/**
 * Comprehensive Concurrency, Collision & Race Condition Audit Test
 * Tests:
 * 1. Two customers holding the same seat simultaneously (exactly 1 wins).
 * 2. Expired seat hold automatically restored to available.
 * 3. Simultaneous payment confirmation on the same pending booking (idempotent, no double charge).
 * 4. Duplicate payment attempt after confirmation.
 * 5. Booking cancellation during a simulated payment attempt.
 */

const assert = require('assert');
const { pool } = require('../config/db');
const BookingService = require('../services/bookingService');
const PaymentService = require('../services/paymentService');
const CustomerService = require('../services/customerService');

async function runConcurrencyAudit() {
  console.log('========================================================');
  console.log(' Starting Audit: Concurrency, Collisions & ACID Semantics');
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

  const testCustomer1 = 1;
  const testCustomer2 = 2;

  // Pick future showtime with available seats
  const [showtimes] = await pool.query(
    `SELECT s.showtime_id, s.start_time 
     FROM showtimes s 
     JOIN showtime_seats ss ON s.showtime_id = ss.showtime_id
     WHERE s.status = 'scheduled' AND s.start_time > DATE_ADD(NOW(), INTERVAL 2 HOUR) AND ss.status = 'available'
     GROUP BY s.showtime_id, s.start_time
     HAVING COUNT(ss.showtime_seat_id) >= 10
     LIMIT 1`
  );
  const showtimeId = showtimes && showtimes.length > 0 ? showtimes[0].showtime_id : 1;

  // Ensure test seats exist as available for test repeatability
  await pool.query(
    `UPDATE showtime_seats 
     SET status = 'available' 
     WHERE showtime_id = ? AND status != 'booked' 
     LIMIT 20`,
    [showtimeId]
  );

  // Helper to find available seats
  async function getAvailableSeats(count = 1) {
    const data = await BookingService.getShowtimeSeatMatrix(showtimeId);
    const list = [];
    for (const r of Object.keys(data.rows).sort()) {
      for (const s of data.rows[r]) {
        if (s.status === 'available') {
          list.push(s.seatId);
          if (list.length >= count) return list;
        }
      }
    }
    return list;
  }

  // 1. Simultaneous Seat Hold Competition
  await test('Concurrency 1: Simultaneous hold requests on the same seat - strictly 1 winner', async () => {
    const [targetSeat] = await getAvailableSeats(1);

    const req1 = BookingService.holdSeats({
      customerId: testCustomer1,
      showtimeId,
      seatIds: [targetSeat]
    }).then(res => ({ success: true, cust: 1, res }))
      .catch(err => ({ success: false, cust: 1, error: err.message }));

    const req2 = BookingService.holdSeats({
      customerId: testCustomer2,
      showtimeId,
      seatIds: [targetSeat]
    }).then(res => ({ success: true, cust: 2, res }))
      .catch(err => ({ success: false, cust: 2, error: err.message }));

    const [r1, r2] = await Promise.all([req1, req2]);
    const winners = [r1, r2].filter(r => r.success);
    const losers = [r1, r2].filter(r => !r.success);

    assert.strictEqual(winners.length, 1, 'Exactly one customer must secure the hold');
    assert.strictEqual(losers.length, 1, 'The competing customer must be rejected');

    // Clean up winner
    await BookingService.cancelHold(winners[0].res.bookingId);
  });

  // 2. Expired Seat Hold Automatic Recovery
  await test('Concurrency 2: Expired seat hold is automatically released and restored to available inventory', async () => {
    const [seatId] = await getAvailableSeats(1);

    const hold = await BookingService.holdSeats({
      customerId: testCustomer1,
      showtimeId,
      seatIds: [seatId]
    });

    // Manually backdate held_until to simulate expiration
    await pool.query(
      `UPDATE showtime_seats 
       SET held_until = DATE_SUB(NOW(), INTERVAL 5 MINUTE) 
       WHERE hold_booking_id = ?`,
      [hold.bookingId]
    );

    // Call matrix or hold cleanup
    await BookingService.releaseExpiredHolds(showtimeId);

    const [bRow] = await pool.query('SELECT status FROM bookings WHERE booking_id = ?', [hold.bookingId]);
    assert.strictEqual(bRow[0].status, 'expired');

    const [sRow] = await pool.query('SELECT status FROM showtime_seats WHERE showtime_id = ? AND seat_id = ?', [showtimeId, seatId]);
    assert.strictEqual(sRow[0].status, 'available');
  });

  // 3. Simultaneous Payment Confirmations on the same booking
  await test('Concurrency 3: Simultaneous payment confirmation attempts on same booking - idempotent, no duplicate charge', async () => {
    const [seatId] = await getAvailableSeats(1);

    const hold = await BookingService.holdSeats({
      customerId: testCustomer1,
      showtimeId,
      seatIds: [seatId]
    });

    // Fire two simultaneous payment confirmations
    const p1 = PaymentService.processPayment({
      bookingId: hold.bookingId,
      customerId: testCustomer1,
      paymentMethod: 'card',
      simulateSuccess: true
    });

    const p2 = PaymentService.processPayment({
      bookingId: hold.bookingId,
      customerId: testCustomer1,
      paymentMethod: 'card',
      simulateSuccess: true
    });

    const [pay1, pay2] = await Promise.all([p1, p2]);

    assert(pay1.success, 'First payment must be successful');
    assert(pay2.success, 'Second payment must report success/already paid');

    // Verify exactly ONE successful payment record was created
    const [payments] = await pool.query(
      `SELECT COUNT(*) as count FROM payments WHERE booking_id = ? AND status = 'success'`,
      [hold.bookingId]
    );
    assert.strictEqual(payments[0].count, 1, 'Strictly 1 payment record must be created');

    // Verify tickets count matches seat count (1)
    const [tickets] = await pool.query('SELECT COUNT(*) as count FROM tickets WHERE booking_id = ?', [hold.bookingId]);
    assert.strictEqual(tickets[0].count, 1, 'Only 1 ticket must be generated');
  });

  // 4. Duplicate Payment Attempt After Confirmation
  await test('Concurrency 4: Re-submitting payment after confirmation returns idempotent status without re-charging', async () => {
    const [seatId] = await getAvailableSeats(1);

    const hold = await BookingService.holdSeats({
      customerId: testCustomer1,
      showtimeId,
      seatIds: [seatId]
    });

    const initial = await PaymentService.processPayment({
      bookingId: hold.bookingId,
      customerId: testCustomer1,
      paymentMethod: 'upi',
      simulateSuccess: true
    });
    assert.strictEqual(initial.success, true);

    // Second payment attempt
    const second = await PaymentService.processPayment({
      bookingId: hold.bookingId,
      customerId: testCustomer1,
      paymentMethod: 'upi',
      simulateSuccess: true
    });

    assert.strictEqual(second.success, true);
    assert.strictEqual(second.alreadyPaid, true);
  });

  // 5. Booking Cancellation During / Before Payment Attempt
  await test('Concurrency 5: Cancelling a pending booking prevents subsequent payment from confirming', async () => {
    const [seatId] = await getAvailableSeats(1);

    const hold = await BookingService.holdSeats({
      customerId: testCustomer1,
      showtimeId,
      seatIds: [seatId]
    });

    // Customer cancels hold
    await CustomerService.cancelBooking({
      bookingId: hold.bookingId,
      customerId: testCustomer1
    });

    // Late payment arrival attempt (MUST BE REJECTED)
    let paymentThrew = false;
    try {
      await PaymentService.processPayment({
        bookingId: hold.bookingId,
        customerId: testCustomer1,
        paymentMethod: 'card',
        simulateSuccess: true
      });
    } catch (e) {
      paymentThrew = true;
      assert(e.message.includes('status: cancelled') || e.message.includes('expired'));
    }
    assert(paymentThrew, 'Payment must fail if booking was already cancelled');
  });

  console.log('========================================================');
  console.log(` Concurrency Audit Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runConcurrencyAudit().catch(err => {
  console.error('Fatal concurrency audit error:', err);
  process.exit(1);
});
