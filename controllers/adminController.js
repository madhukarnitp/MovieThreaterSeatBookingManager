const { pool } = require('../config/db');

/**
 * Display Admin Operations Dashboard
 */
async function getDashboard(req, res, next) {
  try {
    // 1. Fetch Aggregated System Metrics
    const [stats] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM movies) AS total_movies,
        (SELECT COUNT(*) FROM theaters) AS total_theaters,
        (SELECT COUNT(*) FROM screens) AS total_screens,
        (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers,
        (SELECT COUNT(*) FROM bookings WHERE booking_status = 'CONFIRMED') AS confirmed_bookings,
        (SELECT COALESCE(SUM(amount), 0.00) FROM payments WHERE payment_status = 'SUCCESS') AS total_revenue
    `);

    // 2. Fetch Recent Bookings
    const [recentBookings] = await pool.query(`
      SELECT b.booking_id, b.booking_ref, b.total_amount, b.booking_status, b.booking_date,
             u.full_name AS customer_name, u.email AS customer_email,
             m.title AS movie_title,
             t.name AS theater_name,
             sc.screen_name,
             p.payment_status, p.payment_method
      FROM bookings b
      JOIN users u ON b.user_id = u.user_id
      JOIN showtimes s ON b.showtime_id = s.showtime_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters t ON sc.theater_id = t.theater_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      ORDER BY b.booking_date DESC
      LIMIT 6
    `);

    // 3. Fetch Recent Payments
    const [recentPayments] = await pool.query(`
      SELECT p.payment_id, p.transaction_ref, p.amount, p.payment_method, p.payment_status, p.payment_date,
             b.booking_ref, u.full_name AS customer_name
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN users u ON b.user_id = u.user_id
      ORDER BY p.payment_date DESC
      LIMIT 6
    `);

    // 4. Fetch Top Performing Movies by Revenue
    const [topMovies] = await pool.query(`
      SELECT m.movie_id, m.title,
             COUNT(DISTINCT b.booking_id) AS total_bookings,
             COALESCE(SUM(p.amount), 0.00) AS revenue
      FROM movies m
      LEFT JOIN showtimes s ON m.movie_id = s.movie_id
      LEFT JOIN bookings b ON s.showtime_id = b.showtime_id AND b.booking_status = 'CONFIRMED'
      LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.payment_status = 'SUCCESS'
      GROUP BY m.movie_id, m.title
      ORDER BY revenue DESC
      LIMIT 5
    `);

    const rawStats = stats[0];
    const totalRev = parseFloat(rawStats.total_revenue) || 0;

    const enrichedMetrics = {
      ...rawStats,
      totalSuccessfulRevenue: totalRev,
      totalConfirmedBookings: rawStats.confirmed_bookings || 0,
      activeMovies: rawStats.total_movies || 0,
      totalCustomers: rawStats.total_customers || 0,
      totalScreens: rawStats.total_screens || 0,
      totalTheaters: rawStats.total_theaters || 0
    };

    res.render('admin/dashboard', {
      title: 'Admin Dashboard - CineSeat Manager',
      activePage: 'admin-dashboard',
      metrics: enrichedMetrics,
      recentBookings,
      recentPayments,
      topMovies,
      dailyBookings: [],
      movieRevenue: topMovies.map(m => ({ title: m.title, revenue: parseFloat(m.revenue) || 0 })),
      reports: {
        totalRevenue: totalRev,
        confirmedCount: rawStats.confirmed_bookings,
        activeMoviesCount: rawStats.total_movies
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Display All Movies Management Page
 */
async function getMovies(req, res, next) {
  try {
    const [movies] = await pool.query(`
      SELECT m.*, COUNT(s.showtime_id) AS total_showtimes
      FROM movies m
      LEFT JOIN showtimes s ON m.movie_id = s.movie_id
      GROUP BY m.movie_id
      ORDER BY m.release_date DESC
    `);

    // Fetch genre list
    const [genreRows] = await pool.query('SELECT genre FROM movies');
    const genreSet = new Set();
    genreRows.forEach(r => {
      if (r.genre) r.genre.split(',').forEach(g => genreSet.add(g.trim()));
    });
    const genres = Array.from(genreSet).map((name, idx) => ({ genre_id: idx + 1, name }));

    const enrichedMovies = movies.map(m => ({
      ...m,
      poster_path: m.poster_url || '/images/posters/fallback.svg',
      genres: m.genre,
      certification: 'UA',
      slug: m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
      status: 'now_showing'
    }));

    res.render('admin/movies', {
      title: 'Manage Movies - CineSeat Manager',
      activePage: 'admin-movies',
      movies: enrichedMovies,
      genres
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add New Movie
 */
async function postAddMovie(req, res, next) {
  try {
    const { title, description, duration_min, genre, language, release_date, poster_url, poster_path, genres } = req.body;

    const finalGenre = (Array.isArray(genres) ? genres.join(', ') : genre) || '';
    const finalPoster = poster_url || poster_path || '/images/posters/fallback.svg';

    if (!title || !duration_min || !language || !release_date) {
      req.flash('error', 'Title, duration, language, and release date are required.');
      return res.redirect('/admin/movies');
    }

    const durationNum = Number(duration_min);
    if (isNaN(durationNum) || durationNum <= 0) {
      req.flash('error', 'Duration must be a positive integer in minutes.');
      return res.redirect('/admin/movies');
    }

    await pool.query(
      `INSERT INTO movies (title, description, duration_min, genre, language, release_date, poster_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), description ? description.trim() : null, durationNum, finalGenre.trim() || 'General', language.trim(), release_date, finalPoster.trim()]
    );

    req.flash('success', `Movie "${title.trim()}" added successfully.`);
    res.redirect('/admin/movies');
  } catch (error) {
    next(error);
  }
}

