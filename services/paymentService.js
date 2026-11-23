const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool } = require('../config/db');

class PaymentService {
  /**
   * Process simulated payment transaction.
   * If simulateSuccess is true:
   *   1. Verify customer ownership
   *   2. Lock booking row with FOR UPDATE
   *   3. Verify booking status is 'pending'
   *   4. Verify hold has not expired
   *   5. Verify every selected seat is still held by this booking
   *   6. Create successful payment record
   *   7. Update booking status to 'confirmed'
   *   8. Update showtime_seats to 'booked' and clear hold fields
   *   9. Generate one ticket per booking seat with a QR code
   *   10. Commit transaction
   *
   * If simulateSuccess is false:
   *   Record failed payment attempt, keep hold active (unless hold time expired).
   */
  static async processPayment({
    bookingId,
    customerId,
    paymentMethod = 'card',
    simulateSuccess = true,
    failureReason = 'Card declined by issuing bank (Simulated)'
  }) {
    if (!bookingId || !customerId) {
      throw new Error('Booking ID and Customer ID are required.');
    }

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // 1. Lock the booking row and verify ownership
      const [bookings] = await conn.query(
        `SELECT booking_id, booking_ref, customer_id, showtime_id, total_amount, status, booked_at 
         FROM bookings 
         WHERE booking_id = ? 
         FOR UPDATE`,
        [bookingId]
      );

      if (bookings.length === 0) {
        throw new Error('Booking not found.');
      }

      const booking = bookings[0];

      // Verify ownership
      if (booking.customer_id !== customerId) {
        throw new Error('Unauthorized: You do not own this booking.');
      }

      // Check if already confirmed (Idempotency / Duplicate payment protection)
      if (booking.status === 'confirmed') {
        await conn.rollback();
        return {
          success: true,
          alreadyPaid: true,
          bookingId: booking.booking_id,
          bookingRef: booking.booking_ref,
          message: 'Booking has already been confirmed.'
        };
      }

      // If already cancelled or expired
      if (booking.status !== 'pending') {
        throw new Error(`Cannot process payment for booking with status: ${booking.status}.`);
      }

      // Lock seats associated with this booking
      const [bookingSeats] = await conn.query(
        `SELECT bs.booking_seat_id, bs.seat_id, bs.showtime_id, bs.price_paid,
                se.row_label, se.seat_number,
                ss.status AS seat_status, ss.held_by, ss.held_until, ss.hold_booking_id
         FROM booking_seats bs
         JOIN seats se ON bs.seat_id = se.seat_id
         JOIN showtime_seats ss ON bs.showtime_id = ss.showtime_id AND bs.seat_id = ss.seat_id
         WHERE bs.booking_id = ?
         ORDER BY bs.seat_id ASC
         FOR UPDATE`,
        [bookingId]
      );

      if (bookingSeats.length === 0) {
        throw new Error('No seats found for this booking.');
      }

      // Check hold validity: held_until must be > NOW()
      const now = new Date();
      let isHoldExpired = false;

      for (const seat of bookingSeats) {
        if (!seat.held_until || new Date(seat.held_until) <= now) {
          isHoldExpired = true;
          break;
        }
        if (seat.seat_status !== 'held' || seat.hold_booking_id !== booking.booking_id) {
          isHoldExpired = true;
          break;
        }
      }

      if (isHoldExpired) {
        // Release seats and mark booking expired
        await conn.query(
          `UPDATE showtime_seats 
           SET status = 'available', held_by = NULL, held_until = NULL, hold_booking_id = NULL 
           WHERE hold_booking_id = ?`,
          [bookingId]
        );
        await conn.query(
          `DELETE FROM booking_seats WHERE booking_id = ?`,
          [bookingId]
        );
        await conn.query(
          `UPDATE bookings 
           SET status = 'expired', updated_at = NOW() 
           WHERE booking_id = ?`,
          [bookingId]
        );

        await conn.commit();
        throw new Error('Your seat reservation has expired. Please select your seats again.');
      }

      // Generate unique transaction reference: TXN + timestamp + random
      const txnRef = `TXN-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      // Handle Simulated Payment Failure
      if (!simulateSuccess) {
        // Record failed payment attempt
        const [paymentResult] = await conn.query(
          `INSERT INTO payments (booking_id, transaction_ref, payment_method, amount, currency, status, gateway_response, created_at)
           VALUES (?, ?, ?, ?, 'INR', 'failed', ?, NOW())`,
          [
            bookingId,
            txnRef,
            paymentMethod,
            booking.total_amount,
            JSON.stringify({
              gateway: 'Simulated Gateway (Demo Mode)',
              status: 'declined',
              reason: failureReason,
              timestamp: new Date().toISOString()
            })
          ]
        );

        await conn.commit();
        return {
          success: false,
          paymentId: paymentResult.insertId,
          transactionRef: txnRef,
          message: failureReason || 'Simulated payment was declined. You can retry while your hold is active.'
        };
      }

      // Handle Simulated Payment Success
      // 1. Create successful payment record
      const [paymentResult] = await conn.query(
        `INSERT INTO payments (booking_id, transaction_ref, payment_method, amount, currency, status, gateway_response, paid_at, created_at)
         VALUES (?, ?, ?, ?, 'INR', 'success', ?, NOW(), NOW())`,
        [
          bookingId,
          txnRef,
          paymentMethod,
          booking.total_amount,
          JSON.stringify({
            gateway: 'Simulated Gateway (Demo Mode)',
            status: 'approved',
            authCode: `AUTH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            timestamp: new Date().toISOString()
          })
        ]
      );

      const paymentId = paymentResult.insertId;

      // 2. Update booking to confirmed
      await conn.query(
        `UPDATE bookings 
         SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() 
         WHERE booking_id = ?`,
        [bookingId]
      );

      // 3. Update showtime_seats to 'booked' and clear temporary hold fields
      const seatIds = bookingSeats.map(bs => bs.seat_id);
      await conn.query(
        `UPDATE showtime_seats 
         SET status = 'booked', booking_id = ?, held_by = NULL, held_until = NULL, hold_booking_id = NULL 
         WHERE showtime_id = ? AND seat_id IN (?)`,
        [bookingId, booking.showtime_id, seatIds]
      );

      // 4. Generate one ticket per booking seat with a QR verification code
      const ticketsCreated = [];
      const year = new Date().getFullYear();

      for (let i = 0; i < bookingSeats.length; i++) {
        const bs = bookingSeats[i];
        // Unique ticket number: TKT-YEAR-BOOKINGID-SEATCODE
        const ticketNumber = `TKT-${year}-${String(booking.booking_id).padStart(4, '0')}-${bs.row_label}${bs.seat_number}`;
        
        // Secure verification token: signed payload containing ticket number, booking ref, and hash
        const verificationToken = crypto
          .createHmac('sha256', process.env.SESSION_SECRET || 'movie_theater_secret_key')
          .update(`${ticketNumber}:${booking.booking_ref}`)
          .digest('hex')
          .substring(0, 24);

        const qrPayload = JSON.stringify({
          ticket: ticketNumber,
          booking: booking.booking_ref,
          seat: `${bs.row_label}${bs.seat_number}`,
          token: verificationToken
        });

        // Generate data URL for QR Code
        const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
          width: 200,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        });

        const [tResult] = await conn.query(
          `INSERT INTO tickets (booking_seat_id, booking_id, ticket_number, qr_code_path, status, issued_at)
           VALUES (?, ?, ?, ?, 'valid', NOW())`,
          [bs.booking_seat_id, bookingId, ticketNumber, qrCodeDataUrl]
        );

        ticketsCreated.push({
          ticketId: tResult.insertId,
          ticketNumber,
          seat: `${bs.row_label}${bs.seat_number}`
        });
      }

      await conn.commit();

      return {
        success: true,
        paymentId,
        transactionRef: txnRef,
        bookingId: booking.booking_id,
        bookingRef: booking.booking_ref,
        ticketsCount: ticketsCreated.length,
        tickets: ticketsCreated
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Get complete ticket information for viewing and printing.
   */
  static async getTicketDetails(ticketIdentifier, customerId = null, isAdmin = false) {
    let query = `
      SELECT 
        t.ticket_id, t.ticket_number, t.qr_code_path, t.status AS ticket_status, t.issued_at,
        b.booking_id, b.booking_ref, b.total_amount, b.status AS booking_status, b.booked_at, b.confirmed_at,
        c.customer_id, c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
        se.row_label, se.seat_number,
        st.name AS seat_category,
        bs.price_paid,
        s.showtime_id, s.start_time, s.end_time, s.language, s.format,
        m.movie_id, m.title AS movie_title, m.poster_path, m.duration_min, m.certification,
        sc.screen_id, sc.name AS screen_name, sc.screen_type,
        th.theater_id, th.name AS theater_name, th.city, th.address,
        p.transaction_ref, p.payment_method, p.paid_at
      FROM tickets t
      JOIN booking_seats bs ON t.booking_seat_id = bs.booking_seat_id
      JOIN seats se ON bs.seat_id = se.seat_id
      JOIN seat_types st ON se.seat_type_id = st.seat_type_id
      JOIN bookings b ON t.booking_id = b.booking_id
      JOIN customers c ON b.customer_id = c.customer_id
      JOIN showtimes s ON b.showtime_id = s.showtime_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters th ON sc.theater_id = th.theater_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.status = 'success'
      WHERE (t.ticket_number = ? OR t.ticket_id = ?)
    `;

    const params = [ticketIdentifier, isNaN(Number(ticketIdentifier)) ? 0 : Number(ticketIdentifier)];

    if (!isAdmin && customerId) {
      query += ` AND b.customer_id = ?`;
      params.push(customerId);
    }

    const [rows] = await pool.query(query, params);
    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  }

  /**
   * Get all tickets for a specific confirmed booking.
   */
  static async getBookingTickets(bookingId, customerId = null, isAdmin = false) {
    let query = `
      SELECT 
        b.booking_id, b.booking_ref, b.total_amount, b.status AS booking_status, b.confirmed_at,
        c.customer_id, c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
        s.showtime_id, s.start_time, s.end_time, s.language, s.format,
        m.movie_id, m.title AS movie_title, m.poster_path, m.duration_min, m.certification,
        sc.name AS screen_name, sc.screen_type,
        th.name AS theater_name, th.city, th.address,
        p.transaction_ref, p.payment_method, p.paid_at
      FROM bookings b
      JOIN customers c ON b.customer_id = c.customer_id
      JOIN showtimes s ON b.showtime_id = s.showtime_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters th ON sc.theater_id = th.theater_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.status = 'success'
      WHERE b.booking_id = ?
    `;

    const params = [bookingId];
    if (!isAdmin && customerId) {
      query += ` AND b.customer_id = ?`;
      params.push(customerId);
    }

    const [bookings] = await pool.query(query, params);
    if (bookings.length === 0) {
      return null;
    }

    const booking = bookings[0];

    // Fetch all ticket records for this booking
    const [tickets] = await pool.query(
      `SELECT 
         t.ticket_id, t.ticket_number, t.qr_code_path, t.status AS ticket_status, t.issued_at,
         se.row_label, se.seat_number,
         st.name AS seat_category,
         bs.price_paid
       FROM tickets t
       JOIN booking_seats bs ON t.booking_seat_id = bs.booking_seat_id
       JOIN seats se ON bs.seat_id = se.seat_id
       JOIN seat_types st ON se.seat_type_id = st.seat_type_id
       WHERE t.booking_id = ?
       ORDER BY se.row_label ASC, se.seat_number ASC`,
      [bookingId]
    );

    booking.tickets = tickets;

    // Fetch payment history for this booking
    const [payments] = await pool.query(
      `SELECT payment_id, transaction_ref, payment_method, amount, status, gateway_response, paid_at, created_at
       FROM payments 
       WHERE booking_id = ?
       ORDER BY created_at DESC`,
      [bookingId]
    );
    booking.payments = payments;

    return booking;
  }

  /**
   * Verify and mark a ticket as USED by staff / admin.
   */
  static async verifyAndUseTicket(ticketIdentifier) {
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [tickets] = await conn.query(
        `SELECT 
           t.ticket_id, t.ticket_number, t.status AS ticket_status,
           b.booking_ref, b.status AS booking_status,
           c.full_name AS customer_name,
           se.row_label, se.seat_number,
           s.start_time, s.format,
           m.title AS movie_title,
           sc.name AS screen_name,
           th.name AS theater_name
         FROM tickets t
         JOIN booking_seats bs ON t.booking_seat_id = bs.booking_seat_id
         JOIN seats se ON bs.seat_id = se.seat_id
         JOIN bookings b ON t.booking_id = b.booking_id
         JOIN customers c ON b.customer_id = c.customer_id
         JOIN showtimes s ON b.showtime_id = s.showtime_id
         JOIN movies m ON s.movie_id = m.movie_id
         JOIN screens sc ON s.screen_id = sc.screen_id
         JOIN theaters th ON sc.theater_id = th.theater_id
         WHERE t.ticket_number = ? OR t.ticket_id = ?
         FOR UPDATE`,
        [ticketIdentifier, isNaN(Number(ticketIdentifier)) ? 0 : Number(ticketIdentifier)]
      );

      if (tickets.length === 0) {
        throw new Error('Ticket not found in the system.');
      }

      const ticket = tickets[0];

      if (ticket.booking_status !== 'confirmed') {
        throw new Error(`Associated booking is ${ticket.booking_status}, not confirmed.`);
      }

      if (ticket.ticket_status === 'used') {
        throw new Error(`Ticket ${ticket.ticket_number} has ALREADY BEEN USED.`);
      }

      if (ticket.ticket_status === 'cancelled') {
        throw new Error(`Ticket ${ticket.ticket_number} has been CANCELLED.`);
      }

      // Mark ticket as used
      await conn.query(
        `UPDATE tickets SET status = 'used' WHERE ticket_id = ?`,
        [ticket.ticket_id]
      );

      await conn.commit();

      return {
        success: true,
        ticketNumber: ticket.ticket_number,
        movieTitle: ticket.movie_title,
        theaterName: ticket.theater_name,
        screenName: ticket.screen_name,
        seat: `${ticket.row_label}${ticket.seat_number}`,
        customerName: ticket.customer_name,
        message: 'Ticket successfully verified and marked as USED.'
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Get customer's booking & ticket history.
   */
  static async getCustomerBookingHistory(customerId) {
    const [bookings] = await pool.query(
      `SELECT 
         b.booking_id, b.booking_ref, b.total_amount, b.status AS booking_status, b.booked_at, b.confirmed_at,
         m.movie_id, m.title AS movie_title, m.poster_path, m.duration_min,
         s.showtime_id, s.start_time, s.format, s.language,
         th.name AS theater_name, th.city,
         sc.name AS screen_name,
         COUNT(DISTINCT t.ticket_id) AS ticket_count,
         p.transaction_ref, p.payment_method, p.status AS payment_status
       FROM bookings b
       JOIN showtimes s ON b.showtime_id = s.showtime_id
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters th ON sc.theater_id = th.theater_id
       LEFT JOIN tickets t ON b.booking_id = t.booking_id
       LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.status = 'success'
       WHERE b.customer_id = ?
       GROUP BY b.booking_id
       ORDER BY b.booked_at DESC`,
      [customerId]
    );

    return bookings;
  }
}

module.exports = PaymentService;
