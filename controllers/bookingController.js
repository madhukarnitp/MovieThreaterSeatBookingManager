const BookingService = require('../services/bookingService');

class BookingController {
  /**
   * Render the interactive seat selection page.
   * GET /showtimes/:id/seats or /bookings/select-seats?showtime_id=:id
   */
  static async renderSeatSelection(req, res, next) {
    try {
      const showtimeId = req.params.id || req.query.showtime_id;
      if (!showtimeId || isNaN(Number(showtimeId))) {
        req.flash('error', 'Invalid showtime specified.');
        return res.redirect('/movies');
      }

      const customerId = req.session && req.session.customer ? req.session.customer.customer_id : null;
      const data = await BookingService.getShowtimeSeatMatrix(Number(showtimeId), customerId);

      if (!data) {
        req.flash('error', 'Showtime not found.');
        return res.redirect('/movies');
      }

      res.render('bookings/select-seats', {
        title: `Select Seats - ${data.showtime.movie_title}`,
        showtime: data.showtime,
        seatTypes: data.seatTypes,
        rows: data.rows,
        summary: data.summary,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    } catch (error) {
      console.error('Error rendering seat selection:', error);
      next(error);
    }
  }

  /**
   * Live availability AJAX endpoint for real-time seat polling.
   * GET /api/showtimes/:id/seat-availability
   */
  static async getSeatAvailabilityApi(req, res) {
    try {
      const showtimeId = req.params.id;
      if (!showtimeId || isNaN(Number(showtimeId))) {
        return res.status(400).json({ success: false, message: 'Invalid showtime ID.' });
      }

      const customerId = req.session && req.session.customer ? req.session.customer.customer_id : null;
      const data = await BookingService.getShowtimeSeatMatrix(Number(showtimeId), customerId);

      if (!data) {
        return res.status(404).json({ success: false, message: 'Showtime not found.' });
      }

      // Format flat seats array for easy frontend lookup
      const seats = [];
      Object.keys(data.rows).forEach(rowLabel => {
        data.rows[rowLabel].forEach(seat => {
          seats.push({
            seatId: seat.seatId,
            seatCode: seat.seatCode,
            status: seat.status,
            isMyHold: seat.isMyHold,
            price: seat.price,
            categoryName: seat.categoryName
          });
        });
      });

      return res.json({
        success: true,
        showtimeId: Number(showtimeId),
        summary: data.summary,
        seats
      });
    } catch (error) {
      console.error('Error in seat availability API:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch live availability.' });
    }
  }

  /**
   * Handle seat reservation hold request.
   * POST /bookings/hold
   */
  static async holdSeats(req, res, next) {
    try {
      const customerId = req.session.customer.customer_id;
      let { showtime_id, seat_ids } = req.body;

      if (!showtime_id) {
        req.flash('error', 'Showtime is required.');
        return res.redirect('/movies');
      }

      // Normalize seat_ids whether received as string, single value, or array
      let parsedSeatIds = [];
      if (Array.isArray(seat_ids)) {
        parsedSeatIds = seat_ids;
      } else if (typeof seat_ids === 'string') {
        try {
          const parsed = JSON.parse(seat_ids);
          parsedSeatIds = Array.isArray(parsed) ? parsed : [seat_ids];
        } catch (e) {
          parsedSeatIds = seat_ids.split(',').map(s => s.trim()).filter(Boolean);
        }
      } else if (seat_ids) {
        parsedSeatIds = [seat_ids];
      }

      if (parsedSeatIds.length === 0) {
        req.flash('error', 'Please select at least one seat.');
        return res.redirect(`/showtimes/${showtime_id}/seats`);
      }

      const holdResult = await BookingService.holdSeats({
        customerId,
        showtimeId: Number(showtime_id),
        seatIds: parsedSeatIds
      });

      req.flash('success', `Reserved ${holdResult.seatCount} seat(s). Complete payment within 10 minutes to confirm.`);
      return res.redirect(`/bookings/${holdResult.bookingId}/payment`);
    } catch (error) {
      console.error('Error holding seats:', error.message);
      const showtimeId = req.body.showtime_id;
      req.flash('error', error.message || 'Failed to reserve seats. Please try again.');
      if (showtimeId) {
        return res.redirect(`/showtimes/${showtimeId}/seats`);
      }
      return res.redirect('/movies');
    }
  }

  /**
   * Render the payment / checkout confirmation page for a held booking.
   * GET /bookings/:id/payment
   */
  static async renderPayment(req, res, next) {
    try {
      const bookingId = req.params.id;
      const customerId = req.session.customer.customer_id;

      const booking = await BookingService.getBookingDetails(Number(bookingId), customerId);

      if (!booking) {
        req.flash('error', 'Booking not found or not authorized.');
        return res.redirect('/movies');
      }

      if (booking.status === 'expired' || booking.remainingSeconds <= 0) {
        req.flash('error', 'Your seat hold has expired. Please select your seats again.');
        return res.redirect(`/showtimes/${booking.showtime_id}/seats`);
      }

      if (booking.status !== 'pending') {
        req.flash('info', `Booking is currently ${booking.status}.`);
        return res.redirect('/movies');
      }

      res.render('bookings/payment', {
        title: `Complete Payment - ${booking.booking_ref}`,
        booking,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    } catch (error) {
      console.error('Error rendering payment page:', error);
      next(error);
    }
  }

  /**
   * Release hold early on customer request.
   * POST /bookings/:id/cancel
   */
  static async cancelHold(req, res, next) {
    try {
      const bookingId = req.params.id;
      const customerId = req.session.customer.customer_id;

      const booking = await BookingService.getBookingDetails(Number(bookingId), customerId);
      if (!booking) {
        req.flash('error', 'Booking not found.');
        return res.redirect('/movies');
      }

      await BookingService.cancelHold(Number(bookingId), customerId);
      req.flash('info', 'Your seat reservation has been released.');
      return res.redirect(`/showtimes/${booking.showtime_id}/seats`);
    } catch (error) {
      console.error('Error cancelling hold:', error);
      req.flash('error', error.message || 'Unable to release hold.');
      return res.redirect('/movies');
    }
  }
}

module.exports = BookingController;
