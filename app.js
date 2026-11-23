// Patch deprecated util.isArray used by legacy libraries like connect-flash in Node 22+
const util = require('util');
if (typeof util.isArray === 'function') {
  util.isArray = Array.isArray;
}

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const flash = require('connect-flash');

const sessionMiddleware = require('./config/session');
const { injectCsrfToken } = require('./middleware/csrf');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"]
      }
    }
  })
);

// Configure View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure Public Static Assets
app.use(express.static(path.join(__dirname, 'public')));

// Configure Body Parsers (JSON & URL-Encoded)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Management with MySQL Store
app.use(sessionMiddleware);

// Flash Messages
app.use(flash());

// Inject CSRF Token into locals
app.use(injectCsrfToken);

// Global template locals (available in all views)
app.use((req, res, next) => {
  // Sync customer & user session objects if present
  if (req.session?.user && !req.session.customer) {
    req.session.customer = {
      customer_id: req.session.user.id,
      id: req.session.user.id,
      full_name: req.session.user.fullName,
      email: req.session.user.email,
      phone: req.session.user.phone
    };
  }
  if (req.session?.customer && !req.session.user) {
    req.session.user = {
      id: req.session.customer.customer_id || req.session.customer.id,
      fullName: req.session.customer.full_name || req.session.customer.fullName,
      email: req.session.customer.email,
      phone: req.session.customer.phone,
      role: 'customer'
    };
  }

  res.locals.appName = 'CineSeat Manager';
  res.locals.currentYear = new Date().getFullYear();
  res.locals.currentPath = req.path;

  // Session user/admin context
  res.locals.currentUser = req.session?.user || null;
  res.locals.currentCustomer = req.session?.customer || null;
  res.locals.currentAdmin = req.session?.admin || null;
  res.locals.isAuthenticated = Boolean(req.session?.user || req.session?.admin || req.session?.customer);

  // Flash notifications
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.info_msg = req.flash('info');
  res.locals.warning_msg = req.flash('warning');

  next();
});

// Application Routes
app.use('/', routes);

// 404 and Centralized Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
