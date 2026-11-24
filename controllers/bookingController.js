const { pool } = require('../config/db');

/**
 * Helper to calculate seat price based on seat_type and base ticket_price
 */
function calculatePrice(seatType, basePrice) {
  const base = parseFloat(basePrice) || 200.00;
  if (!seatType) return base.toFixed(2);
  const type = seatType.toUpperCase();
  if (type === 'VIP') return (base * 1.50).toFixed(2);
  if (type === 'PREMIUM') return (base * 1.25).toFixed(2);
  return base.toFixed(2);
}

/**
 * Display Seat Selection Matrix for a Showtime
 */
async function getSeatSelection(req, res, next) {
  try {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
      req.flash('info', 'Administrator accounts manage cinema operations and do not place bookings.');
      return res.redirect('/admin/dashboard');
    }

    const showtimeId = req.params?.showtimeId || req.params?.id || req.query?.showtime_id;

    // 1. Fetch showtime with movie, screen, and theater info
    const [showtimeRows] = await pool.query(
      `SELECT s.showtime_id, s.movie_id, s.screen_id, s.show_date, s.start_time, s.end_time, s.ticket_price,
              m.title AS movie_title, m.poster_url, m.duration_min, m.language, m.genre,
              sc.screen_name, sc.total_capacity,
              t.theater_id, t.name AS theater_name, t.city
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       WHERE s.showtime_id = ? AND s.status = 'SCHEDULED'
       LIMIT 1`,
      [showtimeId]
    );

    if (showtimeRows.length === 0) {
      req.flash('error', 'Showtime not found or has been cancelled.');
      return res.redirect('/movies');
    }

    const showtime = showtimeRows[0];
    showtime.poster_path = showtime.poster_url || '/images/posters/fallback.svg';
    showtime.certification = 'UA';
    showtime.format = '2D';

    // Format display date and time cleanly
    const dateStr = showtime.show_date instanceof Date 
      ? showtime.show_date.toISOString().split('T')[0] 
      : String(showtime.show_date);
    const startDateTime = new Date(`${dateStr}T${showtime.start_time}`);
    showtime.formatted_datetime = isNaN(startDateTime.getTime()) 
      ? `${dateStr} ${showtime.start_time}` 
      : startDateTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // 2. Fetch all physical seats in this screen
    const [seats] = await pool.query(
      `SELECT seat_id, screen_id, row_label, seat_number, seat_type
       FROM seats
       WHERE screen_id = ?
       ORDER BY row_label ASC, seat_number ASC`,
      [showtime.screen_id]
    );

    // 3. Fetch currently booked / pending seats for this showtime
    // A physical seat is unavailable for this showtime if included in a booking for this same showtime with status PENDING or CONFIRMED
    const [reservedRows] = await pool.query(
      `SELECT bs.seat_id, b.user_id, b.booking_status
       FROM booking_seats bs
       JOIN bookings b ON bs.booking_id = b.booking_id
       WHERE b.showtime_id = ? AND b.booking_status IN ('PENDING', 'CONFIRMED')`,
      [showtimeId]
    );

    const currentUserId = req.session?.user?.user_id || null;
    const reservedMap = new Map();
    reservedRows.forEach(r => {
      reservedMap.set(r.seat_id, {
        status: r.booking_status === 'CONFIRMED' ? 'booked' : 'held',
        isMyHold: currentUserId && r.user_id === currentUserId && r.booking_status === 'PENDING'
      });
    });

    // 4. Organize seats by row
    const rows = {};
    const seatTypePricings = [
      { name: 'Standard', calculated_price: calculatePrice('STANDARD', showtime.ticket_price) },
      { name: 'Premium', calculated_price: calculatePrice('PREMIUM', showtime.ticket_price) },
      { name: 'VIP', calculated_price: calculatePrice('VIP', showtime.ticket_price) }
    ];

    seats.forEach(seat => {
      const rowLabel = seat.row_label;
      if (!rows[rowLabel]) {
        rows[rowLabel] = [];
      }

      const reservation = reservedMap.get(seat.seat_id);
      const isBooked = Boolean(reservation);
      const seatStatus = isBooked ? (reservation.status === 'booked' ? 'booked' : 'held') : 'available';

      rows[rowLabel].push({
        seatId: seat.seat_id,
        seat_id: seat.seat_id,
        seatNumber: seat.seat_number,
        rowLabel: seat.row_label,
        seatCode: `${seat.row_label}${seat.seat_number}`,
        categoryName: seat.seat_type,
        price: calculatePrice(seat.seat_type, showtime.ticket_price),
        status: seatStatus,
        isMyHold: reservation ? reservation.isMyHold : false
      });
    });

    res.render('bookings/select-seats', {
      title: `Select Seats: ${showtime.movie_title} - CineSeat Manager`,
      activePage: 'movies',
      showtime,
      rows,
      seatTypes: seatTypePricings,
      csrfToken: 'demo-token'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Live Seat Availability API (JSON Endpoint for Poller)
 */
async function getSeatAvailabilityApi(req, res) {
  try {
    const showtimeId = req.params?.showtimeId || req.query?.showtime_id;

    const [reservedRows] = await pool.query(
      `SELECT bs.seat_id, b.user_id, b.booking_status
       FROM booking_seats bs
       JOIN bookings b ON bs.booking_id = b.booking_id
       WHERE b.showtime_id = ? AND b.booking_status IN ('PENDING', 'CONFIRMED')`,
      [showtimeId]
    );

    const currentUserId = req.session?.user?.user_id || null;
    const seats = reservedRows.map(r => ({
      seat_id: r.seat_id,
      seatId: r.seat_id,
      status: r.booking_status === 'CONFIRMED' ? 'booked' : 'held',
      is_my_hold: Boolean(currentUserId && r.user_id === currentUserId && r.booking_status === 'PENDING'),
      isMyHold: Boolean(currentUserId && r.user_id === currentUserId && r.booking_status === 'PENDING')
    }));

    return res.json({ success: true, seats });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Create a Booking (Transactional Seat Reservation & Integrity Check)
 *
 * Booking Safety Guarantees:
 * 1. Dedicated MySQL transaction (pool.getConnection -> beginTransaction)
 * 2. Consistent lock order: sorts seat IDs ascending to prevent deadlocks
 * 3. Lock seat rows with SELECT ... FOR UPDATE
 * 4. Recheck seat availability inside transaction (PENDING or CONFIRMED for same showtime)
 * 5. Calculate total amount accurately
 * 6. Insert booking record and booking_seats records
 * 7. Commit only on total success; rollback on any failure
 */
async function createBooking(req, res, next) {
  let connection;
  const isJsonReq = req.xhr || req.headers.accept?.includes('application/json') || req.body.format === 'json';

  try {
    if (!req.session || !req.session.user) {
      if (isJsonReq) {
        return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
      }
      req.flash('error', 'Please log in to reserve seats.');
      return res.redirect('/login');
    }

    if (req.session.user.role === 'admin') {
      if (isJsonReq) {
        return res.status(403).json({ success: false, error: 'Administrators cannot book seats. Please use a customer account.' });
      }
      req.flash('error', 'Administrators cannot place customer bookings.');
      return res.redirect('/admin/dashboard');
    }

    const userId = req.session.user.user_id;
    let { showtime_id, seat_ids, direct_confirm, auto_confirm } = req.body;

    if (!showtime_id) {
      if (isJsonReq) {
        return res.status(400).json({ success: false, error: 'Showtime ID is required.' });
      }
      req.flash('error', 'Showtime ID is required.');
      return res.redirect('/movies');
    }

    // Parse seat_ids if passed as JSON string or comma-delimited string
    let parsedSeatIds = [];
    if (typeof seat_ids === 'string') {
      try {
        parsedSeatIds = JSON.parse(seat_ids);
      } catch (e) {
        parsedSeatIds = seat_ids.split(',').map(s => s.trim());
      }
    } else if (Array.isArray(seat_ids)) {
      parsedSeatIds = seat_ids;
    }

    parsedSeatIds = parsedSeatIds.map(Number).filter(id => !isNaN(id) && id > 0);

    if (parsedSeatIds.length === 0) {
      if (isJsonReq) {
        return res.status(400).json({ success: false, error: 'Please select at least one seat.' });
      }
      req.flash('error', 'Please select at least one seat.');
      return res.redirect(`/showtimes/${showtime_id}/seats`);
    }

    if (parsedSeatIds.length > 10) {
      if (isJsonReq) {
        return res.status(400).json({ success: false, error: 'You cannot book more than 10 seats in a single reservation.' });
      }
      req.flash('error', 'You cannot book more than 10 seats in a single reservation.');
      return res.redirect(`/showtimes/${showtime_id}/seats`);
    }

    // Consistent lock order: sort unique seat IDs in strictly ascending numerical order
    // to prevent deadlock when concurrent transactions attempt to lock the same set of seats
    const sortedSeatIds = [...new Set(parsedSeatIds)].sort((a, b) => a - b);

    // Acquire dedicated connection from pool for ACID Transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Verify showtime exists and is active, locking the showtime row
    const [stRows] = await connection.query(
      'SELECT showtime_id, screen_id, ticket_price, status FROM showtimes WHERE showtime_id = ? FOR UPDATE',
      [showtime_id]
    );

    if (stRows.length === 0 || stRows[0].status !== 'SCHEDULED') {
      await connection.rollback();
      if (isJsonReq) {
        return res.status(400).json({ success: false, error: 'Selected showtime is no longer active.' });
      }
      req.flash('error', 'Selected showtime is no longer active.');
      return res.redirect('/movies');
    }

    const showtime = stRows[0];

    // 2. Lock the relevant seat rows using SELECT ... FOR UPDATE in consistent ascending order
    const placeholders = sortedSeatIds.map(() => '?').join(',');
    const [lockedSeats] = await connection.query(
      `SELECT seat_id, screen_id, row_label, seat_number, seat_type
       FROM seats
       WHERE seat_id IN (${placeholders}) AND screen_id = ?
       ORDER BY seat_id ASC
       FOR UPDATE`,
      [...sortedSeatIds, showtime.screen_id]
    );

    // If any requested seat does not exist or does not belong to this screen, reject
    if (lockedSeats.length !== sortedSeatIds.length) {
      await connection.rollback();
      if (isJsonReq) {
        return res.status(400).json({ success: false, error: 'One or more invalid seat IDs were selected for this screen.' });
      }
      req.flash('error', 'One or more invalid seat IDs were selected for this screen.');
      return res.redirect(`/showtimes/${showtime_id}/seats`);
    }

    // 3. Recheck seat availability inside the transaction:
    // A physical seat is unavailable for this showtime if it is already included in a booking
    // for this SAME showtime whose booking status is PENDING or CONFIRMED.
    const [conflictRows] = await connection.query(
      `SELECT bs.seat_id, s.row_label, s.seat_number
       FROM booking_seats bs
       INNER JOIN bookings b ON bs.booking_id = b.booking_id
       INNER JOIN seats s ON bs.seat_id = s.seat_id
       WHERE b.showtime_id = ?
         AND b.booking_status IN ('PENDING', 'CONFIRMED')
         AND bs.seat_id IN (${placeholders})
       FOR UPDATE`,
      [showtime_id, ...sortedSeatIds]
    );

    if (conflictRows.length > 0) {
      await connection.rollback();
      const conflictList = conflictRows.map(c => `${c.row_label}${c.seat_number}`).join(', ');
      const msg = `Seat ${conflictList} is already booked for this showtime.`;
      if (isJsonReq) {
        return res.status(409).json({ success: false, error: msg, conflicted_seats: conflictRows });
      }
      req.flash('error', msg);
      return res.redirect(`/showtimes/${showtime_id}/seats`);
    }

    // 4. Calculate total price
    let totalAmount = 0;
    const seatPriceMap = {};
    lockedSeats.forEach(s => {
      const price = parseFloat(calculatePrice(s.seat_type, showtime.ticket_price));
      seatPriceMap[s.seat_id] = price;
      totalAmount += price;
    });

    const shouldAutoConfirm = direct_confirm === true || direct_confirm === 'true' || auto_confirm === true || auto_confirm === 'true';
    const initialStatus = shouldAutoConfirm ? 'CONFIRMED' : 'PENDING';

    // 5. Insert Master Booking Record
    const bookingRef = 'BK-' + Date.now().toString().slice(-8) + '-' + Math.floor(100 + Math.random() * 900);
    const [bookingResult] = await connection.query(
      `INSERT INTO bookings (booking_ref, user_id, showtime_id, total_amount, booking_status)
       VALUES (?, ?, ?, ?, ?)`,
      [bookingRef, userId, showtime_id, totalAmount, initialStatus]
    );

    const bookingId = bookingResult.insertId;

    // 6. Insert Individual Booking Seats
    for (const seatId of sortedSeatIds) {
      await connection.query(
        `INSERT INTO booking_seats (booking_id, seat_id, price)
         VALUES (?, ?, ?)`,
        [bookingId, seatId, seatPriceMap[seatId]]
      );
    }

    // If auto-confirm is requested, record payment as well
    if (shouldAutoConfirm) {
      const txnRef = 'TXN-' + Date.now().toString().slice(-8) + '-' + Math.floor(1000 + Math.random() * 9000);
      await connection.query(
        `INSERT INTO payments (booking_id, transaction_ref, payment_method, amount, payment_status)
         VALUES (?, ?, 'UPI', ?, 'SUCCESS')`,
        [bookingId, txnRef, totalAmount]
      );
    }

    // 7. Commit Transaction only when all operations succeed
    await connection.commit();

    if (isJsonReq) {
      return res.status(201).json({
        success: true,
        booking_id: bookingId,
        booking_ref: bookingRef,
        total_amount: totalAmount,
        booking_status: initialStatus,
        seats_count: sortedSeatIds.length
      });
    }

    if (shouldAutoConfirm) {
      req.flash('success', `Booking confirmed successfully! Ref: ${bookingRef}`);
      return res.redirect(`/bookings/${bookingId}/confirmation`);
    }

    return res.redirect(`/bookings/${bookingId}/payment`);
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.error('Rollback error:', rbErr);
      }
    }
    if (isJsonReq) {
      return res.status(500).json({ success: false, error: error.message });
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Display Booking Confirmation Page
 */
async function getConfirmation(req, res, next) {
  try {
    const bookingId = req.params?.bookingId || req.params?.id || req.body?.booking_id;

    const [bookingRows] = await pool.query(
      `SELECT b.booking_id, b.booking_ref, b.user_id, b.showtime_id, b.total_amount, b.booking_status, b.booking_date,
              m.title AS movie_title, m.poster_url, m.language, m.duration_min,
              t.name AS theater_name, t.city, t.address,
              sc.screen_name,
              s.show_date, s.start_time, s.end_time,
              u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
              p.transaction_ref, p.payment_method, p.payment_status, p.payment_date
       FROM bookings b
       JOIN users u ON b.user_id = u.user_id
       JOIN showtimes s ON b.showtime_id = s.showtime_id
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.payment_status = 'SUCCESS'
       WHERE b.booking_id = ?
       LIMIT 1`,
      [bookingId]
    );

    if (bookingRows.length === 0) {
      req.flash('error', 'Booking not found.');
      return res.redirect('/customer/dashboard');
    }

    const booking = bookingRows[0];

    // Authorization check: Prevent viewing another customer's booking
    const currentUserId = req.session?.user?.user_id;
    const isAdmin = req.session?.user?.role === 'admin';
    if (!isAdmin && booking.user_id !== currentUserId) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ success: false, error: 'Unauthorized: You cannot access another customer\'s booking.' });
      }
      req.flash('error', 'Access denied: You cannot view another customer\'s booking.');
      return res.redirect('/customer/dashboard');
    }

    // Fetch reserved seats
    const [seats] = await pool.query(
      `SELECT bs.booking_seat_id, bs.price, st.row_label, st.seat_number, st.seat_type
       FROM booking_seats bs
       JOIN seats st ON bs.seat_id = st.seat_id
       WHERE bs.booking_id = ?
       ORDER BY st.row_label, st.seat_number`,
      [bookingId]
    );

    // Format show date safely without timezone shift
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

    // Human-readable datetime string (e.g., 'Tue, Nov 24, 2026 at 10:00 AM')
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

    booking.seats = seats;
    booking.seats_list = seats.map(s => `${s.row_label}${s.seat_number}`).join(', ');
    booking.poster_path = booking.poster_url || '/images/posters/fallback.svg';
    booking.formatted_datetime = readableDateTime;
    booking.formatted_date = dateStr;
    booking.formatted_time = timeStr;

    const ticketList = seats.map((s) => {
      const seatCode = `${s.row_label}${s.seat_number}`;
      const tktNumber = `TKT-${booking.booking_ref}-${seatCode}`;
      const seatPrice = Number(s.price) || (Number(booking.total_amount) / (seats.length || 1)) || 0;
      return {
        booking_id: booking.booking_id,
        booking_ref: booking.booking_ref,
        ticket_number: tktNumber,
        seat_code: seatCode,
        row_label: s.row_label,
        seat_number: s.seat_number,
        seat_type: s.seat_type || 'STANDARD',
        seat_category: s.seat_type || 'STANDARD',
        price: seatPrice,
        price_paid: seatPrice,
        customer_name: booking.customer_name || 'Verified Patron',
        customer_email: booking.customer_email || '',
        customer_phone: booking.customer_phone || '',
        movie_title: booking.movie_title,
        theater_name: booking.theater_name,
        screen_name: booking.screen_name,
        certification: 'U/A',
        format: '2D',
        language: booking.language || 'Hindi',
        show_date: dateStr,
        start_time: timeStr,
        formatted_datetime: readableDateTime,
        ticket_status: (booking.booking_status === 'CONFIRMED' || booking.booking_status === 'PENDING') ? 'valid' : booking.booking_status.toLowerCase(),
        qr_code_path: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(tktNumber)}`
      };
    });

    const primaryTicket = ticketList.length > 0 ? ticketList[0] : {
      booking_id: booking.booking_id,
      booking_ref: booking.booking_ref,
      ticket_number: `TKT-${booking.booking_ref}`,
      seat_code: booking.seats_list || 'General',
      row_label: 'A',
      seat_number: '1',
      seat_type: 'STANDARD',
      seat_category: 'STANDARD',
      price: Number(booking.total_amount) || 0,
      price_paid: Number(booking.total_amount) || 0,
      customer_name: booking.customer_name || 'Verified Patron',
      customer_email: booking.customer_email || '',
      customer_phone: booking.customer_phone || '',
      movie_title: booking.movie_title,
      theater_name: booking.theater_name,
      screen_name: booking.screen_name,
      certification: 'U/A',
      format: '2D',
      language: booking.language || 'Hindi',
      show_date: dateStr,
      start_time: timeStr,
      formatted_datetime: readableDateTime,
      ticket_status: (booking.booking_status === 'CONFIRMED' || booking.booking_status === 'PENDING') ? 'valid' : booking.booking_status.toLowerCase(),
      qr_code_path: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('TKT-' + booking.booking_ref)}`
    };

    res.render('bookings/ticket-print', {
      title: `Ticket Confirmed: ${booking.booking_ref} - CineSeat Manager`,
      activePage: 'customer-dashboard',
      booking,
      ticket: primaryTicket,
      tickets: ticketList
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Display Customer Booking History
 */
async function getUserBookings(req, res, next) {
  try {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to view your bookings.');
      return res.redirect('/login');
    }

    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/bookings');
    }

    const userId = req.session.user.user_id;

    const [bookings] = await pool.query(
      `SELECT b.booking_id, b.booking_ref, b.total_amount, b.booking_status, b.booking_date,
              m.movie_id, m.title AS movie_title, m.poster_url,
              t.name AS theater_name, t.city,
              sc.screen_name,
              s.showtime_id, s.show_date, s.start_time,
              GROUP_CONCAT(CONCAT(st.row_label, st.seat_number) ORDER BY st.row_label, st.seat_number SEPARATOR ', ') AS reserved_seats,
              MAX(p.payment_status) AS payment_status,
              MAX(p.payment_method) AS payment_method
       FROM bookings b
       JOIN showtimes s ON b.showtime_id = s.showtime_id
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
       LEFT JOIN seats st ON bs.seat_id = st.seat_id
       LEFT JOIN payments p ON b.booking_id = p.booking_id
       WHERE b.user_id = ?
       GROUP BY b.booking_id, b.booking_ref, b.total_amount, b.booking_status, b.booking_date,
                m.movie_id, m.title, m.poster_url, t.name, t.city, sc.screen_name,
                s.showtime_id, s.show_date, s.start_time
       ORDER BY b.booking_date DESC`,
      [userId]
    );

    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(b => (b.booking_status || '').toUpperCase() === 'CONFIRMED').length;
    const upcomingBookings = bookings.filter(b => {
      const showDate = new Date(b.show_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return (b.booking_status || '').toUpperCase() === 'CONFIRMED' && showDate >= today;
    }).length;

    let totalSpent = 0;
    bookings.forEach(b => {
      if ((b.booking_status || '').toUpperCase() === 'CONFIRMED') {
        totalSpent += parseFloat(b.total_amount) || 0;
      }
    });

    const enrichedBookings = bookings.map(b => {
      let dateStr = '';
      if (b.show_date instanceof Date) {
        const y = b.show_date.getFullYear();
        const m = String(b.show_date.getMonth() + 1).padStart(2, '0');
        const d = String(b.show_date.getDate()).padStart(2, '0');
        dateStr = `${y}-${m}-${d}`;
      } else {
        dateStr = String(b.show_date || '').split('T')[0];
      }
      const statusUpper = (b.booking_status || 'PENDING').toUpperCase();
      const payStatus = (b.payment_status || (statusUpper === 'CONFIRMED' ? 'SUCCESS' : 'PENDING')).toUpperCase();
      return {
        ...b,
        booking_status: statusUpper,
        payment_status: payStatus,
        seat_codes: b.reserved_seats || 'N/A',
        seats_count: b.reserved_seats ? b.reserved_seats.split(',').length : 0,
        formatted_date: dateStr,
        formatted_time: String(b.start_time || '10:00:00').slice(0, 5),
        is_cancellable: statusUpper === 'CONFIRMED' || statusUpper === 'PENDING'
      };
    });

    res.render('customer/dashboard', {
      title: 'My Bookings - CineSeat Manager',
      activePage: 'customer-dashboard',
      bookings: enrichedBookings,
      recentBookings: enrichedBookings,
      stats: {
        totalBookings,
        confirmedBookings,
        upcomingBookings,
        validTickets: confirmedBookings,
        totalSpent: Number(totalSpent)
      },
      user: req.session.user,
      customer: req.session.user
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel Active Booking (ACID Transaction)
 *
 * Requirements:
 * - Transactional row lock on bookings
 * - Strict authorization: only booking owner or admin can cancel
 * - Updates booking status to CANCELLED
 * - Frees seats immediately (since availability checks booking_status IN ('PENDING', 'CONFIRMED'))
 */
async function cancelBooking(req, res, next) {
  let connection;
  const isJsonReq = req.xhr || req.headers.accept?.includes('application/json') || req.body?.format === 'json';

  try {
    if (!req.session || !req.session.user) {
      if (isJsonReq) return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
      req.flash('error', 'Please log in to cancel bookings.');
      return res.redirect('/login');
    }

    const bookingId = req.params.bookingId || req.params.id || req.body?.booking_id;
    const userId = req.session.user.user_id;
    const isAdmin = req.session.user.role === 'admin';

    if (!bookingId) {
      if (isJsonReq) return res.status(400).json({ success: false, error: 'Booking ID is required.' });
      req.flash('error', 'Booking ID is required.');
      return res.redirect('/customer/dashboard');
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Fetch booking with row lock
    const [bookingRows] = await connection.query(
      'SELECT booking_id, user_id, booking_status, total_amount FROM bookings WHERE booking_id = ? FOR UPDATE',
      [bookingId]
    );

    if (bookingRows.length === 0) {
      await connection.rollback();
      if (isJsonReq) return res.status(404).json({ success: false, error: 'Booking not found.' });
      req.flash('error', 'Booking not found.');
      return res.redirect('/customer/dashboard');
    }

    const booking = bookingRows[0];

    // 2. Strict authorization check: Only booking owner or admin can cancel
    if (!isAdmin && booking.user_id !== userId) {
      await connection.rollback();
      if (isJsonReq) {
        return res.status(403).json({ success: false, error: 'Unauthorized: You cannot cancel another customer\'s booking.' });
      }
      req.flash('error', 'Access denied: You cannot cancel another customer\'s booking.');
      return res.redirect('/customer/dashboard');
    }

    if (booking.booking_status === 'CANCELLED') {
      await connection.rollback();
      if (isJsonReq) return res.status(400).json({ success: false, error: 'Booking is already cancelled.' });
      req.flash('error', 'Booking is already cancelled.');
      return res.redirect('/customer/dashboard');
    }

    // 3. Update booking status to CANCELLED
    await connection.query(
      'UPDATE bookings SET booking_status = "CANCELLED" WHERE booking_id = ?',
      [bookingId]
    );

    // 4. Update payments status consistently for any pending payment
    await connection.query(
      'UPDATE payments SET payment_status = "FAILED" WHERE booking_id = ? AND payment_status = "PENDING"',
      [bookingId]
    );

    await connection.commit();

    if (isJsonReq) {
      return res.status(200).json({
        success: true,
        message: 'Booking cancelled successfully. Reserved seats have been freed.',
        booking_id: bookingId,
        booking_status: 'CANCELLED'
      });
    }

    req.flash('success', 'Booking cancelled successfully. Reserved seats have been freed.');
    return res.redirect('/customer/dashboard');
  } catch (error) {
    if (connection) await connection.rollback();
    if (isJsonReq) return res.status(500).json({ success: false, error: error.message });
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  getSeatSelection,
  getSeatAvailabilityApi,
  createBooking,
  getConfirmation,
  getUserBookings,
  cancelBooking
};
