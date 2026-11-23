/**
 * Comprehensive Automated Tests for Movie Seat Selection, Holding & Concurrency
 */

const assert = require('assert');
const { pool } = require('../config/db');
const BookingService = require('../services/bookingService');

async function runBookingTests() {
  console.log('========================================================');
  console.log(' Starting Automated Tests: Seat Booking & Concurrency');
  console.log('========================================================');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // Setup: Find a future scheduled showtime with available seats
  const [showtimes] = await pool.query(
    `SELECT s.showtime_id 
     FROM showtimes s 
     WHERE s.status = 'scheduled' AND s.start_time > NOW() 
     LIMIT 1`
  );

  if (showtimes.length === 0) {
    console.error('No future showtimes available for test.');
    process.exit(1);
  }

  const testShowtimeId = showtimes[0].showtime_id;
  const testCustomer1 = 1; // seeded customer John Doe
  const testCustomer2 = 2; // seeded customer Jane Smith

  // Reset any holds on testShowtimeId and clean any unconfirmed booking_seats
  const [unconfirmed] = await pool.query(
    `SELECT b.booking_id FROM bookings b
     LEFT JOIN tickets t ON b.booking_id = t.booking_id
     WHERE b.showtime_id = ? AND b.status IN ('pending', 'cancelled', 'expired') AND t.ticket_id IS NULL`,
    [testShowtimeId]
  );
  if (unconfirmed.length > 0) {
    const ids = unconfirmed.map(b => b.booking_id);
    await pool.query(`DELETE FROM booking_seats WHERE booking_id IN (?)`, [ids]);
  }
  await pool.query(
    `UPDATE showtime_seats 
     SET status = 'available', held_by = NULL, held_until = NULL, hold_booking_id = NULL 
     WHERE showtime_id = ? AND status != 'booked'`,
    [testShowtimeId]
  );

  // Helper to find available seats anywhere in the matrix
  function findAvailableSeats(data, count = 1) {
    const list = [];
    for (const r of Object.keys(data.rows).sort()) {
      for (const s of data.rows[r]) {
        if (s.status === 'available') {
          list.push(s);
          if (list.length >= count) return list;
        }
      }
    }
    return list;
  }
  await test('BookingService.getShowtimeSeatMatrix returns valid grid and pricing', async () => {
    const data = await BookingService.getShowtimeSeatMatrix(testShowtimeId, testCustomer1);
    assert(data !== null, 'Data should not be null');
    assert(data.showtime, 'Showtime details should exist');
    assert(Object.keys(data.rows).length > 0, 'Rows should be populated');
    assert(data.summary.totalSeats > 0, 'Total seats should be greater than zero');
  });

  // Test 2: Reserve / Hold a single seat successfully
  let heldBookingId = null;
  let heldSeatId = null;
  await test('BookingService.holdSeats holds single seat and creates pending booking', async () => {
    const data = await BookingService.getShowtimeSeatMatrix(testShowtimeId, testCustomer1);
    const available = findAvailableSeats(data, 1);
    assert(available.length > 0, 'Must find an available seat');
    heldSeatId = available[0].seatId;

    const res = await BookingService.holdSeats({
      customerId: testCustomer1,
      showtimeId: testShowtimeId,
      seatIds: [heldSeatId]
    });

    assert(res.bookingId > 0, 'Booking ID should be created');
    assert(res.bookingRef.startsWith('BK'), 'Booking reference should start with BK');
    heldBookingId = res.bookingId;

    // Verify database row
    const [ssRows] = await pool.query(
      `SELECT status, held_by, hold_booking_id FROM showtime_seats WHERE showtime_id = ? AND seat_id = ?`,
      [testShowtimeId, heldSeatId]
    );
    assert.strictEqual(ssRows[0].status, 'held');
    assert.strictEqual(ssRows[0].held_by, testCustomer1);
    assert.strictEqual(ssRows[0].hold_booking_id, heldBookingId);
  });

  // Test 3: Attempting to hold the same seat by customer 2 must FAIL
  await test('BookingService.holdSeats rejects holding an already held seat by another customer', async () => {
    let threw = false;
    try {
      await BookingService.holdSeats({
        customerId: testCustomer2,
        showtimeId: testShowtimeId,
        seatIds: [heldSeatId]
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('no longer available') || err.message.includes('Held by another customer'));
    }
    assert(threw, 'Should have thrown error on held seat');
  });

  // Test 4: Cancel / release hold
  await test('BookingService.cancelHold releases seats and marks booking cancelled', async () => {
    const success = await BookingService.cancelHold(heldBookingId, testCustomer1);
    assert.strictEqual(success, true);

    const [ssRows] = await pool.query(
      `SELECT status, held_by, hold_booking_id FROM showtime_seats WHERE showtime_id = ? AND seat_id = ?`,
      [testShowtimeId, heldSeatId]
    );
    assert.strictEqual(ssRows[0].status, 'available');
    assert.strictEqual(ssRows[0].held_by, null);
    assert.strictEqual(ssRows[0].hold_booking_id, null);

    const [bRows] = await pool.query(`SELECT status FROM bookings WHERE booking_id = ?`, [heldBookingId]);
    assert.strictEqual(bRows[0].status, 'cancelled');
  });

  // Test 5: Hold multiple seats simultaneously
  let multiBookingId = null;
  let multiSeatIds = [];
  await test('BookingService.holdSeats reserves multiple seats atomically', async () => {
    const data = await BookingService.getShowtimeSeatMatrix(testShowtimeId, testCustomer1);
    const available = findAvailableSeats(data, 2);
    assert(available.length >= 2, 'Need at least 2 available seats');

    multiSeatIds = [available[0].seatId, available[1].seatId];

    const res = await BookingService.holdSeats({
      customerId: testCustomer1,
      showtimeId: testShowtimeId,
      seatIds: multiSeatIds
    });

    assert.strictEqual(res.seatCount, 2);
    multiBookingId = res.bookingId;

    const details = await BookingService.getBookingDetails(multiBookingId, testCustomer1);
    assert.strictEqual(details.seats.length, 2);
  });

  // Test 6: Hold expiration mechanism
  await test('BookingService.releaseExpiredHolds cleans up past holds', async () => {
    // Manually backdate held_until and booking booked_at
    await pool.query(
      `UPDATE showtime_seats 
       SET held_until = DATE_SUB(NOW(), INTERVAL 5 MINUTE) 
       WHERE hold_booking_id = ?`,
      [multiBookingId]
    );

    const releasedCount = await BookingService.releaseExpiredHolds(testShowtimeId);
    assert(releasedCount >= 1, 'Should have released at least 1 expired booking');

    const [bRows] = await pool.query(`SELECT status FROM bookings WHERE booking_id = ?`, [multiBookingId]);
    assert.strictEqual(bRows[0].status, 'expired');

    const [ssRows] = await pool.query(
      `SELECT status FROM showtime_seats WHERE seat_id IN (?) AND showtime_id = ?`,
      [multiSeatIds, testShowtimeId]
    );
    ssRows.forEach(row => {
      assert.strictEqual(row.status, 'available');
    });
  });

  // Test 7: CONCURRENCY TEST - Two simultaneous requests competing for the exact same seat
  await test('Concurrency: Simultaneous hold requests on the same seat - exactly one succeeds', async () => {
    const data = await BookingService.getShowtimeSeatMatrix(testShowtimeId);
    const available = findAvailableSeats(data, 1);
    assert(available.length > 0, 'Must find an available target seat');

    const seatIdToCompete = available[0].seatId;

    // Launch both promises simultaneously without awaiting sequentially
    const req1 = BookingService.holdSeats({
      customerId: testCustomer1,
      showtimeId: testShowtimeId,
      seatIds: [seatIdToCompete]
    }).then(res => ({ success: true, winner: 'customer1', res }))
      .catch(err => ({ success: false, winner: 'customer1', error: err.message }));

    const req2 = BookingService.holdSeats({
      customerId: testCustomer2,
      showtimeId: testShowtimeId,
      seatIds: [seatIdToCompete]
    }).then(res => ({ success: true, winner: 'customer2', res }))
      .catch(err => ({ success: false, winner: 'customer2', error: err.message }));

    const [result1, result2] = await Promise.all([req1, req2]);

    const successes = [result1, result2].filter(r => r.success);
    const failures = [result1, result2].filter(r => !r.success);

    assert.strictEqual(successes.length, 1, 'Exactly one customer must successfully hold the seat');
    assert.strictEqual(failures.length, 1, 'The competing customer must be rejected');
    const failureMsg = failures[0].error.toLowerCase();
    assert(failureMsg.includes('no longer available') || failureMsg.includes('held') || failureMsg.includes('duplicate') || failureMsg.includes('deadlock'), 'Failure message must indicate seat conflict: ' + failures[0].error);

    // Clean up winner's hold
    const winnerBookingId = successes[0].res.bookingId;
    await BookingService.cancelHold(winnerBookingId);
  });

  // Test 8: Validation - exceeding max seat limit
  await test('BookingService rejects requesting more than 10 seats', async () => {
    let threw = false;
    try {
      await BookingService.holdSeats({
        customerId: testCustomer1,
        showtimeId: testShowtimeId,
        seatIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('at most 10 seats'));
    }
    assert(threw, 'Should throw error when exceeding 10 seats');
  });

  console.log('========================================================');
  console.log(` Booking Test Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runBookingTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
