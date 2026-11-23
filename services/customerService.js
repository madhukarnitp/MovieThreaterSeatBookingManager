const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

class CustomerService {
  /**
   * Get comprehensive customer dashboard stats and categorized bookings.
   */
  static async getDashboardData(customerId) {
    // 1. Fetch customer profile info
    const [custRows] = await pool.query(
      `SELECT customer_id, full_name, email, phone, status, created_at FROM customers WHERE customer_id = ?`,
      [customerId]
    );

    if (custRows.length === 0) return null;
    const customer = custRows[0];

    // 2. Aggregate stats
    const [stats] = await pool.query(
      `SELECT 
         COUNT(*) AS total_bookings,
         SUM(CASE WHEN b.status = 'confirmed' AND s.start_time > NOW() THEN 1 ELSE 0 END) AS upcoming_bookings,
         SUM(CASE WHEN b.status = 'confirmed' AND s.start_time <= NOW() THEN 1 ELSE 0 END) AS past_bookings,
         SUM(CASE WHEN b.status IN ('cancelled', 'expired') THEN 1 ELSE 0 END) AS cancelled_bookings,
         COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.total_amount ELSE 0 END), 0.00) AS total_spent
       FROM bookings b
       JOIN showtimes s ON b.showtime_id = s.showtime_id
       WHERE b.customer_id = ?`,
      [customerId]
    );

    // 3. Count available active tickets
    const [ticketStats] = await pool.query(
      `SELECT COUNT(t.ticket_id) AS total_valid_tickets
       FROM tickets t
       JOIN bookings b ON t.booking_id = b.booking_id
       JOIN showtimes s ON b.showtime_id = s.showtime_id
       WHERE b.customer_id = ? AND t.status = 'valid' AND s.start_time > NOW()`,
      [customerId]
    );

    return {
      customer,
      stats: {
        totalBookings: Number(stats[0]?.total_bookings || 0),
        upcomingBookings: Number(stats[0]?.upcoming_bookings || 0),
        pastBookings: Number(stats[0]?.past_bookings || 0),
        cancelledBookings: Number(stats[0]?.cancelled_bookings || 0),
        totalSpent: Number(stats[0]?.total_spent || 0),
        validTickets: Number(ticketStats[0]?.total_valid_tickets || 0)
      }
    };
  }

  /**
   * Get customer bookings with optional category filter: 'all', 'upcoming', 'past', 'cancelled'.
   */
  static async getCustomerBookings(customerId, filter = 'all') {
    let query = `
      SELECT 
        b.booking_id,
        b.booking_ref,
        b.status AS booking_status,
        b.total_amount,
        b.booked_at,
        b.confirmed_at,
        b.cancelled_at,
        m.movie_id,
        m.title AS movie_title,
        m.poster_path,
        m.duration_min,
        m.certification,
        t.name AS theater_name,
        t.city,
        sc.name AS screen_name,
        s.showtime_id,
        s.start_time,
        s.end_time,
        s.format,
        s.language,
        COUNT(DISTINCT bs.booking_seat_id) AS seats_count,
        GROUP_CONCAT(DISTINCT CONCAT(se.row_label, se.seat_number) ORDER BY se.row_label, se.seat_number SEPARATOR ', ') AS seat_codes,
        p.transaction_ref,
        p.payment_method,
        p.status AS payment_status,
        r.refund_id,
        r.status AS refund_status,
        r.amount AS refund_amount,
        -- Check cancellation eligibility: confirmed and showtime starts > 2 hours in the future
        CASE 
          WHEN b.status = 'confirmed' AND TIMESTAMPDIFF(MINUTE, NOW(), s.start_time) >= 120 THEN 1 
          ELSE 0 
        END AS is_cancellable,
        TIMESTAMPDIFF(MINUTE, NOW(), s.start_time) AS minutes_to_showtime
      FROM bookings b
      JOIN showtimes s ON b.showtime_id = s.showtime_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters t ON sc.theater_id = t.theater_id
      LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
      LEFT JOIN seats se ON bs.seat_id = se.seat_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.status = 'success'
      LEFT JOIN refunds r ON p.payment_id = r.payment_id
      WHERE b.customer_id = ?
    `;

    const params = [customerId];

    if (filter === 'upcoming') {
      query += ` AND b.status = 'confirmed' AND s.start_time > NOW()`;
    } else if (filter === 'past') {
      query += ` AND b.status = 'confirmed' AND s.start_time <= NOW()`;
    } else if (filter === 'cancelled') {
      query += ` AND b.status IN ('cancelled', 'expired', 'refunded')`;
    }

    query += ` GROUP BY b.booking_id, p.transaction_ref, p.payment_method, p.status, r.refund_id, r.status, r.amount
               ORDER BY b.booked_at DESC`;

    const [rows] = await pool.query(query, params);
    return rows;
  }

