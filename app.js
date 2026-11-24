// Patch Node.js util.isArray deprecation warning (DEP0044) triggered by older dependencies like express-validator/lodash
const util = require('util');
if (typeof util.isArray === 'function') {
  Object.defineProperty(util, 'isArray', {
    value: Array.isArray,
    writable: true,
    enumerable: true,
    configurable: true
  });
}

const express = require('express');
const path = require('path');
const flash = require('connect-flash');

const sessionMiddleware = require('./config/session');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

// Safe View Formatters
function formatDateHelper(d) {
  if (!d) return 'N/A';
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return 'N/A';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, '0') + ', ' + d.getFullYear();
  }
  const str = String(d).split('T')[0];
  const parts = str.split('-');
  if (parts.length === 3) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mIdx = parseInt(parts[1], 10) - 1;
    return (months[mIdx] || parts[1]) + ' ' + parts[2] + ', ' + parts[0];
  }
  return str;
}

function formatTimeHelper(t) {
  if (!t) return 'N/A';
  if (t instanceof Date) {
    if (isNaN(t.getTime())) return 'N/A';
    return t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  const str = String(t).trim();
  const parts = str.split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const mins = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return hours + ':' + mins + ' ' + ampm;
  }
  return str;
}

function formatDateTimeHelper(d, t) {
  if (!d && !t) return 'N/A';
  const dateStr = formatDateHelper(d);
  const timeStr = formatTimeHelper(t);
  if (dateStr === 'N/A') return timeStr;
  if (timeStr === 'N/A') return dateStr;
  return `${dateStr} at ${timeStr}`;
}

function formatCurrencyHelper(val) {
  const num = Number(val);
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

const app = express();

// Configure View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure Public Static Assets
app.use(express.static(path.join(__dirname, 'public')));

// Configure Body Parsers (JSON & URL-Encoded Form Data)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Management
app.use(sessionMiddleware);

// Flash Notification Messages
app.use(flash());

// Global template locals (available across all EJS views)
app.use((req, res, next) => {
  const user = req.session?.user || null;

  res.locals.appName = 'CineSeat';
  res.locals.currentYear = new Date().getFullYear();
  res.locals.currentPath = req.path;

  // Session user/admin context
  res.locals.currentUser = user;
  res.locals.currentCustomer = (user && user.role === 'customer') ? user : null;
  res.locals.currentAdmin = (user && user.role === 'admin') ? user : null;
  res.locals.isAuthenticated = Boolean(user);
  res.locals.csrfToken = 'demo-csrf-token';

  // Flash notifications
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.info_msg = req.flash('info');
  res.locals.warning_msg = req.flash('warning');

  // Global formatting utilities
  res.locals.formatDate = formatDateHelper;
  res.locals.formatTime = formatTimeHelper;
  res.locals.formatDateTime = formatDateTimeHelper;
  res.locals.formatCurrency = formatCurrencyHelper;

  next();
});

// Mount Centralized Application Routes
app.use('/', routes);

// 404 and Centralized Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
