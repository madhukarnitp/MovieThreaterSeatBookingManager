const { pool } = require('../config/db');

async function migrate() {
  try {
    console.log('Applying migration...');
    await pool.query("ALTER TABLE bookings MODIFY COLUMN status ENUM('pending', 'confirmed', 'cancelled', 'refunded', 'expired') NOT NULL DEFAULT 'pending'");
    console.log('Updated bookings.status enum');
    
    // Check if hold_booking_id column exists
    const [cols] = await pool.query("SHOW COLUMNS FROM showtime_seats LIKE 'hold_booking_id'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE showtime_seats ADD COLUMN hold_booking_id BIGINT UNSIGNED NULL AFTER booking_id, ADD CONSTRAINT fk_ss_hold_booking FOREIGN KEY (hold_booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL");
      console.log('Added hold_booking_id to showtime_seats');
    } else {
      console.log('hold_booking_id already exists');
    }
    console.log('Migration complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
