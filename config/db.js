const mysql = require('mysql2/promise');
require('dotenv').config();

// Create MySQL connection pool using environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'movie_theater_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

/**
 * Reusable database connectivity check
 * @returns {Promise<{success: boolean, message: string, timestamp: string}>}
 */
async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT 1 + 1 AS result, NOW() as currentTime');
    return {
      success: true,
      message: 'MySQL connection established successfully.',
      timestamp: rows[0].currentTime,
      database: process.env.DB_NAME || 'movie_theater_db',
      host: process.env.DB_HOST || '127.0.0.1'
    };
  } catch (error) {
    console.error('Database connection error:', error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  pool,
  testConnection
};
