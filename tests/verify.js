/**
 * Automated Verification Script for Movie Theater DBMS Project
 * Tests:
 * 1. MySQL Database connection & schema integrity (9 relational tables)
 * 2. Foreign key and relational constraints validity
 * 3. HTTP Server and public/protected routes
 */
require('dotenv').config();
const http = require('http');
const { pool, testConnection } = require('../config/db');
const app = require('../app');

async function runTests() {
  console.log('='.repeat(65));
  console.log(' RUNNING VERIFICATION SUITE: MOVIE THEATER DBMS PROJECT');
  console.log('='.repeat(65));

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Database Connection
  await test('MySQL connection is live and healthy', async () => {
    const res = await testConnection();
    if (!res.success) throw new Error('Database connection check returned unsuccessful');
  });

  // 2. Check 9 Relational Tables
  await test('All 9 core normalized relational tables exist', async () => {
    const [tables] = await pool.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0].toLowerCase());
    const expected = ['users', 'theaters', 'screens', 'seats', 'movies', 'showtimes', 'bookings', 'booking_seats', 'payments'];
    for (const tbl of expected) {
      if (!tableNames.includes(tbl)) {
        throw new Error(`Required relational table "${tbl}" missing from database`);
      }
    }
  });

  // 3. Relational Foreign Key Integrity Checks
  await test('Referential integrity: Showtimes reference valid Movies and Screens', async () => {
    const [orphans] = await pool.query(`
      SELECT s.showtime_id 
      FROM showtimes s
      LEFT JOIN movies m ON s.movie_id = m.movie_id
      LEFT JOIN screens sc ON s.screen_id = sc.screen_id
      WHERE m.movie_id IS NULL OR sc.screen_id IS NULL
    `);
    if (orphans.length > 0) throw new Error(`Found ${orphans.length} orphaned showtime records`);
  });

  await test('Referential integrity: Booking seats reference valid Bookings and Seats', async () => {
    const [orphans] = await pool.query(`
      SELECT bs.booking_seat_id 
      FROM booking_seats bs
      LEFT JOIN bookings b ON bs.booking_id = b.booking_id
      LEFT JOIN seats st ON bs.seat_id = st.seat_id
      WHERE b.booking_id IS NULL OR st.seat_id IS NULL
    `);
    if (orphans.length > 0) throw new Error(`Found ${orphans.length} orphaned booking_seats records`);
  });

  await test('Referential integrity: Payments reference valid Bookings', async () => {
    const [orphans] = await pool.query(`
      SELECT p.payment_id 
      FROM payments p
      LEFT JOIN bookings b ON p.booking_id = b.booking_id
      WHERE b.booking_id IS NULL
    `);
    if (orphans.length > 0) throw new Error(`Found ${orphans.length} orphaned payment records`);
  });

  // 4. HTTP Server Routes Verification
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function get(path) {
    const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    return res;
  }

  try {
    await test('GET /health returns HTTP 200 and UP status', async () => {
      const res = await get('/health');
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const json = await res.json();
      if (json.status !== 'UP') throw new Error(`Expected status UP, got ${json.status}`);
    });

    await test('GET / renders homepage with 200 status', async () => {
      const res = await get('/');
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const text = await res.text();
      if (!text.includes('CineSeat')) throw new Error('Missing CineSeat in homepage HTML');
    });

    await test('GET /movies renders movie catalog with 200 status', async () => {
      const res = await get('/movies');
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await test('GET /movies/showtimes renders showtimes with 200 status', async () => {
      const res = await get('/movies/showtimes');
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await test('GET /theaters renders theater complexes with 200 status', async () => {
      const res = await get('/theaters');
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await test('GET /login and GET /register render forms with 200 status', async () => {
      const r1 = await get('/login');
      const r2 = await get('/register');
      if (r1.status !== 200 || r2.status !== 200) throw new Error('Auth forms failed to render');
    });

    await test('Protected route /admin/dashboard redirects unauthenticated users to /login', async () => {
      const res = await get('/admin/dashboard');
      if (res.status !== 302) throw new Error(`Expected 302 redirect, got ${res.status}`);
      const location = res.headers.get('location');
      if (!location || !location.includes('/login')) throw new Error(`Expected redirect to /login, got ${location}`);
    });

    await test('Protected route /customer/bookings redirects unauthenticated users to /login', async () => {
      const res = await get('/customer/bookings');
      if (res.status !== 302) throw new Error(`Expected 302 redirect, got ${res.status}`);
      const location = res.headers.get('location');
      if (!location || !location.includes('/login')) throw new Error(`Expected redirect to /login, got ${location}`);
    });
  } finally {
    server.close();
  }

  console.log('='.repeat(65));
  console.log(` SUMMARY: ${passed} Passed | ${failed} Failed`);
  console.log('='.repeat(65));

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
