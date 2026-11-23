const AdminService = require('../services/adminService');

/**
 * Controller for comprehensive cinema administration & operational management
 */
class AdminController {
  // =========================================================================
  // DASHBOARD
  // =========================================================================
  static async showDashboard(req, res, next) {
    try {
      const [
        metrics,
        dailyBookings,
        movieRevenue,
        popularMovies
      ] = await Promise.all([
        AdminService.getDashboardMetrics(),
        AdminService.getDailyBookingReport(7),
        AdminService.getMovieWiseRevenueReport(),
        AdminService.getMostPopularMovies(5)
      ]);

      res.render('admin/dashboard', {
        title: 'Operations Dashboard - CineSeat Admin',
        activePage: 'admin-dashboard',
        admin: req.session.admin,
        metrics,
        recentBookings: metrics.recentBookings,
        recentPayments: metrics.recentPayments,
        dailyBookings,
        movieRevenue,
        popularMovies,
        alert: null
      });
    } catch (error) {
      console.error('Error in AdminController.showDashboard:', error.message);
      next(error);
    }
  }

  // =========================================================================
  // A. MOVIE MANAGEMENT
  // =========================================================================
  static async listMovies(req, res, next) {
    try {
      const [movies, genres] = await Promise.all([
        AdminService.getAllMovies(),
        AdminService.getAllGenres()
      ]);

      res.render('admin/movies', {
        title: 'Manage Movies - CineSeat Admin',
        activePage: 'admin-movies',
        admin: req.session.admin,
        movies,
        genres,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async createMovie(req, res, next) {
    try {
      const { title, slug, duration_min, language, certification, release_date, poster_path, trailer_url, status, genres } = req.body;

      if (!title || !duration_min || !language || !certification || !release_date) {
        req.flash('error', 'Please fill in all mandatory movie fields.');
        return res.redirect('/admin/movies');
      }

      // Parse genres input cleanly (handles array, single value, or comma-separated string)
      let rawGenres = [];
      if (Array.isArray(genres)) {
        rawGenres = genres;
      } else if (typeof genres === 'string') {
        rawGenres = genres.split(',');
      }
      const genreIds = rawGenres.map(g => Number(String(g).trim())).filter(n => !isNaN(n) && n > 0);

      await AdminService.createMovie({
        title,
        slug,
        duration_min: Number(duration_min),
        language,
        certification,
        release_date,
        poster_path,
        trailer_url,
        status: status || 'now_showing'
      }, genreIds);

      req.flash('success', `Movie "${title}" added successfully.`);
      res.redirect('/admin/movies');
    } catch (error) {
      console.error('Error creating movie:', error.message);
      req.flash('error', error.message || 'Failed to create movie.');
      res.redirect('/admin/movies');
    }
  }

  static async updateMovie(req, res, next) {
    try {
      const movieId = req.params.id;
      const { title, slug, duration_min, language, certification, release_date, poster_path, trailer_url, status, genres } = req.body;

      if (!title || !duration_min || !language || !certification || !release_date) {
        req.flash('error', 'Please fill in all mandatory movie fields.');
        return res.redirect('/admin/movies');
      }

      let rawGenres = [];
      if (Array.isArray(genres)) {
        rawGenres = genres;
      } else if (typeof genres === 'string') {
        rawGenres = genres.split(',');
      }
      const genreIds = rawGenres.map(g => Number(String(g).trim())).filter(n => !isNaN(n) && n > 0);

      await AdminService.updateMovie(movieId, {
        title,
        slug,
        duration_min: Number(duration_min),
        language,
        certification,
        release_date,
        poster_path,
        trailer_url,
        status
      }, genreIds);

      req.flash('success', `Movie "${title}" updated successfully.`);
      res.redirect('/admin/movies');
    } catch (error) {
      console.error('Error updating movie:', error.message);
      req.flash('error', error.message || 'Failed to update movie.');
      res.redirect('/admin/movies');
    }
  }

  static async deleteMovie(req, res, next) {
    try {
      const movieId = req.params.id;
      const result = await AdminService.deleteOrDeactivateMovie(movieId);
      req.flash(result.action === 'deleted' ? 'success' : 'info', result.message);
      res.redirect('/admin/movies');
    } catch (error) {
      req.flash('error', error.message || 'Failed to delete movie.');
      res.redirect('/admin/movies');
    }
  }

  // =========================================================================
  // GENRES MANAGEMENT
  // =========================================================================
  static async listGenres(req, res, next) {
    try {
      const genres = await AdminService.getAllGenres();
      res.render('admin/genres', {
        title: 'Manage Genres - CineSeat Admin',
        activePage: 'admin-genres',
        admin: req.session.admin,
        genres,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async createGenre(req, res, next) {
    try {
      const { name, slug } = req.body;
      if (!name || name.trim() === '') {
        req.flash('error', 'Genre name cannot be empty.');
        return res.redirect('/admin/genres');
      }
      await AdminService.createGenre(name, slug);
      req.flash('success', `Genre "${name}" created successfully.`);
      res.redirect('/admin/genres');
    } catch (error) {
      req.flash('error', error.message || 'Failed to create genre.');
      res.redirect('/admin/genres');
    }
  }

  static async updateGenre(req, res, next) {
    try {
      const genreId = req.params.id;
      const { name, slug } = req.body;
      if (!name || name.trim() === '') {
        req.flash('error', 'Genre name cannot be empty.');
        return res.redirect('/admin/genres');
      }
      await AdminService.updateGenre(genreId, name, slug);
      req.flash('success', `Genre updated to "${name}".`);
      res.redirect('/admin/genres');
    } catch (error) {
      req.flash('error', error.message || 'Failed to update genre.');
      res.redirect('/admin/genres');
    }
  }

  static async deleteGenre(req, res, next) {
    try {
      const genreId = req.params.id;
      await AdminService.deleteGenre(genreId);
      req.flash('success', 'Genre removed successfully.');
      res.redirect('/admin/genres');
    } catch (error) {
      req.flash('error', error.message || 'Failed to delete genre.');
      res.redirect('/admin/genres');
    }
  }

  // =========================================================================
  // B. THEATER MANAGEMENT
  // =========================================================================
  static async listTheaters(req, res, next) {
    try {
      const theaters = await AdminService.getAllTheaters();
      res.render('admin/theaters', {
        title: 'Manage Theaters - CineSeat Admin',
        activePage: 'admin-theaters',
        admin: req.session.admin,
        theaters,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async createTheater(req, res, next) {
    try {
      const { name, address, city, state, pincode, phone } = req.body;
      if (!name || !address || !city || !state) {
        req.flash('error', 'Theater name, address, city, and state are required.');
        return res.redirect('/admin/theaters');
      }

      await AdminService.createTheater({ name, address, city, state, pincode, phone });
      req.flash('success', `Theater "${name}" added successfully.`);
      res.redirect('/admin/theaters');
    } catch (error) {
      req.flash('error', error.message || 'Failed to create theater.');
      res.redirect('/admin/theaters');
    }
  }

  static async updateTheater(req, res, next) {
    try {
      const theaterId = req.params.id;
      const { name, address, city, state, pincode, phone, is_active } = req.body;

      if (!name || !address || !city || !state) {
        req.flash('error', 'Theater name, address, city, and state are required.');
        return res.redirect('/admin/theaters');
      }

      await AdminService.updateTheater(theaterId, {
        name,
        address,
        city,
        state,
        pincode,
        phone,
        is_active: is_active !== undefined ? Number(is_active) : 1
      });

      req.flash('success', `Theater "${name}" updated successfully.`);
      res.redirect('/admin/theaters');
    } catch (error) {
      req.flash('error', error.message || 'Failed to update theater.');
      res.redirect('/admin/theaters');
    }
  }

  static async deleteTheater(req, res, next) {
    try {
      const theaterId = req.params.id;
      const result = await AdminService.deleteOrDeactivateTheater(theaterId);
      req.flash(result.action === 'deleted' ? 'success' : 'info', result.message);
      res.redirect('/admin/theaters');
    } catch (error) {
      req.flash('error', error.message || 'Failed to delete theater.');
      res.redirect('/admin/theaters');
    }
  }

  // =========================================================================
  // C. SCREEN MANAGEMENT
  // =========================================================================
  static async listScreens(req, res, next) {
    try {
      const theaterFilter = req.query.theater_id || null;
      const [screens, theaters] = await Promise.all([
        AdminService.getAllScreens(theaterFilter),
        AdminService.getAllTheaters()
      ]);

      res.render('admin/screens', {
        title: 'Manage Screens - CineSeat Admin',
        activePage: 'admin-screens',
        admin: req.session.admin,
        screens,
        theaters,
        selectedTheaterId: theaterFilter,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async createScreen(req, res, next) {
    try {
      const { theater_id, name, total_capacity, screen_type, is_active } = req.body;
      if (!theater_id || !name) {
        req.flash('error', 'Theater and screen name are required.');
        return res.redirect('/admin/screens');
      }

      await AdminService.createScreen({
        theater_id,
        name,
        total_capacity: Number(total_capacity) || 50,
        screen_type: screen_type || '2D',
        is_active: is_active !== undefined ? Number(is_active) : 1
      });

      req.flash('success', `Screen "${name}" created successfully.`);
      res.redirect(`/admin/screens?theater_id=${theater_id}`);
    } catch (error) {
      req.flash('error', error.message || 'Failed to create screen.');
      res.redirect('/admin/screens');
    }
  }

  static async updateScreen(req, res, next) {
    try {
      const screenId = req.params.id;
      const { name, total_capacity, screen_type, is_active } = req.body;

      if (!name) {
        req.flash('error', 'Screen name cannot be empty.');
        return res.redirect('/admin/screens');
      }

      await AdminService.updateScreen(screenId, {
        name,
        total_capacity: Number(total_capacity) || 50,
        screen_type: screen_type || '2D',
        is_active: is_active !== undefined ? Number(is_active) : 1
      });

      req.flash('success', `Screen "${name}" updated successfully.`);
      res.redirect('/admin/screens');
    } catch (error) {
      req.flash('error', error.message || 'Failed to update screen.');
      res.redirect('/admin/screens');
    }
  }

  static async deleteScreen(req, res, next) {
    try {
      const screenId = req.params.id;
      const result = await AdminService.deleteOrDeactivateScreen(screenId);
      req.flash(result.action === 'deleted' ? 'success' : 'info', result.message);
      res.redirect('/admin/screens');
    } catch (error) {
      req.flash('error', error.message || 'Failed to delete screen.');
      res.redirect('/admin/screens');
    }
  }

  // =========================================================================
  // D. SEAT MANAGEMENT
  // =========================================================================
  static async listSeats(req, res, next) {
    try {
      const [theaters, screens, seatTypes] = await Promise.all([
        AdminService.getAllTheaters(),
        AdminService.getAllScreens(),
        AdminService.getSeatTypes()
      ]);

      const selectedScreenId = req.query.screen_id || (screens.length > 0 ? screens[0].screen_id : null);
      let seats = [];
      let selectedScreen = null;

      if (selectedScreenId) {
        seats = await AdminService.getSeatsByScreen(selectedScreenId);
        selectedScreen = await AdminService.getScreenById(selectedScreenId);
      }

      res.render('admin/seats', {
        title: 'Manage Screen Seats - CineSeat Admin',
        activePage: 'admin-seats',
        admin: req.session.admin,
        theaters,
        screens,
        seatTypes,
        seats,
        selectedScreenId: Number(selectedScreenId),
        selectedScreen,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async createSingleSeat(req, res, next) {
    try {
      const { screen_id, row_label, seat_number, seat_type_id } = req.body;
      if (!screen_id || !row_label || !seat_number || !seat_type_id) {
        req.flash('error', 'All seat configuration fields are required.');
        return res.redirect(`/admin/seats?screen_id=${screen_id}`);
      }

      await AdminService.createSingleSeat(screen_id, { row_label, seat_number, seat_type_id });
      req.flash('success', `Seat ${row_label.toUpperCase()}${seat_number} configured successfully.`);
      res.redirect(`/admin/seats?screen_id=${screen_id}`);
    } catch (error) {
      req.flash('error', error.message || 'Failed to create seat.');
      res.redirect(`/admin/seats?screen_id=${req.body.screen_id}`);
    }
  }

  static async batchCreateSeats(req, res, next) {
    try {
      const { screen_id, row_label, start_number, end_number, seat_type_id } = req.body;
      if (!screen_id || !row_label || !start_number || !end_number || !seat_type_id) {
        req.flash('error', 'All batch configuration fields are required.');
        return res.redirect(`/admin/seats?screen_id=${screen_id}`);
      }

      const count = await AdminService.batchCreateSeats(screen_id, {
        row_label,
        start_number,
        end_number,
        seat_type_id
      });

      req.flash('success', `Configured ${count} seats in Row ${row_label.toUpperCase()} (${start_number} to ${end_number}).`);
      res.redirect(`/admin/seats?screen_id=${screen_id}`);
    } catch (error) {
      req.flash('error', error.message || 'Failed to batch create seats.');
      res.redirect(`/admin/seats?screen_id=${req.body.screen_id}`);
    }
  }

  static async toggleSeat(req, res, next) {
    try {
      const seatId = req.params.id;
      const { is_active, screen_id } = req.body;
      await AdminService.toggleSeatActive(seatId, is_active);
      req.flash('success', `Seat ${is_active === '1' ? 'activated' : 'deactivated'} successfully.`);
      res.redirect(`/admin/seats?screen_id=${screen_id}`);
    } catch (error) {
      req.flash('error', error.message || 'Failed to toggle seat status.');
      res.redirect('back');
    }
  }

  static async deleteSeat(req, res, next) {
    try {
      const seatId = req.params.id;
      const screenId = req.body.screen_id;
      await AdminService.deleteSeat(seatId);
      req.flash('success', 'Seat removed permanently.');
      res.redirect(`/admin/seats?screen_id=${screenId}`);
    } catch (error) {
      req.flash('error', error.message || 'Failed to delete seat.');
      res.redirect(`/admin/seats?screen_id=${req.body.screen_id}`);
    }
  }

  // =========================================================================
  // E. SHOWTIME MANAGEMENT
  // =========================================================================
  static async listShowtimes(req, res, next) {
    try {
      const { movie_id, theater_id, status } = req.query;

      const [showtimes, movies, theaters, screens] = await Promise.all([
        AdminService.getAllShowtimes({ movie_id, theater_id, status }),
        AdminService.getAllMovies(),
        AdminService.getAllTheaters(),
        AdminService.getAllScreens()
      ]);

      res.render('admin/showtimes', {
        title: 'Manage Showtimes - CineSeat Admin',
        activePage: 'admin-showtimes',
        admin: req.session.admin,
        showtimes,
        movies,
        theaters,
        screens,
        filters: {
          movie_id: movie_id || '',
          theater_id: theater_id || '',
          status: status || ''
        },
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async createShowtime(req, res, next) {
    try {
      const { movie_id, theater_id, screen_id, start_date, start_time_of_day, buffer_min, base_price, format, language } = req.body;

      if (!movie_id || !theater_id || !screen_id || !start_date || !start_time_of_day || !base_price) {
        req.flash('error', 'All showtime parameters are mandatory.');
        return res.redirect('/admin/showtimes');
      }

      await AdminService.createShowtime({
        movie_id,
        theater_id,
        screen_id,
        start_date,
        start_time_of_day,
        buffer_min: buffer_min || 20,
        base_price: Number(base_price),
        format: format || '2D',
        language: language || 'English'
      });

      req.flash('success', 'Showtime created and seat inventory generated successfully.');
      res.redirect('/admin/showtimes');
    } catch (error) {
      console.error('Error creating showtime:', error.message);
      req.flash('error', error.message || 'Failed to schedule showtime.');
      res.redirect('/admin/showtimes');
    }
  }

  static async cancelShowtime(req, res, next) {
    try {
      const showtimeId = req.params.id;
      await AdminService.cancelShowtime(showtimeId);
      req.flash('success', 'Showtime cancelled successfully.');
      res.redirect('/admin/showtimes');
    } catch (error) {
      req.flash('error', error.message || 'Failed to cancel showtime.');
      res.redirect('/admin/showtimes');
    }
  }

  // =========================================================================
  // F. BOOKINGS, CUSTOMERS & PAYMENTS VIEWERS
  // =========================================================================
  static async listBookings(req, res, next) {
    try {
      const bookings = await AdminService.getAllBookings(100);
      res.render('admin/bookings', {
        title: 'Customer Bookings - CineSeat Admin',
        activePage: 'admin-bookings',
        admin: req.session.admin,
        bookings,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async listCustomers(req, res, next) {
    try {
      const search = req.query.search || '';
      const customers = await AdminService.getAllCustomers(search);
      res.render('admin/customers', {
        title: 'Customer Accounts - CineSeat Admin',
        activePage: 'admin-customers',
        admin: req.session.admin,
        customers,
        search,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async viewCustomerDetails(req, res, next) {
    try {
      const customerId = req.params.id;
      const data = await AdminService.getCustomerDetails(customerId);
      if (!data) {
        req.flash('error', 'Customer not found.');
        return res.redirect('/admin/customers');
      }

      res.render('admin/customer-details', {
        title: `Customer - ${data.customer.full_name}`,
        activePage: 'admin-customers',
        admin: req.session.admin,
        customer: data.customer,
        bookings: data.bookings,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async toggleCustomerStatus(req, res, next) {
    try {
      const customerId = req.params.id;
      const { status } = req.body;
      await AdminService.toggleCustomerStatus(customerId, status);
      req.flash('success', `Customer status updated to ${status.toUpperCase()}.`);
      res.redirect(req.headers.referer || '/admin/customers');
    } catch (error) {
      req.flash('error', error.message || 'Failed to update customer status.');
      res.redirect('/admin/customers');
    }
  }

  static async listPayments(req, res, next) {
    try {
      const payments = await AdminService.getAllPayments(100);
      res.render('admin/payments', {
        title: 'Payment Transactions - CineSeat Admin',
        activePage: 'admin-payments',
        admin: req.session.admin,
        payments,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async listTickets(req, res, next) {
    try {
      const tickets = await AdminService.getAllTickets(100);
      res.render('admin/tickets', {
        title: 'Issued Tickets - CineSeat Admin',
        activePage: 'admin-tickets',
        admin: req.session.admin,
        tickets,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async listRefunds(req, res, next) {
    try {
      const refunds = await AdminService.getAllRefunds(50);
      res.render('admin/refunds', {
        title: 'Refund Audit Logs - CineSeat Admin',
        activePage: 'admin-refunds',
        admin: req.session.admin,
        refunds,
        alert: null
      });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // REPORTS & ANALYTICS
  // =========================================================================
  static async showReports(req, res, next) {
    try {
      const days = Number(req.query.days) || 14;

      const [
        metrics,
        dailyBookings,
        monthlyRevenue,
        movieRevenue,
        theaterRevenue,
        popularMovies,
        popularShowtimes
      ] = await Promise.all([
        AdminService.getDashboardMetrics(),
        AdminService.getDailyBookingReport(days),
        AdminService.getMonthlyRevenueReport(),
        AdminService.getMovieWiseRevenueReport(),
        AdminService.getTheaterWiseRevenueReport(),
        AdminService.getMostPopularMovies(5),
        AdminService.getMostBookedShowtimes(8)
      ]);

      res.render('admin/reports', {
        title: 'Cinema Analytics & Reports - CineSeat Admin',
        activePage: 'admin-reports',
        admin: req.session.admin,
        metrics,
        dailyBookings,
        monthlyRevenue,
        movieRevenue,
        theaterRevenue,
        popularMovies,
        popularShowtimes,
        selectedDays: days,
        alert: null
      });
    } catch (error) {
      console.error('Error in AdminController.showReports:', error);
      next(error);
    }
  }
}

module.exports = AdminController;
