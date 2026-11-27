const db = require('../config/database');

class Order {
  static async listByStoreOwner(storeOwnerId, { status, q, paymentMethod } = {}) {
    let sql = `SELECT o.*,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
      FROM orders o WHERE o.store_owner_id = ?`;
    const params = [storeOwnerId];
    if (status) {
      sql += ' AND o.status = ?';
      params.push(status);
    }
    if (paymentMethod) {
      sql += ' AND o.payment_method = ?';
      params.push(paymentMethod);
    }
    if (q) {
      sql += ' AND (o.id = ? OR EXISTS (SELECT 1 FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = o.id AND p.name LIKE ?))';
      params.push(Number(q) || 0, `%${q}%`);
    }
    sql += ' ORDER BY o.created_at DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  }

  static async getSalesAnalytics(storeOwnerId, { limitTop = 5 } = {}) {
    const [[ordersAgg]] = await db.query(
      `SELECT 
         (SELECT COUNT(*) FROM orders WHERE store_owner_id = ? AND status IN ('pending','on_the_way','delivered')) AS totalOrders,
         (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE store_owner_id = ? AND status = 'delivered') AS totalSales`,
      [storeOwnerId, storeOwnerId]
    );

    const [[statusAgg]] = await db.query(
      `SELECT 
         SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS countPending,
         SUM(CASE WHEN status='on_the_way' THEN 1 ELSE 0 END) AS countOnTheWay,
         SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS countDelivered,
         SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS countRejected,
         COALESCE(SUM(CASE WHEN status='delivered' THEN total_amount ELSE 0 END),0) AS revenueDelivered,
         COALESCE(AVG(CASE WHEN status='delivered' THEN total_amount END),0) AS aovDelivered
       FROM orders WHERE store_owner_id = ?`,
      [storeOwnerId]
    );

    const [[itemsSoldAgg]] = await db.query(
      `SELECT COALESCE(SUM(oi.quantity),0) AS itemsSold
       FROM order_items oi JOIN orders o ON oi.order_id = o.id
       WHERE o.store_owner_id = ? AND o.status = 'delivered'`,
      [storeOwnerId]
    );

    const [revenueByCategory] = await db.query(
      `SELECT IFNULL(p.category,'Uncategorized') AS category,
              COALESCE(SUM(oi.subtotal),0) AS revenue,
              COALESCE(SUM(oi.quantity),0) AS qty
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.store_owner_id = ? AND o.status = 'delivered'
       GROUP BY category
       ORDER BY revenue DESC`,
      [storeOwnerId]
    );

    const [dailyRevenue7] = await db.query(
      `SELECT DATE(o.created_at) AS day,
              COALESCE(SUM(o.total_amount),0) AS revenue,
              COUNT(*) AS orders
       FROM orders o
       WHERE o.store_owner_id = ? AND o.status = 'delivered' AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY day
       ORDER BY day ASC`,
      [storeOwnerId]
    );

    const [monthlyRevenue6] = await db.query(
      `SELECT DATE_FORMAT(o.created_at,'%Y-%m') AS month,
              COALESCE(SUM(o.total_amount),0) AS revenue,
              COUNT(*) AS orders
       FROM orders o
       WHERE o.store_owner_id = ? AND o.status = 'delivered' AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY month
       ORDER BY month ASC`,
      [storeOwnerId]
    );

    const [topProducts] = await db.query(
      `SELECT p.id, p.name, SUM(oi.quantity) AS soldQty, SUM(oi.subtotal) AS revenue
       FROM order_items oi 
       JOIN products p ON oi.product_id = p.id 
       JOIN orders o ON oi.order_id = o.id
      WHERE o.store_owner_id = ? AND o.status = 'delivered'
       GROUP BY p.id, p.name
       ORDER BY soldQty DESC
       LIMIT ?`,
      [storeOwnerId, limitTop]
    );

    return {
      ...ordersAgg,
      ...statusAgg,
      ...itemsSoldAgg,
      revenueByCategory,
      dailyRevenue7,
      monthlyRevenue6,
      topProducts
    };
  }
}

module.exports = Order;
