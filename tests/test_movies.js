const app = require('../app');
const http = require('http');

async function runMovieTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[Movie Test Runner] Testing on ${baseUrl}`);

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

  try {
    // 1. Homepage Verification
    await test('Homepage renders with hero banner, now showing, upcoming, and popular sections', async () => {
      const res = await fetch(`${baseUrl}/`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const html = await res.text();
      if (!html.includes('Now Showing')) throw new Error('Missing "Now Showing" section');
      if (!html.includes('Upcoming Releases')) throw new Error('Missing "Upcoming Releases" section');
      if (!html.includes('Most Popular Movies')) throw new Error('Missing "Most Popular Movies" section');
      if (!html.includes('Inception')) throw new Error('Featured movie not rendered');
    });

    // 2. Movie Listing Verification
    await test('Movie listing renders all active movies from MySQL', async () => {
      const res = await fetch(`${baseUrl}/movies`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const html = await res.text();
      if (!html.includes('Browse Movies')) throw new Error('Missing title header');
      if (!html.includes('Inception') || !html.includes('Interstellar')) {
        throw new Error('Expected movie titles not rendered in listing');
      }
    });

    // 3. Search Movies by Title
    await test('Search movies by title query parameter', async () => {
      const res = await fetch(`${baseUrl}/movies?search=Inception`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const html = await res.text();
      if (!html.includes('Inception')) throw new Error('Matching movie "Inception" not returned');
      if (html.includes('Interstellar')) throw new Error('Unmatched movie "Interstellar" should not be returned');
    });

    // 4. Filter by Genre
    await test('Filter movies by genre slug', async () => {
      const res = await fetch(`${baseUrl}/movies?genre=sci-fi`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const html = await res.text();
      if (!html.includes('Inception') && !html.includes('Interstellar')) {
        throw new Error('Sci-Fi movies not returned');
      }
    });

    // 5. Filter by Status (Upcoming)
    await test('Filter movies by status = upcoming', async () => {
      const res = await fetch(`${baseUrl}/movies?status=upcoming`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const html = await res.text();
      if (!html.includes('Avatar: Fire and Ash') && !html.includes('Spider-Man: Beyond the Spider-Verse')) {
        throw new Error('Upcoming movies not returned');
      }
    });

    // 6. Empty Search State
    await test('Empty state rendered for non-matching search', async () => {
      const res = await fetch(`${baseUrl}/movies?search=NonExistentMovieQueryXYZ`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const html = await res.text();
      if (!html.includes('No Movies Found')) {
        throw new Error('Expected empty state message "No Movies Found"');
      }
    });

    // 7. Movie Details for Valid ID
    await test('Movie details page renders full metadata, poster, and available showtimes', async () => {
      const res = await fetch(`${baseUrl}/movies/1`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const html = await res.text();
      if (!html.includes('Inception')) throw new Error('Movie title not found');
      if (!html.includes('UA')) throw new Error('Certification badge not found');
      if (!html.includes('Available Showtimes &amp; Theaters') && !html.includes('Available Showtimes & Theaters')) {
        throw new Error('Showtimes section missing');
      }
      if (!html.includes('CineGrand Premiere')) throw new Error('Showing theater name not found');
    });

    // 8. Movie Details for Non-Existent ID (404)
    await test('Graceful 404 handled for non-existent movie ID', async () => {
      const res = await fetch(`${baseUrl}/movies/999999`);
      if (res.status !== 404) throw new Error(`Expected 404, received ${res.status}`);
      const html = await res.text();
      if (!html.includes('404') && !html.includes('Not Found')) {
        throw new Error('Expected 404 error page');
      }
    });

    // 9. Showtime Selection Page
    await test('Showtime selection page renders theaters, screens, dates, and ticket prices', async () => {
      const res = await fetch(`${baseUrl}/movies/1/showtimes`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const html = await res.text();
      if (!html.includes('Inception')) throw new Error('Movie title not in header');
      if (!html.includes('CineGrand Premiere')) throw new Error('Theater name not found');
      if (!html.includes('Screen 1 (IMAX)')) throw new Error('Screen name not found');
      if (!html.includes('seats left')) throw new Error('Available seats count not found');
    });

    console.log(`\n========================================`);
    console.log(`MOVIE BROWSING TEST SUITE SUMMARY:`);
    console.log(`Total Tests : ${total}`);
    console.log(`Passed      : ${passed}`);
    console.log(`Failed      : ${total - passed}`);
    console.log(`========================================\n`);

    if (passed !== total) process.exitCode = 1;
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exitCode = 1;
  } finally {
    server.close(() => process.exit(process.exitCode || 0));
  }
}

runMovieTests();
