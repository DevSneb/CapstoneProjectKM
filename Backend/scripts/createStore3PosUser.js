require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function ensurePosUsersTable(conn) {
  await conn.query(`
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
}

async function run() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await ensurePosUsersTable(conn);

    const username = 'pos_store3';
    const email = 'pos.store3@kadiwa.local';
    const fullName = 'Store 3 POS Cashier';
    const plainPassword = 'posstore3';

    const [exists] = await conn.query('SELECT id FROM pos_users WHERE username = ? OR email = ?', [username, email]);
    if (exists.length) {
      await conn.commit();
      console.log('POS user already exists for Store 3.');
      console.log(`Username: ${username}`);
      console.log(`Password: ${plainPassword}`);
      process.exit(0);
      return;
    }

    const hashed = await bcrypt.hash(plainPassword, 10);
    await conn.query(
      'INSERT INTO pos_users (store_owner_id, username, email, password, full_name, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [3, username, email, hashed, fullName, 'pos_user', 'approved']
    );

    await conn.commit();
    console.log('Created Store 3 POS user.');
    console.log(`Username: ${username}`);
    console.log(`Password: ${plainPassword}`);
  } catch (err) {
    await conn.rollback();
    console.error('Failed to create Store 3 POS user:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit();
  }
}

run();
