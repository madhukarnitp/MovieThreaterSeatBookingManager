const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middlewares/auth');

// All admin routes require admin role
router.use(isAdmin);

// Dashboard
router.get('/', adminController.getDashboard);
router.get('/dashboard', adminController.getDashboard);

// Movie Management
router.get('/movies', adminController.getMovies);
router.post('/movies', adminController.postAddMovie);
router.post('/movies/add', adminController.postAddMovie);
router.post('/movies/:id/edit', adminController.postEditMovie);
router.post('/movies/edit/:id', adminController.postEditMovie);
router.post('/movies/:id/delete', adminController.postDeleteMovie);
router.post('/movies/delete/:id', adminController.postDeleteMovie);

// Theater Management
router.get('/theaters', adminController.getTheaters);
router.post('/theaters', adminController.postAddTheater);
router.post('/theaters/add', adminController.postAddTheater);
router.post('/theaters/:id/edit', adminController.postEditTheater);
router.post('/theaters/edit/:id', adminController.postEditTheater);
router.post('/theaters/:id/delete', adminController.postDeleteTheater);
router.post('/theaters/delete/:id', adminController.postDeleteTheater);

// Screen Management
router.get('/screens', adminController.getScreens);
router.post('/screens', adminController.postAddScreen);
router.post('/screens/add', adminController.postAddScreen);
router.post('/screens/:id/edit', adminController.postEditScreen);
router.post('/screens/edit/:id', adminController.postEditScreen);
router.post('/screens/:id/delete', adminController.postDeleteScreen);
router.post('/screens/delete/:id', adminController.postDeleteScreen);

// Seat Matrix Management
router.get('/seats', adminController.getSeats);
router.post('/seats', adminController.postAddSeat);
router.post('/seats/add', adminController.postAddSeat);
router.post('/seats/batch', adminController.postBatchSeats);
router.post('/seats/:id/delete', adminController.postDeleteSeat);
router.post('/seats/delete/:id', adminController.postDeleteSeat);

// Showtime Scheduling & Management
router.get('/showtimes', adminController.getShowtimes);
router.post('/showtimes', adminController.postAddShowtime);
router.post('/showtimes/add', adminController.postAddShowtime);
router.post('/showtimes/:id/edit', adminController.postEditShowtime);
router.post('/showtimes/edit/:id', adminController.postEditShowtime);
router.post('/showtimes/:id/cancel', adminController.postCancelShowtime);
router.post('/showtimes/cancel/:id', adminController.postCancelShowtime);

// Bookings & Audit
router.get('/bookings', adminController.getBookings);

// Financial Payments Audit
router.get('/payments', adminController.getPayments);

module.exports = router;
