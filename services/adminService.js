const { pool } = require('../config/db');

/**
 * Service providing direct SQL queries and transactions for all Admin Management Operations
 */
class AdminService {
  // =========================================================================
  // DASHBOARD METRICS & SUMMARY
  // =========================================================================
  static async getDashboardMetrics() {
    const [moviesCount] = await pool.query('SELECT COUNT(*) AS total_movies FROM movies');
    const [theatersCount] = await pool.query('SELECT COUNT(*) AS total_theaters FROM theaters');
    const [screensCount] = await pool.query('SELECT COUNT(*) AS total_screens FROM screens');
    const [customersCount] = await pool.query('SELECT COUNT(*) AS total_customers FROM customers');

    const [bookingStats] = await pool.query(
      `SELECT 
         COUNT(*) AS total_bookings,
         SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_bookings,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_bookings,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_bookings,
         SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired_bookings
       FROM bookings`
    );

    const [financials] = await pool.query(
      `SELECT 
         COALESCE(SUM(amount), 0.00) AS total_revenue
       FROM payments 
       WHERE status = 'success'`
    );

    const [refunds] = await pool.query(
      `SELECT 
         COALESCE(SUM(amount), 0.00) AS total_refunds
       FROM refunds 
       WHERE status = 'processed'`
    );

    // Recent 10 bookings
    const [recentBookings] = await pool.query(
      `SELECT 
         b.booking_id,
         b.booking_ref,
         b.status,
         b.total_amount,
         b.booked_at,
         c.full_name AS customer_name,
         c.email AS customer_email,
         m.title AS movie_title,
         t.name AS theater_name,
         sc.name AS screen_name
       FROM bookings b
       JOIN customers c ON b.customer_id = c.customer_id
       JOIN showtimes sh ON b.showtime_id = sh.showtime_id
       JOIN movies m ON sh.movie_id = m.movie_id
       JOIN screens sc ON sh.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       ORDER BY b.booked_at DESC
       LIMIT 10`
    );

    // Recent 10 payments
    const [recentPayments] = await pool.query(
      `SELECT 
         p.payment_id,
         p.transaction_ref,
         p.payment_method,
         p.amount,
         p.status AS payment_status,
         p.paid_at,
         p.created_at,
         b.booking_ref,
         c.full_name AS customer_name
       FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       JOIN customers c ON b.customer_id = c.customer_id
       ORDER BY p.created_at DESC
       LIMIT 10`
    );

    const bStat = bookingStats[0] || {};

    return {
      totalMovies: Number(moviesCount[0]?.total_movies || 0),
      totalTheaters: Number(theatersCount[0]?.total_theaters || 0),
      totalScreens: Number(screensCount[0]?.total_screens || 0),
      totalCustomers: Number(customersCount[0]?.total_customers || 0),
      totalBookings: Number(bStat.total_bookings || 0),
      confirmedBookings: Number(bStat.confirmed_bookings || 0),
      pendingBookings: Number(bStat.pending_bookings || 0),
      cancelledBookings: Number(bStat.cancelled_bookings || 0),
      expiredBookings: Number(bStat.expired_bookings || 0),
      totalSuccessfulRevenue: Number(financials[0]?.total_revenue || 0),
      totalRefunds: Number(refunds[0]?.total_refunds || 0),
      netRevenue: Number(financials[0]?.total_revenue || 0) - Number(refunds[0]?.total_refunds || 0),
      recentBookings,
      recentPayments
    };
  }

  // =========================================================================
  // ANALYTICS & REPORTS (COUNT, SUM, AVG, GROUP BY)
  // =========================================================================

  /**
   * 1. Daily Booking & Revenue Trend Report (Past N days)
   */
  static async getDailyBookingReport(days = 14) {
    const [rows] = await pool.query(
      `SELECT 
         DATE(b.booked_at) AS report_date,
         COUNT(b.booking_id) AS total_bookings,
         SUM(CASE WHEN b.status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_bookings,
         COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.total_amount ELSE 0 END), 0.00) AS daily_revenue
       FROM bookings b
       WHERE b.booked_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(b.booked_at)
       ORDER BY report_date ASC`,
      [Number(days)]
    );
    return rows;
  }

