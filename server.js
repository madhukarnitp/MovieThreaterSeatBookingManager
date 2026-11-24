// Patch Node.js util.isArray deprecation warning (DEP0044) triggered by older dependencies like express-validator/lodash
const util = require('util');
if (typeof util.isArray === 'function') {
  Object.defineProperty(util, 'isArray', {
    value: Array.isArray,
    writable: true,
    enumerable: true,
    configurable: true
  });
}

require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/db');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 1. Reusable database connection verification on startup
    console.log('Testing MySQL database connection...');
    const dbInfo = await testConnection();
    console.log(`[Database] OK: Connected to "${dbInfo.database}" at ${dbInfo.host}`);

    // 2. Start HTTP server
    const server = app.listen(PORT, () => {
      console.log('========================================================');
      console.log(` Movie Theater Seat Booking & Showtime Manager`);
      console.log(` Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(` Server URL  : http://localhost:${PORT}`);
      console.log(` Health Check: http://localhost:${PORT}/health`);
      console.log('========================================================');
    });

    // Graceful shutdown handling
    const handleShutdown = (signal) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  } catch (error) {
    console.error('Failed to start server due to database connection error:');
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
