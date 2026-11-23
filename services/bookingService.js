const { pool } = require('../config/db');

class BookingService {
  /**
   * Release any temporary holds that have expired.
   * Updates bookings status to 'expired' and frees held seats.
   */
  static async releaseExpiredHolds(showtimeId = null) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Find expired pending bookings
      // A booking is expired if it has been pending and its held_until timestamp is in the past
      // or if created > 10 minutes ago
      let findQuery = `
        SELECT DISTINCT b.booking_id 
        FROM bookings b
        JOIN showtime_seats ss ON ss.hold_booking_id = b.booking_id
        WHERE b.status = 'pending' AND ss.status = 'held' AND ss.held_until < NOW()
      `;
      const findParams = [];

      if (showtimeId) {
        findQuery += ' AND b.showtime_id = ?';
        findParams.push(showtimeId);
      }

      const [expiredBookings] = await conn.query(findQuery, findParams);

      if (expiredBookings.length > 0) {
        const expiredIds = expiredBookings.map(b => b.booking_id);

        // Delete any unconfirmed booking_seats records for expired holds
        await conn.query(
          `DELETE FROM booking_seats WHERE booking_id IN (?)`,
          [expiredIds]
        );

        // Mark showtime seats as available
        await conn.query(
          `UPDATE showtime_seats 
           SET status = 'available', held_by = NULL, held_until = NULL, hold_booking_id = NULL 
           WHERE hold_booking_id IN (?)`,
          [expiredIds]
        );

        // Mark bookings as expired
        await conn.query(
          `UPDATE bookings 
           SET status = 'expired', updated_at = NOW() 
           WHERE booking_id IN (?)`,
          [expiredIds]
        );
      }

      // Also clean up any stray held seats without active bookings where held_until < NOW()
      let strayQuery = `
        UPDATE showtime_seats 
        SET status = 'available', held_by = NULL, held_until = NULL, hold_booking_id = NULL 
        WHERE status = 'held' AND held_until < NOW()
      `;
      const strayParams = [];
      if (showtimeId) {
        strayQuery += ' AND showtime_id = ?';
        strayParams.push(showtimeId);
      }
      await conn.query(strayQuery, strayParams);