  /**
   * Cancel booking with strict business rules, ACID transaction, and automated refund creation.
   *
   * For confirmed bookings:
   *   1. Verify customer ownership
   *   2. Lock booking FOR UPDATE
   *   3. Check cancellation policy (Showtime must not have started, e.g. at least 2 hours before showtime)
   *   4. Update booking status to 'cancelled'
   *   5. Update all issued tickets for this booking to 'cancelled'
   *   6. Free up showtime_seats (set to 'available', release booking_id)
   *   7. Find successful payment and create simulated refund record in 'pending' status
   *   8. Commit transaction atomically
   *
   * For pending bookings:
   *   Cancel booking, release held seats.
   */
  static async cancelBooking({ bookingId, customerId, reason = 'Cancelled by customer' }) {
    if (!bookingId || !customerId) {
      throw new Error('Booking ID and Customer ID are required.');
    }

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // 1. Lock and verify booking
      const [bookings] = await conn.query(
        `SELECT b.booking_id, b.booking_ref, b.customer_id, b.showtime_id, b.total_amount, b.status,
                s.start_time
         FROM bookings b
         JOIN showtimes s ON b.showtime_id = s.showtime_id
         WHERE b.booking_id = ?
         FOR UPDATE`,
        [bookingId]
      );

      if (bookings.length === 0) {
        throw new Error('Booking not found.');
      }

      const booking = bookings[0];

      // Ownership verification
      if (booking.customer_id !== customerId) {
        throw new Error('Unauthorized: You do not own this booking.');
      }

      // If pending hold cancellation
      if (booking.status === 'pending') {
        // Release held seats
        await conn.query(
          `UPDATE showtime_seats 
           SET status = 'available', held_by = NULL, held_until = NULL, hold_booking_id = NULL 
           WHERE hold_booking_id = ?`,
          [bookingId]
        );
        await conn.query(`DELETE FROM booking_seats WHERE booking_id = ?`, [bookingId]);
        await conn.query(
          `UPDATE bookings SET status = 'cancelled', cancel_reason = ?, cancelled_at = NOW() WHERE booking_id = ?`,
          [reason, bookingId]
        );

        await conn.commit();
        return {
          success: true,
          bookingRef: booking.booking_ref,
          message: 'Pending hold released successfully.'
        };
      }

      // Check if already cancelled
      if (['cancelled', 'expired', 'refunded'].includes(booking.status)) {
        throw new Error(`Booking is already ${booking.status}.`);
      }

      if (booking.status !== 'confirmed') {
        throw new Error(`Cannot cancel booking with status: ${booking.status}.`);
      }

      // Check Cancellation Policy:
      // College DBMS Cinema Policy: Cancellation allowed up to showtime start (or configured 2 hour window)
      const now = new Date();
      const showStartTime = new Date(booking.start_time);

      if (showStartTime <= now) {
        throw new Error('Cannot cancel ticket: The movie screening has already started.');
      }

      // 4. Update booking status
      await conn.query(
        `UPDATE bookings 
         SET status = 'cancelled', cancel_reason = ?, cancelled_at = NOW(), updated_at = NOW() 
         WHERE booking_id = ?`,
        [reason, bookingId]
      );

      // 5. Update tickets to cancelled
      await conn.query(
        `UPDATE tickets SET status = 'cancelled' WHERE booking_id = ?`,
        [bookingId]
      );

      // Remove unconfirmed booking_seats for cancelled bookings so seats can be re-reserved
      await conn.query(`DELETE FROM booking_seats WHERE booking_id = ?`, [bookingId]);

      // 6. Release showtime seats back to inventory
      await conn.query(
        `UPDATE showtime_seats 
         SET status = 'available', booking_id = NULL, held_by = NULL, held_until = NULL, hold_booking_id = NULL 
         WHERE booking_id = ? AND showtime_id = ?`,
        [bookingId, booking.showtime_id]
      );

      // 7. Find successful payment and initiate refund request
      const [payments] = await conn.query(
        `SELECT payment_id, amount, transaction_ref FROM payments WHERE booking_id = ? AND status = 'success' ORDER BY paid_at DESC LIMIT 1`,
        [bookingId]
      );

      let refundCreated = false;
      let refundRef = null;

      if (payments.length > 0) {
        const payment = payments[0];
        refundRef = `REF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

        // Create refund record in 'processed' or 'pending' state
        // For complete demo flow, create pending refund record
        await conn.query(
          `INSERT INTO refunds (payment_id, booking_id, refund_ref, amount, status, reason, initiated_at, processed_at)
           VALUES (?, ?, ?, ?, 'processed', ?, NOW(), NOW())`,
          [payment.payment_id, bookingId, refundRef, payment.amount, `Refund for cancelled booking ${booking.booking_ref}`]
        );

        // Update payment status to refunded
        await conn.query(
          `UPDATE payments SET status = 'refunded' WHERE payment_id = ?`,
          [payment.payment_id]
        );

        refundCreated = true;
      }

      await conn.commit();

      return {
        success: true,
        bookingRef: booking.booking_ref,
        refundCreated,
        refundRef,
        refundAmount: payments.length > 0 ? Number(payments[0].amount).toFixed(2) : '0.00',
        message: 'Booking cancelled successfully. Your seats have been released and refund has been recorded.'
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Update customer profile information (full_name, phone).
   * Strictly prevents changing status, email or role.
   */
  static async updateProfile(customerId, { full_name, phone }) {
    if (!full_name || !full_name.trim()) {
      throw new Error('Full name is required.');
    }

    await pool.query(
      `UPDATE customers SET full_name = ?, phone = ?, updated_at = NOW() WHERE customer_id = ?`,
      [full_name.trim(), phone ? phone.trim() : null, customerId]
    );

    return true;
  }

  /**
   * Change customer password after verifying existing password.
   */
  static async changePassword(customerId, { current_password, new_password, confirm_password }) {
    if (!current_password || !new_password || !confirm_password) {
      throw new Error('All password fields are required.');
    }

    if (new_password.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    if (new_password !== confirm_password) {
      throw new Error('New password and confirmation do not match.');
    }

    const [rows] = await pool.query(
      `SELECT password_hash FROM customers WHERE customer_id = ?`,
      [customerId]
    );

    if (rows.length === 0) {
      throw new Error('Customer account not found.');
    }

    const isValid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!isValid) {
      throw new Error('Current password is incorrect.');
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query(
      `UPDATE customers SET password_hash = ?, updated_at = NOW() WHERE customer_id = ?`,
      [newHash, customerId]
    );

    return true;
  }

  /**
   * Get all active and past tickets for customer with QR payloads.
   */
  static async getCustomerTickets(customerId) {
    const [rows] = await pool.query(
      `SELECT 
         t.ticket_id, t.ticket_number, t.qr_code_path, t.status AS ticket_status, t.issued_at,
         b.booking_id, b.booking_ref, b.status AS booking_status,
         se.row_label, se.seat_number,
         st.name AS seat_category,
         bs.price_paid,
         s.showtime_id, s.start_time, s.format, s.language,
         m.movie_id, m.title AS movie_title, m.poster_path, m.duration_min,
         sc.name AS screen_name,
         th.name AS theater_name, th.city
       FROM tickets t
       JOIN booking_seats bs ON t.booking_seat_id = bs.booking_seat_id
       JOIN seats se ON bs.seat_id = se.seat_id
       JOIN seat_types st ON se.seat_type_id = st.seat_type_id
       JOIN bookings b ON t.booking_id = b.booking_id
       JOIN showtimes s ON b.showtime_id = s.showtime_id
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters th ON sc.theater_id = th.theater_id
       WHERE b.customer_id = ?
       ORDER BY s.start_time DESC, t.issued_at DESC`,
      [customerId]
    );
    return rows;
  }
}

module.exports = CustomerService;
