/**
 * Centralized Error Handling Middlewares
 */

/**
 * 404 Not Found Handler
 */
function notFoundHandler(req, res, next) {
  res.status(404);

  // If request expects JSON (like API or health routes)
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.json({
      success: false,
      status: 404,
      message: `Resource not found: ${req.originalUrl}`
    });
  }

  // Render 404 EJS page
  return res.render('pages/404', {
    title: '404 - Page Not Found',
    activePage: '',
    path: req.originalUrl,
    alert: null
  });
}

/**
 * Global Error Handler
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.status || 500;
  console.error(`[Error] ${req.method} ${req.originalUrl} - ${err.message}`);
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode);

  // JSON response for API or AJAX requests
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.json({
      success: false,
      status: statusCode,
      message: err.message || 'Internal Server Error'
    });
  }

  // Render error page or fallback
  return res.render('pages/404', {
    title: `${statusCode} - Server Error`,
    activePage: '',
    path: req.originalUrl,
    alert: {
      type: 'danger',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred. Please try again later.' 
        : err.message
    }
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
