const db = require('../config/database');

class Shipment {
  static async listByStoreOwner(storeOwnerId) {
    const [rows] = await db.query(
      `SELECT s.*, o.status as order_status, o.total_amount
       FROM shipments s
       JOIN orders o ON s.order_id = o.id
       WHERE s.store_owner_id = ?
       ORDER BY s.updated_at DESC`,
      [storeOwnerId]
    );
    return rows;
  }

  static async update(storeOwnerId, id, data) {
    const [result] = await db.query(
      'UPDATE shipments SET carrier = ?, tracking_number = ?, status = ? WHERE id = ? AND store_owner_id = ?',
      [data.carrier || null, data.tracking_number || null, data.status || 'preparing', id, storeOwnerId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = Shipment;
