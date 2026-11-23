const { pool } = require('../config/db');

async function updateDates() {
  await pool.query(`
    UPDATE showtimes 
    SET start_time = TIMESTAMP(CURRENT_DATE, TIME(start_time)),
        end_time = TIMESTAMP(CURRENT_DATE, TIME(end_time))
    WHERE showtime_id IN (1, 2, 3, 4, 5)
  `);

  await pool.query(`
    UPDATE showtimes 
    SET start_time = TIMESTAMP(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), TIME(start_time)),
        end_time = TIMESTAMP(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), TIME(end_time))
    WHERE showtime_id IN (6, 7, 8, 9)
  `);

  await pool.query(`
    UPDATE showtimes 
    SET start_time = TIMESTAMP(DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), TIME(start_time)),
        end_time = TIMESTAMP(DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), TIME(end_time))
    WHERE showtime_id IN (10, 11, 12)
  `);

  console.log('Successfully refreshed showtime dates relative to CURRENT_DATE.');
  process.exit(0);
}

updateDates().catch(err => {
  console.error('Error updating dates:', err);
  process.exit(1);
});
