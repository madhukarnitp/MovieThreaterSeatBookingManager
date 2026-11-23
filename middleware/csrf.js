const { csrfSync } = require('csrf-sync');

const {
  generateToken,
  csrfSynchronisedProtection
} = csrfSync({
  getTokenFromRequest: (req) => {
    return req.body?._csrf || req.body?.csrfToken || req.headers['x-csrf-token'] || req.headers['csrf-token'];
  }
});

/**
 * Middleware to generate CSRF token and inject into view locals
 */
function injectCsrfToken(req, res, next) {
  // Only generate token if session exists
  if (req.session) {
    try {
      res.locals.csrfToken = generateToken(req);
    } catch (_) {
      res.locals.csrfToken = '';
    }
  } else {
    res.locals.csrfToken = '';
  }
  next();
}

/**
 * Custom CSRF error handler wrapper
 */
function handleCsrfProtection(req, res, next) {
  // Skip CSRF validation for safe HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Logout operations intentionally destroy the session. If user submits logout
  // with an expired or invalidated CSRF token, allow safe logout and redirect
  // rather than trapping the user on an error screen.
  if (req.originalUrl.includes('/logout')) {
    return csrfSynchronisedProtection(req, res, (err) => {
      if (err) {
        // Fallback directly to the controller logout action to safely clear session
        return next();
      }
      next();
    });
  }

  csrfSynchronisedProtection(req, res, (err) => {
    if (err) {
      console.warn(`[CSRF Error] Invalid token on ${req.method} ${req.originalUrl}`);
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(403).json({
          success: false,
          message: 'Invalid or missing CSRF token. Please refresh the page and try again.'
        });
      }
      req.flash('error', 'Security check failed (Invalid or expired form token). Please try again.');
      
      // Use modern secure redirect target instead of deprecated res.redirect('back')
      const referrer = req.get('Referrer') || req.get('Referer') || '/';
      return res.redirect(referrer);
    }
    next();
  });
}

module.exports = {
  injectCsrfToken,
  handleCsrfProtection
};
