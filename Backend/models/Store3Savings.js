const db = require('../config/database');

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

class Store3Savings {
  static tablesReady = false;

  static async ensureTables(connection = db) {
    if (this.tablesReady) return;

    await connection.query(
      `CREATE TABLE IF NOT EXISTS store3_savings_wallets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT NOT NULL UNIQUE,
        total_contributed DECIMAL(12,2) NOT NULL DEFAULT 0,
        current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_store3_wallet_customer
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS store3_savings_transactions (
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
      )`
    );

    this.tablesReady = true;
  }

  static async ensureWallet(customerId, connection = db) {
    await this.ensureTables(connection);

    await connection.query(
      `INSERT INTO store3_savings_wallets (customer_id)
       VALUES (?)
       ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id)`,
      [customerId]
    );

    const [[wallet]] = await connection.query(
      `SELECT id, customer_id, total_contributed, current_balance, created_at, updated_at
       FROM store3_savings_wallets
       WHERE customer_id = ?
       LIMIT 1`,
      [customerId]
    );

    return wallet || null;
  }

  static async creditForDeliveredOrder(order, connection = db) {
    const storeId = Number(order?.store_id);
    const customerId = Number(order?.customer_id || 0);
    const orderId = Number(order?.id);
    const purchaseAmount = roundMoney(order?.total_amount);

    if (storeId !== 3 || !customerId || !orderId || purchaseAmount <= 0) {
      return { credited: false, reason: 'not_eligible' };
    }

    const rewardRate = 0.05;
    const rewardAmount = roundMoney(purchaseAmount * rewardRate);
    if (rewardAmount <= 0) {
      return { credited: false, reason: 'zero_reward' };
    }

    await this.ensureTables(connection);
    const wallet = await this.ensureWallet(customerId, connection);

    try {
      await connection.query(
        `INSERT INTO store3_savings_transactions
          (wallet_id, customer_id, order_id, store_id, purchase_amount, reward_rate, reward_amount, type, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'accrual', ?)`,
        [
          wallet.id,
          customerId,
          orderId,
          storeId,
          purchaseAmount,
          rewardRate,
          rewardAmount,
          '5% of Store 3 delivered purchase added to savings wallet'
        ]
      );
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') {
        return { credited: false, reason: 'already_credited' };
      }
      throw err;
    }

    await connection.query(
      `UPDATE store3_savings_wallets
       SET total_contributed = total_contributed + ?,
           current_balance = current_balance + ?
       WHERE id = ?`,
      [rewardAmount, rewardAmount, wallet.id]
    );

    return { credited: true, reward_amount: rewardAmount };
  }

  static async getWalletByCustomer(customerId, connection = db) {
    const numericCustomerId = Number(customerId || 0);
    if (!numericCustomerId) {
      return {
        customer_id: 0,
        total_contributed: 0,
        current_balance: 0
      };
    }

    await this.ensureTables(connection);
    const wallet = await this.ensureWallet(numericCustomerId, connection);
    if (!wallet) {
      return {
        customer_id: numericCustomerId,
        total_contributed: 0,
        current_balance: 0
      };
    }

    return {
      customer_id: Number(wallet.customer_id),
      total_contributed: Number(wallet.total_contributed || 0),
      current_balance: Number(wallet.current_balance || 0),
      created_at: wallet.created_at,
      updated_at: wallet.updated_at
    };
  }

  static async listTransactionsByCustomer(customerId, limit = 20, connection = db) {
    const numericCustomerId = Number(customerId || 0);
    if (!numericCustomerId) return [];

    await this.ensureTables(connection);

    const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
    const [rows] = await connection.query(
      `SELECT id, order_id, store_id, purchase_amount, reward_rate, reward_amount, type, note, created_at
       FROM store3_savings_transactions
       WHERE customer_id = ?
       ORDER BY id DESC
       LIMIT ?`,
      [numericCustomerId, safeLimit]
    );

    return rows.map(row => ({
      id: Number(row.id),
      order_id: Number(row.order_id),
      store_id: Number(row.store_id),
      purchase_amount: Number(row.purchase_amount || 0),
      reward_rate: Number(row.reward_rate || 0),
      reward_amount: Number(row.reward_amount || 0),
      type: row.type,
      note: row.note,
      created_at: row.created_at
    }));
  }
}

module.exports = Store3Savings;
