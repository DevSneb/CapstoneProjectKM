require('dotenv').config();
const db = require('../config/database');

async function run() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`
      CREATE TABLE IF NOT EXISTS store3_savings_wallets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT NOT NULL UNIQUE,
        total_contributed DECIMAL(12,2) NOT NULL DEFAULT 0,
        current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_store3_wallet_customer
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS store3_savings_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        wallet_id INT NOT NULL,
        customer_id INT NOT NULL,
        order_id INT NOT NULL,
        store_id INT NOT NULL,
        purchase_amount DECIMAL(12,2) NOT NULL,
        reward_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
        reward_amount DECIMAL(12,2) NOT NULL,
        type ENUM('accrual') NOT NULL DEFAULT 'accrual',
        note VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_store3_savings_order UNIQUE (order_id),
        CONSTRAINT fk_store3_savings_wallet
          FOREIGN KEY (wallet_id) REFERENCES store3_savings_wallets(id) ON DELETE CASCADE,
        CONSTRAINT fk_store3_savings_customer
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        CONSTRAINT fk_store3_savings_order
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_store3_savings_store
          FOREIGN KEY (store_id) REFERENCES store_owners(id) ON DELETE CASCADE
      )
    `);

    await conn.commit();
    console.log('Store 3 savings rewards tables are ready.');
  } catch (err) {
    await conn.rollback();
    console.error('Failed to create Store 3 savings rewards tables:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit();
  }
}

run();
