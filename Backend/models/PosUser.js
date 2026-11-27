const db = require('../config/database');
const bcrypt = require('bcryptjs');

class PosUser {
  static tableReady = false;

  static async ensureTableExists() {
    if (this.tableReady) return;

    await db.query(`
      CREATE TABLE IF NOT EXISTS pos_users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        store_owner_id INT NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        role VARCHAR(30) NOT NULL DEFAULT 'pos_user',
        status ENUM('approved','disabled') NOT NULL DEFAULT 'approved',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_pos_users_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
      )
    `);

    this.tableReady = true;
  }

  static async findByUsername(username) {
    await this.ensureTableExists();
    const value = String(username || '').trim();
    if (!value) return undefined;
    const [rows] = await db.query(
      'SELECT * FROM pos_users WHERE username = ? OR LOWER(username) = LOWER(?) LIMIT 1',
      [value, value]
    );
    return rows[0];
  }

  static async findByEmail(email) {
    await this.ensureTableExists();
    const value = String(email || '').trim();
    if (!value) return undefined;
    const [rows] = await db.query(
      'SELECT * FROM pos_users WHERE email = ? OR LOWER(email) = LOWER(?) LIMIT 1',
      [value, value]
    );
    return rows[0];
  }

  /** Resolve by username first, then email (usernames may contain @). */
  static async findByLoginIdentifier(identifier) {
    const value = String(identifier || '').trim();
    if (!value) return undefined;
    const byUsername = await this.findByUsername(value);
    if (byUsername) return byUsername;
    if (value.includes('@')) return this.findByEmail(value);
    return undefined;
  }

  static isBcryptHash(value) {
    return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value || ''));
  }

  static async comparePassword(plainPassword, hashedPassword) {
    const plain = String(plainPassword || '');
    const stored = String(hashedPassword || '');
    if (!plain || !stored) return false;

    if (this.isBcryptHash(stored)) {
      return bcrypt.compare(plain, stored);
    }

    // Legacy / mistyped create path stored plaintext — accept once, then caller should rehash.
    return plain === stored;
  }

  static async updatePassword(id, newPassword) {
    await this.ensureTableExists();
    const hashed = await bcrypt.hash(String(newPassword || ''), 10);
    const [result] = await db.query('UPDATE pos_users SET `password` = ? WHERE id = ?', [hashed, id]);
    return result.affectedRows > 0;
  }
}

module.exports = PosUser;
