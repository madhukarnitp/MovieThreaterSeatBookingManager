const express = require('express');
const router = express.Router();
const MovieController = require('../controllers/movieController');

// Movie catalog listing & filters
router.get('/', MovieController.listMovies);

// Showtime selection for all movies or pre-filtered
router.get('/showtimes', MovieController.showShowtimeSelection);

// Single movie details
router.get('/:id', MovieController.showMovieDetails);

// Showtimes specific to a movie
router.get('/:id/showtimes', MovieController.showShowtimeSelection);

module.exports = router;
