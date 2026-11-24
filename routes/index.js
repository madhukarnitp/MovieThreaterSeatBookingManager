const express = require('express');
const router = express.Router();

const movieController = require('../controllers/movieController');
const authRoutes = require('./authRoutes');
const movieRoutes = require('./movieRoutes');
const bookingRoutes = require('./bookingRoutes');
const paymentRoutes = require('./paymentRoutes');
const adminRoutes = require('./adminRoutes');

// Public Home Page
router.get('/', movieController.getHome);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Mount modular sub-routes
router.use('/', authRoutes);
router.use('/auth', authRoutes);
router.use('/', movieRoutes);
router.use('/', bookingRoutes);
router.use('/', paymentRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
