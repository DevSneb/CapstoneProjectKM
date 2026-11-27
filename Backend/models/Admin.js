const db = require('../config/database');
const bcrypt = require('bcryptjs');

class Admin {
  static async findByUsername(username) {
    const [rows] = await db.query('SELECT * FROM admins WHERE username = ?', [username]);
    return rows[0];
  }

  static async findByEmail(email) {
    const [rows] = await db.query('SELECT * FROM admins WHERE email = ?', [email]);
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await db.query('SELECT id, username, email, full_name, role FROM admins WHERE id = ?', [id]);
    return rows[0];
  }

  static async create(adminData) {
    const hashedPassword = await bcrypt.hash(adminData.password, 10);
    const [result] = await db.query(
      'INSERT INTO admins (username, email, password, full_name) VALUES (?, ?, ?, ?)',
      [adminData.username, adminData.email, hashedPassword, adminData.full_name]
    );
    return result.insertId;
  }

  static async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
}

module.exports = Admin;
