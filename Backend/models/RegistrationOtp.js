const db = require('../config/database');
const bcrypt = require('bcryptjs');

class RegistrationOtp {
  static async ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_registration_otps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        payload_json JSON NOT NULL,
        otp_hash VARCHAR(255) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_email (email),
        KEY idx_expires (expires_at)
      )
    `);
  }

  static generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  static async hashOtp(otp) {
    return bcrypt.hash(String(otp), 10);
  }

  static async compareOtp(otp, hash) {
    return bcrypt.compare(String(otp), hash);
  }

  static async upsertPending({ email, username, payload, otp }) {
    await RegistrationOtp.ensureTable();
    const otpHash = await RegistrationOtp.hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.query(
      `INSERT INTO customer_registration_otps
        (email, username, payload_json, otp_hash, attempts, expires_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         payload_json = VALUES(payload_json),
         otp_hash = VALUES(otp_hash),
         attempts = 0,
         expires_at = VALUES(expires_at),
         created_at = CURRENT_TIMESTAMP`,
      [email, username, JSON.stringify(payload), otpHash, expiresAt]
    );
    return expiresAt;
  }

  static async findByEmail(email) {
    await RegistrationOtp.ensureTable();
    const [rows] = await db.query(
      'SELECT * FROM customer_registration_otps WHERE email = ? LIMIT 1',
      [email]
    );
    return rows[0] || null;
  }

  static async bumpAttempts(id) {
    await db.query(
      'UPDATE customer_registration_otps SET attempts = attempts + 1 WHERE id = ?',
      [id]
    );
  }

  static async removeByEmail(email) {
    await db.query('DELETE FROM customer_registration_otps WHERE email = ?', [email]);
  }

  static async cleanupExpired() {
    await RegistrationOtp.ensureTable();
    await db.query('DELETE FROM customer_registration_otps WHERE expires_at < NOW()');
  }
}

module.exports = RegistrationOtp;
