const { pool } = require('../config/db');

async function syncAndClean() {
  console.log('Syncing database state...');
  // Mark all seats recorded in booking_seats as 'booked'
  await pool.query(`
    UPDATE showtime_seats ss
    JOIN booking_seats bs ON ss.showtime_id = bs.showtime_id AND ss.seat_id = bs.seat_id
    SET ss.status = 'booked'
  `);

  // Release any orphaned holds
  await pool.query(`
    UPDATE showtime_seats
    SET status = 'available', held_by = NULL, held_until = NULL, hold_booking_id = NULL
    WHERE status = 'held'
  `);

  console.log('Sync complete.');
  process.exit(0);
}

syncAndClean().catch(err => {
  console.error(err);
  process.exit(1);
});