  /**
   * 2. Monthly Revenue Report
   */
  static async getMonthlyRevenueReport() {
    const [rows] = await pool.query(
      `SELECT 
         DATE_FORMAT(p.paid_at, '%Y-%m') AS month_key,
         COUNT(p.payment_id) AS successful_transactions,
         COALESCE(SUM(p.amount), 0.00) AS monthly_revenue,
         COALESCE(AVG(p.amount), 0.00) AS avg_transaction_value
       FROM payments p
       WHERE p.status = 'success' AND p.paid_at IS NOT NULL
       GROUP BY DATE_FORMAT(p.paid_at, '%Y-%m')
       ORDER BY month_key DESC
       LIMIT 12`
    );
    return rows;
  }

  /**
   * 3. Movie-wise Revenue & Admissions Report
   */
  static async getMovieWiseRevenueReport() {
    const [rows] = await pool.query(
      `SELECT 
         m.movie_id,
         m.title AS movie_title,
         m.certification,
         m.language,
         COUNT(DISTINCT b.booking_id) AS confirmed_bookings,
         COUNT(DISTINCT bs.booking_seat_id) AS tickets_sold,
         COALESCE(SUM(bs.price_paid), 0.00) AS total_revenue
       FROM movies m
       JOIN showtimes s ON m.movie_id = s.movie_id
       JOIN bookings b ON s.showtime_id = b.showtime_id AND b.status = 'confirmed'
       JOIN booking_seats bs ON b.booking_id = bs.booking_id
       GROUP BY m.movie_id, m.title, m.certification, m.language
       ORDER BY total_revenue DESC`
    );
    return rows;
  }

  /**
   * 4. Theater-wise Revenue & Occupancy Report
   */
  static async getTheaterWiseRevenueReport() {
    const [rows] = await pool.query(
      `SELECT 
         t.theater_id,
         t.name AS theater_name,
         t.city,
         COUNT(DISTINCT sc.screen_id) AS total_screens,
         COUNT(DISTINCT b.booking_id) AS confirmed_bookings,
         COUNT(DISTINCT bs.booking_seat_id) AS tickets_sold,
         COALESCE(SUM(bs.price_paid), 0.00) AS total_revenue
       FROM theaters t
       JOIN screens sc ON t.theater_id = sc.theater_id
       JOIN showtimes s ON sc.screen_id = s.screen_id
       JOIN bookings b ON s.showtime_id = b.showtime_id AND b.status = 'confirmed'
       JOIN booking_seats bs ON b.booking_id = bs.booking_id
       GROUP BY t.theater_id, t.name, t.city
       ORDER BY total_revenue DESC`
    );
    return rows;
  }

