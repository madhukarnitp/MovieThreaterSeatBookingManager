const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { pool } = require('./db');

// MySQL session store options
const sessionStore = new MySQLStore({
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000, // Clear expired every 15 minutes
  expiration: (Number(process.env.SESSION_LIFETIME_MINUTES) || 120) * 60 * 1000, // 2 hours default
  createDatabaseTable: true,
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
}, pool);

// Express session configuration
const sessionMiddleware = session({
  key: 'cineseat_sid',
  secret: process.env.SESSION_SECRET || 'c1n3_s34t_m4n4g3r_s3cur3_s3ss10n_s3cr3t_2026_k3y',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: (Number(process.env.SESSION_LIFETIME_MINUTES) || 120) * 60 * 1000
  }
});

module.exports = sessionMiddleware;
