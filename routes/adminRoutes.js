const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');
const { handleCsrfProtection } = require('../middleware/csrf');

// All admin routes strictly require authenticated administrator session
router.use(requireAdmin);

// Dashboard
router.get('/', (req, res) => res.redirect('/admin/dashboard'));
router.get('/dashboard', AdminController.showDashboard);

// A. Movie Management
router.get('/movies', AdminController.listMovies);
router.post('/movies', handleCsrfProtection, AdminController.createMovie);
router.post('/movies/:id/edit', handleCsrfProtection, AdminController.updateMovie);
router.post('/movies/:id/delete', handleCsrfProtection, AdminController.deleteMovie);

// Genres Management
router.get('/genres', AdminController.listGenres);
router.post('/genres', handleCsrfProtection, AdminController.createGenre);
router.post('/genres/:id/edit', handleCsrfProtection, AdminController.updateGenre);
router.post('/genres/:id/delete', handleCsrfProtection, AdminController.deleteGenre);

// B. Theater Management
router.get('/theaters', AdminController.listTheaters);
router.post('/theaters', handleCsrfProtection, AdminController.createTheater);
router.post('/theaters/:id/edit', handleCsrfProtection, AdminController.updateTheater);
router.post('/theaters/:id/delete', handleCsrfProtection, AdminController.deleteTheater);

// C. Screen Management
router.get('/screens', AdminController.listScreens);
router.post('/screens', handleCsrfProtection, AdminController.createScreen);
router.post('/screens/:id/edit', handleCsrfProtection, AdminController.updateScreen);
router.post('/screens/:id/delete', handleCsrfProtection, AdminController.deleteScreen);

// D. Seat Management
router.get('/seats', AdminController.listSeats);
router.post('/seats', handleCsrfProtection, AdminController.createSingleSeat);
router.post('/seats/batch', handleCsrfProtection, AdminController.batchCreateSeats);
router.post('/seats/:id/toggle', handleCsrfProtection, AdminController.toggleSeat);
router.post('/seats/:id/delete', handleCsrfProtection, AdminController.deleteSeat);

// E. Showtime Management
router.get('/showtimes', AdminController.listShowtimes);
router.post('/showtimes', handleCsrfProtection, AdminController.createShowtime);
router.post('/showtimes/:id/cancel', handleCsrfProtection, AdminController.cancelShowtime);

// F. Bookings, Customers, Payments, Tickets & Refunds Viewers
router.get('/bookings', AdminController.listBookings);
router.get('/customers', AdminController.listCustomers);
router.get('/customers/:id', AdminController.viewCustomerDetails);
router.post('/customers/:id/status', handleCsrfProtection, AdminController.toggleCustomerStatus);
router.get('/payments', AdminController.listPayments);
router.get('/tickets', AdminController.listTickets);
router.get('/refunds', AdminController.listRefunds);

// G. Analytics & Reports
router.get('/reports', AdminController.showReports);

// H. Ticket Verification & Check-In
const PaymentController = require('../controllers/paymentController');
router.get('/tickets/verify', PaymentController.renderTicketVerification);
router.post('/tickets/verify', handleCsrfProtection, PaymentController.processTicketVerification);

module.exports = router;