  /**
   * 5. Most Popular Movies (ranked by ticket sales & bookings)
   */
  static async getMostPopularMovies(limit = 5) {
    const [rows] = await pool.query(
      `SELECT 
         m.movie_id,
         m.title AS movie_title,
         m.poster_path,
         m.duration_min,
         m.language,
         COUNT(DISTINCT b.booking_id) AS total_bookings,
         COUNT(DISTINCT bs.booking_seat_id) AS total_tickets,
         COALESCE(SUM(bs.price_paid), 0.00) AS total_gross
       FROM movies m
       LEFT JOIN showtimes s ON m.movie_id = s.movie_id
       LEFT JOIN bookings b ON s.showtime_id = b.showtime_id AND b.status = 'confirmed'
       LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
       GROUP BY m.movie_id
       ORDER BY total_tickets DESC, total_bookings DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }

  /**
   * 6. Most Booked Showtimes
   */
  static async getMostBookedShowtimes(limit = 8) {
    const [rows] = await pool.query(
      `SELECT 
         s.showtime_id,
         s.start_time,
         s.format,
         m.title AS movie_title,
         t.name AS theater_name,
         sc.name AS screen_name,
         sc.total_capacity,
         COUNT(DISTINCT bs.booking_seat_id) AS seats_sold,
         ROUND((COUNT(DISTINCT bs.booking_seat_id) / sc.total_capacity) * 100, 1) AS occupancy_rate,
         COALESCE(SUM(bs.price_paid), 0.00) AS showtime_revenue
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       LEFT JOIN bookings b ON s.showtime_id = b.showtime_id AND b.status = 'confirmed'
       LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
       GROUP BY s.showtime_id
       ORDER BY seats_sold DESC, showtime_revenue DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }

  // =========================================================================
  // A. MOVIE MANAGEMENT
  // =========================================================================
  static async getAllMovies() {
    const [rows] = await pool.query(
      `SELECT 
         m.movie_id,
         m.title,
         m.slug,
         m.duration_min,
         m.language,
         m.certification,
         m.release_date,
         m.poster_path,
         m.trailer_url,
         m.status,
         m.created_at,
         COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', '), '') AS genres,
         COUNT(DISTINCT s.showtime_id) AS showtimes_count
       FROM movies m
       LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
       LEFT JOIN genres g ON mg.genre_id = g.genre_id
       LEFT JOIN showtimes s ON m.movie_id = s.movie_id
       GROUP BY m.movie_id
       ORDER BY m.movie_id DESC`
    );
    return rows;
  }

  static async getMovieById(movieId) {
    const [rows] = await pool.query(
      `SELECT 
         m.*,
         COALESCE(GROUP_CONCAT(DISTINCT mg.genre_id), '') AS genre_ids
       FROM movies m
       LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
       WHERE m.movie_id = ?
       GROUP BY m.movie_id`,
      [movieId]
    );

    if (rows.length === 0) return null;
    const movie = rows[0];
    movie.genreIdList = movie.genre_ids ? movie.genre_ids.split(',').map(Number) : [];
    return movie;
  }

  static async createMovie(movieData, genreIds = []) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Auto-generate slug if not provided
      const slug = (movieData.slug || movieData.title)
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

      const [result] = await conn.query(
        `INSERT INTO movies 
           (title, slug, description, duration_min, language, certification, release_date, poster_path, trailer_url, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movieData.title,
          slug,
          movieData.description || null,
          Number(movieData.duration_min),
          movieData.language,
          movieData.certification,
          movieData.release_date,
          movieData.poster_path || `/images/posters/${slug}.svg`,
          movieData.trailer_url || null,
          movieData.status || 'now_showing'
        ]
      );

      const movieId = result.insertId;

      // Assign multiple genres
      if (Array.isArray(genreIds) && genreIds.length > 0) {
        for (const gId of genreIds) {
          if (gId) {
            await conn.query('INSERT INTO movie_genres (movie_id, genre_id) VALUES (?, ?)', [movieId, Number(gId)]);
          }
        }
      }

      await conn.commit();
      return movieId;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async updateMovie(movieId, movieData, genreIds = []) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const slug = (movieData.slug || movieData.title)
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

      await conn.query(
        `UPDATE movies SET
           title = ?,
           slug = ?,
           description = ?,
           duration_min = ?,
           language = ?,
           certification = ?,
           release_date = ?,
           poster_path = ?,
           trailer_url = ?,
           status = ?,
           updated_at = NOW()
         WHERE movie_id = ?`,
        [
          movieData.title,
          slug,
          movieData.description || null,
          Number(movieData.duration_min),
          movieData.language,
          movieData.certification,
          movieData.release_date,
          movieData.poster_path || `/images/posters/${slug}.svg`,
          movieData.trailer_url || null,
          movieData.status,
          movieId
        ]
      );

      // Refresh genres mapping
      await conn.query('DELETE FROM movie_genres WHERE movie_id = ?', [movieId]);
      if (Array.isArray(genreIds) && genreIds.length > 0) {
        for (const gId of genreIds) {
          if (gId) {
            await conn.query('INSERT INTO movie_genres (movie_id, genre_id) VALUES (?, ?)', [movieId, Number(gId)]);
          }
        }
      }

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async deleteOrDeactivateMovie(movieId) {
    // Check if movie is referenced by showtimes
    const [showtimes] = await pool.query('SELECT COUNT(*) AS count FROM showtimes WHERE movie_id = ?', [movieId]);
    const count = showtimes[0]?.count || 0;

    if (count > 0) {
      // Historical references exist -> deactivate rather than hard delete
      await pool.query('UPDATE movies SET status = "ended", updated_at = NOW() WHERE movie_id = ?', [movieId]);
      return { action: 'deactivated', message: `Movie has ${count} historical showtimes. Status set to 'ended'.` };
    } else {
      // Safe to hard delete
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM movie_genres WHERE movie_id = ?', [movieId]);
        await conn.query('DELETE FROM movies WHERE movie_id = ?', [movieId]);
        await conn.commit();
        return { action: 'deleted', message: 'Movie deleted permanently.' };
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  }

  // =========================================================================
  // GENRES MANAGEMENT
  // =========================================================================
  static async getAllGenres() {
    const [rows] = await pool.query(
      `SELECT 
         g.genre_id,
         g.name,
         g.slug,
         g.created_at,
         COUNT(mg.movie_id) AS movie_count
       FROM genres g
       LEFT JOIN movie_genres mg ON g.genre_id = mg.genre_id
       GROUP BY g.genre_id
       ORDER BY g.name ASC`
    );
    return rows;
  }

  static async createGenre(name, slug = null) {
    const cleanSlug = (slug || name).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    const [result] = await pool.query(
      'INSERT INTO genres (name, slug, created_at) VALUES (?, ?, NOW())',
      [name.trim(), cleanSlug]
    );
    return result.insertId;
  }

  static async updateGenre(genreId, name, slug = null) {
    const cleanSlug = (slug || name).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    await pool.query(
      'UPDATE genres SET name = ?, slug = ? WHERE genre_id = ?',
      [name.trim(), cleanSlug, genreId]
    );
    return true;
  }

  static async deleteGenre(genreId) {
    await pool.query('DELETE FROM genres WHERE genre_id = ?', [genreId]);
    return true;
  }

  // =========================================================================
  // B. THEATER MANAGEMENT
  // =========================================================================
  static async getAllTheaters() {
    const [rows] = await pool.query(
      `SELECT 
         t.theater_id,
         t.name,
         t.address,
         t.city,
         t.state,
         t.pincode,
         t.phone,
         t.is_active,
         t.created_at,
         COUNT(DISTINCT sc.screen_id) AS screen_count,
         COALESCE(SUM(sc.total_capacity), 0) AS total_theater_capacity
       FROM theaters t
       LEFT JOIN screens sc ON t.theater_id = sc.theater_id
       GROUP BY t.theater_id
       ORDER BY t.theater_id DESC`
    );
    return rows;
  }

  static async getTheaterById(theaterId) {
    const [rows] = await pool.query('SELECT * FROM theaters WHERE theater_id = ?', [theaterId]);
    return rows[0] || null;
  }

  static async createTheater(data) {
    const [result] = await pool.query(
      `INSERT INTO theaters (name, address, city, state, pincode, phone, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        data.name.trim(),
        data.address.trim(),
        data.city.trim(),
        data.state.trim(),
        data.pincode ? data.pincode.trim() : null,
        data.phone ? data.phone.trim() : null
      ]
    );
    return result.insertId;
  }

