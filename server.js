require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/db');
const BookingService = require('./services/bookingService');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Reusable database connection verification on startup
    console.log('Testing MySQL database connection...');
    const dbInfo = await testConnection();
    console.log(`[Database] OK: Connected to ${dbInfo.database} at ${dbInfo.host}`);

    const server = app.listen(PORT, () => {
      console.log('========================================================');
      console.log(` Movie Theater Seat Booking & Showtime Manager`);
      console.log(` Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(` Server URL  : http://localhost:${PORT}`);
      console.log(` Health Check: http://localhost:${PORT}/health`);
      console.log('========================================================');
    });

    // Background cleanup job for expired seat holds every 60 seconds
    const cleanupInterval = setInterval(async () => {
      try {
        const released = await BookingService.releaseExpiredHolds();
        if (released > 0) {
          console.log(`[Hold Cleanup] Released ${released} expired pending booking(s).`);
        }
      } catch (err) {
        console.error('[Hold Cleanup Error]:', err.message);
      }
    }, 60000);

    // Graceful shutdown
    const handleShutdown = (signal) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      clearInterval(cleanupInterval);
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
