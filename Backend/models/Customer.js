const db = require('../config/database');
const bcrypt = require('bcryptjs');

class Customer {
  static async findByUsername(username) {
    const [rows] = await db.query(
      'SELECT * FROM customers WHERE username = ? OR email = ? LIMIT 1',
      [username, String(username || '').toLowerCase()]
    );
    return rows[0];
  }

  static async findByEmail(email) {
    const value = String(email || '').trim().toLowerCase();
    const [rows] = await db.query(
      'SELECT * FROM customers WHERE LOWER(email) = ? OR username = ? LIMIT 1',
      [value, email]
    );
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await db.query(
      'SELECT id, username, email, full_name, phone, address, role FROM customers WHERE id = ?', 
      [id]
    );
    return rows[0];
  }

  static async findWithPasswordById(id) {
    const [rows] = await db.query('SELECT * FROM customers WHERE id = ?', [id]);
    return rows[0];
  }

  static async create(customerData) {
    const hashedPassword = await bcrypt.hash(customerData.password, 10);
    const [result] = await db.query(
      'INSERT INTO customers (username, email, password, full_name, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
      [customerData.username, customerData.email, hashedPassword, customerData.full_name, customerData.phone, customerData.address]
    );
    return result.insertId;
  }

  static async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async updateEmail(id, email) {
    const [result] = await db.query('UPDATE customers SET email = ? WHERE id = ?', [email, id]);
    return result.affectedRows > 0;
  }

  static async updatePassword(id, newPassword) {
    const hashed = await bcrypt.hash(newPassword, 10);
    const [result] = await db.query('UPDATE customers SET password = ? WHERE id = ?', [hashed, id]);
    return result.affectedRows > 0;
  }
}

module.exports = Customer;
