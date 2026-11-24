/**
 * Client-side script for Movie Theater Seat Booking & Showtime Manager
 */
document.addEventListener('DOMContentLoaded', () => {
  // Auto-dismiss alerts after 5 seconds if desired
  const alerts = document.querySelectorAll('.alert-dismissible');
  alerts.forEach(alert => {
    setTimeout(() => {
      try {
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
        if (bsAlert) {
          bsAlert.close();
        }
      } catch (_) {}
    }, 5000);
  });

  // Enable Bootstrap tooltips if any are present
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

  // Live debounced keyup search on the Movies Catalog page
  const movieFilterForm = document.getElementById('movieFilterForm');
  const searchInput = document.getElementById('searchInput');
  if (movieFilterForm && searchInput) {
    let searchDebounceTimer = null;
    let lastRequestedQuery = searchInput.value;

    searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') return; // Allow normal form submit on Enter

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(async () => {
        const currentValue = searchInput.value;
        if (currentValue === lastRequestedQuery) return;
        lastRequestedQuery = currentValue;

        const params = new URLSearchParams(new FormData(movieFilterForm));
        const targetUrl = `${movieFilterForm.action}?${params.toString()}`;

        try {
          const response = await fetch(targetUrl, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
          });
          if (!response.ok) return;

          const html = await response.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');

          const newResults = doc.getElementById('moviesResultsContainer');
          const currentResults = document.getElementById('moviesResultsContainer');
          if (newResults && currentResults) {
            currentResults.innerHTML = newResults.innerHTML;
          }

          const newBadge = doc.getElementById('movieCountBadge');
          const currentBadge = document.getElementById('movieCountBadge');
          if (newBadge && currentBadge) {
            currentBadge.innerHTML = newBadge.innerHTML;
          }

          window.history.replaceState({}, '', targetUrl);
        } catch (err) {
          console.error('Live movie search failed:', err);
        }
      }, 250);
    });
  }

  console.log('CineSeat Manager initialized successfully.');
});
