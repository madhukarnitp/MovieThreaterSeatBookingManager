const express = require('express');
const router = express.Router();
const movieController = require('../controllers/movieController');

router.get('/movies', movieController.getMovies);
router.get('/movies/showtimes', movieController.getShowtimes);
router.get('/movies/:id/showtimes', movieController.getMovieDetails);
router.get('/movies/:id', movieController.getMovieDetails);
router.get('/theaters', movieController.getTheaters);

module.exports = router;
