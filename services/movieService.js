const { pool } = require('../config/db');

/**
 * Service for public-facing movie catalog, showtimes, and filters
 */
class MovieService {
  /**
   * Helper to format runtime minutes into "Xh Ym"
   */
  static formatDuration(minutes) {
    if (!minutes || isNaN(minutes)) return 'N/A';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hrs > 0 ? `${hrs}h ${mins > 0 ? `${mins}m` : ''}`.trim() : `${mins}m`;
  }

  /**
   * Get featured movie for homepage hero banner
   */
  static async getFeaturedMovie() {
    const [rows] = await pool.query(
      `SELECT 
         m.movie_id,
         m.title,
         m.slug,
         m.description,
         m.duration_min,
         m.language,
         m.certification,
         m.release_date,
         m.poster_path,
         m.trailer_url,
         m.status,
         COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', '), '') AS genres,
         MIN(s.base_price) AS min_price,
         COUNT(DISTINCT s.showtime_id) AS active_shows_count
       FROM movies m
       LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
       LEFT JOIN genres g ON mg.genre_id = g.genre_id
       LEFT JOIN showtimes s ON m.movie_id = s.movie_id AND s.status = 'scheduled'
       WHERE m.status = 'now_showing'
       GROUP BY m.movie_id
       ORDER BY active_shows_count DESC, m.release_date DESC
       LIMIT 1`
    );

    if (rows.length === 0) return null;
    const movie = rows[0];
    movie.formattedDuration = this.formatDuration(movie.duration_min);
    movie.genreList = movie.genres ? movie.genres.split(', ') : [];
    return movie;
  }

  /**
   * Get now showing movies
   */
  static async getNowShowing(limit = 8) {
    const [rows] = await pool.query(
      `SELECT 
         m.movie_id,
         m.title,
         m.slug,
         m.description,
         m.duration_min,
         m.language,
         m.certification,
         m.release_date,
         m.poster_path,
         m.trailer_url,
         m.status,
         COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', '), '') AS genres,
         COALESCE(GROUP_CONCAT(DISTINCT s.format ORDER BY s.format SEPARATOR ', '), '') AS formats,
         COUNT(DISTINCT s.showtime_id) AS showtimes_count,
         MIN(s.base_price) AS min_price
       FROM movies m
       LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
       LEFT JOIN genres g ON mg.genre_id = g.genre_id
       LEFT JOIN showtimes s ON m.movie_id = s.movie_id AND s.status = 'scheduled'
       WHERE m.status = 'now_showing'
       GROUP BY m.movie_id
       ORDER BY m.release_date DESC, showtimes_count DESC
       LIMIT ?`,
      [Number(limit)]
    );

    return rows.map(m => ({
      ...m,
      formattedDuration: this.formatDuration(m.duration_min),
      genreList: m.genres ? m.genres.split(', ') : [],
      formatList: m.formats ? m.formats.split(', ') : []
    }));
  }

  /**
   * Get upcoming movies
   */
  static async getUpcoming(limit = 6) {
    const [rows] = await pool.query(
      `SELECT 
         m.movie_id,
         m.title,
         m.slug,
         m.description,
         m.duration_min,
         m.language,
         m.certification,
         m.release_date,
         m.poster_path,
         m.trailer_url,
         m.status,
         COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', '), '') AS genres
       FROM movies m
       LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
       LEFT JOIN genres g ON mg.genre_id = g.genre_id
       WHERE m.status = 'upcoming'
       GROUP BY m.movie_id
       ORDER BY m.release_date ASC
       LIMIT ?`,
      [Number(limit)]
    );

    return rows.map(m => ({
      ...m,
      formattedDuration: this.formatDuration(m.duration_min),
      genreList: m.genres ? m.genres.split(', ') : []
    }));
  }

