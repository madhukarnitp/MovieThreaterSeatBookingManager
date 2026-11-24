/**
 * Centralized Error Handling Middlewares
 */

function notFoundHandler(req, res, next) {
  res.status(404);
  if (req.accepts('html')) {
    return res.render('pages/404', {
      title: '404 - Page Not Found',
      activePage: '404',
      message: 'The page or resource you requested could not be found.'
    });
  }
  return res.json({ success: false, error: 'Resource not found' });
}

function errorHandler(err, req, res, next) {
  console.error('[Error Handler]:', err.stack || err.message);

  const statusCode = err.status || 500;
  res.status(statusCode);

  if (req.accepts('html')) {
    req.flash('error', err.message || 'An unexpected server error occurred.');
    return res.render('pages/404', {
      title: 'Server Error',
      activePage: 'error',
      message: err.message || 'An unexpected database or server error occurred.'
    });
  }

  return res.json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
