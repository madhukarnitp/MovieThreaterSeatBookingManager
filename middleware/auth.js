/**
 * Authentication and Authorization Middlewares
 */

/**
 * Protect customer routes: requires authenticated customer session
 */
function requireCustomer(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'customer') {
    return next();
  }

  // Save attempted URL to return to after login
  if (req.originalUrl && req.method === 'GET') {
    req.session.returnTo = req.originalUrl;
  }

  req.flash('error', 'Please log in to your account to access that page.');
  return res.redirect('/auth/login');
}

/**
 * Protect admin routes: requires authenticated administrator session
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  req.flash('error', 'Access denied. Administrator privileges required.');
  return res.redirect('/auth/admin/login');
}

/**
 * Redirect customer away from auth pages if already logged in
 */
function redirectIfCustomer(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/customer/dashboard');
  }
  next();
}

/**
 * Redirect admin away from admin login if already logged in
 */
function redirectIfAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  next();
}

module.exports = {
  requireCustomer,
  requireAdmin,
  redirectIfCustomer,
  redirectIfAdmin
};
