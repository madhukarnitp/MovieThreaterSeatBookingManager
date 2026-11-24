const { pool } = require('../config/db');

/**
 * Format helper for movie view attributes
 */
function enrichMovie(movie) {
  if (!movie) return null;
  const genres = movie.genre ? movie.genre.split(',').map(g => g.trim()) : ['Cinema'];
  const activeShowtimes = Number(movie.active_showtimes_count || 0);
  const releaseDate = movie.release_date ? new Date(movie.release_date) : null;
  const isUpcoming = releaseDate && releaseDate > new Date();
  const computedStatus = movie.status || (activeShowtimes > 0 ? 'now_showing' : (isUpcoming ? 'upcoming' : 'ended'));

  return {
    ...movie,
    genres: movie.genre || 'Cinema',
    language: movie.language || 'Hindi',
    formattedDuration: `${movie.duration_min || 120} mins`,
    genreList: genres,
    formatList: movie.formatList || ['2D'],
    certification: movie.certification || 'UA',
    status: computedStatus,
    poster_path: movie.poster_url || '/images/posters/fallback.svg',
    trailer_url: movie.trailer_url || null,
    slug: (movie.title || 'movie').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
  };
}

/**
 * Display Home Landing Page
 */
async function getHome(req, res, next) {
  try {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }

    // 1. Fetch currently available movies
    const [movies] = await pool.query(
      'SELECT * FROM movies ORDER BY release_date DESC LIMIT 10'
    );

    const enrichedMovies = movies.map(enrichMovie);
    const featuredMovie = enrichedMovies.length > 0 ? {
      ...enrichedMovies[0],
      active_shows_count: 8,
      min_price: 250.00
    } : null;

    // 2. Fetch theaters
    const [theaters] = await pool.query(
      'SELECT * FROM theaters ORDER BY city, name'
    );

    // 3. Fetch upcoming scheduled showtimes
    const [showtimes] = await pool.query(
      `SELECT s.showtime_id, s.show_date, s.start_time, s.ticket_price,
              m.movie_id, m.title AS movie_title, m.poster_url,
              t.name AS theater_name, t.city, sc.screen_name
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       WHERE s.status = 'SCHEDULED' AND s.show_date >= CURDATE()
       ORDER BY s.show_date ASC, s.start_time ASC
       LIMIT 8`
    );

    // 4. Popular movies with ticket sales
    const [popularRows] = await pool.query(
      `SELECT m.*, COUNT(b.booking_id) AS tickets_sold
       FROM movies m
       LEFT JOIN showtimes s ON m.movie_id = s.movie_id
       LEFT JOIN bookings b ON s.showtime_id = b.showtime_id
       GROUP BY m.movie_id
       ORDER BY tickets_sold DESC, m.release_date DESC
       LIMIT 4`
    );
    const popular = (popularRows.length > 0 ? popularRows : movies.slice(0, 4)).map(m => ({
      ...enrichMovie(m),
      tickets_sold: Math.max(m.tickets_sold || 0, 150)
    }));

    // 5. Upcoming movies
    const upcoming = enrichedMovies.slice(4, 7);

    // 6. Genres & Languages for filter bar
    const filterOptions = {
      genres: [
        { slug: 'Action', name: 'Action' },
        { slug: 'Drama', name: 'Drama' },
        { slug: 'Sci-Fi', name: 'Sci-Fi' },
        { slug: 'Comedy', name: 'Comedy' },
        { slug: 'Thriller', name: 'Thriller' }
      ],
      languages: ['Hindi', 'English', 'Telugu', 'Tamil', 'Kannada']
    };

    res.render('pages/home', {
      title: 'CineSeat Manager - Premier Seat Booking',
      activePage: 'home',
      featuredMovie,
      nowShowing: enrichedMovies.slice(0, 4),
      upcoming,
      popular,
      filterOptions,
      theaters,
      upcomingShowtimes: showtimes
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Display All Movies Catalog
 */
async function getMovies(req, res, next) {
  try {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
      return res.redirect('/admin/movies');
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const genre = (typeof req.query.genre === 'string' && req.query.genre.trim()) ? req.query.genre.trim() : 'all';
    const language = (typeof req.query.language === 'string' && req.query.language.trim()) ? req.query.language.trim() : 'all';
    const status = (typeof req.query.status === 'string' && req.query.status.trim()) ? req.query.status.trim() : 'all';
    const sort = (typeof req.query.sort === 'string' && req.query.sort.trim()) ? req.query.sort.trim() : 'newest';

    let query = `
      SELECT m.*, COUNT(s.showtime_id) AS active_showtimes_count
      FROM movies m
      LEFT JOIN showtimes s ON m.movie_id = s.movie_id AND s.status = 'SCHEDULED' AND s.show_date >= CURDATE()
    `;
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push('(m.title LIKE ? OR m.description LIKE ? OR m.genre LIKE ? OR m.language LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (genre.toLowerCase() !== 'all') {
      conditions.push('m.genre LIKE ?');
      params.push(`%${genre}%`);
    }

    if (language.toLowerCase() !== 'all') {
      conditions.push('LOWER(m.language) = LOWER(?)');
      params.push(language);
    }

    if (status === 'upcoming') {
      conditions.push('m.release_date > CURDATE()');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY m.movie_id';

    if (status === 'now_showing') {
      query += ' HAVING active_showtimes_count > 0';
    } else if (status === 'ended') {
      query += ' HAVING active_showtimes_count = 0 AND m.release_date <= CURDATE()';
    }

    const sortMap = {
      newest: 'm.release_date DESC',
      title_asc: 'm.title ASC',
      title_desc: 'm.title DESC',
      duration_desc: 'm.duration_min DESC'
    };
    query += ` ORDER BY ${sortMap[sort] || sortMap.newest}`;

    const [rows] = await pool.query(query, params);
    const movies = rows.map(enrichMovie);

    // Get all unique genres and languages for filter controls
    const [allMetaRows] = await pool.query('SELECT genre, language FROM movies');
    const genreSet = new Set();
    const languageSet = new Set();
    allMetaRows.forEach(r => {
      if (r.genre) {
        r.genre.split(',').forEach(g => genreSet.add(g.trim()));
      }
      if (r.language) {
        languageSet.add(r.language.trim());
      }
    });

    const genresList = Array.from(genreSet).sort();
    const languagesList = Array.from(languageSet).sort();

    res.render('pages/movies/index', {
      title: 'Movies Catalog - CineSeat Manager',
      activePage: 'movies',
      movies,
      totalCount: movies.length,
      filters: {
        search,
        genre,
        language,
        status,
        sort
      },
      filterOptions: {
        genres: genresList.map(g => ({ name: g, slug: g })),
        languages: languagesList
      },
      pagination: {
        page: 1,
        limit: 12,
        total: movies.length,
        totalPages: 1
      },
      genres: genresList,
      selectedGenre: genre === 'all' ? '' : genre,
      searchQuery: search
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Display Single Movie Details with Screenings
 */
async function getMovieDetails(req, res, next) {
  try {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
      return res.redirect('/admin/movies');
    }

    const movieId = req.params.id;

    // Fetch movie
    const [movieRows] = await pool.query(
      'SELECT * FROM movies WHERE movie_id = ? LIMIT 1',
      [movieId]
    );

    if (movieRows.length === 0) {
      req.flash('error', 'Movie not found.');
      return res.redirect('/movies');
    }

    const movie = enrichMovie(movieRows[0]);

    // Fetch showtimes grouped by theater
    const [showtimeRows] = await pool.query(
      `SELECT s.showtime_id, s.show_date, s.start_time, s.end_time, s.ticket_price, s.status,
              sc.screen_id, sc.screen_name, sc.total_capacity,
              t.theater_id, t.name AS theater_name, t.city, t.address,
              (SELECT COUNT(*) 
               FROM booking_seats bs 
               JOIN bookings b ON bs.booking_id = b.booking_id 
               WHERE b.showtime_id = s.showtime_id AND b.booking_status IN ('PENDING', 'CONFIRMED')) AS booked_seats_count
       FROM showtimes s
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       WHERE s.movie_id = ? AND s.status = 'SCHEDULED' AND s.show_date >= CURDATE()
       ORDER BY s.show_date, t.city, t.name, s.start_time`,
      [movieId]
    );

    // Build showtimesData structure expected by details.ejs
    const dateSet = new Set();
    const grouped = {};

    showtimeRows.forEach(st => {
      // Format date string YYYY-MM-DD
      const d = new Date(st.show_date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      dateSet.add(dateStr);

      if (!grouped[dateStr]) {
        grouped[dateStr] = { theaters: {} };
      }

      if (!grouped[dateStr].theaters[st.theater_id]) {
        grouped[dateStr].theaters[st.theater_id] = {
          id: st.theater_id,
          name: st.theater_name,
          city: st.city,
          address: st.address,
          showtimes: []
        };
      }

      const availableSeats = Math.max(0, st.total_capacity - (st.booked_seats_count || 0));

      grouped[dateStr].theaters[st.theater_id].showtimes.push({
        showtime_id: st.showtime_id,
        screen_id: st.screen_id,
        screen_name: st.screen_name,
        format: '2D',
        base_price: parseFloat(st.ticket_price).toFixed(2),
        start_time: st.start_time,
        formattedTime: String(st.start_time).slice(0, 5),
        available_seats: availableSeats
      });
    });

    const availableDates = Array.from(dateSet).sort();
    const selectedDate = req.query?.date && availableDates.includes(req.query.date)
      ? req.query.date
      : (availableDates.length > 0 ? availableDates[0] : '');

    res.render('pages/movies/details', {
      title: `${movie.title} - CineSeat Manager`,
      activePage: 'movies',
      movie,
      showtimesData: {
        availableDates,
        grouped
      },
      selectedDate,
      showtimes: showtimeRows
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Display All Showtimes by Date and City
 */
async function getShowtimes(req, res, next) {
  try {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
      return res.redirect('/admin/showtimes');
    }

    const { date, city, movie_id } = req.query;
    let query = `
      SELECT s.showtime_id, s.show_date, s.start_time, s.end_time, s.ticket_price, s.status,
              m.movie_id, m.title AS movie_title, m.poster_url, m.duration_min, m.genre, m.language,
              sc.screen_id, sc.screen_name, sc.total_capacity,
              t.theater_id, t.name AS theater_name, t.city, t.address,
              (SELECT COUNT(*) 
               FROM booking_seats bs 
               JOIN bookings b ON bs.booking_id = b.booking_id 
               WHERE b.showtime_id = s.showtime_id AND b.booking_status IN ('PENDING', 'CONFIRMED')) AS booked_seats_count
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.movie_id
       JOIN screens sc ON s.screen_id = sc.screen_id
       JOIN theaters t ON sc.theater_id = t.theater_id
       WHERE s.status = 'SCHEDULED'
    `;
    const params = [];

    query += ' AND s.show_date >= CURDATE()';

    if (city) {
      query += ' AND t.city = ?';
      params.push(city);
    }

    if (movie_id) {
      query += ' AND s.movie_id = ?';
      params.push(movie_id);
    }

    query += ' ORDER BY s.show_date ASC, t.city ASC, t.name ASC, s.start_time ASC';

    const [showtimes] = await pool.query(query, params);

    // Fetch movie if movie_id provided
    let selectedMovie = null;
    if (movie_id) {
      const [mRows] = await pool.query('SELECT * FROM movies WHERE movie_id = ? LIMIT 1', [movie_id]);
      if (mRows.length > 0) {
        selectedMovie = enrichMovie(mRows[0]);
      }
    }

    // Build showtimesData structure
    const dateSet = new Set();
    const grouped = {};

    showtimes.forEach(st => {
      const d = new Date(st.show_date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      dateSet.add(dateStr);

      if (!grouped[dateStr]) {
        grouped[dateStr] = { theaters: {} };
      }

      if (!grouped[dateStr].theaters[st.theater_id]) {
        grouped[dateStr].theaters[st.theater_id] = {
          id: st.theater_id,
          name: st.theater_name,
          city: st.city,
          address: st.address,
          showtimes: []
        };
      }

      const availableSeats = Math.max(0, st.total_capacity - (st.booked_seats_count || 0));

      grouped[dateStr].theaters[st.theater_id].showtimes.push({
        showtime_id: st.showtime_id,
        screen_id: st.screen_id,
        screen_name: st.screen_name,
        format: '2D',
        base_price: parseFloat(st.ticket_price).toFixed(2),
        start_time: st.start_time,
        formattedTime: String(st.start_time).slice(0, 5),
        available_seats: availableSeats,
        movie_title: st.movie_title,
        movie_id: st.movie_id
      });
    });

    const availableDates = Array.from(dateSet).sort();
    const selectedDate = date && availableDates.includes(date)
      ? date
      : (availableDates.length > 0 ? availableDates[0] : '');

    // Get all cities for filter dropdown
    const [cityRows] = await pool.query('SELECT DISTINCT city FROM theaters ORDER BY city');
    const cities = cityRows.map(c => c.city);

    // Get all movies for filter dropdown
    const [allMovies] = await pool.query('SELECT movie_id, title FROM movies ORDER BY title');

    res.render('pages/movies/showtimes', {
      title: 'Showtimes & Screenings - CineSeat Manager',
      activePage: 'showtimes',
      showtimes,
      movie: selectedMovie,
      showtimesData: {
        availableDates,
        grouped
      },
      selectedDate,
      cities,
      movies: allMovies,
      filters: {
        date: date || '',
        city: city || '',
        movie_id: movie_id || ''
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Display All Theaters with Screens and Upcoming Showtimes
 */
async function getTheaters(req, res, next) {
  try {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
      return res.redirect('/admin/theaters');
    }

    const { city } = req.query;

    let query = `
      SELECT t.theater_id, t.name, t.city, t.address,
             COUNT(DISTINCT sc.screen_id) AS total_screens,
             COALESCE(SUM(sc.total_capacity), 0) AS total_capacity
      FROM theaters t
      LEFT JOIN screens sc ON t.theater_id = sc.theater_id
    `;
    const params = [];

    if (city && city.trim()) {
      query += ' WHERE t.city = ?';
      params.push(city.trim());
    }

    query += ' GROUP BY t.theater_id, t.name, t.city, t.address ORDER BY t.city ASC, t.name ASC';

    const [theaters] = await pool.query(query, params);

    // Fetch screens for each theater
    const [screens] = await pool.query(`
      SELECT sc.screen_id, sc.theater_id, sc.screen_name, sc.total_capacity
      FROM screens sc
      INNER JOIN theaters t ON sc.theater_id = t.theater_id
      ORDER BY sc.screen_name ASC
    `);

    // Fetch upcoming showtimes for theaters
    const [upcomingShows] = await pool.query(`
      SELECT s.showtime_id, s.show_date, s.start_time, s.ticket_price,
             m.movie_id, m.title AS movie_title, m.poster_url,
             sc.screen_id, sc.screen_name, sc.theater_id
      FROM showtimes s
      INNER JOIN movies m ON s.movie_id = m.movie_id
      INNER JOIN screens sc ON s.screen_id = sc.screen_id
      WHERE s.status = 'SCHEDULED' AND s.show_date >= CURDATE()
      ORDER BY s.show_date ASC, s.start_time ASC
    `);

    // Attach screens and showtimes to each theater
    const enrichedTheaters = theaters.map(th => {
      const thScreens = screens.filter(sc => sc.theater_id === th.theater_id);
      const thShows = upcomingShows.filter(s => s.theater_id === th.theater_id).slice(0, 4);
      return {
        ...th,
        screens: thScreens,
        upcomingShowtimes: thShows
      };
    });

    // Get unique cities for filter dropdown
    const [cityRows] = await pool.query('SELECT DISTINCT city FROM theaters ORDER BY city');
    const cities = cityRows.map(c => c.city);

    res.render('pages/theaters', {
      title: 'Our Theaters & Complexes - CineSeat Manager',
      activePage: 'theaters',
      theaters: enrichedTheaters,
      cities,
      selectedCity: city || ''
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getHome,
  getMovies,
  getMovieDetails,
  getShowtimes,
  getTheaters
};