  static async updateTheater(theaterId, data) {
    await pool.query(
      `UPDATE theaters SET
         name = ?,
         address = ?,
         city = ?,
         state = ?,
         pincode = ?,
         phone = ?,
         is_active = ?,
         updated_at = NOW()
       WHERE theater_id = ?`,
      [
        data.name.trim(),
        data.address.trim(),
        data.city.trim(),
        data.state.trim(),
        data.pincode ? data.pincode.trim() : null,
        data.phone ? data.phone.trim() : null,
        data.is_active !== undefined ? Number(data.is_active) : 1,
        theaterId
      ]
    );
    return true;
  }

  static async deleteOrDeactivateTheater(theaterId) {
    // Check if any screens exist
    const [screens] = await pool.query('SELECT screen_id FROM screens WHERE theater_id = ?', [theaterId]);
    if (screens.length > 0) {
      // Toggle active status to 0 to preserve screens & showtimes
      await pool.query('UPDATE theaters SET is_active = 0, updated_at = NOW() WHERE theater_id = ?', [theaterId]);
      return { action: 'deactivated', message: 'Theater has active screens. Marked as inactive.' };
    }
    await pool.query('DELETE FROM theaters WHERE theater_id = ?', [theaterId]);
    return { action: 'deleted', message: 'Theater deleted successfully.' };
  }