  /**
   * Get popular movies ranked by tickets sold and box office
   */
  static async getPopular(limit = 6) {
    const [rows] = await pool.query(
      `SELECT 
         m.movie_id,
         m.title,
         m.slug,
         m.description,
         m.duration_min,
         m.language,
         m.certification,
         m.release_date,
         m.poster_path,
         m.status,
         COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', '), '') AS genres,
         COUNT(DISTINCT bs.booking_seat_id) AS tickets_sold,
         COALESCE(SUM(bs.price_paid), 0.00) AS box_office
       FROM movies m
       LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
       LEFT JOIN genres g ON mg.genre_id = g.genre_id
       LEFT JOIN showtimes s ON m.movie_id = s.movie_id
       LEFT JOIN bookings b ON s.showtime_id = b.showtime_id AND b.status = 'confirmed'
       LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
       WHERE m.status IN ('now_showing', 'ended')
       GROUP BY m.movie_id
       ORDER BY tickets_sold DESC, box_office DESC
       LIMIT ?`,
      [Number(limit)]
    );

    return rows.map(m => ({
      ...m,
      formattedDuration: this.formatDuration(m.duration_min),
      genreList: m.genres ? m.genres.split(', ') : []
    }));
  }

  /**
   * Search and filter all movies with parameterized queries
   */
  static async getAllMovies({ search, genre, language, status, sort }) {
    let sql = `
      SELECT 
        m.movie_id,
        m.title,
        m.slug,
        m.description,
        m.duration_min,
        m.language,
        m.certification,
        m.release_date,
        m.poster_path,
        m.trailer_url,
        m.status,
        COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', '), '') AS genres,
        COALESCE(GROUP_CONCAT(DISTINCT s.format ORDER BY s.format SEPARATOR ', '), '') AS formats,
        COUNT(DISTINCT s.showtime_id) AS showtimes_count,
        MIN(s.base_price) AS min_price
      FROM movies m
      LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
      LEFT JOIN genres g ON mg.genre_id = g.genre_id
      LEFT JOIN showtimes s ON m.movie_id = s.movie_id AND s.status = 'scheduled'
      WHERE 1=1
    `;
    const params = [];

    // Search by title (parameterized with LIKE)
    if (search && search.trim() !== '') {
      sql += ` AND m.title LIKE ?`;
      params.push(`%${search.trim()}%`);
    }

    // Filter by genre slug or name
    if (genre && genre.trim() !== '' && genre.toLowerCase() !== 'all') {
      sql += ` AND m.movie_id IN (
        SELECT mg2.movie_id 
        FROM movie_genres mg2 
        JOIN genres g2 ON mg2.genre_id = g2.genre_id 
        WHERE LOWER(g2.name) = LOWER(?) OR LOWER(g2.slug) = LOWER(?)
      )`;
      params.push(genre.trim(), genre.trim());
    }

    // Filter by language
    if (language && language.trim() !== '' && language.toLowerCase() !== 'all') {
      sql += ` AND LOWER(m.language) = LOWER(?)`;
      params.push(language.trim());
    }

    // Filter by movie status
    if (status && ['now_showing', 'upcoming', 'ended'].includes(status.toLowerCase())) {
      sql += ` AND m.status = ?`;
      params.push(status.toLowerCase());
    }

    sql += ` GROUP BY m.movie_id`;

    // Sort order
    if (sort === 'oldest') {
      sql += ` ORDER BY m.release_date ASC`;
    } else if (sort === 'title_asc') {
      sql += ` ORDER BY m.title ASC`;
    } else if (sort === 'title_desc') {
      sql += ` ORDER BY m.title DESC`;
    } else if (sort === 'duration_desc') {
      sql += ` ORDER BY m.duration_min DESC`;
    } else {
      // Default: newest releases first, then showtimes count
      sql += ` ORDER BY m.release_date DESC, showtimes_count DESC`;
    }

    const [rows] = await pool.query(sql, params);

    return rows.map(m => ({
      ...m,
      formattedDuration: this.formatDuration(m.duration_min),
      genreList: m.genres ? m.genres.split(', ') : [],
      formatList: m.formats ? m.formats.split(', ') : []
    }));
  }

