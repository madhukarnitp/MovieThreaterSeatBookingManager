const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

/**
 * Display User Login Page
 */
async function getLogin(req, res) {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }
    return res.redirect('/');
  }

  res.render('auth/login', {
    title: 'Login - CineSeat Manager',
    activePage: 'login',
    returnTo: req.query.returnTo || ''
  });
}

/**
 * Process User Login (Customer and Admin)
 */
async function postLogin(req, res, next) {
  try {
    const { email, password, returnTo } = req.body;

    if (!email || !password) {
      req.flash('error', 'Please provide both email and password.');
      return res.redirect(`/login${returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : ''}`);
    }

    // Direct Parameterized SQL Query
    const [rows] = await pool.query(
      'SELECT user_id, full_name, email, password_hash, phone, role FROM users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      req.flash('error', 'Invalid email address or password.');
      return res.redirect(`/login${returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : ''}`);
    }

    const user = rows[0];
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);

    if (!passwordMatch) {
      req.flash('error', 'Invalid email address or password.');
      return res.redirect(`/login${returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : ''}`);
    }

    // Initialize session
    req.session.user = {
      id: user.user_id,
      user_id: user.user_id,
      fullName: user.full_name,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role
    };

    req.flash('success', `Welcome back, ${user.full_name}!`);

    if (user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }

    const redirectUrl = returnTo && returnTo.startsWith('/') ? returnTo : '/';
    return res.redirect(redirectUrl);
  } catch (error) {
    next(error);
  }
}

/**
 * Display Registration Page
 */
async function getRegister(req, res) {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }

  res.render('auth/register', {
    title: 'Register - CineSeat Manager',
    activePage: 'register'
  });
}

/**
 * Process Customer Registration
 */
async function postRegister(req, res, next) {
  try {
    const { full_name, email, phone, password, confirm_password } = req.body;

    // 1. Validate full name
    if (!full_name || full_name.trim().length < 2) {
      req.flash('error', 'Full name must be at least 2 characters long.');
      return res.redirect('/register');
    }

    // 2. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      req.flash('error', 'Please enter a valid email address.');
      return res.redirect('/register');
    }

    // 3. Validate phone format (if provided)
    if (phone && phone.trim().length > 0 && !/^[0-9+\-\s()]{7,20}$/.test(phone.trim())) {
      req.flash('error', 'Please enter a valid phone number (digits and optional plus/dash).');
      return res.redirect('/register');
    }

    // 4. Validate password length
    if (!password || password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters long.');
      return res.redirect('/register');
    }

    // 5. Confirm password match
    if (confirm_password && password !== confirm_password) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/register');
    }

    const cleanEmail = email.trim().toLowerCase();

    // 6. Prevent duplicate email registrations (parameterized query)
    const [existing] = await pool.query(
      'SELECT user_id FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    if (existing.length > 0) {
      req.flash('error', 'An account with this email address already exists. Please sign in.');
      return res.redirect('/login');
    }

    // 7. Hash password using bcrypt
    const passwordHash = bcrypt.hashSync(password, 10);

    // 8. Insert new customer record
    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
      [full_name.trim(), cleanEmail, passwordHash, phone && phone.trim().length > 0 ? phone.trim() : null, 'customer']
    );

    // 9. Auto-login newly registered user
    req.session.user = {
      id: result.insertId,
      user_id: result.insertId,
      fullName: full_name.trim(),
      full_name: full_name.trim(),
      email: cleanEmail,
      phone: phone && phone.trim().length > 0 ? phone.trim() : null,
      role: 'customer'
    };

    req.flash('success', `Registration successful! Welcome to CineSeat, ${full_name.trim()}.`);
    return res.redirect('/');
  } catch (error) {
    next(error);
  }
}

/**
 * Log Out User
 */
function logout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error during logout:', err);
    }
    res.redirect('/');
  });
}

module.exports = {
  getLogin,
  postLogin,
  getRegister,
  postRegister,
  logout
};