  // =========================================================================
  // C. SCREEN MANAGEMENT
  // =========================================================================
  static async getAllScreens(theaterId = null) {
    let sql = `
      SELECT 
        sc.screen_id,
        sc.theater_id,
        sc.name AS screen_name,
        sc.total_capacity,
        sc.screen_type,
        sc.is_active,
        sc.created_at,
        t.name AS theater_name,
        t.city AS theater_city,
        COUNT(DISTINCT s.seat_id) AS configured_seats_count,
        COUNT(DISTINCT CASE WHEN s.is_active = 1 THEN s.seat_id END) AS active_seats_count
      FROM screens sc
      JOIN theaters t ON sc.theater_id = t.theater_id
      LEFT JOIN seats s ON sc.screen_id = s.screen_id
      WHERE 1=1
    `;
    const params = [];

    if (theaterId) {
      sql += ' AND sc.theater_id = ?';
      params.push(theaterId);
    }

    sql += ' GROUP BY sc.screen_id ORDER BY t.name ASC, sc.name ASC';
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  static async getScreenById(screenId) {
    const [rows] = await pool.query(
      `SELECT sc.*, t.name AS theater_name 
       FROM screens sc 
       JOIN theaters t ON sc.theater_id = t.theater_id 
       WHERE sc.screen_id = ?`,
      [screenId]
    );
    return rows[0] || null;
  }

  static async createScreen(data) {
    const [result] = await pool.query(
      `INSERT INTO screens (theater_id, name, total_capacity, screen_type, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        Number(data.theater_id),
        data.name.trim(),
        Number(data.total_capacity) || 50,
        data.screen_type || '2D',
        data.is_active !== undefined ? Number(data.is_active) : 1
      ]
    );
    return result.insertId;
  }

  static async updateScreen(screenId, data) {
    await pool.query(
      `UPDATE screens SET
         name = ?,
         total_capacity = ?,
         screen_type = ?,
         is_active = ?,
         updated_at = NOW()
       WHERE screen_id = ?`,
      [
        data.name.trim(),
        Number(data.total_capacity),
        data.screen_type,
        data.is_active !== undefined ? Number(data.is_active) : 1,
        screenId
      ]
    );
    return true;
  }

  static async deleteOrDeactivateScreen(screenId) {
    const [showtimes] = await pool.query('SELECT COUNT(*) AS count FROM showtimes WHERE screen_id = ?', [screenId]);
    if (showtimes[0]?.count > 0) {
      await pool.query('UPDATE screens SET is_active = 0, updated_at = NOW() WHERE screen_id = ?', [screenId]);
      return { action: 'deactivated', message: 'Screen is referenced by showtimes. Deactivated successfully.' };
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM seats WHERE screen_id = ?', [screenId]);
      await conn.query('DELETE FROM screens WHERE screen_id = ?', [screenId]);
      await conn.commit();
      return { action: 'deleted', message: 'Screen and seats deleted successfully.' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // =========================================================================
  // D. SEAT MANAGEMENT
  // =========================================================================
  static async getSeatTypes() {
    const [rows] = await pool.query('SELECT * FROM seat_types ORDER BY seat_type_id ASC');
    return rows;
  }

  static async getSeatsByScreen(screenId) {
    const [rows] = await pool.query(
      `SELECT 
         s.seat_id,
         s.screen_id,
         s.seat_type_id,
         s.row_label,
         s.seat_number,
         s.is_active,
         st.name AS seat_type_name,
         st.color_code,
         (SELECT COUNT(*) FROM booking_seats bs WHERE bs.seat_id = s.seat_id) AS booking_history_count
       FROM seats s
       JOIN seat_types st ON s.seat_type_id = st.seat_type_id
       WHERE s.screen_id = ?
       ORDER BY s.row_label ASC, s.seat_number ASC`,
      [screenId]
    );
    return rows;
  }

  static async createSingleSeat(screenId, { row_label, seat_number, seat_type_id }) {
    const row = row_label.trim().toUpperCase();
    const num = Number(seat_number);

    // Prevent duplicate seat position
    const [existing] = await pool.query(
      'SELECT seat_id FROM seats WHERE screen_id = ? AND row_label = ? AND seat_number = ?',
      [screenId, row, num]
    );
    if (existing.length > 0) {
      const err = new Error(`Seat ${row}${num} already exists in this screen.`);
      err.status = 409;
      throw err;
    }

    const [result] = await pool.query(
      'INSERT INTO seats (screen_id, seat_type_id, row_label, seat_number, is_active, created_at) VALUES (?, ?, ?, ?, 1, NOW())',
      [screenId, Number(seat_type_id), row, num]
    );

    // Update screen capacity count
    await this.syncScreenCapacity(screenId);

    return result.insertId;
  }

  static async batchCreateSeats(screenId, { row_label, start_number, end_number, seat_type_id }) {
    const row = row_label.trim().toUpperCase();
    const start = Number(start_number);
    const end = Number(end_number);

    if (end < start) {
      throw new Error('End number must be greater than or equal to start number.');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let createdCount = 0;

      for (let n = start; n <= end; n++) {
        // Check duplicate
        const [existing] = await conn.query(
          'SELECT seat_id FROM seats WHERE screen_id = ? AND row_label = ? AND seat_number = ?',
          [screenId, row, n]
        );
        if (existing.length === 0) {
          await conn.query(
            'INSERT INTO seats (screen_id, seat_type_id, row_label, seat_number, is_active, created_at) VALUES (?, ?, ?, ?, 1, NOW())',
            [screenId, Number(seat_type_id), row, n]
          );
          createdCount++;
        }
      }

      await conn.commit();
      await this.syncScreenCapacity(screenId);
      return createdCount;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async toggleSeatActive(seatId, isActive) {
    await pool.query('UPDATE seats SET is_active = ? WHERE seat_id = ?', [Number(isActive), seatId]);
    return true;
  }

  static async deleteSeat(seatId) {
    // Check if referenced by historical transactions
    const [bookings] = await pool.query('SELECT COUNT(*) AS count FROM booking_seats WHERE seat_id = ?', [seatId]);
    if (bookings[0]?.count > 0) {
      const err = new Error('Cannot delete seat: it is referenced by existing booking transactions. Deactivate the seat instead.');
      err.status = 409;
      throw err;
    }

    // Get screen_id before delete
    const [seat] = await pool.query('SELECT screen_id FROM seats WHERE seat_id = ?', [seatId]);
    const screenId = seat[0]?.screen_id;

    await pool.query('DELETE FROM seats WHERE seat_id = ?', [seatId]);
    if (screenId) {
      await this.syncScreenCapacity(screenId);
    }
    return true;
  }

  static async syncScreenCapacity(screenId) {
    const [counts] = await pool.query(
      'SELECT COUNT(*) AS total FROM seats WHERE screen_id = ? AND is_active = 1',
      [screenId]
    );
    const total = counts[0]?.total || 0;
    if (total > 0) {
      await pool.query('UPDATE screens SET total_capacity = ? WHERE screen_id = ?', [total, screenId]);
    }
  }

  // =========================================================================
  // E. SHOWTIME MANAGEMENT
  // =========================================================================
  static async getAllShowtimes(filters = {}) {
    let sql = `
      SELECT 
        s.showtime_id,
        s.movie_id,
        s.screen_id,
        s.start_time,
        s.end_time,
        s.base_price,
        s.format,
        s.language,
        s.status,
        m.title AS movie_title,
        m.duration_min,
        m.certification,
        t.theater_id,
        t.name AS theater_name,
        t.city AS theater_city,
        sc.name AS screen_name,
        sc.total_capacity,
        COUNT(DISTINCT CASE WHEN ss.status = 'booked' THEN ss.seat_id END) AS booked_seats_count,
        COUNT(DISTINCT CASE WHEN ss.status = 'available' THEN ss.seat_id END) AS available_seats_count
      FROM showtimes s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters t ON sc.theater_id = t.theater_id
      LEFT JOIN showtime_seats ss ON s.showtime_id = ss.showtime_id
      WHERE 1=1
    `;
    const params = [];

    if (filters.movie_id) {
      sql += ' AND s.movie_id = ?';
      params.push(filters.movie_id);
    }
    if (filters.theater_id) {
      sql += ' AND t.theater_id = ?';
      params.push(filters.theater_id);
    }
    if (filters.status) {
      sql += ' AND s.status = ?';
      params.push(filters.status);
    }

    sql += ' GROUP BY s.showtime_id ORDER BY s.start_time DESC';

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  static async createShowtime({
    movie_id,
    theater_id,
    screen_id,
    start_date,
    start_time_of_day,
    buffer_min = 20,
    base_price,
    format = '2D',
    language = 'English'
  }) {
    // 1. Fetch movie to get duration
    const [movies] = await pool.query('SELECT movie_id, title, duration_min FROM movies WHERE movie_id = ?', [movie_id]);
    if (movies.length === 0) throw new Error('Selected movie not found.');
    const movie = movies[0];

    // 2. Validate screen belongs to selected theater!
    const [screens] = await pool.query(
      'SELECT screen_id, theater_id, name, screen_type, total_capacity FROM screens WHERE screen_id = ? AND theater_id = ?',
      [screen_id, theater_id]
    );
    if (screens.length === 0) {
      throw new Error('Screen validation error: The selected screen does not belong to the selected theater.');
    }

    // 3. Validate screen has active seats
    const [activeSeats] = await pool.query(
      'SELECT COUNT(*) AS count FROM seats WHERE screen_id = ? AND is_active = 1',
      [screen_id]
    );
    if ((activeSeats[0]?.count || 0) === 0) {
      throw new Error('Cannot schedule showtime: This screen does not have any active seats configured.');
    }

    // 4. Calculate start and end times with buffer
    const startDateTime = new Date(`${start_date}T${start_time_of_day}`);
    if (isNaN(startDateTime.getTime())) {
      throw new Error('Invalid start date or time format.');
    }

    const durationMin = Number(movie.duration_min);
    const bufferMinutes = Number(buffer_min) || 20;
    const totalRuntimeMinutes = durationMin + bufferMinutes;
    const endDateTime = new Date(startDateTime.getTime() + totalRuntimeMinutes * 60 * 1000);

    const formattedStart = startDateTime.toISOString().slice(0, 19).replace('T', ' ');
    const formattedEnd = endDateTime.toISOString().slice(0, 19).replace('T', ' ');

    // 5. Pre-check overlapping showtimes on the same screen
    const [overlaps] = await pool.query(
      `SELECT showtime_id FROM showtimes 
       WHERE screen_id = ? 
         AND status != 'cancelled'
         AND ((? < end_time) AND (? > start_time))`,
      [screen_id, formattedStart, formattedEnd]
    );

    if (overlaps.length > 0) {
      throw new Error('Schedule conflict: An active showtime already exists on this screen during the requested time window.');
    }

    // 6. Use transaction to insert showtime & generate showtime_seats inventory
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [insertResult] = await conn.query(
        `INSERT INTO showtimes 
           (movie_id, screen_id, start_time, end_time, base_price, language, format, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', NOW())`,
        [
          Number(movie_id),
          Number(screen_id),
          formattedStart,
          formattedEnd,
          Number(base_price),
          language,
          format
        ]
      );

      const newShowtimeId = insertResult.insertId;

      // Automatically generate showtime_seats inventory with tiered pricing
      const numericPrice = Number(base_price);
      await conn.query(
        `INSERT INTO showtime_seats (showtime_id, seat_id, price, status)
         SELECT 
           ?,
           s.seat_id,
           CASE 
             WHEN LOWER(st.name) = 'premium' THEN ROUND(? * 1.35, 2)
             WHEN LOWER(st.name) = 'recliner' THEN ROUND(? * 1.80, 2)
             ELSE ?
           END AS calculated_price,
           'available'
         FROM seats s
         JOIN seat_types st ON s.seat_type_id = st.seat_type_id
         WHERE s.screen_id = ? AND s.is_active = 1`,
        [newShowtimeId, numericPrice, numericPrice, numericPrice, Number(screen_id)]
      );

      await conn.commit();
      return newShowtimeId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async cancelShowtime(showtimeId) {
    await pool.query('UPDATE showtimes SET status = "cancelled", updated_at = NOW() WHERE showtime_id = ?', [showtimeId]);
    return true;
  }

  // =========================================================================
  // F. BOOKINGS, CUSTOMERS & PAYMENTS VIEWERS
  // =========================================================================
  static async getAllBookings(limit = 50) {
    const [rows] = await pool.query(
      `SELECT 
         b.booking_id,
         b.booking_ref,
         b.total_amount,
         b.status,
         b.booked_at,
         c.customer_id,
         c.full_name AS customer_name,
         c.email AS customer_email,
         c.phone AS customer_phone,
         m.title AS movie_title,
         t.name AS theater_name,
         sc.name AS screen_name,
         sh.start_time,
         sh.format,
         COUNT(DISTINCT bs.booking_seat_id) AS seats_count,
         p.payment_method,
         p.transaction_ref,
         p.status AS payment_status
       FROM bookings b
       JOIN customers c ON b.customer_id = c.customer_id
       JOIN showtimes sh ON b.showtime_id = sh.showtime_id
       JOIN movies m ON sh.movie_id = m.movie_id
       JOIN screens sc ON sh.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
       LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.status = 'success'
       GROUP BY b.booking_id, p.payment_method, p.transaction_ref, p.status
       ORDER BY b.booked_at DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }

  static async getAllCustomers(search = '') {
    let query = `
      SELECT 
         c.customer_id,
         c.full_name,
         c.email,
         c.phone,
         c.status,
         c.created_at,
         COUNT(DISTINCT b.booking_id) AS total_bookings,
         COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.total_amount ELSE 0 END), 0.00) AS total_spent
       FROM customers c
       LEFT JOIN bookings b ON c.customer_id = b.customer_id
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` WHERE c.full_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ` GROUP BY c.customer_id ORDER BY c.customer_id DESC`;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  static async getCustomerDetails(customerId) {
    const [customer] = await pool.query(
      `SELECT customer_id, full_name, email, phone, status, created_at, updated_at 
       FROM customers 
       WHERE customer_id = ?`,
      [customerId]
    );

    if (customer.length === 0) return null;

    const [bookings] = await pool.query(
      `SELECT 
         b.booking_id, b.booking_ref, b.total_amount, b.status, b.booked_at, b.confirmed_at,
         m.title AS movie_title,
         th.name AS theater_name,
         sc.name AS screen_name,
         s.start_time,
         COUNT(DISTINCT bs.booking_seat_id) AS ticket_count,
         p.status AS payment_status,
         p.transaction_ref
       FROM bookings b
       JOIN showtimes s ON b.showtime_id = s.showtime_id
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters th ON sc.theater_id = th.theater_id
       LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
       LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.status = 'success'
       WHERE b.customer_id = ?
       GROUP BY b.booking_id, p.status, p.transaction_ref
       ORDER BY b.booked_at DESC`,
      [customerId]
    );

    return {
      customer: customer[0],
      bookings
    };
  }

  static async getAllTickets(limit = 100) {
    const [rows] = await pool.query(
      `SELECT 
         t.ticket_id, t.ticket_number, t.status AS ticket_status, t.issued_at,
         b.booking_ref, b.status AS booking_status,
         c.full_name AS customer_name, c.email AS customer_email,
         m.title AS movie_title,
         th.name AS theater_name,
         sc.name AS screen_name,
         s.start_time,
         se.row_label, se.seat_number,
         st.name AS seat_category,
         bs.price_paid
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
       ORDER BY t.issued_at DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }

  static async getAllRefunds(limit = 50) {
    const [rows] = await pool.query(
      `SELECT 
         r.refund_id, r.refund_ref, r.amount, r.status AS refund_status, r.reason, r.initiated_at, r.processed_at,
         p.transaction_ref, p.payment_method,
         b.booking_ref,
         c.full_name AS customer_name, c.email AS customer_email
       FROM refunds r
       JOIN payments p ON r.payment_id = p.payment_id
       JOIN bookings b ON r.booking_id = b.booking_id
       JOIN customers c ON b.customer_id = c.customer_id
       ORDER BY r.initiated_at DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }

  static async toggleCustomerStatus(customerId, status) {
    if (!['active', 'blocked'].includes(status)) {
      throw new Error('Invalid customer status.');
    }
    await pool.query('UPDATE customers SET status = ?, updated_at = NOW() WHERE customer_id = ?', [status, customerId]);
    return true;
  }

  static async getAllPayments(limit = 50) {
    const [rows] = await pool.query(
      `SELECT 
         p.payment_id,
         p.booking_id,
         p.transaction_ref,
         p.payment_method,
         p.amount,
         p.currency,
         p.status AS payment_status,
         p.paid_at,
         p.created_at,
         b.booking_ref,
         c.full_name AS customer_name,
         c.email AS customer_email,
         r.refund_id,
         r.amount AS refunded_amount,
         r.status AS refund_status
       FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       JOIN customers c ON b.customer_id = c.customer_id
       LEFT JOIN refunds r ON p.payment_id = r.payment_id
       ORDER BY p.created_at DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }
}

module.exports = AdminService;
