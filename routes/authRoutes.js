const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const {
  registrationValidationRules,
  loginValidationRules,
  handleValidationErrors
} = require('../middleware/validators');
const { redirectIfCustomer, redirectIfAdmin } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { handleCsrfProtection } = require('../middleware/csrf');

// Customer Registration
router.get('/register', redirectIfCustomer, AuthController.showRegister);
router.post(
  '/register',
  authLimiter,
  handleCsrfProtection,
  redirectIfCustomer,
  registrationValidationRules,
  handleValidationErrors('auth/register', 'Create Your Account - CineSeat', 'register'),
  AuthController.register
);

// Customer Login
router.get('/login', redirectIfCustomer, AuthController.showLogin);
router.post(
  '/login',
  authLimiter,
  handleCsrfProtection,
  redirectIfCustomer,
  loginValidationRules,
  handleValidationErrors('auth/login', 'Customer Login - CineSeat', 'login'),
  AuthController.login
);

// Customer Logout
router.post('/logout', handleCsrfProtection, AuthController.logout);
router.get('/logout', AuthController.logout);

// Admin Login (Separate portal, never exposes admin registration)
router.get('/admin/login', redirectIfAdmin, AuthController.showAdminLogin);
router.post(
  '/admin/login',
  authLimiter,
  handleCsrfProtection,
  redirectIfAdmin,
  loginValidationRules,
  handleValidationErrors('auth/admin-login', 'Administrator Portal - CineSeat', 'admin-login'),
  AuthController.adminLogin
);

// Admin Logout
router.post('/admin/logout', handleCsrfProtection, AuthController.adminLogout);
router.get('/admin/logout', AuthController.adminLogout);

module.exports = router;
