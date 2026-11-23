const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/bookingController');
const PaymentController = require('../controllers/paymentController');
const { requireCustomer } = require('../middleware/auth');

// Seat selection page (Publicly accessible to browse, but action requires login)
router.get('/showtimes/:id/seats', BookingController.renderSeatSelection);
router.get('/bookings/select-seats', BookingController.renderSeatSelection);

// AJAX live availability endpoint
router.get('/api/showtimes/:id/seat-availability', BookingController.getSeatAvailabilityApi);

// Customer-protected hold & payment routes
router.post('/bookings/hold', requireCustomer, BookingController.holdSeats);
router.get('/bookings/:id/payment', requireCustomer, BookingController.renderPayment);
router.post('/bookings/:id/cancel', requireCustomer, BookingController.cancelHold);

// Simulated Payment execution
router.post('/bookings/:id/pay', requireCustomer, PaymentController.processPayment);

// Ticket Views
router.get('/bookings/:id/tickets', requireCustomer, PaymentController.viewBookingTickets);
router.get('/tickets/:identifier', requireCustomer, PaymentController.viewSingleTicket);

module.exports = router;
