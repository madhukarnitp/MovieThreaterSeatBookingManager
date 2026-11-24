const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { isAuthenticated } = require('../middlewares/auth');

// Seat Selection Views
router.get('/showtimes/:showtimeId/seats', bookingController.getSeatSelection);
router.get('/booking/select-seats/:showtimeId', bookingController.getSeatSelection);

// Live Availability JSON API
router.get('/api/showtimes/:showtimeId/seat-availability', bookingController.getSeatAvailabilityApi);

// Reserve / Hold Seats (ACID Transaction)
router.post('/bookings/hold', isAuthenticated, bookingController.createBooking);
router.post('/booking/create', isAuthenticated, bookingController.createBooking);

// Confirmation & Ticket Print Pages
router.get('/bookings/:bookingId/confirmation', bookingController.getConfirmation);
router.get('/booking/confirmation/:bookingId', bookingController.getConfirmation);
router.get('/bookings/:bookingId/tickets', bookingController.getConfirmation);
router.get('/booking/tickets/:bookingId', bookingController.getConfirmation);

// Customer Bookings
router.get('/customer/dashboard', isAuthenticated, bookingController.getUserBookings);
router.get('/customer/bookings', isAuthenticated, bookingController.getUserBookings);
router.get('/my-bookings', isAuthenticated, bookingController.getUserBookings);

// Cancel Booking
router.post('/bookings/:bookingId/cancel', isAuthenticated, bookingController.cancelBooking);
router.post('/booking/cancel/:bookingId', isAuthenticated, bookingController.cancelBooking);

module.exports = router;
