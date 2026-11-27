const db = require('../config/database');
const { sendNotificationEmail } = require('../services/emailService');

class Notification {
  static tablesReady = false;

  static get lowStockThreshold() {
    return Math.max(0, Number(process.env.LOW_STOCK_THRESHOLD || 10));
  }

  static async ensureTables(connection = db) {
    if (this.tablesReady) return;
    await connection.query(
      `CREATE TABLE IF NOT EXISTS notifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        store_owner_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notifications_store_owner
          FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
      )`
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS customer_notifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_customer_notifications_customer
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )`
    );
    this.tablesReady = true;
  }

  static async listByStoreOwner(storeOwnerId, limit = 20) {
    await this.ensureTables();
    const [rows] = await db.query(
      'SELECT * FROM notifications WHERE store_owner_id = ? ORDER BY created_at DESC LIMIT ?',
      [storeOwnerId, Math.min(100, Math.max(1, Number(limit) || 20))]
    );
    return rows;
  }

  static async listByCustomer(customerId, limit = 30) {
    await this.ensureTables();
    const [rows] = await db.query(
      'SELECT * FROM customer_notifications WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?',
      [customerId, Math.min(100, Math.max(1, Number(limit) || 30))]
    );
    return rows;
  }

  static async unreadCountForStoreOwner(storeOwnerId) {
    await this.ensureTables();
    const [[row]] = await db.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE store_owner_id = ? AND is_read = 0',
      [storeOwnerId]
    );
    return Number(row?.count || 0);
  }

  static async unreadCountForCustomer(customerId) {
    await this.ensureTables();
    const [[row]] = await db.query(
      'SELECT COUNT(*) AS count FROM customer_notifications WHERE customer_id = ? AND is_read = 0',
      [customerId]
    );
    return Number(row?.count || 0);
  }

  static async create(storeOwnerId, { type, message }, connection = db) {
    await this.ensureTables(connection);
    const [result] = await connection.query(
      'INSERT INTO notifications (store_owner_id, type, message) VALUES (?, ?, ?)',
      [storeOwnerId, type, message]
    );
    return result.insertId;
  }

  static async createForCustomer(customerId, { type, message }, connection = db) {
    await this.ensureTables(connection);
    const [result] = await connection.query(
      'INSERT INTO customer_notifications (customer_id, type, message) VALUES (?, ?, ?)',
      [customerId, type, message]
    );
    return result.insertId;
  }

  static async markRead(storeOwnerId, id) {
    await this.ensureTables();
    const [result] = await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND store_owner_id = ?',
      [id, storeOwnerId]
    );
    return result.affectedRows > 0;
  }

  static async markCustomerRead(customerId, id) {
    await this.ensureTables();
    const [result] = await db.query(
      'UPDATE customer_notifications SET is_read = 1 WHERE id = ? AND customer_id = ?',
      [id, customerId]
    );
    return result.affectedRows > 0;
  }

  static async markAllStoreRead(storeOwnerId) {
    await this.ensureTables();
    await db.query('UPDATE notifications SET is_read = 1 WHERE store_owner_id = ?', [storeOwnerId]);
  }

  static async markAllCustomerRead(customerId) {
    await this.ensureTables();
    await db.query('UPDATE customer_notifications SET is_read = 1 WHERE customer_id = ?', [customerId]);
  }

  static queueEmail(payload) {
    setImmediate(() => {
      sendNotificationEmail(payload).catch(err => {
        console.error('[Notification] Email delivery failed:', err.message || err);
      });
    });
  }

  static async notifyStoreOwner(storeOwnerId, { type, message, subject }) {
    const id = await this.create(storeOwnerId, { type, message });
    const [[store]] = await db.query(
      'SELECT email, full_name, store_name FROM store_owners WHERE id = ? LIMIT 1',
      [storeOwnerId]
    );
    if (store?.email) {
      this.queueEmail({
        to: store.email,
        recipientName: store.full_name || store.store_name,
        subject: subject || 'Kadiwa Mart store notification',
        message,
        actionUrl: `${String(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/store-owner/dashboard/notifications`
      });
    }
    return id;
  }

  static async notifyCustomer(customerId, { type, message, subject }) {
    if (!customerId) return null;
    const id = await this.createForCustomer(customerId, { type, message });
    const [[customer]] = await db.query(
      'SELECT email, full_name FROM customers WHERE id = ? LIMIT 1',
      [customerId]
    );
    if (customer?.email) {
      this.queueEmail({
        to: customer.email,
        recipientName: customer.full_name,
        subject: subject || 'Kadiwa Mart order update',
        message,
        actionUrl: `${String(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/customer/dashboard/notifications`
      });
    }
    return id;
  }

  static async emailStoreOwners(storeOwnerIds, { subject, message }) {
    const ids = [...new Set((storeOwnerIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    const [stores] = await db.query(
      `SELECT email, full_name, store_name FROM store_owners WHERE id IN (${placeholders})`,
      ids
    );
    for (const store of stores) {
      if (!store.email) continue;
      this.queueEmail({
        to: store.email,
        recipientName: store.full_name || store.store_name,
        subject,
        message,
        actionUrl: `${String(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/store-owner/dashboard/notifications`
      });
    }
  }
}

module.exports = Notification;
