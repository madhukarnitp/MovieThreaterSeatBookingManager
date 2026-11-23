const express = require('express');
const router = express.Router();
const HomeController = require('../controllers/homeController');

// Home page
router.get('/', HomeController.getHomePage);

// Health check endpoint
router.get('/health', HomeController.getHealth);

module.exports = router;
