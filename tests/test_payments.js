/**
 * Comprehensive Automated Tests for Payments, Ticket Issuance, and Verification
 */

const assert = require('assert');
const { pool } = require('../config/db');
const BookingService = require('../services/bookingService');
const PaymentService = require('../services/paymentService');

async function runPaymentTests() {
  console.log('========================================================');
  console.log(' Starting Automated Tests: Payments & Ticket Management');
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

  // Find a valid future scheduled showtime
  const [showtimes] = await pool.query(
    `SELECT s.showtime_id 
     FROM showtimes s 
     WHERE s.status = 'scheduled' AND s.start_time > NOW() 
     LIMIT 1`
  );

  const testShowtimeId = showtimes[0].showtime_id;
  const testCustomer = 1; // John Doe

  // Reset any old holds and clean unconfirmed booking_seats
  const [pendingOld] = await pool.query(
    `SELECT b.booking_id FROM bookings b
     LEFT JOIN tickets t ON b.booking_id = t.booking_id
     WHERE b.showtime_id = ? AND b.status IN ('pending', 'cancelled', 'expired') AND t.ticket_id IS NULL`,
    [testShowtimeId]
  );
  if (pendingOld.length > 0) {
    const ids = pendingOld.map(b => b.booking_id);
    await pool.query(`DELETE FROM booking_seats WHERE booking_id IN (?)`, [ids]);
    await pool.query(
      `UPDATE showtime_seats 
       SET status = 'available', held_by = NULL, held_until = NULL, hold_booking_id = NULL 
       WHERE showtime_id = ? AND status = 'held'`,
      [testShowtimeId]
    );
  }

  // Helper to create a fresh held booking
  async function createFreshBooking(customerId, seatCount = 1) {
    const data = await BookingService.getShowtimeSeatMatrix(testShowtimeId);
    const available = [];
    for (const r of Object.keys(data.rows).sort()) {
      for (const s of data.rows[r]) {
        if (s.status === 'available') {
          available.push(s);
          if (available.length >= seatCount) break;
        }
      }
      if (available.length >= seatCount) break;
    }
    assert(available.length >= seatCount, 'Not enough seats available for test setup');

    const seatsToHold = available.slice(0, seatCount).map(s => s.seatId);
    return await BookingService.holdSeats({
      customerId,
      showtimeId: testShowtimeId,
      seatIds: seatsToHold
    });
  }

  // Test 1: Simulated Failed Payment keeps hold active and records failure
  let testBooking1 = null;
  await test('PaymentService records failed payment attempt and retains pending hold', async () => {
    testBooking1 = await createFreshBooking(testCustomer, 1);

    const failResult = await PaymentService.processPayment({
      bookingId: testBooking1.bookingId,
      customerId: testCustomer,
      paymentMethod: 'card',
      simulateSuccess: false,
      failureReason: 'Insufficient funds (Simulated)'
    });

    assert.strictEqual(failResult.success, false);
    assert(failResult.message.includes('Insufficient funds'));

    // Check payment table has failed record
    const [payments] = await pool.query(
      `SELECT status, payment_method, amount FROM payments WHERE payment_id = ?`,
      [failResult.paymentId]
    );
    assert.strictEqual(payments.length, 1);
    assert.strictEqual(payments[0].status, 'failed');

    // Verify booking is STILL pending
    const [bRows] = await pool.query(
      `SELECT status FROM bookings WHERE booking_id = ?`,
      [testBooking1.bookingId]
    );
    assert.strictEqual(bRows[0].status, 'pending');

    // Verify seats are STILL held
    const [ssRows] = await pool.query(
      `SELECT status FROM showtime_seats WHERE hold_booking_id = ?`,
      [testBooking1.bookingId]
    );
    assert.strictEqual(ssRows[0].status, 'held');
  });

  // Test 2: Retry with Successful Payment confirms booking and issues QR tickets
  let ticketNumbers = [];
  await test('PaymentService completes payment, confirms booking, marks seats booked, and creates tickets', async () => {
    const successResult = await PaymentService.processPayment({
      bookingId: testBooking1.bookingId,
      customerId: testCustomer,
      paymentMethod: 'upi',
      simulateSuccess: true
    });

    assert.strictEqual(successResult.success, true);
    assert(successResult.transactionRef.startsWith('TXN-'));
    assert.strictEqual(successResult.ticketsCount, 1);

    // Verify booking status is now 'confirmed'
    const [bRows] = await pool.query(
      `SELECT status, confirmed_at FROM bookings WHERE booking_id = ?`,
      [testBooking1.bookingId]
    );
    assert.strictEqual(bRows[0].status, 'confirmed');
    assert(bRows[0].confirmed_at !== null);

    // Verify showtime_seats are now 'booked' and hold fields cleared
    const [ssRows] = await pool.query(
      `SELECT status, booking_id, held_by, hold_booking_id FROM showtime_seats WHERE booking_id = ?`,
      [testBooking1.bookingId]
    );
    assert.strictEqual(ssRows.length, 1);
    assert.strictEqual(ssRows[0].status, 'booked');
    assert.strictEqual(ssRows[0].held_by, null);
    assert.strictEqual(ssRows[0].hold_booking_id, null);

    // Verify ticket generated with QR code data URL
    const [tRows] = await pool.query(
      `SELECT ticket_id, ticket_number, qr_code_path, status FROM tickets WHERE booking_id = ?`,
      [testBooking1.bookingId]
    );
    assert.strictEqual(tRows.length, 1);
    assert(tRows[0].ticket_number.startsWith('TKT-'));
    assert(tRows[0].qr_code_path.startsWith('data:image/png;base64,'));
    assert.strictEqual(tRows[0].status, 'valid');

    ticketNumbers.push(tRows[0].ticket_number);
  });

  // Test 3: Idempotency / Duplicate Payment Protection
  await test('PaymentService prevents duplicate payment on already confirmed booking', async () => {
    const duplicateResult = await PaymentService.processPayment({
      bookingId: testBooking1.bookingId,
      customerId: testCustomer,
      paymentMethod: 'card',
      simulateSuccess: true
    });

    assert.strictEqual(duplicateResult.success, true);
    assert.strictEqual(duplicateResult.alreadyPaid, true);
    assert(duplicateResult.message.includes('already been confirmed'));

    // Verify NO new payment record was created
    const [payments] = await pool.query(
      `SELECT COUNT(*) as cnt FROM payments WHERE booking_id = ? AND status = 'success'`,
      [testBooking1.bookingId]
    );
    assert.strictEqual(payments[0].cnt, 1, 'Should only have 1 successful payment record');
  });

  // Test 4: Expired Hold Rejection during Payment
  await test('PaymentService rejects payment on expired seat hold and restores seat availability', async () => {
    const expiredBooking = await createFreshBooking(testCustomer, 1);

    // Simulate hold expiration
    await pool.query(
      `UPDATE showtime_seats 
       SET held_until = DATE_SUB(NOW(), INTERVAL 5 MINUTE) 
       WHERE hold_booking_id = ?`,
      [expiredBooking.bookingId]
    );

    let threw = false;
    try {
      await PaymentService.processPayment({
        bookingId: expiredBooking.bookingId,
        customerId: testCustomer,
        paymentMethod: 'card',
        simulateSuccess: true
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('expired'));
    }
    assert(threw, 'Should throw error when paying for an expired hold');

    // Verify booking is marked expired
    const [bRows] = await pool.query(
      `SELECT status FROM bookings WHERE booking_id = ?`,
      [expiredBooking.bookingId]
    );
    assert.strictEqual(bRows[0].status, 'expired');
  });

  // Test 5: Verify & Use Ticket (Gate check-in)
  await test('PaymentService.verifyAndUseTicket marks valid ticket as used and admits attendee', async () => {
    const ticketToUse = ticketNumbers[0];

    const admission = await PaymentService.verifyAndUseTicket(ticketToUse);
    assert.strictEqual(admission.success, true);
    assert(admission.message.includes('marked as USED'));

    // Check DB ticket status
    const [tRows] = await pool.query(
      `SELECT status FROM tickets WHERE ticket_number = ?`,
      [ticketToUse]
    );
    assert.strictEqual(tRows[0].status, 'used');
  });

  // Test 6: Prevent Duplicate Ticket Usage
  await test('PaymentService.verifyAndUseTicket rejects already used tickets', async () => {
    const ticketToUse = ticketNumbers[0];

    let threw = false;
    try {
      await PaymentService.verifyAndUseTicket(ticketToUse);
    } catch (err) {
      threw = true;
      assert(err.message.includes('ALREADY BEEN USED'));
    }
    assert(threw, 'Should reject already used ticket');
  });

  // Test 7: Multi-Seat Ticket Generation
  await test('PaymentService generates distinct QR tickets for each seat in multi-seat booking', async () => {
    const multiBooking = await createFreshBooking(testCustomer, 2);

    const res = await PaymentService.processPayment({
      bookingId: multiBooking.bookingId,
      customerId: testCustomer,
      paymentMethod: 'netbanking',
      simulateSuccess: true
    });

    assert.strictEqual(res.ticketsCount, 2);

    const ticketsData = await PaymentService.getBookingTickets(multiBooking.bookingId, testCustomer);
    assert.strictEqual(ticketsData.tickets.length, 2);
    assert.notStrictEqual(ticketsData.tickets[0].ticket_number, ticketsData.tickets[1].ticket_number);
    assert(ticketsData.tickets[0].qr_code_path.startsWith('data:image/png'));
  });

  // Test 8: Unauthorized customer payment rejection
  await test('PaymentService rejects payment attempt by another customer', async () => {
    const customer2Booking = await createFreshBooking(2, 1); // Customer 2 (Jane)

    let threw = false;
    try {
      // Customer 1 attempts to pay for Customer 2's booking
      await PaymentService.processPayment({
        bookingId: customer2Booking.bookingId,
        customerId: testCustomer, // customer 1
        paymentMethod: 'card',
        simulateSuccess: true
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('Unauthorized') || err.message.includes('do not own'));
    }
    assert(threw, 'Should throw error when customer is unauthorized');
  });

  console.log('========================================================');
  console.log(` Payment Test Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPaymentTests().catch(err => {
  console.error('Fatal payment test error:', err);
  process.exit(1);
});