  /**
   * Get single movie details by ID or Slug
   */
  static async getMovieById(movieId) {
    if (!movieId) return null;

    const [rows] = await pool.query(
      `SELECT 
         m.movie_id,
         m.title,
         m.slug,
         m.description,
         m.duration_min,
         m.language,
         m.certification,
         m.release_date,
         m.poster_path,
         m.trailer_url,
         m.status,
         COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', '), '') AS genres,
         COALESCE(GROUP_CONCAT(DISTINCT s.format ORDER BY s.format SEPARATOR ', '), '') AS available_formats,
         MIN(s.base_price) AS min_price,
         MAX(s.base_price) AS max_price,
         COUNT(DISTINCT s.showtime_id) AS total_shows
       FROM movies m
       LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
       LEFT JOIN genres g ON mg.genre_id = g.genre_id
       LEFT JOIN showtimes s ON m.movie_id = s.movie_id AND s.status = 'scheduled'
       WHERE m.movie_id = ? OR m.slug = ?
       GROUP BY m.movie_id
       LIMIT 1`,
      [movieId, String(movieId)]
    );

    if (rows.length === 0) return null;

    const movie = rows[0];
    movie.formattedDuration = this.formatDuration(movie.duration_min);
    movie.genreList = movie.genres ? movie.genres.split(', ') : [];
    movie.formatList = movie.available_formats ? movie.available_formats.split(', ') : [];
    return movie;
  }

  /**
   * Get available scheduled showtimes for a movie, optionally filtered by date
   */
  static async getMovieShowtimes(movieId, targetDate = null) {
    let dateCondition = `AND DATE(s.start_time) >= CURRENT_DATE`;
    const params = [movieId];

    if (targetDate) {
      dateCondition = `AND DATE(s.start_time) = ?`;
      params.push(targetDate);
    }

    const [rows] = await pool.query(
      `SELECT 
         s.showtime_id,
         s.movie_id,
         s.screen_id,
         s.start_time,
         s.end_time,
         s.base_price,
         s.format,
         s.language,
         s.status,
         DATE(s.start_time) AS show_date,
         TIME(s.start_time) AS show_time,
         sc.name AS screen_name,
         sc.screen_type,
         sc.total_capacity,
         t.theater_id,
         t.name AS theater_name,
         t.address AS theater_address,
         t.city AS theater_city,
         (SELECT COUNT(*) FROM showtime_seats ss WHERE ss.showtime_id = s.showtime_id AND ss.status = 'available') AS available_seats
       FROM showtimes s
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       WHERE s.movie_id = ?
         AND s.status = 'scheduled'
         ${dateCondition}
       ORDER BY s.start_time ASC`,
      params
    );

    // Group showtimes by Date -> Theater
    const scheduleByDate = {};
    for (const row of rows) {
      const dateKey = new Date(row.start_time).toISOString().split('T')[0];
      if (!scheduleByDate[dateKey]) {
        scheduleByDate[dateKey] = {
          date: dateKey,
          displayDate: new Date(row.start_time).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          }),
          theaters: {}
        };
      }

      const theaterId = row.theater_id;
      if (!scheduleByDate[dateKey].theaters[theaterId]) {
        scheduleByDate[dateKey].theaters[theaterId] = {
          theater_id: row.theater_id,
          name: row.theater_name,
          address: row.theater_address,
          city: row.theater_city,
          showtimes: []
        };
      }

      scheduleByDate[dateKey].theaters[theaterId].showtimes.push({
        showtime_id: row.showtime_id,
        screen_id: row.screen_id,
        screen_name: row.screen_name,
        format: row.format,
        language: row.language,
        start_time: row.start_time,
        end_time: row.end_time,
        formattedTime: new Date(row.start_time).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        base_price: Number(row.base_price).toFixed(2),
        available_seats: row.available_seats,
        total_capacity: row.total_capacity
      });
    }

    return {
      rawList: rows,
      grouped: scheduleByDate,
      availableDates: Object.keys(scheduleByDate)
    };
  }

  /**
   * Get filter criteria options (genres, languages, cities)
   */
  static async getFilterOptions() {
    const [genres] = await pool.query('SELECT genre_id, name, slug FROM genres ORDER BY name ASC');
    const [languages] = await pool.query('SELECT DISTINCT language FROM movies WHERE language IS NOT NULL ORDER BY language ASC');
    const [theaters] = await pool.query('SELECT theater_id, name, city FROM theaters WHERE is_active = 1 ORDER BY city ASC, name ASC');

    return {
      genres,
      languages: languages.map(l => l.language),
      theaters
    };
  }
}

module.exports = MovieService;
