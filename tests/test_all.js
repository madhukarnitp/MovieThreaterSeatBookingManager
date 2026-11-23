/**
 * Master Test Suite Runner for Movie Theater Seat Booking & Showtime Manager
 * Executes all test modules sequentially and provides a unified status report.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const testSuites = [
    { name: 'Server & Database Verification', script: 'verify.js' },
    { name: 'Authentication Suite (Customer & Admin)', script: 'test_auth.js' },
    { name: 'Public Movies Browsing Suite', script: 'test_movies.js' },
    { name: 'Admin Management Suite', script: 'test_admin.js' },
    { name: 'Seat Selection & Hold Suite', script: 'test_booking.js' },
    { name: 'Payment & Ticket Management Suite', script: 'test_payments.js' },
    { name: 'Admin Dashboard & Reports Suite', script: 'test_reports.js' },
    { name: 'Customer Dashboard Suite', script: 'test_customer.js' },
    { name: 'Concurrency & Race Condition Suite', script: 'test_concurrency_audit.js' }
];

console.log('='.repeat(70));
console.log(' RUNNING FULL VERIFICATION SUITE: MOVIE THEATER BOOKING SYSTEM');
console.log('='.repeat(70));

let passedSuites = 0;
let failedSuites = 0;
const results = [];

for (const suite of testSuites) {
    console.log(`\n>>> Executing: ${suite.name} (${suite.script})`);
    const startTime = Date.now();
    const result = spawnSync('node', [path.join(__dirname, suite.script)], {
        stdio: 'inherit',
        env: process.env
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.status === 0) {
        passedSuites++;
        results.push({ ...suite, status: 'PASSED', duration });
    } else {
        failedSuites++;
        results.push({ ...suite, status: 'FAILED', duration, code: result.status });
    }
}

console.log('\n' + '='.repeat(70));
console.log(' VERIFICATION SUMMARY');
console.log('='.repeat(70));
results.forEach((r, idx) => {
    const symbol = r.status === 'PASSED' ? '✓' : '✗';
    console.log(` ${symbol} [${idx + 1}/${results.length}] ${r.name.padEnd(46)}: ${r.status} (${r.duration}s)`);
});
console.log('-'.repeat(70));
console.log(`Total Suites: ${testSuites.length} | Passed: ${passedSuites} | Failed: ${failedSuites}`);
console.log('='.repeat(70));

if (failedSuites > 0) {
    console.error(`\n❌ Full test run FAILED with ${failedSuites} failing suite(s).`);
    process.exit(1);
} else {
    console.log(`\n🎉 All ${passedSuites} test suites PASSED successfully.`);
    process.exit(0);
}
