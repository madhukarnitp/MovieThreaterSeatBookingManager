const express = require('express');
const router = express.Router();
const CustomerController = require('../controllers/customerController');
const { requireCustomer } = require('../middleware/auth');
const { handleCsrfProtection } = require('../middleware/csrf');

// All routes strictly require authenticated customer identity
router.use(requireCustomer);

// Dashboard overview
router.get('/dashboard', CustomerController.showDashboard);

// Customer Profile & Security
router.get('/profile', CustomerController.showProfile);
router.post('/profile', handleCsrfProtection, CustomerController.updateProfile);
router.post('/change-password', handleCsrfProtection, CustomerController.changePassword);

// Categorized Bookings (all, upcoming, past, cancelled)
router.get('/bookings', CustomerController.showBookings);
router.post('/bookings/:id/cancel', handleCsrfProtection, CustomerController.cancelBooking);

// Customer Tickets (all issued digital passes with QR)
router.get('/tickets', CustomerController.showTickets);

module.exports = router;
