require('dotenv').config();
const db = require('../config/database');

async function run() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`
      CREATE TABLE IF NOT EXISTS cash_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        store_id INT NOT NULL,
        \`date\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        type ENUM('Cash In', 'Cash Out') NOT NULL,
        reference VARCHAR(255) NOT NULL,
        description TEXT,
        amount DECIMAL(10,2) NOT NULL,
        CONSTRAINT fk_cash_transactions_store_owner
          FOREIGN KEY (store_id) REFERENCES store_owners(id) ON DELETE CASCADE
      )
    `);

    await conn.commit();
    console.log('cash_transactions table is ready.');
  } catch (err) {
    await conn.rollback();
    console.error('Failed to create cash_transactions table:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit();
  }
}

run();
