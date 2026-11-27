const db = require('../config/database');
const bcrypt = require('bcryptjs');

function toMysqlDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class PasswordResetOtp {
  static async ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_password_reset_otps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        otp_hash VARCHAR(255) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_email (email),
        KEY idx_customer (customer_id),
        KEY idx_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  static generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  static async hashOtp(otp) {
    return bcrypt.hash(String(otp), 10);
  }

  static async compareOtp(otp, hash) {
    if (!otp || !hash) return false;
    return bcrypt.compare(String(otp), String(hash));
  }

  static async upsert({ customerId, email, otp }) {
    await PasswordResetOtp.ensureTable();
    const otpHash = await PasswordResetOtp.hashOtp(otp);
    const expiresAt = toMysqlDateTime(new Date(Date.now() + 15 * 60 * 1000));
    await db.query(
      `INSERT INTO customer_password_reset_otps
        (customer_id, email, otp_hash, attempts, expires_at)
       VALUES (?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE
         customer_id = VALUES(customer_id),
         otp_hash = VALUES(otp_hash),
         attempts = 0,
         expires_at = VALUES(expires_at)`,
      [customerId, email, otpHash, expiresAt]
    );
    return expiresAt;
  }

  static async findByEmail(email) {
    await PasswordResetOtp.ensureTable();
    const [rows] = await db.query(
      `SELECT id, customer_id, email, otp_hash, attempts, expires_at
       FROM customer_password_reset_otps
       WHERE LOWER(email) = LOWER(?)
       LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  }

  static isExpiredRow(row) {
    if (!row || !row.expires_at) return true;
    const expiresMs = new Date(row.expires_at).getTime();
    if (!Number.isFinite(expiresMs)) return true;
    return expiresMs < Date.now();
  }

  static async bumpAttempts(id) {
    await PasswordResetOtp.ensureTable();
    await db.query(
      'UPDATE customer_password_reset_otps SET attempts = attempts + 1 WHERE id = ?',
      [id]
    );
  }

  static async removeByEmail(email) {
    await PasswordResetOtp.ensureTable();
    await db.query('DELETE FROM customer_password_reset_otps WHERE email = ?', [email]);
  }

  static async cleanupExpired() {
    await PasswordResetOtp.ensureTable();
    await db.query('DELETE FROM customer_password_reset_otps WHERE expires_at < NOW()');
  }
}

module.exports = PasswordResetOtp;
