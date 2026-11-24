const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { isAuthenticated } = require('../middlewares/auth');

// Simulated Payment Page
router.get('/bookings/:bookingId/payment', isAuthenticated, paymentController.getPaymentPage);
router.get('/booking/payment/:bookingId', isAuthenticated, paymentController.getPaymentPage);

// Simulated Payment Submission (Direct Single-Click Execution)
router.post('/bookings/:bookingId/pay', isAuthenticated, paymentController.processPayment);
router.post('/booking/:bookingId/pay', isAuthenticated, paymentController.processPayment);
router.post('/payments/process', isAuthenticated, paymentController.processPayment);
router.post('/booking/payment/process', isAuthenticated, paymentController.processPayment);

module.exports = router;
