const MovieService = require('../services/movieService');

/**
 * Controller handling public movie browsing, details, and showtime schedules
 */
class MovieController {
  /**
   * GET /movies
   * Display searchable, filterable movie listing
   */
  static async listMovies(req, res, next) {
    try {
      const { search, genre, language, status, sort } = req.query;

      // Fetch filtered movies from MySQL
      const movies = await MovieService.getAllMovies({
        search,
        genre,
        language,
        status,
        sort
      });

      // Fetch filter metadata for dropdowns
      const filterOptions = await MovieService.getFilterOptions();

      res.render('pages/movies/index', {
        title: 'Browse Movies - CineSeat Cinema',
        activePage: 'movies',
        movies,
        totalCount: movies.length,
        filterOptions,
        filters: {
          search: search || '',
          genre: genre || 'all',
          language: language || 'all',
          status: status || 'all',
          sort: sort || 'newest'
        },
        alert: null
      });
    } catch (error) {
      console.error('Error in MovieController.listMovies:', error.message);
      next(error);
    }
  }

  /**
   * GET /movies/:id
   * Display single movie details, trailer, and showtimes
   */
  static async showMovieDetails(req, res, next) {
    try {
      const movieId = req.params.id;

      // Handle invalid or empty movie ID
      if (!movieId || (isNaN(movieId) && typeof movieId !== 'string')) {
        return res.status(404).render('pages/404', {
          title: 'Movie Not Found - CineSeat',
          activePage: 'movies',
          path: req.originalUrl,
          alert: {
            type: 'warning',
            message: 'Invalid movie identifier provided.'
          }
        });
      }

      const movie = await MovieService.getMovieById(movieId);

      if (!movie) {
        return res.status(404).render('pages/404', {
          title: 'Movie Not Found - CineSeat',
          activePage: 'movies',
          path: req.originalUrl,
          alert: {
            type: 'warning',
            message: 'The requested movie could not be found in our cinema catalog.'
          }
        });
      }

      // Fetch showtimes for this movie
      const selectedDate = req.query.date || null;
      const showtimesData = await MovieService.getMovieShowtimes(movie.movie_id, selectedDate);

      res.render('pages/movies/details', {
        title: `${movie.title} - CineSeat Cinema`,
        activePage: 'movies',
        movie,
        showtimesData,
        selectedDate: selectedDate || (showtimesData.availableDates[0] || null),
        alert: null
      });
    } catch (error) {
      console.error('Error in MovieController.showMovieDetails:', error.message);
      next(error);
    }
  }

  /**
   * GET /movies/:id/showtimes (and GET /showtimes)
   * Showtime selection grid
   */
  static async showShowtimeSelection(req, res, next) {
    try {
      const movieId = req.params.id || req.query.movie;
      const selectedDate = req.query.date || null;
      const selectedTheater = req.query.theater || 'all';

      let movie = null;
      if (movieId) {
        movie = await MovieService.getMovieById(movieId);
      }

      const filterOptions = await MovieService.getFilterOptions();

      // If movie selected, get its showtimes
      let showtimesData = { rawList: [], grouped: {}, availableDates: [] };
      if (movie) {
        showtimesData = await MovieService.getMovieShowtimes(movie.movie_id, selectedDate);
      } else {
        // Fetch now-showing movies to allow user to pick one
        const nowShowing = await MovieService.getNowShowing(12);
        if (nowShowing.length > 0) {
          movie = nowShowing[0];
          showtimesData = await MovieService.getMovieShowtimes(movie.movie_id, selectedDate);
        }
      }

      res.render('pages/movies/showtimes', {
        title: movie ? `Showtimes for ${movie.title} - CineSeat` : 'Select Movie Showtimes - CineSeat',
        activePage: 'showtimes',
        movie,
        showtimesData,
        filterOptions,
        selectedDate: selectedDate || (showtimesData.availableDates[0] || null),
        selectedTheater,
        alert: null
      });
    } catch (error) {
      console.error('Error in MovieController.showShowtimeSelection:', error.message);
      next(error);
    }
  }
}

module.exports = MovieController;