      await conn.commit();
      return expiredBookings.length;
    } catch (error) {
      await conn.rollback();
      console.error('Error releasing expired holds:', error.message);
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Retrieve showtime details and full screen seat layout with current availability.
   * Auto-releases expired holds before returning.
   */
  static async getShowtimeSeatMatrix(showtimeId, customerId = null) {
    // 1. Release expired holds first
    await this.releaseExpiredHolds(showtimeId);

    // 2. Fetch showtime details
    const [showtimeRows] = await pool.query(
      `SELECT 
         s.showtime_id, s.movie_id, s.screen_id, s.start_time, s.end_time, s.base_price, s.language, s.format, s.status,
         m.title AS movie_title, m.poster_path, m.duration_min, m.certification,
         sc.name AS screen_name, sc.screen_type, sc.total_capacity AS total_seats,
         t.theater_id, t.name AS theater_name, t.city, t.address
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       WHERE s.showtime_id = ?`,
      [showtimeId]
    );

    if (showtimeRows.length === 0) {
      return null;
    }

    const showtime = showtimeRows[0];

    // 3. Fetch seat categories with their pricing for this showtime from showtime_seats
    const [seatTypes] = await pool.query(
      `SELECT DISTINCT 
         st.seat_type_id, st.name, st.description, st.color_code,
         ss.price AS calculated_price
       FROM showtimes s
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN seats se ON sc.screen_id = se.screen_id
       JOIN seat_types st ON se.seat_type_id = st.seat_type_id
       JOIN showtime_seats ss ON se.seat_id = ss.seat_id AND ss.showtime_id = s.showtime_id
       WHERE s.showtime_id = ?
       ORDER BY calculated_price ASC`,
      [showtimeId]
    );

    // 4. Fetch all seats for the screen combined with showtime inventory status
    const [seatRows] = await pool.query(
      `SELECT 
         se.seat_id, se.screen_id, se.row_label, se.seat_number, se.is_active AS seat_active,
         st.seat_type_id, st.name AS category_name, st.color_code,
         ss.showtime_seat_id, ss.price, ss.status AS seat_status, ss.held_by, ss.held_until, ss.hold_booking_id
       FROM seats se
       JOIN seat_types st ON se.seat_type_id = st.seat_type_id
       LEFT JOIN showtime_seats ss ON se.seat_id = ss.seat_id AND ss.showtime_id = ?
       WHERE se.screen_id = ?
       ORDER BY se.row_label ASC, se.seat_number ASC`,
      [showtimeId, showtime.screen_id]
    );

    // Group seats by row for layout rendering
    const rows = {};
    let totalAvailable = 0;
    let totalHeld = 0;
    let totalBooked = 0;

    for (const seat of seatRows) {
      // Determine effective visual status
      let effectiveStatus = seat.seat_status || 'available';
      if (!seat.seat_active) {
        effectiveStatus = 'blocked';
      }

      // Check if held by the current requesting user
      const isMyHold = customerId && seat.held_by === customerId && seat.seat_status === 'held';

      if (effectiveStatus === 'available') totalAvailable++;
      else if (effectiveStatus === 'held') totalHeld++;
      else if (effectiveStatus === 'booked') totalBooked++;

      if (!rows[seat.row_label]) {
        rows[seat.row_label] = [];
      }

      rows[seat.row_label].push({
        seatId: seat.seat_id,
        seatNumber: seat.seat_number,
        rowLabel: seat.row_label,
        seatCode: `${seat.row_label}${seat.seat_number}`,
        categoryName: seat.category_name,
        colorCode: seat.color_code,
        price: Number(seat.price !== null ? seat.price : showtime.base_price).toFixed(2),
        status: effectiveStatus,
        isMyHold: !!isMyHold,
        isActive: Boolean(seat.seat_active)
      });
    }

    return {
      showtime,
      seatTypes,
      rows,
      summary: {
        totalSeats: seatRows.length,
        available: totalAvailable,
        held: totalHeld,
        booked: totalBooked
      }
    };
  }

  /**
   * Temporarily hold seats for a customer with strict atomic concurrency control.
   * Uses SELECT ... FOR UPDATE in consistent seat ID order.
   */
  static async holdSeats({ customerId, showtimeId, seatIds }) {
    if (!customerId) {
      throw new Error('Authentication required to reserve seats.');
    }

    // Verify customer account is active (blocked customers cannot book)
    const [custRows] = await pool.query(
      `SELECT status FROM customers WHERE customer_id = ?`,
      [customerId]
    );
    if (custRows.length === 0 || custRows[0].status === 'blocked') {
      throw new Error('Your account is suspended or blocked. You cannot book seats.');
    }

    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      throw new Error('Please select at least one seat.');
    }

    if (seatIds.length > 10) {
      throw new Error('You can reserve at most 10 seats per booking.');
    }

    // Deduplicate and convert to numbers
    const cleanSeatIds = Array.from(new Set(seatIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0)));
    if (cleanSeatIds.length === 0) {
      throw new Error('Invalid seats selected.');
    }

    // Sort numerically ascending to prevent deadlock during concurrent lock acquisition
    cleanSeatIds.sort((a, b) => a - b);

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Verify showtime exists and has not started
      const [showtimeRows] = await conn.query(
        `SELECT showtime_id, movie_id, screen_id, start_time, status 
         FROM showtimes 
         WHERE showtime_id = ?`,
        [showtimeId]
      );

      if (showtimeRows.length === 0) {
        throw new Error('Showtime not found.');
      }

      const showtime = showtimeRows[0];
      if (showtime.status !== 'scheduled') {
        throw new Error(`This showtime is ${showtime.status}.`);
      }

      if (new Date(showtime.start_time) <= new Date()) {
        throw new Error('This showtime has already started.');
      }

      // Lock the requested seats FOR UPDATE in sorted order
      const [lockedSeats] = await conn.query(
        `SELECT 
           ss.showtime_seat_id, ss.showtime_id, ss.seat_id, ss.price, ss.status, ss.held_by, ss.held_until,
           se.row_label, se.seat_number, se.is_active
         FROM showtime_seats ss
         JOIN seats se ON ss.seat_id = se.seat_id
         WHERE ss.showtime_id = ? AND ss.seat_id IN (?)
         ORDER BY ss.seat_id ASC
         FOR UPDATE`,
        [showtimeId, cleanSeatIds]
      );

      if (lockedSeats.length !== cleanSeatIds.length) {
        throw new Error('One or more selected seats do not exist in this showtime inventory.');
      }

      // Validate availability of every seat
      const unavailableSeats = [];
      let totalAmount = 0;

      for (const seat of lockedSeats) {
        if (!seat.is_active) {
          unavailableSeats.push(`${seat.row_label}${seat.seat_number} (Blocked)`);
          continue;
        }

        // Available seat check
        if (seat.status === 'booked') {
          unavailableSeats.push(`${seat.row_label}${seat.seat_number} (Already Booked)`);
        } else if (seat.status === 'held') {
          // If held by someone else and hold hasn't expired
          if (seat.held_by !== customerId && new Date(seat.held_until) > new Date()) {
            unavailableSeats.push(`${seat.row_label}${seat.seat_number} (Held by another customer)`);
          }
        } else if (seat.status !== 'available') {
          unavailableSeats.push(`${seat.row_label}${seat.seat_number} (Unavailable)`);
        }

        totalAmount += Number(seat.price);
      }

      if (unavailableSeats.length > 0) {
        throw new Error(`The following seats are no longer available: ${unavailableSeats.join(', ')}`);
      }

      // If customer has an existing pending booking for this showtime, expire/release it
      const [existingPending] = await conn.query(
        `SELECT booking_id FROM bookings WHERE customer_id = ? AND showtime_id = ? AND status = 'pending'`,
        [customerId, showtimeId]
      );

      if (existingPending.length > 0) {
        const oldBookingIds = existingPending.map(b => b.booking_id);
        await conn.query(
          `DELETE FROM booking_seats WHERE booking_id IN (?)`,
          [oldBookingIds]
        );
        await conn.query(
          `UPDATE showtime_seats 
           SET status = 'available', held_by = NULL, held_until = NULL, hold_booking_id = NULL 
           WHERE hold_booking_id IN (?)`,
          [oldBookingIds]
        );
        await conn.query(
          `UPDATE bookings SET status = 'cancelled', cancel_reason = 'Replaced by new seat selection' WHERE booking_id IN (?)`,
          [oldBookingIds]
        );
      }

      // Generate unique booking reference: BK + timestamp + random suffix
      const bookingRef = `BK${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 10 minute hold window
      const holdMinutes = 10;
      const [bookingResult] = await conn.query(
        `INSERT INTO bookings (booking_ref, customer_id, showtime_id, total_amount, status, booked_at)
         VALUES (?, ?, ?, ?, 'pending', NOW())`,
        [bookingRef, customerId, showtimeId, totalAmount.toFixed(2)]
      );

      const bookingId = bookingResult.insertId;

      // Insert snapshot records in booking_seats
      const bookingSeatsData = lockedSeats.map(seat => [
        bookingId,
        seat.seat_id,
        showtimeId,
        seat.price
      ]);

      await conn.query(
        `INSERT INTO booking_seats (booking_id, seat_id, showtime_id, price_paid) VALUES ?`,
        [bookingSeatsData]
      );

      // Update showtime_seats to 'held' with 10 min hold_until and hold_booking_id
      await conn.query(
        `UPDATE showtime_seats 
         SET status = 'held', held_by = ?, hold_booking_id = ?, held_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
         WHERE showtime_id = ? AND seat_id IN (?)`,
        [customerId, bookingId, holdMinutes, showtimeId, cleanSeatIds]
      );

      await conn.commit();

      return {
        bookingId,
        bookingRef,
        totalAmount: totalAmount.toFixed(2),
        seatCount: cleanSeatIds.length,
        expiresInSeconds: holdMinutes * 60
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Fetch complete booking details including held/booked seats, movie, and showtime info.
   */
  static async getBookingDetails(bookingId, customerId = null) {
    let query = `
      SELECT 
        b.booking_id, b.booking_ref, b.customer_id, b.showtime_id, b.total_amount, b.status, b.booked_at,
        c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
        s.start_time, s.end_time, s.language, s.format,
        m.movie_id, m.title AS movie_title, m.poster_path, m.duration_min, m.certification,
        sc.name AS screen_name, sc.screen_type,
        t.theater_id, t.name AS theater_name, t.city, t.address,
        MAX(ss.held_until) AS held_until,
        TIMESTAMPDIFF(SECOND, NOW(), MAX(ss.held_until)) AS remaining_seconds
      FROM bookings b
      JOIN customers c ON b.customer_id = c.customer_id
      JOIN showtimes s ON b.showtime_id = s.showtime_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters t ON sc.theater_id = t.theater_id
      LEFT JOIN showtime_seats ss ON ss.hold_booking_id = b.booking_id
      WHERE b.booking_id = ?
    `;
    const params = [bookingId];

    if (customerId) {
      query += ' AND b.customer_id = ?';
      params.push(customerId);
    }

    query += ' GROUP BY b.booking_id';

    const [rows] = await pool.query(query, params);
    if (rows.length === 0) {
      return null;
    }

    const booking = rows[0];

    // Fetch individual seats booked
    const [seats] = await pool.query(
      `SELECT 
         bs.seat_id, bs.price_paid,
         se.row_label, se.seat_number,
         st.name AS category_name
       FROM booking_seats bs
       JOIN seats se ON bs.seat_id = se.seat_id
       JOIN seat_types st ON se.seat_type_id = st.seat_type_id
       WHERE bs.booking_id = ?
       ORDER BY se.row_label ASC, se.seat_number ASC`,
      [bookingId]
    );

    booking.seats = seats;
    booking.remainingSeconds = Math.max(0, booking.remaining_seconds || 0);

    return booking;
  }

  /**
   * Cancel / release a pending hold.
   */
  static async cancelHold(bookingId, customerId = null) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let checkQuery = `SELECT booking_id, status FROM bookings WHERE booking_id = ?`;
      const checkParams = [bookingId];
      if (customerId) {
        checkQuery += ' AND customer_id = ?';
        checkParams.push(customerId);
      }
      checkQuery += ' FOR UPDATE';

      const [bookings] = await conn.query(checkQuery, checkParams);
      if (bookings.length === 0) {
        throw new Error('Booking not found or unauthorized.');
      }

      const booking = bookings[0];
      if (booking.status !== 'pending') {
        throw new Error(`Cannot cancel booking with status ${booking.status}.`);
      }

      // Release seats
      await conn.query(
        `UPDATE showtime_seats 
         SET status = 'available', held_by = NULL, held_until = NULL, hold_booking_id = NULL 
         WHERE hold_booking_id = ?`,
        [bookingId]
      );

      // Remove unconfirmed booking_seats records so seats can be re-booked
      await conn.query(`DELETE FROM booking_seats WHERE booking_id = ?`, [bookingId]);

      // Update booking status
      await conn.query(
        `UPDATE bookings 
         SET status = 'cancelled', cancel_reason = 'Cancelled by user', cancelled_at = NOW() 
         WHERE booking_id = ?`,
        [bookingId]
      );

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

module.exports = BookingService;
