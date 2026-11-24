/**
 * Authentication and Role Authorization Middleware
 */

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash('error', 'Please log in to continue.');
  const returnTo = req.originalUrl || '/';
  return res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error', 'Access denied. Administrator privileges required.');
  return res.redirect('/login');
}

function isCustomer(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'customer') {
    return next();
  }
  if (!req.session || !req.session.user) {
    req.flash('error', 'Please log in to proceed.');
    return res.redirect('/login');
  }
  return next();
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isCustomer,
  // Aliases for compatibility
  requireAuth: isAuthenticated,
  requireAdmin: isAdmin,
  requireCustomer: isCustomer
};
