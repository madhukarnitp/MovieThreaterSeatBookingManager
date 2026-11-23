const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

/**
 * Service handling customer and administrator authentication logic
 */
class AuthService {
  /**
   * Find a customer record by email
   * @param {string} email 
   * @returns {Promise<object|null>}
   */
  static async findCustomerByEmail(email) {
    const [rows] = await pool.query(
      'SELECT customer_id, full_name, email, phone, password_hash, status, created_at FROM customers WHERE email = ? LIMIT 1',
      [email]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Register a new customer account
   * Strict Rule: Set status to ACTIVE, hash password, never store plain text.
   * @param {object} customerData 
   * @returns {Promise<{customer_id: number, full_name: string, email: string}>}
   */
  static async registerCustomer({ fullName, email, phone, password }) {
    // Check for duplicate email
    const existing = await this.findCustomerByEmail(email);
    if (existing) {
      const error = new Error('An account with this email address already exists.');
      error.status = 409;
      throw error;
    }

    // Hash password with bcryptjs
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const [result] = await pool.query(
      `INSERT INTO customers (full_name, email, phone, password_hash, status, created_at)
       VALUES (?, ?, ?, ?, 'active', NOW())`,
      [fullName, email, phone || null, passwordHash]
    );

    return {
      customer_id: result.insertId,
      full_name: fullName,
      email: email
    };
  }

  /**
   * Authenticate customer credentials
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<object>} safe user session object
   */
  static async authenticateCustomer(email, password) {
    const customer = await this.findCustomerByEmail(email);
    if (!customer) {
      const error = new Error('Invalid email or password.');
      error.status = 401;
      throw error;
    }

    // Check account status
    if (customer.status === 'blocked') {
      const error = new Error('Your account has been suspended or blocked. Please contact theater support.');
      error.status = 403;
      throw error;
    }

    if (customer.status !== 'active') {
      const error = new Error('Your account is currently inactive.');
      error.status = 403;
      throw error;
    }

    // Verify password hash
    const isMatch = await bcrypt.compare(password, customer.password_hash);
    if (!isMatch) {
      const error = new Error('Invalid email or password.');
      error.status = 401;
      throw error;
    }

    // Return safe customer session object
    return {
      id: customer.customer_id,
      fullName: customer.full_name,
      email: customer.email,
      phone: customer.phone,
      role: 'customer'
    };
  }

  /**
   * Find an administrator record by email
   * @param {string} email 
   * @returns {Promise<object|null>}
   */
  static async findAdminByEmail(email) {
    const [rows] = await pool.query(
      'SELECT admin_id, full_name, email, password_hash, role, is_active FROM admins WHERE email = ? LIMIT 1',
      [email]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Authenticate administrator credentials
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<object>} safe admin session object
   */
  static async authenticateAdmin(email, password) {
    const admin = await this.findAdminByEmail(email);
    if (!admin) {
      const error = new Error('Invalid administrator credentials.');
      error.status = 401;
      throw error;
    }

    if (!admin.is_active) {
      const error = new Error('This administrator account has been deactivated.');
      error.status = 403;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      const error = new Error('Invalid administrator credentials.');
      error.status = 401;
      throw error;
    }

    return {
      id: admin.admin_id,
      fullName: admin.full_name,
      email: admin.email,
      role: admin.role // 'super_admin', 'admin', 'manager'
    };
  }
}

module.exports = AuthService;
