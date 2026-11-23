const AuthService = require('../services/authService');

/**
 * Controller handling registration, customer login, admin login, and sessions
 */
class AuthController {
  /**
   * Render customer registration form
   */
  static showRegister(req, res) {
    res.render('auth/register', {
      title: 'Create Your Account - CineSeat',
      activePage: 'register',
      errors: [],
      oldInput: {},
      alert: null
    });
  }

  /**
   * Process customer registration
   */
  static async register(req, res, next) {
    try {
      const { full_name, email, phone, password } = req.body;

      await AuthService.registerCustomer({
        fullName: full_name,
        email,
        phone,
        password
      });

      req.flash('success', 'Registration successful! You can now log in to your account.');
      return res.redirect('/auth/login');
    } catch (error) {
      if (error.status === 409) {
        return res.status(409).render('auth/register', {
          title: 'Create Your Account - CineSeat',
          activePage: 'register',
          errors: [error.message],
          oldInput: req.body,
          alert: {
            type: 'warning',
            message: error.message
          }
        });
      }
      next(error);
    }
  }

  /**
   * Render customer login form
   */
  static showLogin(req, res) {
    res.render('auth/login', {
      title: 'Customer Login - CineSeat',
      activePage: 'login',
      errors: [],
      oldInput: {},
      alert: null
    });
  }

  /**
   * Process customer login with session regeneration
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const user = await AuthService.authenticateCustomer(email, password);

      // Regenerate session ID to prevent session fixation attacks
      req.session.regenerate((err) => {
        if (err) return next(err);

        req.session.user = user;
        req.session.customer = {
          customer_id: user.id,
          id: user.id,
          full_name: user.fullName,
          email: user.email,
          phone: user.phone
        };
        const returnUrl = req.session.returnTo || '/customer/dashboard';
        delete req.session.returnTo;

        req.flash('success', `Welcome back, ${user.fullName}!`);
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          return res.redirect(returnUrl);
        });
      });
    } catch (error) {
      const statusCode = error.status || 401;
      return res.status(statusCode).render('auth/login', {
        title: 'Customer Login - CineSeat',
        activePage: 'login',
        errors: [error.message],
        oldInput: { email: req.body.email },
        alert: {
          type: statusCode === 403 ? 'warning' : 'danger',
          message: error.message
        }
      });
    }
  }

  /**
   * Customer logout: destroys session and clears cookie
   */
  static logout(req, res, next) {
    req.session.user = null;
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('cineseat_sid');
      return res.redirect('/auth/login?logged_out=1');
    });
  }

  /**
   * Render administrator login form
   */
  static showAdminLogin(req, res) {
    res.render('auth/admin-login', {
      title: 'Administrator Portal - CineSeat',
      activePage: 'admin-login',
      errors: [],
      oldInput: {},
      alert: null
    });
  }

  /**
   * Process administrator login
   */
  static async adminLogin(req, res, next) {
    try {
      const { email, password } = req.body;
      const admin = await AuthService.authenticateAdmin(email, password);

      req.session.regenerate((err) => {
        if (err) return next(err);

        req.session.admin = admin;
        req.flash('success', `Welcome to Cinema Operations, ${admin.fullName}!`);
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          return res.redirect('/admin/dashboard');
        });
      });
    } catch (error) {
      const statusCode = error.status || 401;
      return res.status(statusCode).render('auth/admin-login', {
        title: 'Administrator Portal - CineSeat',
        activePage: 'admin-login',
        errors: [error.message],
        oldInput: { email: req.body.email },
        alert: {
          type: 'danger',
          message: error.message
        }
      });
    }
  }

  /**
   * Admin logout
   */
  static adminLogout(req, res, next) {
    req.session.admin = null;
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('cineseat_sid');
      return res.redirect('/auth/admin/login?logged_out=1');
    });
  }
}

module.exports = AuthController;
