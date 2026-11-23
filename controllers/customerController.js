const CustomerService = require('../services/customerService');

class CustomerController {
  /**
   * Render customer overview dashboard.
   * GET /customer/dashboard
   */
  static async showDashboard(req, res, next) {
    try {
      const customerId = req.session.customer ? req.session.customer.customer_id : (req.session.user ? req.session.user.id : null);
      if (!customerId) {
        req.flash('error', 'Please log in to access the customer area.');
        return res.redirect('/auth/login');
      }

      const [dashboardData, recentBookings] = await Promise.all([
        CustomerService.getDashboardData(customerId),
        CustomerService.getCustomerBookings(customerId, 'all')
      ]);

      if (!dashboardData) {
        req.flash('error', 'Customer profile not found.');
        return res.redirect('/auth/logout');
      }

      res.render('customer/dashboard', {
        title: 'Customer Dashboard - CineSeat',
        activePage: 'customer-dashboard',
        user: req.session.customer || req.session.user,
        customer: dashboardData.customer,
        stats: dashboardData.stats,
        recentBookings: recentBookings.slice(0, 5)
      });
    } catch (error) {
      console.error('Error in CustomerController.showDashboard:', error);
      next(error);
    }
  }

  /**
   * Customer Profile & Password Management page.
   * GET /customer/profile
   */
  static async showProfile(req, res, next) {
    try {
      const customerId = req.session.customer ? req.session.customer.customer_id : req.session.user.id;
      const data = await CustomerService.getDashboardData(customerId);

      res.render('customer/profile', {
        title: 'My Profile - CineSeat',
        activePage: 'customer-profile',
        customer: data.customer,
        user: req.session.customer || req.session.user,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update Profile Details (Full Name & Phone).
   * POST /customer/profile
   */
  static async updateProfile(req, res, next) {
    try {
      const customerId = req.session.customer ? req.session.customer.customer_id : req.session.user.id;
      const { full_name, phone } = req.body;

      await CustomerService.updateProfile(customerId, { full_name, phone });

      // Update session identity
      if (req.session.customer) req.session.customer.full_name = full_name;
      if (req.session.user) req.session.user.fullName = full_name;

      req.flash('success', 'Profile updated successfully.');
      res.redirect('/customer/profile');
    } catch (error) {
      req.flash('error', error.message || 'Failed to update profile.');
      res.redirect('/customer/profile');
    }
  }

  /**
   * Change Customer Password.
   * POST /customer/change-password
   */
  static async changePassword(req, res, next) {
    try {
      const customerId = req.session.customer ? req.session.customer.customer_id : req.session.user.id;
      const { current_password, new_password, confirm_password } = req.body;

      await CustomerService.changePassword(customerId, {
        current_password,
        new_password,
        confirm_password
      });

      req.flash('success', 'Password updated successfully.');
      res.redirect('/customer/profile');
    } catch (error) {
      req.flash('error', error.message || 'Failed to change password.');
      res.redirect('/customer/profile');
    }
  }

  /**
   * Categorized Bookings view (all, upcoming, past, cancelled).
   * GET /customer/bookings
   */
  static async showBookings(req, res, next) {
    try {
      const customerId = req.session.customer ? req.session.customer.customer_id : req.session.user.id;
      const filter = req.query.filter || 'all';

      const bookings = await CustomerService.getCustomerBookings(customerId, filter);

      res.render('customer/bookings', {
        title: 'My Bookings - CineSeat',
        activePage: 'customer-bookings',
        bookings,
        activeFilter: filter,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Customer Tickets view (all generated tickets with QR codes).
   * GET /customer/tickets
   */
  static async showTickets(req, res, next) {
    try {
      const customerId = req.session.customer ? req.session.customer.customer_id : req.session.user.id;
      const tickets = await CustomerService.getCustomerTickets(customerId);

      res.render('customer/tickets', {
        title: 'My Tickets - CineSeat',
        activePage: 'customer-tickets',
        tickets,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle Customer Booking Cancellation.
   * POST /customer/bookings/:id/cancel
   */
  static async cancelBooking(req, res, next) {
    try {
      const bookingId = Number(req.params.id);
      const customerId = req.session.customer ? req.session.customer.customer_id : req.session.user.id;
      const reason = req.body.reason || 'Cancelled by customer';

      const result = await CustomerService.cancelBooking({
        bookingId,
        customerId,
        reason
      });

      req.flash('success', result.message);
      res.redirect('/customer/bookings');
    } catch (error) {
      console.error('Error cancelling customer booking:', error.message);
      req.flash('error', error.message || 'Unable to cancel booking.');
      res.redirect('/customer/bookings');
    }
  }
}

module.exports = CustomerController;
