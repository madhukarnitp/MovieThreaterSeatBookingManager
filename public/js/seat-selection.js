/**
 * Interactive Movie Theater Seat Selection Client Script
 * Handles real-time selection, pricing recalculation, polling availability, and hold submission.
 */

(function() {
  'use strict';

  const MAX_SEATS = 10;
  const selectedSeats = new Map(); // seatId -> { seatCode, price, category }

  // DOM Elements
  const container = document.querySelector('.seat-matrix');
  const countEl = document.getElementById('selected-count');
  const seatsContainer = document.getElementById('selected-seats-container');
  const noSeatsText = document.getElementById('no-seats-text');
  const subtotalEl = document.getElementById('subtotal-amount');
  const totalEl = document.getElementById('total-amount');
  const hiddenSeatIdsInput = document.getElementById('hidden-seat-ids');
  const proceedBtn = document.getElementById('btn-proceed');

  // Extract showtimeId from page URL or hidden input
  const urlParts = window.location.pathname.split('/');
  let showtimeId = null;
  const seatsIndex = urlParts.indexOf('seats');
  if (seatsIndex > 0) {
    showtimeId = urlParts[seatsIndex - 1];
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    showtimeId = urlParams.get('showtime_id');
  }

  // Update summary UI (selected badges, counts, total price)
  function updateSummary() {
    const count = selectedSeats.size;
    if (countEl) countEl.textContent = count;

    let subtotal = 0;
    selectedSeats.forEach(seat => {
      subtotal += parseFloat(seat.price);
    });

    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `₹${subtotal.toFixed(2)}`;

    // Update hidden input for form submission
    const ids = Array.from(selectedSeats.keys());
    if (hiddenSeatIdsInput) hiddenSeatIdsInput.value = JSON.stringify(ids);

    // Render seat tags
    if (seatsContainer) {
      seatsContainer.innerHTML = '';
      if (count === 0) {
        if (noSeatsText) seatsContainer.appendChild(noSeatsText);
      } else {
        selectedSeats.forEach((seat, id) => {
          const pill = document.createElement('span');
          pill.className = 'badge bg-primary text-white d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill small';
          pill.innerHTML = `<span>${seat.seatCode}</span><i class="bi bi-x-circle cursor-pointer ms-1 remove-seat-btn" data-id="${id}"></i>`;
          
          pill.querySelector('.remove-seat-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSeatSelection(id);
          });
          
          seatsContainer.appendChild(pill);
        });
      }
    }

    // Toggle proceed button state
    if (proceedBtn) {
      proceedBtn.disabled = (count === 0);
    }
  }

  // Toggle seat selection
  function toggleSeatSelection(seatId) {
    const seatBtn = document.querySelector(`.cinema-seat[data-seat-id="${seatId}"]`);
    if (!seatBtn) return;

    if (selectedSeats.has(seatId)) {
      // Deselect
      selectedSeats.delete(seatId);
      seatBtn.classList.remove('selected');
    } else {
      // Select
      if (selectedSeats.size >= MAX_SEATS) {
        alert(`You can select a maximum of ${MAX_SEATS} seats per booking.`);
        return;
      }
      const seatCode = seatBtn.dataset.seatCode;
      const price = seatBtn.dataset.price;
      const category = seatBtn.dataset.category;

      selectedSeats.set(seatId, { seatCode, price, category });
      seatBtn.classList.add('selected');
    }

    updateSummary();
  }

  // Bind click handlers to seats
  if (container) {
    container.addEventListener('click', function(e) {
      const seatBtn = e.target.closest('.cinema-seat');
      if (!seatBtn) return;

      const seatId = Number(seatBtn.dataset.seatId);
      const status = seatBtn.dataset.status;

      // Disallow clicking booked or blocked seats
      if (status === 'booked' || status === 'blocked') {
        return;
      }

      // If held by someone else, prevent selection
      if (status === 'held' && !seatBtn.classList.contains('is-my-hold')) {
        alert('This seat is temporarily held by another customer.');
        return;
      }

      toggleSeatSelection(seatId);
    });
  }

  // Live Availability Poller (every 5 seconds)
  async function pollAvailability() {
    if (!showtimeId) return;

    try {
      const response = await fetch(`/api/showtimes/${showtimeId}/seat-availability`);
      if (!response.ok) return;

      const data = await response.json();
      if (!data.success || !Array.isArray(data.seats)) return;

      let conflictDetected = false;

      data.seats.forEach(seat => {
        const btn = document.querySelector(`.cinema-seat[data-seat-id="${seat.seatId}"]`);
        if (!btn) return;

        // If seat is currently selected locally but became held or booked by someone else
        if (selectedSeats.has(seat.seatId) && (seat.status === 'booked' || (seat.status === 'held' && !seat.isMyHold))) {
          selectedSeats.delete(seat.seatId);
          btn.classList.remove('selected');
          conflictDetected = true;
        }

        // Update button visual status
        btn.dataset.status = seat.status;
        btn.className = `cinema-seat seat-${seat.status} ${seat.isMyHold ? 'is-my-hold' : ''} ${selectedSeats.has(seat.seatId) ? 'selected' : ''}`;

        if (seat.status === 'available' || seat.isMyHold) {
          btn.removeAttribute('disabled');
        } else {
          btn.setAttribute('disabled', 'disabled');
        }
      });

      if (conflictDetected) {
        alert('One or more of your selected seats were just taken by another customer and have been removed from your selection.');
        updateSummary();
      }
    } catch (err) {
      console.warn('Seat availability polling paused:', err.message);
    }
  }

  // Start polling interval
  if (showtimeId) {
    setInterval(pollAvailability, 5000);
  }

  // Initialize
  updateSummary();
})();
