const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for authentication routes (login and registration)
 * Protects against brute-force attacks
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per windowMs per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const errorMsg = 'Too many attempts from this IP address. Please try again after 15 minutes.';
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      return res.status(429).json({ success: false, message: errorMsg });
    }
    req.flash('error', errorMsg);
    return res.redirect('back');
  }
});

module.exports = {
  authLimiter
};
