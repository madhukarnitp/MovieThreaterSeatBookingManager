const path = require('path');
const fs = require('fs');
const { pool } = require(path.join(__dirname, '../config/db'));

async function restore() {
  console.log('Restoring seed data...');
  const sql = fs.readFileSync(path.join(__dirname, '../database/seed.sql'), 'utf8');
  const statements = sql
    .replace(/\r\n/g, '\n')
    .split(/;\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err) {
      // Ignore duplicates on seeded primary keys
    }
  }

  // Release all holds back to available
  await pool.query("UPDATE showtime_seats SET status = 'available' WHERE status = 'held'");
  
  // Ensure we have available seats across all showtimes
  await pool.query("UPDATE showtime_seats SET status = 'available' WHERE seat_id BETWEEN 1 AND 30");

  console.log('Database restored successfully.');
  process.exit(0);
}

restore().catch(err => {
  console.error(err);
  process.exit(1);
});
