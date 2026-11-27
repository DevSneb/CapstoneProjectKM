const db = require('../config/database');

class CashTransaction {
  static tableReady = false;

  static async ensureTableExists(connection = db) {
    if (this.tableReady) return;

    await connection.query(
      `CREATE TABLE IF NOT EXISTS cash_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        store_id INT NOT NULL,
        \`date\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        type ENUM('Cash In', 'Cash Out') NOT NULL,
        reference VARCHAR(255) NOT NULL,
        description TEXT,
        amount DECIMAL(10,2) NOT NULL,
        CONSTRAINT fk_cash_transactions_store_owner
          FOREIGN KEY (store_id) REFERENCES store_owners(id) ON DELETE CASCADE
      )`
    );

    this.tableReady = true;
  }

  static async createTransaction(payload, connection = db) {
    await this.ensureTableExists(connection);

    const storeId = Number(payload.store_id);
    const type = String(payload.type || '').trim();
    const reference = String(payload.reference || '').trim();
    const description = payload.description ? String(payload.description).trim() : null;
    const amount = Number(payload.amount || 0);
    const hasDate = payload.date !== undefined && payload.date !== null && String(payload.date).trim() !== '';
    const txDate = hasDate ? new Date(payload.date) : null;

    if (!storeId || !reference || !['Cash In', 'Cash Out'].includes(type) || amount <= 0) {
      throw new Error('Invalid cash transaction payload');
    }

    if (hasDate && Number.isNaN(txDate.getTime())) {
      throw new Error('Invalid cash transaction date');
    }

    let result;
    if (hasDate) {
      [result] = await connection.query(
        `INSERT INTO cash_transactions (store_id, \`date\`, type, reference, description, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [storeId, txDate, type, reference, description, amount]
      );
    } else {
      [result] = await connection.query(
        `INSERT INTO cash_transactions (store_id, type, reference, description, amount)
         VALUES (?, ?, ?, ?, ?)`,
        [storeId, type, reference, description, amount]
      );
    }

    return result.insertId;
  }

  static async findOrderCashIn(storeId, orderId, connection = db) {
    await this.ensureTableExists(connection);

    const [rows] = await connection.query(
      `SELECT id
       FROM cash_transactions
       WHERE store_id = ?
         AND type = 'Cash In'
         AND CAST(reference AS UNSIGNED) = ?
       LIMIT 1`,
      [storeId, Number(orderId)]
    );

    return rows[0] || null;
  }

  static async createCashInForOrder(order, connection = db) {
    const storeId = Number(order?.store_id);
    const orderId = Number(order?.id);
    const totalAmount = Number(order?.total_amount || 0);

    if (!storeId || !orderId || totalAmount <= 0) {
      throw new Error('Invalid order payload for cash-in transaction');
    }

    const existing = await this.findOrderCashIn(storeId, orderId, connection);
    if (existing) return existing.id;

    return this.createTransaction(
      {
        store_id: storeId,
        type: 'Cash In',
        reference: String(orderId),
        description: 'Order Payment',
        amount: totalAmount,
        date: order?.date || order?.created_at
      },
      connection
    );
  }

  static async syncMissingCashInForDeliveredOrders(storeId, connection = db) {
    await this.ensureTableExists(connection);

    const normalizedStoreId = Number(storeId);
    if (!normalizedStoreId) return 0;

    const [rows] = await connection.query(
      `SELECT o.id, o.total_amount, o.created_at
       FROM orders o
       LEFT JOIN cash_transactions ct
         ON ct.store_id = o.store_owner_id
        AND ct.type = 'Cash In'
        AND CAST(ct.reference AS UNSIGNED) = o.id
       WHERE o.store_owner_id = ?
         AND o.status = 'delivered'
         AND ct.id IS NULL`,
      [normalizedStoreId]
    );

    let inserted = 0;
    for (const order of rows) {
      const amount = Number(order.total_amount || 0);
      if (amount <= 0) continue;

      await this.createCashInForOrder(
        {
          id: Number(order.id),
          store_id: normalizedStoreId,
          total_amount: amount,
          created_at: order.created_at
        },
        connection
      );
      inserted += 1;
    }

    return inserted;
  }

  static async getTotalCashInByStore(storeId) {
    await this.ensureTableExists();

    const [rows] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_cash_in
       FROM cash_transactions
       WHERE store_id = ? AND type = 'Cash In'`,
      [storeId]
    );

    return Number(rows[0]?.total_cash_in || 0);
  }

  static async getTotalCashOutByStore(storeId) {
    await this.ensureTableExists();

    const [rows] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_cash_out
       FROM cash_transactions
       WHERE store_id = ? AND type = 'Cash Out'`,
      [storeId]
    );

    return Number(rows[0]?.total_cash_out || 0);
  }

  static async getNetCashByStore(storeId) {
    await this.ensureTableExists();

    const [rows] = await db.query(
      `SELECT COALESCE(
          SUM(CASE WHEN type = 'Cash In' THEN amount ELSE -amount END),
          0
        ) AS net_cash
       FROM cash_transactions
       WHERE store_id = ?`,
      [storeId]
    );

    return Number(rows[0]?.net_cash || 0);
  }
}

module.exports = CashTransaction;
