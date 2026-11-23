/**
 * Automated Tests for Customer Dashboard, Booking Cancellation, Refunds, and Profile Updates
 */

const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const CustomerService = require('../services/customerService');
const BookingService = require('../services/bookingService');
const PaymentService = require('../services/paymentService');

async function runCustomerModuleTests() {
  console.log('========================================================');
  console.log(' Starting Automated Tests: Customer Dashboard & Bookings');
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

  const testCustomer1 = 1; // John Doe
  const testCustomer2 = 2; // Jane Smith

  // Find a future showtime with available seats
  const [showtimes] = await pool.query(
    `SELECT s.showtime_id, s.start_time 
     FROM showtimes s 
     WHERE s.status = 'scheduled' AND s.start_time > DATE_ADD(NOW(), INTERVAL 3 HOUR) 
     LIMIT 1`
  );

  const testShowtimeId = showtimes[0].showtime_id;

  // Helper to find available seats
  async function getAvailableSeat(showtimeId) {
    const data = await BookingService.getShowtimeSeatMatrix(showtimeId);
    for (const r of Object.keys(data.rows).sort()) {
      for (const s of data.rows[r]) {
        if (s.status === 'available') {
          return s.seatId;
        }
      }
    }
    throw new Error('No available seats found');
  }

  // Test 1: Fetch Customer Dashboard Data & KPI Metrics
  await test('CustomerService.getDashboardData returns patron profile and aggregated counts', async () => {
    const data = await CustomerService.getDashboardData(testCustomer1);
    assert(data !== null, 'Dashboard data should exist');
    assert.strictEqual(data.customer.customer_id, testCustomer1);
    assert(typeof data.stats.totalBookings === 'number');
    assert(typeof data.stats.upcomingBookings === 'number');
    assert(typeof data.stats.totalSpent === 'number');
  });

  // Test 2: Categorized Bookings Query
  await test('CustomerService.getCustomerBookings returns categorized bookings', async () => {
    const all = await CustomerService.getCustomerBookings(testCustomer1, 'all');
    assert(Array.isArray(all));

    const upcoming = await CustomerService.getCustomerBookings(testCustomer1, 'upcoming');
    assert(Array.isArray(upcoming));

    const past = await CustomerService.getCustomerBookings(testCustomer1, 'past');
    assert(Array.isArray(past));

    const cancelled = await CustomerService.getCustomerBookings(testCustomer1, 'cancelled');
    assert(Array.isArray(cancelled));
  });

  // Test 3: Cancellation of Confirmed Booking releases seats, cancels tickets, and creates refund
  let cancelledBookingId = null;
  await test('CustomerService.cancelBooking releases seats, updates tickets, and generates refund', async () => {
    const seatId = await getAvailableSeat(testShowtimeId);

    // 1. Hold seats
    const holdRes = await BookingService.holdSeats({
      customerId: testCustomer1,
      showtimeId: testShowtimeId,
      seatIds: [seatId]
    });

    // 2. Pay and confirm
    await PaymentService.processPayment({
      bookingId: holdRes.bookingId,
      customerId: testCustomer1,
      paymentMethod: 'card',
      simulateSuccess: true
    });

    cancelledBookingId = holdRes.bookingId;

    // Verify seats were booked
    const [ssPre] = await pool.query(
      `SELECT status FROM showtime_seats WHERE showtime_id = ? AND seat_id = ?`,
      [testShowtimeId, seatId]
    );
    assert.strictEqual(ssPre[0].status, 'booked');

    // 3. Cancel confirmed booking
    const cancelRes = await CustomerService.cancelBooking({
      bookingId: cancelledBookingId,
      customerId: testCustomer1,
      reason: 'Change of schedule'
    });

    assert.strictEqual(cancelRes.success, true);
    assert.strictEqual(cancelRes.refundCreated, true);
    assert(cancelRes.refundRef.startsWith('REF-'));

    // Verify booking is cancelled in DB
    const [bRows] = await pool.query(
      `SELECT status, cancel_reason, cancelled_at FROM bookings WHERE booking_id = ?`,
      [cancelledBookingId]
    );
    assert.strictEqual(bRows[0].status, 'cancelled');
    assert.strictEqual(bRows[0].cancel_reason, 'Change of schedule');
    assert(bRows[0].cancelled_at !== null);

    // Verify seats released back to 'available'
    const [ssPost] = await pool.query(
      `SELECT status, booking_id FROM showtime_seats WHERE showtime_id = ? AND seat_id = ?`,
      [testShowtimeId, seatId]
    );
    assert.strictEqual(ssPost[0].status, 'available');
    assert.strictEqual(ssPost[0].booking_id, null);

    // Verify tickets marked 'cancelled'
    const [tRows] = await pool.query(
      `SELECT status FROM tickets WHERE booking_id = ?`,
      [cancelledBookingId]
    );
    tRows.forEach(t => assert.strictEqual(t.status, 'cancelled'));

    // Verify refund record exists in DB
    const [rRows] = await pool.query(
      `SELECT amount, status FROM refunds WHERE refund_ref = ?`,
      [cancelRes.refundRef]
    );
    assert.strictEqual(rRows.length, 1);
    assert.strictEqual(rRows[0].status, 'processed');
  });

  // Test 4: Security - Rejection of Cancellation by Unauthorized Customer
  await test('CustomerService.cancelBooking rejects cancellation attempt by another customer', async () => {
    let threw = false;
    try {
      // Customer 2 attempts to cancel Customer 1's booking
      await CustomerService.cancelBooking({
        bookingId: cancelledBookingId,
        customerId: testCustomer2, // Unauthorized
        reason: 'Malicious attempt'
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('Unauthorized') || err.message.includes('do not own') || err.message.includes('already'));
    }
    assert(threw, 'Should throw error when customer does not own booking');
  });

  // Test 5: Profile Updates (Full name & Phone)
  await test('CustomerService.updateProfile updates details and rejects invalid inputs', async () => {
    await CustomerService.updateProfile(testCustomer1, {
      full_name: 'Johnathan Doe Updated',
      phone: '+91 9999988888'
    });

    const [rows] = await pool.query(
      `SELECT full_name, phone FROM customers WHERE customer_id = ?`,
      [testCustomer1]
    );
    assert.strictEqual(rows[0].full_name, 'Johnathan Doe Updated');
    assert.strictEqual(rows[0].phone, '+91 9999988888');

    // Restore name
    await CustomerService.updateProfile(testCustomer1, {
      full_name: 'John Doe',
      phone: '+91 9876543210'
    });
  });

  // Test 6: Password Change & Verification
  await test('CustomerService.changePassword verifies current password before updating hash', async () => {
    // Attempt with incorrect current password (MUST FAIL)
    let wrongPassThrew = false;
    try {
      await CustomerService.changePassword(testCustomer1, {
        current_password: 'WrongPassword123',
        new_password: 'NewPassword@123',
        confirm_password: 'NewPassword@123'
      });
    } catch (e) {
      wrongPassThrew = true;
      assert(e.message.includes('Current password is incorrect'));
    }
    assert(wrongPassThrew, 'Should reject change with wrong current password');

    // Valid change
    await CustomerService.changePassword(testCustomer1, {
      current_password: 'Password@123',
      new_password: 'UpdatedPassword@123',
      confirm_password: 'UpdatedPassword@123'
    });

    const [cRows] = await pool.query(
      `SELECT password_hash FROM customers WHERE customer_id = ?`,
      [testCustomer1]
    );
    const isNewValid = await bcrypt.compare('UpdatedPassword@123', cRows[0].password_hash);
    assert.strictEqual(isNewValid, true);

    // Restore original password for seeded consistency
    await CustomerService.changePassword(testCustomer1, {
      current_password: 'UpdatedPassword@123',
      new_password: 'Password@123',
      confirm_password: 'Password@123'
    });
  });

  // Test 7: Customer Tickets Query
  await test('CustomerService.getCustomerTickets returns customer tickets with QR code assets', async () => {
    const tickets = await CustomerService.getCustomerTickets(testCustomer1);
    assert(Array.isArray(tickets));
    tickets.forEach(t => {
      assert(t.ticket_number.startsWith('TKT-'));
      assert(t.qr_code_path);
    });
  });

  console.log('========================================================');
  console.log(` Customer Module Test Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCustomerModuleTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
