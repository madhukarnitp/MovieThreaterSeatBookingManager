const express = require('express');
const router = express.Router();

const homeRoutes = require('./homeRoutes');
const movieRoutes = require('./movieRoutes');
const authRoutes = require('./authRoutes');
const customerRoutes = require('./customerRoutes');
const adminRoutes = require('./adminRoutes');
const bookingRoutes = require('./bookingRoutes');

// Public Home & Health routes
router.use('/', homeRoutes);

// Booking & Seat selection routes
router.use('/', bookingRoutes);

// Public Movie catalog & details routes (/movies, /movies/:id, /movies/:id/showtimes)
router.use('/movies', movieRoutes);

// Showtime schedule route alias
router.get('/showtimes', (req, res) => res.redirect('/movies/showtimes'));

// Authentication routes (/auth/login, /auth/register, /auth/admin/login, etc.)
router.use('/auth', authRoutes);

// Protected Customer routes (/customer/dashboard, etc.)
router.use('/customer', customerRoutes);

// Protected Administrator routes (/admin/dashboard, etc.)
router.use('/admin', adminRoutes);

module.exports = router;
