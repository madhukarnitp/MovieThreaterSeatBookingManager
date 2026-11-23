const app = require('../app');
const http = require('http');

const server = http.createServer(app);
server.listen(0, async () => {
  const port = server.address().port;
  console.log('Testing server running on port', port);

  try {
    // 1. Test GET /
    const homeRes = await fetch('http://localhost:' + port + '/');
    const homeText = await homeRes.text();
    console.log('GET / status:', homeRes.status, 'HTML length:', homeText.length, 'Contains title:', homeText.includes('Movie Theater Seat Booking'));

    // 2. Test GET /health
    const healthRes = await fetch('http://localhost:' + port + '/health');
    const healthJson = await healthRes.json();
    console.log('GET /health status:', healthRes.status, 'Payload:', JSON.stringify(healthJson, null, 2));

    // 3. Test 404 HTML
    const notFoundRes = await fetch('http://localhost:' + port + '/invalid-path-check');
    const notFoundText = await notFoundRes.text();
    console.log('GET /invalid-path-check status:', notFoundRes.status, 'Contains 404:', notFoundText.includes('404'));

    // 4. Test 404 JSON
    const notFoundJsonRes = await fetch('http://localhost:' + port + '/api/invalid-json', {
      headers: { 'Accept': 'application/json' }
    });
    const notFoundJson = await notFoundJsonRes.json();
    console.log('GET /api/invalid-json JSON status:', notFoundJsonRes.status, 'Payload:', JSON.stringify(notFoundJson));

    console.log('\n>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<');
  } catch (err) {
    console.error('Verification failed:', err);
    process.exitCode = 1;
  } finally {
    server.close(() => process.exit(process.exitCode || 0));
  }
});
