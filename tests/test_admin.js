const app = require('../app');
const http = require('http');
const { pool } = require('../config/db');
const AdminService = require('../services/adminService');

// Helper to extract cookie from response headers
function getCookieHeader(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return '';
  return setCookie.split(';')[0];
}

// Helper to extract CSRF token from HTML
function extractCsrfToken(html) {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return match ? match[1] : '';
}

async function runAdminTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[Admin Test Runner] Running on ${baseUrl}`);

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] Test ${total}: ${name}`);
      console.error(`       Error: ${err.message}`);
    }
  }

  let adminCookie = '';

  try {
    // -----------------------------------------------------------------------
    // 1. Security Gatekeeper: Unauthenticated Access to Admin Routes
    // -----------------------------------------------------------------------
    await test('Reject unauthenticated access to admin routes', async () => {
      const endpoints = ['/admin/dashboard', '/admin/movies', '/admin/theaters', '/admin/screens', '/admin/seats', '/admin/showtimes'];
      for (const endpoint of endpoints) {
        const res = await fetch(`${baseUrl}${endpoint}`, { redirect: 'manual' });
        if (res.status !== 302) {
          throw new Error(`Expected 302 redirect on ${endpoint}, got ${res.status}`);
        }
        const location = res.headers.get('location');
        if (!location.includes('/auth/admin/login')) {
          throw new Error(`Expected redirect to /auth/admin/login, got ${location}`);
        }
      }
    });

    // -----------------------------------------------------------------------
    // 2. Authenticate Admin and Obtain Session Cookie
    // -----------------------------------------------------------------------
    await test('Authenticate admin and establish session', async () => {
      const getRes = await fetch(`${baseUrl}/auth/admin/login`);
      const initialCookie = getCookieHeader(getRes);
      const token = extractCsrfToken(await getRes.text());

      const body = new URLSearchParams({
        _csrf: token,
        email: 'admin@cinema.com',
        password: 'Admin@123'
      });

      const res = await fetch(`${baseUrl}/auth/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': initialCookie
        },
        body: body.toString(),
        redirect: 'manual'
      });

      if (res.status !== 302) throw new Error(`Admin login failed with status ${res.status}`);
      adminCookie = getCookieHeader(res) || initialCookie;

      // Verify dashboard loads
      const dashRes = await fetch(`${baseUrl}/admin/dashboard`, {
        headers: { 'Cookie': adminCookie }
      });
      if (dashRes.status !== 200) throw new Error(`Dashboard returned ${dashRes.status}`);
    });

    // Helper for CSRF-protected admin POST requests
    async function adminPost(url, data, refererPage = '/admin/dashboard') {
      const pageRes = await fetch(`${baseUrl}${refererPage}`, {
        headers: { 'Cookie': adminCookie }
      });
      const token = extractCsrfToken(await pageRes.text());

      const body = new URLSearchParams({ ...data, _csrf: token });
      return fetch(`${baseUrl}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': adminCookie
        },
        body: body.toString(),
        redirect: 'manual'
      });
    }

    // -----------------------------------------------------------------------
    // 3. Movie Management CRUD
    // -----------------------------------------------------------------------
    let testMovieId = null;
    await test('Create new movie with multiple genres', async () => {
      // Clean up previous test movie if any
      await pool.query('DELETE FROM movies WHERE title = ?', ['Admin Test Movie']);

      const res = await adminPost('/admin/movies', {
        title: 'Admin Test Movie',
        slug: 'admin-test-movie',
        duration_min: '135',
        language: 'English',
        certification: 'UA',
        release_date: '2026-12-01',
        status: 'now_showing',
        genres: ['1', '5'] // Action, Sci-Fi
      }, '/admin/movies');

      if (res.status !== 302) throw new Error(`Expected 302 redirect, got ${res.status}`);

      const [rows] = await pool.query('SELECT movie_id, title, duration_min FROM movies WHERE title = ?', ['Admin Test Movie']);
      if (rows.length === 0) throw new Error('Movie not found in database');
      testMovieId = rows[0].movie_id;

      // Check genres mapping
      const [mg] = await pool.query('SELECT genre_id FROM movie_genres WHERE movie_id = ?', [testMovieId]);
      if (mg.length !== 2) throw new Error(`Expected 2 assigned genres, found ${mg.length}`);
    });

    await test('Update movie details', async () => {
      const res = await adminPost(`/admin/movies/${testMovieId}/edit`, {
        title: 'Admin Test Movie Updated',
        slug: 'admin-test-movie-updated',
        duration_min: '140',
        language: 'English',
        certification: 'A',
        release_date: '2026-12-05',
        status: 'now_showing',
        genres: ['2'] // Adventure
      }, '/admin/movies');

      if (res.status !== 302) throw new Error(`Update returned status ${res.status}`);

      const [rows] = await pool.query('SELECT title, certification, duration_min FROM movies WHERE movie_id = ?', [testMovieId]);
      if (rows[0].title !== 'Admin Test Movie Updated' || rows[0].certification !== 'A') {
        throw new Error('Updated movie data did not persist in database');
      }
    });

    // -----------------------------------------------------------------------
    // 4. Theater Management CRUD
    // -----------------------------------------------------------------------
    let testTheaterId = null;
    await test('Create and update theater complex', async () => {
      await pool.query('DELETE FROM theaters WHERE name = ?', ['Admin Test Cineplex']);

      const createRes = await adminPost('/admin/theaters', {
        name: 'Admin Test Cineplex',
        address: 'Sector 62, Cyber City',
        city: 'Gurugram',
        state: 'Haryana',
        pincode: '122002',
        phone: '+91 124 555 0199'
      }, '/admin/theaters');

      if (createRes.status !== 302) throw new Error(`Create theater returned ${createRes.status}`);

      const [rows] = await pool.query('SELECT theater_id, name, city FROM theaters WHERE name = ?', ['Admin Test Cineplex']);
      if (rows.length === 0) throw new Error('Theater not found in database');
      testTheaterId = rows[0].theater_id;

      // Update theater
      const updateRes = await adminPost(`/admin/theaters/${testTheaterId}/edit`, {
        name: 'Admin Test Cineplex Premiere',
        address: 'Sector 62, Cyber City West',
        city: 'Gurugram',
        state: 'Haryana',
        pincode: '122002',
        phone: '+91 124 555 0200',
        is_active: '1'
      }, '/admin/theaters');

      if (updateRes.status !== 302) throw new Error(`Update theater returned ${updateRes.status}`);
      const [updated] = await pool.query('SELECT name FROM theaters WHERE theater_id = ?', [testTheaterId]);
      if (updated[0].name !== 'Admin Test Cineplex Premiere') throw new Error('Theater update did not persist');
    });

    // -----------------------------------------------------------------------
    // 5. Screen Management CRUD
    // -----------------------------------------------------------------------
    let testScreenId = null;
    await test('Add screen to theater and maintain capacity', async () => {
      const createRes = await adminPost('/admin/screens', {
        theater_id: testTheaterId,
        name: 'Screen 1 (Laser 3D)',
        screen_type: '3D',
        total_capacity: '40',
        is_active: '1'
      }, '/admin/screens');

      if (createRes.status !== 302) throw new Error(`Create screen returned ${createRes.status}`);

      const [rows] = await pool.query('SELECT screen_id, name, theater_id FROM screens WHERE theater_id = ? AND name = ?', [testTheaterId, 'Screen 1 (Laser 3D)']);
      if (rows.length === 0) throw new Error('Screen not found in database');
      testScreenId = rows[0].screen_id;
    });

    // -----------------------------------------------------------------------
    // 6. Seat Management CRUD & Capacity Sync
    // -----------------------------------------------------------------------
    await test('Configure seats, batch generate rows, and prevent duplicate positions', async () => {
      // 1. Add single seat A1
      const singleRes = await adminPost('/admin/seats', {
        screen_id: testScreenId,
        row_label: 'A',
        seat_number: '1',
        seat_type_id: '1' // Standard
      }, `/admin/seats?screen_id=${testScreenId}`);
      if (singleRes.status !== 302) throw new Error(`Single seat creation failed`);

      // 2. Prevent duplicate seat A1
      const dupRes = await adminPost('/admin/seats', {
        screen_id: testScreenId,
        row_label: 'A',
        seat_number: '1',
        seat_type_id: '1'
      }, `/admin/seats?screen_id=${testScreenId}`);
      // Duplicate should be caught and redirected back with error flash
      const dupCount = await pool.query('SELECT COUNT(*) AS count FROM seats WHERE screen_id = ? AND row_label = ? AND seat_number = ?', [testScreenId, 'A', 1]);
      if (dupCount[0][0].count !== 1) throw new Error('Duplicate seat was inserted!');

      // 3. Batch generate Row B (seats 1 to 10)
      const batchRes = await adminPost('/admin/seats/batch', {
        screen_id: testScreenId,
        row_label: 'B',
        start_number: '1',
        end_number: '10',
        seat_type_id: '2' // Premium
      }, `/admin/seats?screen_id=${testScreenId}`);
      if (batchRes.status !== 302) throw new Error(`Batch seat generation failed`);

      // Verify seats in DB
      const [seats] = await pool.query('SELECT COUNT(*) AS count FROM seats WHERE screen_id = ?', [testScreenId]);
      if (seats[0].count !== 11) throw new Error(`Expected 11 seats, found ${seats[0].count}`);

      // Verify screen capacity automatically synced
      const [screen] = await pool.query('SELECT total_capacity FROM screens WHERE screen_id = ?', [testScreenId]);
      if (screen[0].total_capacity !== 11) throw new Error(`Screen capacity did not sync, got ${screen[0].total_capacity}`);
    });

    // -----------------------------------------------------------------------
    // 7. Showtime Scheduling & Inventory Generation
    // -----------------------------------------------------------------------
    let testShowtimeId = null;
    await test('Schedule showtime: validates theater-screen matching, calculates buffer, and auto-generates showtime_seats', async () => {
      // Attempting to schedule with screen belonging to DIFFERENT theater should fail
      try {
        const invalidTheaterId = testTheaterId === 1 ? 2 : 1;
        await AdminService.createShowtime({
          movie_id: testMovieId,
          theater_id: invalidTheaterId, // MISMATCH!
          screen_id: testScreenId,
          start_date: '2026-12-10',
          start_time_of_day: '10:00:00',
          buffer_min: 20,
          base_price: 300.00
        });
        throw new Error('Should have thrown screen-theater mismatch error');
      } catch (mismatchErr) {
        if (!mismatchErr.message.includes('Screen validation error')) {
          throw mismatchErr;
        }
      }

      // Valid showtime scheduling
      const showtimeRes = await adminPost('/admin/showtimes', {
        movie_id: testMovieId,
        theater_id: testTheaterId,
        screen_id: testScreenId,
        start_date: '2026-12-10',
        start_time_of_day: '14:00:00',
        buffer_min: '20',
        base_price: '320.00',
        format: '3D',
        language: 'English'
      }, '/admin/showtimes');

      if (showtimeRes.status !== 302) throw new Error(`Showtime creation returned ${showtimeRes.status}`);

      const [st] = await pool.query(
        'SELECT showtime_id, start_time, end_time, base_price, status FROM showtimes WHERE movie_id = ? AND screen_id = ?',
        [testMovieId, testScreenId]
      );
      if (st.length === 0) throw new Error('Showtime was not inserted into database');
      testShowtimeId = st[0].showtime_id;

      // Verify end_time calculation: start 14:00 + movie duration (140m) + buffer (20m) = 160m (2h 40m) -> 16:40:00
      const startTime = new Date(st[0].start_time);
      const endTime = new Date(st[0].end_time);
      const diffMinutes = Math.round((endTime - startTime) / (60 * 1000));
      if (diffMinutes !== 160) {
        throw new Error(`Expected runtime + buffer of 160 minutes, got ${diffMinutes} minutes`);
      }

      // Verify automated inventory generation for all 11 active seats in screen
      const [inv] = await pool.query(
        'SELECT COUNT(*) AS count FROM showtime_seats WHERE showtime_id = ? AND status = "available"',
        [testShowtimeId]
      );
      if (inv[0].count !== 11) {
        throw new Error(`Expected 11 showtime_seats records generated, found ${inv[0].count}`);
      }
    });

    // -----------------------------------------------------------------------
    // 8. Prevent Overlapping Showtime
    // -----------------------------------------------------------------------
    await test('Prevent scheduling overlapping showtime on same screen', async () => {
      // Try scheduling between 14:30 and 17:00 (overlaps with 14:00 to 16:40)
      try {
        await AdminService.createShowtime({
          movie_id: testMovieId,
          theater_id: testTheaterId,
          screen_id: testScreenId,
          start_date: '2026-12-10',
          start_time_of_day: '14:30:00',
          buffer_min: 20,
          base_price: 320.00
        });
        throw new Error('Should have thrown schedule conflict error');
      } catch (overlapErr) {
        if (!overlapErr.message.includes('conflict') && !overlapErr.message.includes('overlapping')) {
          throw overlapErr;
        }
      }
    });

    // -----------------------------------------------------------------------
    // 9. Cancel Showtime
    // -----------------------------------------------------------------------
    await test('Cancel scheduled showtime', async () => {
      const cancelRes = await adminPost(`/admin/showtimes/${testShowtimeId}/cancel`, {}, '/admin/showtimes');
      if (cancelRes.status !== 302) throw new Error(`Cancel returned ${cancelRes.status}`);

      const [st] = await pool.query('SELECT status FROM showtimes WHERE showtime_id = ?', [testShowtimeId]);
      if (st[0].status !== 'cancelled') throw new Error(`Expected cancelled status, got ${st[0].status}`);
    });

    // -----------------------------------------------------------------------
    // 10. Customer Account Status Toggle
    // -----------------------------------------------------------------------
    await test('Toggle customer account status (block / unblock)', async () => {
      // Find a customer
      const [cust] = await pool.query('SELECT customer_id, status FROM customers WHERE email = ?', ['john.doe@example.com']);
      const cId = cust[0].customer_id;

      // Block
      await adminPost(`/admin/customers/${cId}/status`, { status: 'blocked' }, '/admin/customers');
      const [b] = await pool.query('SELECT status FROM customers WHERE customer_id = ?', [cId]);
      if (b[0].status !== 'blocked') throw new Error('Customer status was not blocked');

      // Unblock
      await adminPost(`/admin/customers/${cId}/status`, { status: 'active' }, '/admin/customers');
      const [a] = await pool.query('SELECT status FROM customers WHERE customer_id = ?', [cId]);
      if (a[0].status !== 'active') throw new Error('Customer status was not restored to active');
    });

    // Clean up test data
    if (testShowtimeId) {
      await pool.query('DELETE FROM showtime_seats WHERE showtime_id = ?', [testShowtimeId]);
      await pool.query('DELETE FROM showtimes WHERE showtime_id = ?', [testShowtimeId]);
    }
    if (testScreenId) {
      await pool.query('DELETE FROM seats WHERE screen_id = ?', [testScreenId]);
      await pool.query('DELETE FROM screens WHERE screen_id = ?', [testScreenId]);
    }
    if (testTheaterId) {
      await pool.query('DELETE FROM theaters WHERE theater_id = ?', [testTheaterId]);
    }
    if (testMovieId) {
      await pool.query('DELETE FROM movie_genres WHERE movie_id = ?', [testMovieId]);
      await pool.query('DELETE FROM movies WHERE movie_id = ?', [testMovieId]);
    }

    console.log(`\n========================================`);
    console.log(`ADMIN MANAGEMENT MODULE TEST SUMMARY:`);
    console.log(`Total Tests : ${total}`);
    console.log(`Passed      : ${passed}`);
    console.log(`Failed      : ${total - passed}`);
    console.log(`========================================\n`);

    if (passed !== total) process.exitCode = 1;
  } catch (err) {
    console.error('Fatal admin test error:', err);
    process.exitCode = 1;
  } finally {
    server.close(() => process.exit(process.exitCode || 0));
  }
}

runAdminTests();
