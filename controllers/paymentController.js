const PaymentService = require('../services/paymentService');
const BookingService = require('../services/bookingService');

class PaymentController {
  /**
   * Handle simulated payment processing request.
   * POST /bookings/:id/pay
   */
  static async processPayment(req, res, next) {
    try {
      const bookingId = Number(req.params.id);
      const customerId = req.session.customer.customer_id;
      const { payment_method, simulation_action } = req.body;

      const simulateSuccess = simulation_action !== 'fail';

      const result = await PaymentService.processPayment({
        bookingId,
        customerId,
        paymentMethod: payment_method || 'card',
        simulateSuccess,
        failureReason: req.body.failure_reason || 'Simulated payment failed / declined by demo provider.'
      });

      if (result.success) {
        req.flash('success', result.alreadyPaid 
          ? 'Your booking is already confirmed!' 
          : 'Payment simulated successfully! Your tickets are ready.');
        return res.redirect(`/bookings/${bookingId}/tickets`);
      } else {
        req.flash('error', `Payment Simulation Failed: ${result.message}`);
        return res.redirect(`/bookings/${bookingId}/payment`);
      }
    } catch (error) {
      console.error('Error processing payment simulation:', error.message);
      req.flash('error', error.message || 'Payment processing error.');
      const bookingId = req.params.id;
      return res.redirect(`/bookings/${bookingId}/payment`);
    }
  }

  /**
   * View all tickets for a confirmed booking.
   * GET /bookings/:id/tickets
   */
  static async viewBookingTickets(req, res, next) {
    try {
      const bookingId = Number(req.params.id);
      const customerId = req.session.customer ? req.session.customer.customer_id : null;
      const isAdmin = req.session.admin ? true : false;

      const booking = await PaymentService.getBookingTickets(bookingId, customerId, isAdmin);

      if (!booking) {
        req.flash('error', 'Booking not found or unauthorized.');
        return res.redirect('/movies');
      }

      if (booking.status === 'pending') {
        req.flash('info', 'Please complete payment to access your tickets.');
        return res.redirect(`/bookings/${bookingId}/payment`);
      }

      res.render('bookings/tickets', {
        title: `Tickets - ${booking.booking_ref}`,
        booking,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    } catch (error) {
      console.error('Error viewing booking tickets:', error);
      next(error);
    }
  }

  /**
   * Single printable ticket view.
   * GET /tickets/:identifier
   */
  static async viewSingleTicket(req, res, next) {
    try {
      const ticketIdentifier = req.params.identifier;
      const customerId = req.session.customer ? req.session.customer.customer_id : null;
      const isAdmin = req.session.admin ? true : false;

      const ticket = await PaymentService.getTicketDetails(ticketIdentifier, customerId, isAdmin);

      if (!ticket) {
        req.flash('error', 'Ticket not found or unauthorized.');
        return res.redirect('/movies');
      }

      res.render('bookings/ticket-print', {
        title: `Ticket - ${ticket.ticket_number}`,
        ticket
      });
    } catch (error) {
      console.error('Error viewing ticket:', error);
      next(error);
    }
  }

  /**
   * Customer booking and ticket history.
   * GET /customer/bookings or /customer/tickets
   */
  static async viewCustomerHistory(req, res, next) {
    try {
      const customerId = (req.session?.customer?.customer_id) 
                      || (req.session?.user?.id) 
                      || (req.session?.user?.customer_id);

      if (!customerId) {
        req.flash('error', 'Please log in to your account.');
        return res.redirect('/auth/login');
      }

      const bookings = await PaymentService.getCustomerBookingHistory(customerId);

      res.render('customer/booking-history', {
        title: 'My Bookings & Tickets',
        bookings,
        customer: req.session.customer || req.session.user,
        user: req.session.user || req.session.customer
      });
    } catch (error) {
      console.error('Error loading booking history:', error);
      next(error);
    }
  }

  /**
   * Admin / Staff Ticket Verification Page
   * GET /admin/tickets/verify
   */
  static async renderTicketVerification(req, res, next) {
    try {
      res.render('admin/verify-ticket', {
        title: 'Verify & Check-In Tickets',
        result: null,
        error: null,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin / Staff Process Ticket Verification & Mark as Used
   * POST /admin/tickets/verify
   */
  static async processTicketVerification(req, res, next) {
    try {
      const { ticket_identifier } = req.body;
      if (!ticket_identifier || !ticket_identifier.trim()) {
        return res.render('admin/verify-ticket', {
          title: 'Verify & Check-In Tickets',
          result: null,
          error: 'Please enter a ticket number or scan a QR code.',
          csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
      }

      let parsedCode = ticket_identifier.trim();
      // If scanned payload is a JSON string from QR code
      try {
        const json = JSON.parse(parsedCode);
        if (json.ticket) {
          parsedCode = json.ticket;
        }
      } catch (e) {
        // Not JSON, use as-is
      }

      const result = await PaymentService.verifyAndUseTicket(parsedCode);

      res.render('admin/verify-ticket', {
        title: 'Verify & Check-In Tickets',
        result,
        error: null,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    } catch (error) {
      res.render('admin/verify-ticket', {
        title: 'Verify & Check-In Tickets',
        result: null,
        error: error.message || 'Ticket verification failed.',
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    }
  }
}

module.exports = PaymentController;
