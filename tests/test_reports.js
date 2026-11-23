/**
 * Automated Verification of Dashboard Statistics, Reporting Aggregates, and Admin Controls
 */

const assert = require('assert');
const { pool } = require('../config/db');
const AdminService = require('../services/adminService');
const BookingService = require('../services/bookingService');

async function runDashboardReportTests() {
  console.log('========================================================');
  console.log(' Starting Automated Tests: Admin Dashboard & Reports');
  console.log('========================================================');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // Test 1: Verify Dashboard Metrics match direct database counts
  await test('AdminService.getDashboardMetrics accurately calculates catalog counts and financials', async () => {
    const metrics = await AdminService.getDashboardMetrics();

    const [expMovies] = await pool.query('SELECT COUNT(*) as count FROM movies');
    const [expTheaters] = await pool.query('SELECT COUNT(*) as count FROM theaters');
    const [expScreens] = await pool.query('SELECT COUNT(*) as count FROM screens');
    const [expCustomers] = await pool.query('SELECT COUNT(*) as count FROM customers');
    const [expConfirmed] = await pool.query("SELECT COUNT(*) as count FROM bookings WHERE status = 'confirmed'");
    const [expRevenue] = await pool.query("SELECT COALESCE(SUM(amount), 0.00) as sum FROM payments WHERE status = 'success'");

    assert.strictEqual(metrics.totalMovies, expMovies[0].count);
    assert.strictEqual(metrics.totalTheaters, expTheaters[0].count);
    assert.strictEqual(metrics.totalScreens, expScreens[0].count);
    assert.strictEqual(metrics.totalCustomers, expCustomers[0].count);
    assert.strictEqual(metrics.confirmedBookings, expConfirmed[0].count);
    assert.strictEqual(metrics.totalSuccessfulRevenue, Number(expRevenue[0].sum));
    assert(Array.isArray(metrics.recentBookings));
    assert(Array.isArray(metrics.recentPayments));
  });

  // Test 2: Verify Daily Booking & Revenue Trend Report
  await test('AdminService.getDailyBookingReport returns daily aggregated booking counts and revenue', async () => {
    const dailyData = await AdminService.getDailyBookingReport(14);
    assert(Array.isArray(dailyData), 'Should return an array');
    dailyData.forEach(row => {
      assert(row.report_date, 'Date must be present');
      assert(typeof row.total_bookings === 'number', 'Bookings count must be numeric');
      assert(Number(row.daily_revenue) >= 0, 'Revenue must be non-negative');
    });
  });

  // Test 3: Verify Monthly Revenue Report
  await test('AdminService.getMonthlyRevenueReport returns monthly aggregated payments', async () => {
    const monthlyData = await AdminService.getMonthlyRevenueReport();
    assert(Array.isArray(monthlyData), 'Should return an array');
    monthlyData.forEach(row => {
      assert(row.month_key, 'Month key must be present e.g. YYYY-MM');
      assert(typeof row.successful_transactions === 'number');
      assert(Number(row.monthly_revenue) >= 0);
    });
  });

  // Test 4: Verify Movie-wise Revenue Report
  await test('AdminService.getMovieWiseRevenueReport returns revenue aggregated per movie', async () => {
    const movieData = await AdminService.getMovieWiseRevenueReport();
    assert(Array.isArray(movieData), 'Should return an array');
    movieData.forEach(row => {
      assert(row.movie_title, 'Movie title required');
      assert(Number(row.total_revenue) >= 0, 'Revenue must be valid number');
    });
  });

  // Test 5: Verify Theater-wise Performance Report
  await test('AdminService.getTheaterWiseRevenueReport returns revenue aggregated per theater', async () => {
    const theaterData = await AdminService.getTheaterWiseRevenueReport();
    assert(Array.isArray(theaterData), 'Should return an array');
    theaterData.forEach(row => {
      assert(row.theater_name, 'Theater name required');
      assert(Number(row.total_revenue) >= 0, 'Revenue must be valid number');
    });
  });

  // Test 6: Verify Customer Search and Account Toggle
  await test('AdminService.getAllCustomers supports search filter and status toggle', async () => {
    const all = await AdminService.getAllCustomers();
    assert(all.length > 0, 'Customers should exist');

    // Search by name
    const filtered = await AdminService.getAllCustomers('John');
    assert(filtered.length >= 1, 'Search should find customer John');
    assert(filtered[0].full_name.includes('John'));

    // Toggle status to blocked and back
    const targetCustId = filtered[0].customer_id;
    await AdminService.toggleCustomerStatus(targetCustId, 'blocked');
    const [cBlocked] = await pool.query('SELECT status FROM customers WHERE customer_id = ?', [targetCustId]);
    assert.strictEqual(cBlocked[0].status, 'blocked');

    // Attempt booking with blocked customer (MUST BE REJECTED)
    let blockedThrew = false;
    try {
      await BookingService.holdSeats({
        customerId: targetCustId,
        showtimeId: 6,
        seatIds: [125]
      });
    } catch (e) {
      blockedThrew = true;
      assert(e.message.includes('suspended or blocked'));
    }
    assert(blockedThrew, 'Blocked customer should not be able to hold seats');

    // Restore customer to active
    await AdminService.toggleCustomerStatus(targetCustId, 'active');
    const [cActive] = await pool.query('SELECT status FROM customers WHERE customer_id = ?', [targetCustId]);
    assert.strictEqual(cActive[0].status, 'active');
  });

  // Test 7: Verify Tickets & Refunds Audit queries
  await test('AdminService queries all tickets and refunds for administration auditing', async () => {
    const tickets = await AdminService.getAllTickets(20);
    assert(Array.isArray(tickets), 'Tickets list must be array');

    const refunds = await AdminService.getAllRefunds(20);
    assert(Array.isArray(refunds), 'Refunds list must be array');
  });

  console.log('========================================================');
  console.log(` Dashboard & Reports Test Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runDashboardReportTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
