const { pool } = require('../config/db');

/**
 * Display Simplified Simulated Payment Page
 */
async function getPaymentPage(req, res, next) {
  try {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to proceed with payment.');
      return res.redirect('/login');
    }

    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/payments');
    }

    const bookingId = req.params.bookingId || req.params.id;
    const userId = req.session.user.user_id;
    const isAdmin = req.session.user.role === 'admin';

    // 1. Fetch booking details
    const [bookingRows] = await pool.query(
      `SELECT b.booking_id, b.booking_ref, b.user_id, b.showtime_id, b.total_amount, b.booking_status, b.booking_date,
              m.movie_id, m.title AS movie_title, m.poster_url, m.duration_min, m.language,
              t.name AS theater_name, t.city,
              sc.screen_name,
              s.show_date, s.start_time, s.end_time,
              u.full_name AS customer_name
       FROM bookings b
       JOIN users u ON b.user_id = u.user_id
       JOIN showtimes s ON b.showtime_id = s.showtime_id
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       WHERE b.booking_id = ?
       LIMIT 1`,
      [bookingId]
    );

    if (bookingRows.length === 0) {
      req.flash('error', 'Booking order not found.');
      return res.redirect('/customer/dashboard');
    }

    const booking = bookingRows[0];

    // Authorization Check: prevent viewing another customer's booking
    if (!isAdmin && booking.user_id !== userId) {
      req.flash('error', 'Access denied: You cannot view payment for another customer\'s booking.');
      return res.redirect('/customer/dashboard');
    }

    if (booking.booking_status === 'CONFIRMED') {
      req.flash('info', 'This booking has already been paid and confirmed.');
      return res.redirect(`/bookings/${booking.booking_id}/confirmation`);
    }

    if (booking.booking_status === 'CANCELLED') {
      req.flash('error', 'This booking has been cancelled and seats were released.');
      return res.redirect('/customer/dashboard');
    }

    // Fetch seats in this booking
    const [seats] = await pool.query(
      `SELECT bs.booking_seat_id, bs.price, st.row_label, st.seat_number, st.seat_type
       FROM booking_seats bs
       JOIN seats st ON bs.seat_id = st.seat_id
       WHERE bs.booking_id = ?
       ORDER BY st.row_label, st.seat_number`,
      [bookingId]
    );

    booking.seats = seats;
    booking.seats_list = seats.map(s => `${s.row_label}${s.seat_number}`).join(', ');
    booking.poster_path = booking.poster_url || '/images/posters/fallback.svg';
    booking.certification = 'UA';
    booking.format = '2D';

    // Format clean date string safely without timezone offset issues
    let dateStr = '';
    if (booking.show_date instanceof Date) {
      const y = booking.show_date.getFullYear();
      const m = String(booking.show_date.getMonth() + 1).padStart(2, '0');
      const d = String(booking.show_date.getDate()).padStart(2, '0');
      dateStr = `${y}-${m}-${d}`;
    } else {
      dateStr = String(booking.show_date || '').split('T')[0];
    }
    const timeStr = String(booking.start_time || '10:00:00').slice(0, 5);

    let readableDateTime = `${dateStr} at ${timeStr}`;
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const mIdx = parseInt(parts[1], 10) - 1;
        const [hours, mins] = timeStr.split(':').map(Number);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        readableDateTime = `${months[mIdx] || parts[1]} ${parts[2]}, ${parts[0]} at ${displayHours}:${String(mins).padStart(2, '0')} ${ampm}`;
      }
    } catch (e) {}

    booking.formatted_datetime = readableDateTime;
    booking.formatted_date = dateStr;
    booking.formatted_time = timeStr;

    res.render('bookings/payment', {
      title: `Confirm Payment: ${booking.booking_ref} - CineSeat Manager`,
      activePage: 'movies',
      booking,
      csrfToken: 'demo-token'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Process Simple Simulated Payment (ACID Transaction)
 *
 * Requirements:
 * - Single button click triggers simulated payment completion
 * - Uses MySQL transaction with row lock
 * - Records payment in payments table
 * - Updates booking status to CONFIRMED
 * - Strict authorization check: cannot pay for another user's booking
 */
async function processPayment(req, res, next) {
  let connection;
  const isJsonReq = req.xhr || req.headers.accept?.includes('application/json') || req.body.format === 'json';

  try {
    if (!req.session || !req.session.user) {
      if (isJsonReq) {
        return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
      }
      req.flash('error', 'Please log in to continue.');
      return res.redirect('/login');
    }

    const userId = req.session.user.user_id;
    const isAdmin = req.session.user.role === 'admin';

    if (isAdmin) {
      if (isJsonReq) {
        return res.status(403).json({ success: false, error: 'Administrators cannot execute customer payments.' });
      }
      return res.redirect('/admin/payments');
    }

    const bookingId = req.params?.bookingId || req.params?.id || req.body?.booking_id;
    const simulationAction = req.body?.simulation_action || (req.body?.fail ? 'fail' : 'success');

    if (!bookingId) {
      if (isJsonReq) {
        return res.status(400).json({ success: false, error: 'Booking ID is required.' });
      }
      req.flash('error', 'Booking ID is required.');
      return res.redirect('/customer/dashboard');
    }

    // Acquire connection for ACID Transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Fetch booking with row lock
    const [bookingRows] = await connection.query(
      `SELECT booking_id, booking_ref, user_id, total_amount, booking_status
       FROM bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingRows.length === 0) {
      await connection.rollback();
      if (isJsonReq) {
        return res.status(404).json({ success: false, error: 'Booking order not found.' });
      }
      req.flash('error', 'Booking order not found.');
      return res.redirect('/customer/dashboard');
    }

    const booking = bookingRows[0];

    // Authorization Check: Only booking owner or admin can pay
    if (!isAdmin && booking.user_id !== userId) {
      await connection.rollback();
      if (isJsonReq) {
        return res.status(403).json({ success: false, error: 'Unauthorized: You cannot pay for another customer\'s booking.' });
      }
      req.flash('error', 'Access denied: You cannot pay for another customer\'s booking.');
      return res.redirect('/customer/dashboard');
    }

    if (booking.booking_status === 'CONFIRMED') {
      await connection.rollback();
      if (isJsonReq) {
        return res.status(200).json({ success: true, message: 'Booking has already been confirmed.', booking_id: bookingId });
      }
      req.flash('info', 'Booking has already been confirmed.');
      return res.redirect(`/bookings/${bookingId}/confirmation`);
    }

    if (booking.booking_status === 'CANCELLED') {
      await connection.rollback();
      if (isJsonReq) {
        return res.status(400).json({ success: false, error: 'This reservation was cancelled.' });
      }
      req.flash('error', 'This reservation was cancelled.');
      return res.redirect('/customer/dashboard');
    }

    // Determine simulated payment outcome (default is success)
    const isSuccess = simulationAction !== 'fail';
    const paymentStatus = isSuccess ? 'SUCCESS' : 'FAILED';
    const txnRef = 'TXN-' + Date.now().toString().slice(-8) + '-' + Math.floor(1000 + Math.random() * 9000);

    // 2. Insert Payment Record
    const [paymentResult] = await connection.query(
      `INSERT INTO payments (booking_id, transaction_ref, payment_method, amount, payment_status)
       VALUES (?, ?, 'UPI', ?, ?)`,
      [bookingId, txnRef, booking.total_amount, paymentStatus]
    );

    if (isSuccess) {
      // 3. Update Booking Status to CONFIRMED
      await connection.query(
        `UPDATE bookings
         SET booking_status = 'CONFIRMED'
         WHERE booking_id = ?`,
        [bookingId]
      );

      await connection.commit();

      if (isJsonReq) {
        return res.status(200).json({
          success: true,
          booking_id: bookingId,
          transaction_ref: txnRef,
          payment_status: 'SUCCESS',
          booking_status: 'CONFIRMED',
          amount: booking.total_amount
        });
      }

      req.flash('success', `Payment of ₹${Number(booking.total_amount).toFixed(2)} successful! Booking confirmed.`);
      return res.redirect(`/bookings/${bookingId}/confirmation`);
    } else {
      // Failed payment simulation
      await connection.commit();

      if (isJsonReq) {
        return res.status(402).json({
          success: false,
          booking_id: bookingId,
          transaction_ref: txnRef,
          payment_status: 'FAILED',
          error: 'Simulated payment was declined.'
        });
      }

      req.flash('error', 'Simulated payment was declined. Please try again.');
      return res.redirect(`/bookings/${bookingId}/payment`);
    }
  } catch (error) {
    if (connection) await connection.rollback();
    if (isJsonReq) {
      return res.status(500).json({ success: false, error: error.message });
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  getPaymentPage,
  processPayment
};
