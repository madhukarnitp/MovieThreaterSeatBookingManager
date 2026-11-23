const app = require('../app');
const http = require('http');
const { pool } = require('../config/db');

// Helper to extract cookies from response
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

async function runAuthTests() {
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[Test Runner] Server listening on ${baseUrl}`);

  let passed = 0;
  let total = 0;

  async function assertTest(name, fn) {
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

  try {
    // Clean up test customer if exists
    await pool.query('DELETE FROM customers WHERE email = ?', ['automated_test@cinema.com']);

    // ---------------------------------------------------------------
    // 1. Attempt customer access without authentication
    // ---------------------------------------------------------------
    await assertTest('Attempt customer dashboard access without authentication', async () => {
      const res = await fetch(`${baseUrl}/customer/dashboard`, { redirect: 'manual' });
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, received ${res.status}`);
      }
      const location = res.headers.get('location');
      if (!location.includes('/auth/login')) {
        throw new Error(`Expected redirect to /auth/login, received ${location}`);
      }
    });

    // ---------------------------------------------------------------
    // 2. Fetch registration page and extract CSRF token + Session Cookie
    // ---------------------------------------------------------------
    let regCookie = '';
    let csrfToken = '';
    await assertTest('Fetch registration page and extract CSRF token', async () => {
      const res = await fetch(`${baseUrl}/auth/register`);
      if (res.status !== 200) throw new Error(`Received status ${res.status}`);
      regCookie = getCookieHeader(res);
      const html = await res.text();
      csrfToken = extractCsrfToken(html);
      if (!csrfToken) throw new Error('CSRF token not found in register page HTML');
    });

    // ---------------------------------------------------------------
    // 3. Register a new customer
    // ---------------------------------------------------------------
    await assertTest('Register a new customer with valid credentials', async () => {
      const body = new URLSearchParams({
        _csrf: csrfToken,
        full_name: 'Automated Test User',
        email: 'automated_test@cinema.com',
        phone: '+91 9988776655',
        password: 'TestPassword@123',
        confirm_password: 'TestPassword@123'
      });

      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': regCookie
        },
        body: body.toString(),
        redirect: 'manual'
      });

      if (res.status !== 302) {
        throw new Error(`Registration failed with status ${res.status}`);
      }

      // Verify record in database
      const [rows] = await pool.query('SELECT customer_id, full_name, email, status FROM customers WHERE email = ?', ['automated_test@cinema.com']);
      if (rows.length === 0) throw new Error('Customer not found in database');
      if (rows[0].status !== 'active') throw new Error(`Customer status is ${rows[0].status}, expected active`);
    });

    // ---------------------------------------------------------------
    // 4. Attempt duplicate registration
    // ---------------------------------------------------------------
    await assertTest('Attempt duplicate registration with same email', async () => {
      // Get fresh CSRF token
      const getRes = await fetch(`${baseUrl}/auth/register`);
      const cookie = getCookieHeader(getRes);
      const token = extractCsrfToken(await getRes.text());

      const body = new URLSearchParams({
        _csrf: token,
        full_name: 'Automated Test User',
        email: 'automated_test@cinema.com',
        phone: '+91 9988776655',
        password: 'TestPassword@123',
        confirm_password: 'TestPassword@123'
      });

      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookie
        },
        body: body.toString(),
        redirect: 'manual'
      });

      if (res.status !== 409) {
        throw new Error(`Expected 409 Conflict, received ${res.status}`);
      }
      const html = await res.text();
      if (!html.includes('already exists')) {
        throw new Error('Expected duplicate email error message in response');
      }
    });

    // ---------------------------------------------------------------
    // 5. Login with invalid credentials
    // ---------------------------------------------------------------
    await assertTest('Login with invalid credentials', async () => {
      const getRes = await fetch(`${baseUrl}/auth/login`);
      const cookie = getCookieHeader(getRes);
      const token = extractCsrfToken(await getRes.text());

      const body = new URLSearchParams({
        _csrf: token,
        email: 'automated_test@cinema.com',
        password: 'WrongPassword999!'
      });

      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookie
        },
        body: body.toString(),
        redirect: 'manual'
      });

      if (res.status !== 401) {
        throw new Error(`Expected 401 Unauthorized, received ${res.status}`);
      }
      const html = await res.text();
      if (!html.includes('Invalid email or password')) {
        throw new Error('Expected generic invalid credentials error message');
      }
    });

    // ---------------------------------------------------------------
    // 6. Login with blocked account
    // ---------------------------------------------------------------
    await assertTest('Reject login of blocked account', async () => {
      const getRes = await fetch(`${baseUrl}/auth/login`);
      const cookie = getCookieHeader(getRes);
      const token = extractCsrfToken(await getRes.text());

      const body = new URLSearchParams({
        _csrf: token,
        email: 'alex.turner@example.com', // Seeded with status = 'blocked'
        password: 'Password@123'
      });

      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookie
        },
        body: body.toString(),
        redirect: 'manual'
      });

      if (res.status !== 403) {
        throw new Error(`Expected 403 Forbidden, received ${res.status}`);
      }
      const html = await res.text();
      if (!html.includes('blocked') && !html.includes('suspended')) {
        throw new Error('Expected blocked account warning message');
      }
    });

    // ---------------------------------------------------------------
    // 7. Login with valid credentials and verify protected access
    // ---------------------------------------------------------------
    let customerSessionCookie = '';
    await assertTest('Login with valid credentials and access dashboard', async () => {
      const getRes = await fetch(`${baseUrl}/auth/login`);
      const initialCookie = getCookieHeader(getRes);
      const token = extractCsrfToken(await getRes.text());

      const body = new URLSearchParams({
        _csrf: token,
        email: 'automated_test@cinema.com',
        password: 'TestPassword@123'
      });

      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': initialCookie
        },
        body: body.toString(),
        redirect: 'manual'
      });

      if (loginRes.status !== 302) {
        throw new Error(`Expected 302 login redirect, received ${loginRes.status}`);
      }

      // Capture regenerated session cookie
      customerSessionCookie = getCookieHeader(loginRes) || initialCookie;

      // Access protected dashboard with session cookie
      const dashRes = await fetch(`${baseUrl}/customer/dashboard`, {
        headers: { 'Cookie': customerSessionCookie }
      });

      if (dashRes.status !== 200) {
        throw new Error(`Customer dashboard returned ${dashRes.status}, expected 200`);
      }

      const dashHtml = await dashRes.text();
      if (!dashHtml.includes('Automated Test User')) {
        throw new Error('Customer name not found on authenticated dashboard');
      }
    });

    // ---------------------------------------------------------------
    // 8. Attempt admin access using customer credentials
    // ---------------------------------------------------------------
    await assertTest('Reject admin dashboard access using customer session', async () => {
      const res = await fetch(`${baseUrl}/admin/dashboard`, {
        headers: { 'Cookie': customerSessionCookie },
        redirect: 'manual'
      });

      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect for unauthorized admin access, received ${res.status}`);
      }
      const location = res.headers.get('location');
      if (!location.includes('/auth/admin/login')) {
        throw new Error(`Expected redirect to /auth/admin/login, received ${location}`);
      }
    });

    // ---------------------------------------------------------------
    // 9. Admin login and verify admin dashboard
    // ---------------------------------------------------------------
    let adminSessionCookie = '';
    await assertTest('Admin login with seeded admin credentials and access dashboard', async () => {
      const getRes = await fetch(`${baseUrl}/auth/admin/login`);
      const initialCookie = getCookieHeader(getRes);
      const token = extractCsrfToken(await getRes.text());

      const body = new URLSearchParams({
        _csrf: token,
        email: 'admin@cinema.com',
        password: 'Admin@123'
      });

      const loginRes = await fetch(`${baseUrl}/auth/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': initialCookie
        },
        body: body.toString(),
        redirect: 'manual'
      });

      if (loginRes.status !== 302) {
        throw new Error(`Admin login failed with status ${loginRes.status}`);
      }

      adminSessionCookie = getCookieHeader(loginRes) || initialCookie;

      const adminDashRes = await fetch(`${baseUrl}/admin/dashboard`, {
        headers: { 'Cookie': adminSessionCookie }
      });

      if (adminDashRes.status !== 200) {
        throw new Error(`Admin dashboard returned ${adminDashRes.status}`);
      }

      const adminHtml = await adminDashRes.text();
      if (!adminHtml.includes('Cinema Operations Dashboard')) {
        throw new Error('Admin operations banner not found on admin dashboard');
      }
    });

    // ---------------------------------------------------------------
    // 10. Customer logout and session destruction verification
    // ---------------------------------------------------------------
    await assertTest('Logout and verify session destruction', async () => {
      // Get dashboard page to fetch fresh CSRF token
      const dashRes = await fetch(`${baseUrl}/customer/dashboard`, {
        headers: { 'Cookie': customerSessionCookie }
      });
      const token = extractCsrfToken(await dashRes.text());

      const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': customerSessionCookie
        },
        body: `_csrf=${encodeURIComponent(token)}`,
        redirect: 'manual'
      });

      if (logoutRes.status !== 302) {
        throw new Error(`Logout returned status ${logoutRes.status}`);
      }

      // Re-attempting dashboard access with the old session cookie should now fail (302 to login)
      const reCheckRes = await fetch(`${baseUrl}/customer/dashboard`, {
        headers: { 'Cookie': customerSessionCookie },
        redirect: 'manual'
      });

      if (reCheckRes.status !== 302) {
        throw new Error(`Expected 302 redirect after logout, received ${reCheckRes.status}`);
      }
    });

    // Clean up test customer
    await pool.query('DELETE FROM customers WHERE email = ?', ['automated_test@cinema.com']);

    console.log(`\n========================================`);
    console.log(`AUTHENTICATION TEST SUITE SUMMARY:`);
    console.log(`Total Tests : ${total}`);
    console.log(`Passed      : ${passed}`);
    console.log(`Failed      : ${total - passed}`);
    console.log(`========================================\n`);

    if (passed !== total) {
      process.exitCode = 1;
    }
  } catch (globalErr) {
    console.error('Fatal test execution error:', globalErr);
    process.exitCode = 1;
  } finally {
    server.close(() => process.exit(process.exitCode || 0));
  }
}

runAuthTests();
