const MovieService = require('../services/movieService');
const HealthService = require('../services/healthService');

/**
 * Controller for public homepage and health check
 */
class HomeController {
  /**
   * Render the Homepage with live MySQL movie sections
   */
  static async getHomePage(req, res, next) {
    try {
      // Fetch dynamic movie data from MySQL
      const [featuredMovie, nowShowing, upcoming, popular, filterOptions, dbHealth] = await Promise.all([
        MovieService.getFeaturedMovie(),
        MovieService.getNowShowing(8),
        MovieService.getUpcoming(6),
        MovieService.getPopular(4),
        MovieService.getFilterOptions(),
        HealthService.checkDatabaseHealth()
      ]);

      res.render('pages/home', {
        title: 'CineSeat - Movie Theater Seat Booking & Showtime Manager',
        activePage: 'home',
        featuredMovie,
        nowShowing,
        upcoming,
        popular,
        filterOptions,
        dbHealth,
        alert: null
      });
    } catch (error) {
      console.error('Error in HomeController.getHomePage:', error.message);
      next(error);
    }
  }

  /**
   * Health-check JSON endpoint
   */
  static async getHealth(req, res) {
    const dbHealth = await HealthService.checkDatabaseHealth();
    const isHealthy = dbHealth.databaseConnected;

    const payload = {
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'Movie Theater Seat Booking & Showtime Manager API',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: dbHealth
    };

    return res.status(isHealthy ? 200 : 503).json(payload);
  }
}

module.exports = HomeController;