/**
 * Update Existing Movie Details
 */
async function postEditMovie(req, res, next) {
  try {
    const movieId = req.params.id;
    const { title, description, duration_min, genre, language, release_date, poster_url, poster_path, genres } = req.body;

    const finalGenre = (Array.isArray(genres) ? genres.join(', ') : genre) || '';
    const finalPoster = poster_url || poster_path || '/images/posters/fallback.svg';

    if (!title || !duration_min || !language || !release_date) {
      req.flash('error', 'Title, duration, language, and release date are required.');
      return res.redirect('/admin/movies');
    }

    const durationNum = Number(duration_min);
    if (isNaN(durationNum) || durationNum <= 0) {
      req.flash('error', 'Duration must be a positive integer in minutes.');
      return res.redirect('/admin/movies');
    }

    await pool.query(
      `UPDATE movies 
       SET title = ?, description = ?, duration_min = ?, genre = ?, language = ?, release_date = ?, poster_url = ?
       WHERE movie_id = ?`,
      [title.trim(), description ? description.trim() : null, durationNum, finalGenre.trim() || 'General', language.trim(), release_date, finalPoster.trim(), movieId]
    );

    req.flash('success', `Movie "${title.trim()}" updated successfully.`);
    res.redirect('/admin/movies');
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a Movie (Only when no dependent showtime records exist)
 */
async function postDeleteMovie(req, res, next) {
  try {
    const movieId = req.params.id;

    // Check if any showtimes exist for this movie
    const [shows] = await pool.query(
      'SELECT COUNT(*) AS count FROM showtimes WHERE movie_id = ?',
      [movieId]
    );

    if (shows[0].count > 0) {
      req.flash('error', `Cannot delete movie: ${shows[0].count} dependent showtime record(s) exist. Remove or cancel dependent showtimes first.`);
      return res.redirect('/admin/movies');
    }

    await pool.query('DELETE FROM movies WHERE movie_id = ?', [movieId]);
    req.flash('success', 'Movie removed successfully.');
    res.redirect('/admin/movies');
  } catch (error) {
    next(error);
  }
}

/**
 * Display Theaters and Screens Management Page
 */
async function getTheaters(req, res, next) {
  try {
    const [theaters] = await pool.query(`
      SELECT t.theater_id, t.name, t.city, t.address, t.created_at,
             COUNT(DISTINCT sc.screen_id) AS screen_count,
             COALESCE(SUM(sc.total_capacity), 0) AS total_theater_capacity,
             1 AS is_active,
             '' AS state,
             '' AS pincode,
             '' AS phone
      FROM theaters t
      LEFT JOIN screens sc ON t.theater_id = sc.theater_id
      GROUP BY t.theater_id, t.name, t.city, t.address, t.created_at
      ORDER BY t.city, t.name
    `);

    const [screens] = await pool.query(`
      SELECT sc.screen_id, sc.theater_id, sc.screen_name, sc.total_capacity, sc.created_at,
             t.name AS theater_name, t.city,
             (SELECT COUNT(*) FROM seats st WHERE st.screen_id = sc.screen_id) AS seat_count
      FROM screens sc
      INNER JOIN theaters t ON sc.theater_id = t.theater_id
      ORDER BY t.name, sc.screen_name
    `);

    res.render('admin/theaters', {
      title: 'Manage Theaters - CineSeat Manager',
      activePage: 'admin-theaters',
      theaters,
      screens
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add New Theater
 */
async function postAddTheater(req, res, next) {
  try {
    const { name, city, address } = req.body;
    if (!name || !city || !address) {
      req.flash('error', 'Theater name, city, and address are required.');
      return res.redirect('/admin/theaters');
    }

    await pool.query(
      'INSERT INTO theaters (name, city, address) VALUES (?, ?, ?)',
      [name.trim(), city.trim(), address.trim()]
    );

    req.flash('success', `Theater "${name.trim()}" added successfully.`);
    res.redirect('/admin/theaters');
  } catch (error) {
    next(error);
  }
}

/**
 * Update Existing Theater
 */
async function postEditTheater(req, res, next) {
  try {
    const theaterId = req.params.id;
    const { name, city, address } = req.body;

    if (!name || !city || !address) {
      req.flash('error', 'Theater name, city, and address are required.');
      return res.redirect('/admin/theaters');
    }

    await pool.query(
      'UPDATE theaters SET name = ?, city = ?, address = ? WHERE theater_id = ?',
      [name.trim(), city.trim(), address.trim(), theaterId]
    );

    req.flash('success', `Theater "${name.trim()}" updated successfully.`);
    res.redirect('/admin/theaters');
  } catch (error) {
    next(error);
  }
}

/**
 * Delete Theater (Check dependent showtimes first)
 */
async function postDeleteTheater(req, res, next) {
  try {
    const theaterId = req.params.id;

    // Check if any screens in this theater have showtimes
    const [shows] = await pool.query(
      `SELECT COUNT(*) AS count 
       FROM showtimes s
       INNER JOIN screens sc ON s.screen_id = sc.screen_id
       WHERE sc.theater_id = ?`,
      [theaterId]
    );

    if (shows[0].count > 0) {
      req.flash('error', `Cannot delete theater: ${shows[0].count} dependent showtime(s) exist on its screens.`);
      return res.redirect('/admin/theaters');
    }

    await pool.query('DELETE FROM theaters WHERE theater_id = ?', [theaterId]);
    req.flash('success', 'Theater removed successfully.');
    res.redirect('/admin/theaters');
  } catch (error) {
    next(error);
  }
}

/**
 * Display Screens Management Page
 */
async function getScreens(req, res, next) {
  try {
    const selectedTheaterId = req.query.theater_id || '';

    let query = `
      SELECT sc.screen_id, sc.theater_id, sc.screen_name, sc.total_capacity, sc.created_at,
             t.name AS theater_name, t.city AS theater_city,
             '2D' AS screen_type,
             1 AS is_active,
             (SELECT COUNT(*) FROM seats st WHERE st.screen_id = sc.screen_id) AS configured_seats_count,
             (SELECT COUNT(*) FROM seats st WHERE st.screen_id = sc.screen_id) AS active_seats_count
      FROM screens sc
      INNER JOIN theaters t ON sc.theater_id = t.theater_id
    `;
    const params = [];

    if (selectedTheaterId) {
      query += ' WHERE sc.theater_id = ?';
      params.push(selectedTheaterId);
    }

    query += ' ORDER BY t.name, sc.screen_name';

    const [screens] = await pool.query(query, params);
    const [theaters] = await pool.query('SELECT theater_id, name, city FROM theaters ORDER BY city, name');

    res.render('admin/screens', {
      title: 'Manage Screens - CineSeat Manager',
      activePage: 'admin-screens',
      screens,
      theaters,
      selectedTheaterId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add Screen and auto-generate standard seats layout
 */
async function postAddScreen(req, res, next) {
  let connection;
  try {
    const { theater_id, screen_name, name, total_capacity } = req.body;
    const finalScreenName = screen_name || name;

    if (!theater_id || !finalScreenName) {
      req.flash('error', 'Theater and screen name are required.');
      return res.redirect('/admin/screens');
    }

    const capacity = Number(total_capacity) || 20;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [screenResult] = await connection.query(
      'INSERT INTO screens (theater_id, screen_name, total_capacity) VALUES (?, ?, ?)',
      [theater_id, finalScreenName.trim(), capacity]
    );

    const screenId = screenResult.insertId;

    // Generate 20 seats (Row A: 1-10 STANDARD, Row B: 1-10 PREMIUM)
    for (let i = 1; i <= 10; i++) {
      await connection.query(
        'INSERT INTO seats (screen_id, row_label, seat_number, seat_type) VALUES (?, "A", ?, "STANDARD")',
        [screenId, i]
      );
      await connection.query(
        'INSERT INTO seats (screen_id, row_label, seat_number, seat_type) VALUES (?, "B", ?, "PREMIUM")',
        [screenId, i]
      );
    }

    await connection.commit();
    req.flash('success', `Screen "${finalScreenName.trim()}" created with 20 configured physical seats.`);
    res.redirect('/admin/screens');
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Update Screen
 */
async function postEditScreen(req, res, next) {
  try {
    const screenId = req.params.id;
    const { name, screen_name, total_capacity } = req.body;
    const finalName = name || screen_name;

    if (!finalName) {
      req.flash('error', 'Screen name is required.');
      return res.redirect('/admin/screens');
    }

    const capacity = Number(total_capacity) || 20;

    await pool.query(
      'UPDATE screens SET screen_name = ?, total_capacity = ? WHERE screen_id = ?',
      [finalName.trim(), capacity, screenId]
    );

    req.flash('success', `Screen "${finalName.trim()}" updated successfully.`);
    res.redirect('/admin/screens');
  } catch (error) {
    next(error);
  }
}

/**
 * Delete Screen (Only if no dependent showtimes exist)
 */
async function postDeleteScreen(req, res, next) {
  try {
    const screenId = req.params.id;

    const [shows] = await pool.query(
      'SELECT COUNT(*) AS count FROM showtimes WHERE screen_id = ?',
      [screenId]
    );

    if (shows[0].count > 0) {
      req.flash('error', `Cannot delete screen: ${shows[0].count} dependent showtime(s) exist on this screen.`);
      return res.redirect('/admin/screens');
    }

    await pool.query('DELETE FROM screens WHERE screen_id = ?', [screenId]);
    req.flash('success', 'Screen removed successfully.');
    res.redirect('/admin/screens');
  } catch (error) {
    next(error);
  }
}

/**
 * Display Physical Seats Matrix Management Page
 */
async function getSeats(req, res, next) {
  try {
    const [screens] = await pool.query(`
      SELECT sc.screen_id, sc.screen_name, sc.total_capacity,
             t.name AS theater_name, t.city,
             '2D' AS screen_type
      FROM screens sc
      INNER JOIN theaters t ON sc.theater_id = t.theater_id
      ORDER BY t.name, sc.screen_name
    `);

    let selectedScreenId = req.query.screen_id;
    if (!selectedScreenId && screens.length > 0) {
      selectedScreenId = screens[0].screen_id;
    }

    let selectedScreen = null;
    let seats = [];

    if (selectedScreenId) {
      selectedScreen = screens.find(s => String(s.screen_id) === String(selectedScreenId)) || null;

      const [seatRows] = await pool.query(`
        SELECT st.seat_id, st.screen_id, st.row_label, st.seat_number, st.seat_type,
               st.seat_type AS seat_type_name,
               CASE st.seat_type
                 WHEN 'STANDARD' THEN '#3b82f6'
                 WHEN 'PREMIUM' THEN '#f59e0b'
                 WHEN 'VIP' THEN '#8b5cf6'
                 ELSE '#3b82f6'
               END AS color_code,
               1 AS is_active,
               (SELECT COUNT(*) FROM booking_seats bs WHERE bs.seat_id = st.seat_id) AS booking_history_count
        FROM seats st
        WHERE st.screen_id = ?
        ORDER BY st.row_label ASC, st.seat_number ASC
      `, [selectedScreenId]);

      seats = seatRows;
    }

    const seatTypes = [
      { seat_type_id: 'STANDARD', name: 'Standard' },
      { seat_type_id: 'PREMIUM', name: 'Premium' },
      { seat_type_id: 'VIP', name: 'VIP' }
    ];

    res.render('admin/seats', {
      title: 'Seat Matrix Configuration - CineSeat Manager',
      activePage: 'admin-seats',
      screens,
      selectedScreenId: selectedScreenId || '',
      selectedScreen,
      seats,
      seatTypes
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add Single Physical Seat
 */
async function postAddSeat(req, res, next) {
  try {
    const { screen_id, row_label, seat_number, seat_type, seat_type_id } = req.body;
    const finalType = seat_type || seat_type_id || 'STANDARD';

    if (!screen_id || !row_label || !seat_number) {
      req.flash('error', 'Screen ID, row label, and seat number are required.');
      return res.redirect(`/admin/seats?screen_id=${screen_id || ''}`);
    }

    const num = Number(seat_number);
    if (isNaN(num) || num <= 0) {
      req.flash('error', 'Seat number must be a positive integer.');
      return res.redirect(`/admin/seats?screen_id=${screen_id}`);
    }

    await pool.query(
      'INSERT INTO seats (screen_id, row_label, seat_number, seat_type) VALUES (?, ?, ?, ?)',
      [screen_id, row_label.trim().toUpperCase(), num, finalType.toUpperCase()]
    );

    req.flash('success', `Seat ${row_label.trim().toUpperCase()}${num} added.`);
    res.redirect(`/admin/seats?screen_id=${screen_id}`);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('error', 'This seat position already exists in this screen.');
      return res.redirect(`/admin/seats?screen_id=${req.body.screen_id}`);
    }
    next(error);
  }
}

/**
 * Batch Generate Seats for a Row
 */
async function postBatchSeats(req, res, next) {
  let connection;
  try {
    const { screen_id, row_label, start_number, end_number, seat_type, seat_type_id } = req.body;
    const finalType = seat_type || seat_type_id || 'STANDARD';

    const start = Number(start_number) || 1;
    const end = Number(end_number) || 10;
    const row = (row_label || 'A').trim().toUpperCase();

    if (!screen_id) {
      req.flash('error', 'Screen is required for batch generating seats.');
      return res.redirect('/admin/seats');
    }

    if (end < start || end - start > 100) {
      req.flash('error', 'Invalid seat number range (maximum 100 per batch).');
      return res.redirect(`/admin/seats?screen_id=${screen_id}`);
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    let addedCount = 0;
    for (let i = start; i <= end; i++) {
      await connection.query(
        `INSERT INTO seats (screen_id, row_label, seat_number, seat_type)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE seat_type = VALUES(seat_type)`,
        [screen_id, row, i, finalType.toUpperCase()]
      );
      addedCount++;
    }

    await connection.commit();
    req.flash('success', `Generated ${addedCount} seats in row ${row}.`);
    res.redirect(`/admin/seats?screen_id=${screen_id}`);
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Delete a Single Seat
 */
async function postDeleteSeat(req, res, next) {
  try {
    const seatId = req.params.id;
    const screenId = req.body.screen_id;

    // Check if seat is part of any booking
    const [bookings] = await pool.query(
      'SELECT COUNT(*) AS count FROM booking_seats WHERE seat_id = ?',
      [seatId]
    );

    if (bookings[0].count > 0) {
      req.flash('error', 'Cannot delete seat referenced in historical bookings.');
      return res.redirect(`/admin/seats?screen_id=${screenId || ''}`);
    }

    await pool.query('DELETE FROM seats WHERE seat_id = ?', [seatId]);
    req.flash('success', 'Physical seat deleted successfully.');
    res.redirect(`/admin/seats?screen_id=${screenId || ''}`);
  } catch (error) {
    next(error);
  }
}

/**
 * Display Showtimes Scheduling Page
 */
async function getShowtimes(req, res, next) {
  try {
    const { movie_id, theater_id, status } = req.query;

    let query = `
      SELECT s.showtime_id, s.movie_id, s.screen_id, s.show_date, s.start_time, s.end_time, s.ticket_price, s.status,
             m.title AS movie_title, m.duration_min,
             t.theater_id, t.name AS theater_name, t.city,
             sc.screen_name, sc.total_capacity,
             (SELECT COUNT(*) 
              FROM booking_seats bs 
              JOIN bookings b ON bs.booking_id = b.booking_id 
              WHERE b.showtime_id = s.showtime_id AND b.booking_status IN ('PENDING', 'CONFIRMED')) AS booked_seats_count
      FROM showtimes s
      INNER JOIN movies m ON s.movie_id = m.movie_id
      INNER JOIN screens sc ON s.screen_id = sc.screen_id
      INNER JOIN theaters t ON sc.theater_id = t.theater_id
    `;
    const params = [];
    const conditions = [];

    if (movie_id) {
      conditions.push('s.movie_id = ?');
      params.push(movie_id);
    }
    if (theater_id) {
      conditions.push('sc.theater_id = ?');
      params.push(theater_id);
    }
    if (status) {
      conditions.push('s.status = ?');
      params.push(status.toUpperCase());
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.show_date DESC, s.start_time DESC';

    const [showtimes] = await pool.query(query, params);

    const [movies] = await pool.query('SELECT movie_id, title, duration_min FROM movies ORDER BY title');
    const [screens] = await pool.query(`
      SELECT sc.screen_id, sc.screen_name, sc.theater_id, sc.total_capacity,
             t.name AS theater_name, t.city,
             '2D' AS screen_type
      FROM screens sc
      INNER JOIN theaters t ON sc.theater_id = t.theater_id
      ORDER BY t.name, sc.screen_name
    `);
    const [theaters] = await pool.query('SELECT theater_id, name, city FROM theaters ORDER BY name');

    // Enrich showtimes for view
    const enrichedShowtimes = showtimes.map(s => {
      const dateStr = s.show_date instanceof Date ? s.show_date.toISOString().split('T')[0] : String(s.show_date);
      const startDateTime = new Date(`${dateStr}T${s.start_time}`);
      const endDateTime = new Date(`${dateStr}T${s.end_time}`);
      const totalCap = s.total_capacity || 20;
      const booked = Number(s.booked_seats_count) || 0;
      return {
        ...s,
        start_time: isNaN(startDateTime.getTime()) ? s.start_time : startDateTime,
        end_time: isNaN(endDateTime.getTime()) ? s.end_time : endDateTime,
        show_date_str: dateStr,
        base_price: s.ticket_price,
        format: '2D',
        certification: 'UA',
        theater_city: s.city,
        booked_seats_count: booked,
        available_seats_count: Math.max(0, totalCap - booked),
        status: (s.status || 'SCHEDULED').toLowerCase()
      };
    });

    res.render('admin/showtimes', {
      title: 'Manage Showtimes - CineSeat Manager',
      activePage: 'admin-showtimes',
      showtimes: enrichedShowtimes,
      movies,
      screens,
      theaters,
      filters: {
        movie_id: movie_id || '',
        theater_id: theater_id || '',
        status: status || ''
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add New Showtime Schedule with Overlap Conflict Prevention
 */
async function postAddShowtime(req, res, next) {
  try {
    const {
      movie_id,
      screen_id,
      show_date,
      start_date,
      start_time,
      start_time_of_day,
      end_time,
      ticket_price,
      base_price,
      buffer_min
    } = req.body;

    const finalDate = show_date || start_date;
    const finalStart = start_time || (start_time_of_day ? `${start_time_of_day}:00` : null);
    const finalPrice = ticket_price || base_price;

    if (!movie_id || !screen_id || !finalDate || !finalStart || finalPrice === undefined || finalPrice === '') {
      req.flash('error', 'Movie, screen, show date, start time, and ticket price are required.');
      return res.redirect('/admin/showtimes');
    }

    const parsedPrice = parseFloat(finalPrice);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      req.flash('error', 'Ticket price must be a valid non-negative amount.');
      return res.redirect('/admin/showtimes');
    }

    // Verify Movie and Screen exist
    const [movieRows] = await pool.query('SELECT movie_id, duration_min FROM movies WHERE movie_id = ?', [movie_id]);
    if (movieRows.length === 0) {
      req.flash('error', 'Selected movie not found.');
      return res.redirect('/admin/showtimes');
    }

    const [screenRows] = await pool.query('SELECT screen_id FROM screens WHERE screen_id = ?', [screen_id]);
    if (screenRows.length === 0) {
      req.flash('error', 'Selected screen not found.');
      return res.redirect('/admin/showtimes');
    }

    // Calculate end time if not explicitly provided
    let finalEnd = end_time;
    if (!finalEnd) {
      const movieDur = movieRows[0].duration_min || 120;
      const buffer = Number(buffer_min) || 20;
      const totalMin = movieDur + buffer;

      const [startH, startM] = finalStart.split(':').map(Number);
      const startInMinutes = startH * 60 + startM;
      const endInMinutes = startInMinutes + totalMin;

      const endH = Math.floor(endInMinutes / 60) % 24;
      const endM = endInMinutes % 60;
      finalEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;
    }

    // Format start time string HH:MM:SS
    const formattedStart = finalStart.length === 5 ? `${finalStart}:00` : finalStart;
    const formattedEnd = finalEnd.length === 5 ? `${finalEnd}:00` : finalEnd;

    if (formattedEnd <= formattedStart) {
      req.flash('error', 'End time must be later than start time.');
      return res.redirect('/admin/showtimes');
    }

    // OVERLAP CHECK: Prevent scheduling overlapping showtimes on the same screen
    // Two intervals overlap if: existing_start < new_end AND existing_end > new_start
    const [conflicts] = await pool.query(
      `SELECT s.showtime_id, s.start_time, s.end_time, m.title AS movie_title
       FROM showtimes s
       INNER JOIN movies m ON s.movie_id = m.movie_id
       WHERE s.screen_id = ? 
         AND s.show_date = ? 
         AND s.status != 'CANCELLED'
         AND (s.start_time < ? AND s.end_time > ?)`,
      [screen_id, finalDate, formattedEnd, formattedStart]
    );

    if (conflicts.length > 0) {
      const conflictShow = conflicts[0];
      req.flash(
        'error',
        `Schedule conflict: Overlaps with "${conflictShow.movie_title}" (${String(conflictShow.start_time).slice(0, 5)} - ${String(conflictShow.end_time).slice(0, 5)}) on this screen.`
      );
      return res.redirect('/admin/showtimes');
    }

    await pool.query(
      `INSERT INTO showtimes (movie_id, screen_id, show_date, start_time, end_time, ticket_price, status)
       VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED')`,
      [movie_id, screen_id, finalDate, formattedStart, formattedEnd, parsedPrice]
    );

    req.flash('success', 'New showtime scheduled successfully.');
    res.redirect('/admin/showtimes');
  } catch (error) {
    next(error);
  }
}

/**
 * Update Existing Showtime Schedule with Overlap Conflict Prevention
 */
async function postEditShowtime(req, res, next) {
  try {
    const showtimeId = req.params.id;
    const { movie_id, screen_id, show_date, start_time, end_time, ticket_price } = req.body;

    if (!movie_id || !screen_id || !show_date || !start_time || !end_time || ticket_price === undefined) {
      req.flash('error', 'All showtime fields are required.');
      return res.redirect('/admin/showtimes');
    }

    const parsedPrice = parseFloat(ticket_price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      req.flash('error', 'Ticket price must be a valid non-negative amount.');
      return res.redirect('/admin/showtimes');
    }

    const formattedStart = start_time.length === 5 ? `${start_time}:00` : start_time;
    const formattedEnd = end_time.length === 5 ? `${end_time}:00` : end_time;

    if (formattedEnd <= formattedStart) {
      req.flash('error', 'End time must be later than start time.');
      return res.redirect('/admin/showtimes');
    }

    // Overlap conflict check excluding own showtime
    const [conflicts] = await pool.query(
      `SELECT s.showtime_id, s.start_time, s.end_time, m.title AS movie_title
       FROM showtimes s
       INNER JOIN movies m ON s.movie_id = m.movie_id
       WHERE s.screen_id = ? 
         AND s.show_date = ? 
         AND s.status != 'CANCELLED'
         AND s.showtime_id != ?
         AND (s.start_time < ? AND s.end_time > ?)`,
      [screen_id, show_date, showtimeId, formattedEnd, formattedStart]
    );

    if (conflicts.length > 0) {
      const conflictShow = conflicts[0];
      req.flash(
        'error',
        `Schedule conflict: Overlaps with "${conflictShow.movie_title}" (${String(conflictShow.start_time).slice(0, 5)} - ${String(conflictShow.end_time).slice(0, 5)}) on this screen.`
      );
      return res.redirect('/admin/showtimes');
    }

    await pool.query(
      `UPDATE showtimes 
       SET movie_id = ?, screen_id = ?, show_date = ?, start_time = ?, end_time = ?, ticket_price = ?
       WHERE showtime_id = ?`,
      [movie_id, screen_id, show_date, formattedStart, formattedEnd, parsedPrice, showtimeId]
    );

    req.flash('success', 'Showtime updated successfully.');
    res.redirect('/admin/showtimes');
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel a Scheduled Showtime
 */
async function postCancelShowtime(req, res, next) {
  try {
    const showtimeId = req.params.id;

    await pool.query(
      'UPDATE showtimes SET status = "CANCELLED" WHERE showtime_id = ?',
      [showtimeId]
    );

    req.flash('success', 'Showtime cancelled successfully.');
    res.redirect('/admin/showtimes');
  } catch (error) {
    next(error);
  }
}

/**
 * Display All Bookings and Payments Audit
 */
async function getBookings(req, res, next) {
  try {
    const [bookings] = await pool.query(`
      SELECT b.booking_id, b.booking_ref, b.total_amount, b.booking_status, b.booking_date,
             u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
             m.title AS movie_title,
             t.name AS theater_name,
             sc.screen_name,
             s.show_date, s.start_time,
             p.payment_id, p.transaction_ref, p.payment_method, p.payment_status,
             (SELECT COUNT(*) FROM booking_seats bs WHERE bs.booking_id = b.booking_id) AS seats_count
      FROM bookings b
      JOIN users u ON b.user_id = u.user_id
      JOIN showtimes s ON b.showtime_id = s.showtime_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters t ON sc.theater_id = t.theater_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      ORDER BY b.booking_date DESC
    `);

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
      const timeStr = String(b.start_time || '10:00:00').slice(0, 5);

      return {
        ...b,
        status: (b.booking_status || 'PENDING').toLowerCase(),
        formatted_date: dateStr,
        formatted_time: timeStr,
        seats_count: Number(b.seats_count) || 1
      };
    });

    res.render('admin/bookings', {
      title: 'Customer Bookings Audit - CineSeat Manager',
      activePage: 'admin-bookings',
      bookings: enrichedBookings
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Display All Financial Transactions & Payment Records
 */
async function getPayments(req, res, next) {
  try {
    const [payments] = await pool.query(`
      SELECT 
        p.payment_id,
        p.transaction_ref,
        p.payment_method,
        p.amount,
        p.payment_status,
        p.payment_date,
        p.payment_date AS created_at,
        b.booking_ref,
        u.full_name AS customer_name,
        u.email AS customer_email,
        NULL AS refund_id,
        0.00 AS refunded_amount,
        NULL AS refund_status
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN users u ON b.user_id = u.user_id
      ORDER BY p.payment_date DESC
    `);

    res.render('admin/payments', {
      title: 'Payment Records - Admin',
      activePage: 'admin-payments',
      payments,
      admin: req.session.user || { fullName: 'System Administrator', role: 'admin' },
      user: req.session.user
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboard,
  getMovies,
  postAddMovie,
  postEditMovie,
  postDeleteMovie,
  getTheaters,
  postAddTheater,
  postEditTheater,
  postDeleteTheater,
  getScreens,
  postAddScreen,
  postEditScreen,
  postDeleteScreen,
  getSeats,
  postAddSeat,
  postBatchSeats,
  postDeleteSeat,
  getShowtimes,
  postAddShowtime,
  postEditShowtime,
  postCancelShowtime,
  getBookings,
  getPayments
};
