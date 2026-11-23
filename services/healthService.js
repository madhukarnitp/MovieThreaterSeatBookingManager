const { pool, testConnection } = require('../config/db');

/**
 * Database health service
 */
class HealthService {
  /**
   * Get database system health status
   */
  static async checkDatabaseHealth() {
    try {
      const connResult = await testConnection();
      
      // Fetch basic counts from database to verify schema access
      let movieCount = 0;
      let showtimeCount = 0;
      let screenCount = 0;

      try {
        const [movies] = await pool.query('SELECT COUNT(*) AS count FROM movies');
        movieCount = movies[0]?.count || 0;
      } catch (_) {
        // Table might not exist yet during fresh setup
      }

      try {
        const [showtimes] = await pool.query('SELECT COUNT(*) AS count FROM showtimes');
        showtimeCount = showtimes[0]?.count || 0;
      } catch (_) {
        // Table might not exist yet during fresh setup
      }

      try {
        const [screens] = await pool.query('SELECT COUNT(*) AS count FROM screens');
        screenCount = screens[0]?.count || 0;
      } catch (_) {
        // Table might not exist yet during fresh setup
      }

      return {
        databaseConnected: true,
        database: connResult.database,
        host: connResult.host,
        timestamp: connResult.timestamp,
        metrics: {
          movies: movieCount,
          showtimes: showtimeCount,
          screens: screenCount
        }
      };
    } catch (error) {
      return {
        databaseConnected: false,
        error: error.message,
        database: process.env.DB_NAME || 'movie_theater_db',
        host: process.env.DB_HOST || '127.0.0.1',
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = HealthService;
