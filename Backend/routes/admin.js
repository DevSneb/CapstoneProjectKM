const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const PosUser = require('../models/PosUser');
const Admin = require('../models/Admin');
const Notification = require('../models/Notification');

const router = express.Router();
const MANAGEABLE_FEATURES = ['products', 'orders', 'inventory', 'customers', 'reports', 'cashflow', 'cashflow2', 'forecasting', 'logistics', 'notifications', 'pos', 'rewards', 'maps'];

async function ensureAnnouncementsTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS admin_announcements (
      id INT PRIMARY KEY AUTO_INCREMENT,
      admin_id INT NOT NULL,
      target_scope ENUM('all','store') NOT NULL DEFAULT 'all',
      target_store_id INT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_admin_announcements_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_announcements_store FOREIGN KEY (target_store_id) REFERENCES store_owners(id) ON DELETE SET NULL
    )`
  );
}

async function ensureFeatureFlagsTables() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS global_feature_flags (
      feature_key VARCHAR(50) PRIMARY KEY,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );
  await db.query(
    `CREATE TABLE IF NOT EXISTS store_feature_flags (
      id INT PRIMARY KEY AUTO_INCREMENT,
      store_owner_id INT NOT NULL,
      feature_key VARCHAR(50) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_store_feature (store_owner_id, feature_key),
      CONSTRAINT fk_store_feature_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
    )`
  );
}

// All admin routes require admin auth
router.use(authMiddleware, isAdmin);

// 5.1 Home: Store Analytics (totals)
router.get('/dashboard/analytics', async (req, res) => {
  try {
    const [[stores]] = await db.query('SELECT COUNT(*) AS count FROM store_owners');
    const [[customers]] = await db.query('SELECT COUNT(*) AS count FROM customers');
    const [[orders]] = await db.query('SELECT COUNT(*) AS count FROM orders');
    const [[products]] = await db.query('SELECT COUNT(*) AS count FROM products');
    const [[sales]] = await db.query("SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE status = 'delivered'");
    res.json({
      stores: stores.count,
      customers: customers.count,
      orders: orders.count,
      products: products.count,
      sales_total: sales.total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load analytics' });
  }
});

// 5.1.1 Home: Detailed Analytics (delivered-only revenue basis)
router.get('/dashboard/analytics/detailed', async (req, res) => {
  try {
    const [[ordersAgg]] = await db.query(
      `SELECT 
         (SELECT COUNT(*) FROM orders WHERE status IN ('pending','on_the_way','delivered')) AS totalOrders,
         (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status = 'delivered') AS totalSales`
    );

    const [[statusAgg]] = await db.query(
      `SELECT 
         SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS countPending,
         SUM(CASE WHEN status='on_the_way' THEN 1 ELSE 0 END) AS countOnTheWay,
         SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS countDelivered,
         SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS countRejected,
         COALESCE(SUM(CASE WHEN status='delivered' THEN total_amount ELSE 0 END),0) AS revenueDelivered,
         COALESCE(AVG(CASE WHEN status='delivered' THEN total_amount END),0) AS aovDelivered
       FROM orders`
    );

    const [[itemsSoldAgg]] = await db.query(
      `SELECT COALESCE(SUM(oi.quantity),0) AS itemsSold
       FROM order_items oi JOIN orders o ON oi.order_id = o.id
       WHERE o.status = 'delivered'`
    );

    const [revenueByCategory] = await db.query(
      `SELECT CASE
                WHEN LOWER(TRIM(COALESCE(p.category,''))) IN ('lowland') THEN 'lowland'
                WHEN LOWER(TRIM(COALESCE(p.category,''))) IN ('highland') THEN 'highland'
                WHEN LOWER(TRIM(COALESCE(p.category,''))) IN ('fruit', 'fruits') THEN 'fruits'
                WHEN LOWER(TRIM(COALESCE(p.category,''))) IN ('rice') THEN 'rice'
                WHEN LOWER(TRIM(COALESCE(p.category,''))) IN ('egg', 'eggs', 'eggs pc', 'eggs (pc)') THEN 'eggs'
                WHEN LOWER(TRIM(COALESCE(p.category,''))) IN ('seafood') THEN 'seafood'
                WHEN LOWER(TRIM(COALESCE(p.category,''))) IN ('pork') THEN 'pork'
                WHEN LOWER(TRIM(COALESCE(p.category,''))) IN ('beef') THEN 'beef'
                WHEN LOWER(TRIM(COALESCE(p.category,''))) IN ('chicken') THEN 'chicken'
                ELSE 'other'
              END AS category,
              COALESCE(SUM(oi.subtotal),0) AS revenue,
              COALESCE(SUM(oi.quantity),0) AS qty
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.status = 'delivered'
       GROUP BY category
       ORDER BY revenue DESC`
    );

    const [dailyRevenue7] = await db.query(
      `SELECT DATE(o.created_at) AS day,
              COALESCE(SUM(o.total_amount),0) AS revenue,
              COUNT(*) AS orders
       FROM orders o
       WHERE o.status = 'delivered' AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY day
       ORDER BY day ASC`
    );

    const [monthlyRevenue6] = await db.query(
      `SELECT DATE_FORMAT(o.created_at,'%Y-%m') AS month,
              COALESCE(SUM(o.total_amount),0) AS revenue,
              COUNT(*) AS orders
       FROM orders o
       WHERE o.status = 'delivered' AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY month
       ORDER BY month ASC`
    );

    const [topProducts] = await db.query(
      `SELECT p.id, p.name, SUM(oi.quantity) AS soldQty, SUM(oi.subtotal) AS revenue
       FROM order_items oi 
       JOIN products p ON oi.product_id = p.id 
       JOIN orders o ON oi.order_id = o.id
       WHERE o.status = 'delivered'
       GROUP BY p.id, p.name
       ORDER BY soldQty DESC
       LIMIT 5`
    );

    res.json({
      ...ordersAgg,
      ...statusAgg,
      ...itemsSoldAgg,
      revenueByCategory,
      dailyRevenue7,
      monthlyRevenue6,
      topProducts
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load detailed analytics' });
  }
});

// Household: customer names & addresses + new vs repeated (by delivered purchases)
router.get('/household', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const [colRows] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME IN ('home_address','work_address')`
    );
    const colSet = new Set(colRows.map((r) => r.COLUMN_NAME));
    const homeExpr = colSet.has('home_address') ? `TRIM(IFNULL(c.home_address,''))` : `''`;
    const workExpr = colSet.has('work_address') ? `TRIM(IFNULL(c.work_address,''))` : `''`;

    let sql = `SELECT 
        c.id,
        c.full_name,
        c.email,
        COALESCE(TRIM(c.phone),'') AS phone,
        COALESCE(TRIM(IFNULL(c.address,'')),'') AS address,
        ${homeExpr} AS home_address,
        ${workExpr} AS work_address,
        COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) AS delivered_order_count,
        COUNT(DISTINCT o.id) AS total_order_count
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      WHERE 1 = 1`;
    const params = [];
    if (q) {
      sql += ` AND (
        c.full_name LIKE ?
        OR c.email LIKE ?
        OR COALESCE(c.phone,'') LIKE ?
        OR COALESCE(c.address,'') LIKE ?
        OR ${homeExpr} LIKE ?
        OR ${workExpr} LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }
    sql += `
      GROUP BY c.id, c.full_name, c.email, c.phone, c.address
      ${colSet.has('home_address') ? ', c.home_address' : ''}
      ${colSet.has('work_address') ? ', c.work_address' : ''}
      ORDER BY c.full_name ASC`;

    const [rows] = await db.query(sql, params);

    const enriched = rows.map((r) => {
      const parts = [];
      if (String(r.address || '').trim()) parts.push(String(r.address).trim());
      const h = String(r.home_address || '').trim();
      if (h) parts.push(`Home: ${h}`);
      const w = String(r.work_address || '').trim();
      if (w) parts.push(`Work: ${w}`);
      const display_address = parts.length ? parts.join(' · ') : '—';

      const n = Number(r.delivered_order_count || 0);
      let buyer_type = 'none';
      let buyer_label = 'No deliveries yet';
      if (n === 1) {
        buyer_type = 'new';
        buyer_label = 'New buyer';
      } else if (n >= 2) {
        buyer_type = 'repeated';
        buyer_label = 'Repeated buyer';
      }

      return {
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone || null,
        address: r.address,
        home_address: r.home_address,
        work_address: r.work_address,
        display_address,
        delivered_order_count: n,
        total_order_count: Number(r.total_order_count || 0),
        buyer_type,
        buyer_label
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load household listing' });
  }
});

// 5.2 Sales Reports: by date range
router.get('/reports/sales', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    let sql = "SELECT DATE(created_at) AS date, SUM(total_amount) AS total FROM orders WHERE status = 'delivered'";
    if (from) { sql += ' AND created_at >= ?'; params.push(from); }
    if (to) { sql += ' AND created_at <= ?'; params.push(to); }
    sql += ' GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load sales reports' });
  }
});

async function ensureMarketPriceColumn() {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'products'
       AND COLUMN_NAME = 'market_price'`
  );
  if (Number(row?.cnt || 0) > 0) return;
  try {
    await db.query('ALTER TABLE products ADD COLUMN market_price DECIMAL(10,2) NULL AFTER price');
  } catch (err) {
    if (!/Duplicate column name/i.test(String(err?.message || ''))) throw err;
  }
}

// 5.4.5 AMAD Market Prices: list products across all stores
router.get('/market-prices', async (req, res) => {
  try {
    await ensureMarketPriceColumn();
    const { storeOwnerId, category, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize || '20', 10)));
    const offset = (page - 1) * pageSize;
    let sql = `SELECT p.id, p.store_owner_id, so.store_name, p.name, p.category, p.unit,
                      p.price, p.market_price, p.status, p.updated_at
               FROM products p
               JOIN store_owners so ON so.id = p.store_owner_id
               WHERE 1=1`;
    const params = [];
    if (storeOwnerId) {
      sql += ' AND p.store_owner_id = ?';
      params.push(parseInt(storeOwnerId, 10));
    }
    if (category) {
      sql += ' AND p.category = ?';
      params.push(category);
    }
    if (q) {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const countSql = 'SELECT COUNT(*) AS cnt FROM (' + sql + ') AS t';
    sql += ' ORDER BY so.store_name ASC, p.name ASC LIMIT ? OFFSET ?';
    const [[{ cnt }]] = await db.query(countSql, params);
    const [rows] = await db.query(sql, [...params, pageSize, offset]);
    res.json({ rows, total: cnt, page, pageSize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load market prices' });
  }
});

// 5.4.6 AMAD Market Prices: set / clear market price for a product
router.put('/market-prices/:id', async (req, res) => {
  try {
    await ensureMarketPriceColumn();
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'Invalid product id' });

    let marketPrice = req.body?.market_price;
    if (marketPrice === '' || marketPrice === null || marketPrice === undefined) {
      marketPrice = null;
    } else {
      marketPrice = Number(marketPrice);
      if (!Number.isFinite(marketPrice) || marketPrice < 0) {
        return res.status(400).json({ message: 'Invalid market_price' });
      }
    }

    const [result] = await db.query(
      'UPDATE products SET market_price = ? WHERE id = ?',
      [marketPrice, id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Product not found' });

    const [rows] = await db.query(
      `SELECT p.id, p.store_owner_id, so.store_name, p.name, p.category, p.unit,
              p.price, p.market_price, p.status, p.updated_at
       FROM products p
       JOIN store_owners so ON so.id = p.store_owner_id
       WHERE p.id = ?`,
      [id]
    );
    res.json({ message: 'Market price updated', row: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update market price' });
  }
});

// 5.5 Price Monitoring: list products with pricing
router.get('/price-monitoring', async (req, res) => {
  try {
    const { storeOwnerId, category, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize || '20', 10)));
    const offset = (page - 1) * pageSize;
    let sql = `SELECT p.id, p.store_owner_id, so.store_name, p.name, p.category, p.price, p.cost, p.srp, p.updated_at, p.status
               FROM products p JOIN store_owners so ON so.id = p.store_owner_id WHERE 1=1`;
    const params = [];
    if (storeOwnerId) { sql += ' AND p.store_owner_id = ?'; params.push(parseInt(storeOwnerId,10)); }
    if (category) { sql += ' AND p.category = ?'; params.push(category); }
    if (q) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const countSql = 'SELECT COUNT(*) AS cnt FROM (' + sql + ') AS t';
    sql += ' ORDER BY so.store_name ASC, p.name ASC LIMIT ? OFFSET ?';
    const [[{ cnt }]] = await db.query(countSql, params);
    const [rows] = await db.query(sql, [...params, pageSize, offset]);
    res.json({ rows, total: cnt, page, pageSize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load price monitoring' });
  }
});

// 5.5.1 Price Monitoring: inline update pricing fields
router.put('/price-monitoring/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'Invalid product id' });

    const body = req.body || {};
    const updates = [];
    const params = [];

    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Invalid price' });
      updates.push('price = ?');
      params.push(price);
    }
    if (body.cost !== undefined) {
      const cost = Number(body.cost);
      if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ message: 'Invalid cost' });
      updates.push('cost = ?');
      params.push(cost);
    }
    if (body.srp !== undefined) {
      const srp = Number(body.srp);
      if (!Number.isFinite(srp) || srp < 0) return res.status(400).json({ message: 'Invalid srp' });
      updates.push('srp = ?');
      params.push(srp);
    }
    if (body.status !== undefined) {
      if (!['active','inactive'].includes(body.status)) return res.status(400).json({ message: 'Invalid status' });
      updates.push('status = ?');
      params.push(body.status);
    }

    if (!updates.length) return res.status(400).json({ message: 'No updates provided' });

    const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);
    const [result] = await db.query(sql, params);
    if (!result.affectedRows) return res.status(404).json({ message: 'Product not found' });

    const [rows] = await db.query(
      `SELECT p.id, p.store_owner_id, so.store_name, p.name, p.category, p.price, p.cost, p.srp, p.updated_at, p.status
       FROM products p JOIN store_owners so ON so.id = p.store_owner_id
       WHERE p.id = ?`,
      [id]
    );
    res.json({ message: 'Price updated', row: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update price data' });
  }
});

// 5.2.1 Submitted Reports from Store Owners
router.get('/reports/submissions', async (req, res) => {
  try {
    // Keep listing resilient if migration columns are missing
    try {
      const [[sourceCol]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_reports' AND COLUMN_NAME = 'report_source'`
      );
      if (Number(sourceCol?.cnt || 0) === 0) {
        await db.query(
          `ALTER TABLE admin_reports
           ADD COLUMN report_source VARCHAR(32) NOT NULL DEFAULT 'kadiwa' AFTER total_revenue`
        );
      }
      const [[notesCol]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_reports' AND COLUMN_NAME = 'notes'`
      );
      if (Number(notesCol?.cnt || 0) === 0) {
        await db.query(
          `ALTER TABLE admin_reports ADD COLUMN notes TEXT NULL AFTER report_file_path`
        );
      }
    } catch (migrateErr) {
      if (!/Duplicate column name/i.test(String(migrateErr?.message || ''))) {
        console.warn('admin_reports migration warning:', migrateErr.message || migrateErr);
      }
    }

    const { storeOwnerId, period, source } = req.query;
    const params = [];
    let sql = `SELECT ar.*, so.store_name
               FROM admin_reports ar JOIN store_owners so ON so.id = ar.store_owner_id`;
    const where = [];
    if (storeOwnerId) { where.push('ar.store_owner_id = ?'); params.push(parseInt(storeOwnerId,10)); }
    if (period) { where.push('ar.period_type = ?'); params.push(period); }
    if (source) { where.push('ar.report_source = ?'); params.push(source); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY ar.created_at DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load submitted reports' });
  }
});

// 5.2.2 Download submitted report file
router.get('/reports/submissions/:id/file', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'Invalid submission id' });

    const [[row]] = await db.query(
      'SELECT id, report_file_name, report_file_path FROM admin_reports WHERE id = ?',
      [id]
    );
    if (!row) return res.status(404).json({ message: 'Submission not found' });
    if (!row.report_file_path) return res.status(404).json({ message: 'No file attached to this submission' });

    const absolutePath = require('path').resolve(__dirname, '..', row.report_file_path);
    if (!require('fs').existsSync(absolutePath)) {
      return res.status(404).json({ message: 'Report file not found on server' });
    }

    const ext = require('path').extname(row.report_file_name || '').toLowerCase();
    const contentType = ext === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const fallbackName = ext === '.pdf' ? `submission_${id}.pdf` : `submission_${id}.xlsx`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${row.report_file_name || fallbackName}"`);
    return res.sendFile(absolutePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to download report file' });
  }
});

// 5.3 Stores: Managing Stores
router.get('/stores', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, username, email, full_name, store_name, phone, address, status, created_at FROM store_owners ORDER BY store_name ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to list stores' });
  }
});

router.get('/stores/:id/pos-users', async (req, res) => {
  try {
    const storeId = parseInt(req.params.id, 10);
    if (!storeId) return res.status(400).json({ message: 'Invalid store id' });
    await PosUser.ensureTableExists();
    const [rows] = await db.query(
      `SELECT id, store_owner_id, username, email, full_name, status, created_at
       FROM pos_users
       WHERE store_owner_id = ?
       ORDER BY created_at DESC`,
      [storeId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load POS users' });
  }
});

router.post('/stores/:id/pos-users', async (req, res) => {
  try {
    const storeId = parseInt(req.params.id, 10);
    if (!storeId) return res.status(400).json({ message: 'Invalid store id' });
    await PosUser.ensureTableExists();

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return res.status(400).json({ message: 'Valid email is required' });
    if (!password || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const [[store]] = await db.query('SELECT id FROM store_owners WHERE id = ?', [storeId]);
    if (!store) return res.status(404).json({ message: 'Store not found' });

    const username = email;
    const fullName = String(req.body.full_name || '').trim() || email.split('@')[0];

    const [existingE] = await db.query(
      'SELECT id FROM pos_users WHERE email = ? OR username = ? LIMIT 1',
      [email, username]
    );
    if (existingE.length) return res.status(400).json({ message: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO pos_users (store_owner_id, username, email, \`password\`, full_name, role, status)
       VALUES (?, ?, ?, ?, ?, 'pos_user', 'approved')`,
      [storeId, username, email, hashed, fullName]
    );
    res.status(201).json({ id: result.insertId, email, message: 'POS user created', login_url: '/pos/login' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create POS user' });
  }
});

router.put('/stores/:storeId/pos-users/:posUserId/status', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId, 10);
    const posUserId = parseInt(req.params.posUserId, 10);
    const status = String(req.body.status || '').trim().toLowerCase();
    if (!storeId || !posUserId) return res.status(400).json({ message: 'Invalid ids' });
    if (!['approved', 'disabled'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    await PosUser.ensureTableExists();
    const [result] = await db.query(
      'UPDATE pos_users SET status = ? WHERE id = ? AND store_owner_id = ?',
      [status, posUserId, storeId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'POS user not found for this store' });
    res.json({ message: 'POS user status updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update POS user status' });
  }
});

router.put('/stores/:id/status', async (req, res) => {
  try {
    const { status } = req.body; // pending | approved | rejected
    if (!['pending','approved','rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const [result] = await db.query('UPDATE store_owners SET status = ? WHERE id = ?', [status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Store not found' });
    res.json({ message: 'Status updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update store status' });
  }
});

// 5.4 Account Settings: Admin profile basics
router.get('/account/me', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, username, email, full_name, role FROM admins WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'Admin not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load admin account' });
  }
});

router.put('/account/email', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('current_password').notEmpty().withMessage('Current password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const email = String(req.body.email || '').trim();
    const full = await Admin.findWithPasswordById(req.user.id);
    if (!full) return res.status(404).json({ message: 'Admin not found' });

    const okCurrent = await Admin.comparePassword(req.body.current_password, full.password);
    if (!okCurrent) return res.status(400).json({ message: 'Current password incorrect' });

    if (email.toLowerCase() === String(full.email || '').toLowerCase()) {
      return res.status(400).json({ message: 'New email is the same as current email' });
    }

    const existing = await Admin.findByEmail(email);
    if (existing && existing.id !== req.user.id) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    await Admin.updateEmail(req.user.id, email);
    const user = await Admin.findById(req.user.id);
    res.json({ message: 'Email updated', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update email' });
  }
});

router.put('/account/password', [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const full = await Admin.findWithPasswordById(req.user.id);
    if (!full) return res.status(404).json({ message: 'Admin not found' });

    const okCurrent = await Admin.comparePassword(req.body.current_password, full.password);
    if (!okCurrent) return res.status(400).json({ message: 'Current password incorrect' });

    await Admin.updatePassword(req.user.id, req.body.new_password);
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update password' });
  }
});

router.get('/announcements', async (req, res) => {
  try {
    await ensureAnnouncementsTable();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));

    const [rows] = await db.query(
      `SELECT aa.id, aa.title, aa.message, aa.target_scope, aa.target_store_id,
              so.store_name AS target_store_name, aa.created_at,
              a.full_name AS admin_name
       FROM admin_announcements aa
       LEFT JOIN store_owners so ON so.id = aa.target_store_id
       LEFT JOIN admins a ON a.id = aa.admin_id
       ORDER BY aa.id DESC
       LIMIT ?`,
      [limit]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load announcements' });
  }
});

router.post('/announcements', async (req, res) => {
  const title = String(req.body.title || '').trim();
  const message = String(req.body.message || '').trim();
  const targetScope = String(req.body.target_scope || 'all').trim().toLowerCase();
  const targetStoreId = req.body.target_store_id !== undefined && req.body.target_store_id !== null
    ? Number(req.body.target_store_id)
    : null;

  if (!title) return res.status(400).json({ message: 'title is required' });
  if (!message) return res.status(400).json({ message: 'message is required' });
  if (!['all', 'store'].includes(targetScope)) {
    return res.status(400).json({ message: 'target_scope must be all or store' });
  }
  if (targetScope === 'store' && (!targetStoreId || targetStoreId <= 0)) {
    return res.status(400).json({ message: 'target_store_id is required for specific store announcement' });
  }

  const conn = await db.getConnection();
  try {
    await ensureAnnouncementsTable();
    await Notification.ensureTables();
    await conn.beginTransaction();

    let storeIds = [];
    if (targetScope === 'all') {
      const [stores] = await conn.query('SELECT id FROM store_owners ORDER BY id ASC');
      storeIds = stores.map(s => Number(s.id));
    } else {
      const [[store]] = await conn.query('SELECT id FROM store_owners WHERE id = ?', [targetStoreId]);
      if (!store) {
        await conn.rollback();
        return res.status(404).json({ message: 'Target store not found' });
      }
      storeIds = [Number(store.id)];
    }

    if (!storeIds.length) {
      await conn.rollback();
      return res.status(400).json({ message: 'No target stores available for announcement' });
    }

    const [announcementResult] = await conn.query(
      `INSERT INTO admin_announcements (admin_id, target_scope, target_store_id, title, message)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, targetScope, targetScope === 'store' ? targetStoreId : null, title, message]
    );

    const notificationMessage = `[Announcement] ${title}: ${message}`;
    const valuesSql = storeIds.map(() => '(?, ?, ?, 0)').join(', ');
    const values = [];
    for (const sid of storeIds) {
      values.push(sid, 'announcement', notificationMessage);
    }

    await conn.query(
      `INSERT INTO notifications (store_owner_id, type, message, is_read)
       VALUES ${valuesSql}`,
      values
    );

    await conn.commit();
    try {
      await Notification.emailStoreOwners(storeIds, {
        subject: `DA announcement: ${title}`,
        message
      });
    } catch (emailErr) {
      console.error('Announcement email notification failed:', emailErr.message || emailErr);
    }
    return res.status(201).json({
      message: 'Announcement published',
      id: announcementResult.insertId,
      target_scope: targetScope,
      target_store_count: storeIds.length
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to publish announcement' });
  } finally {
    conn.release();
  }
});

router.get('/features/config', async (req, res) => {
  try {
    await ensureFeatureFlagsTables();
    const [stores] = await db.query('SELECT id, store_name, status FROM store_owners ORDER BY store_name ASC');
    const [globalFlags] = await db.query('SELECT feature_key, enabled FROM global_feature_flags');
    const [storeFlags] = await db.query('SELECT store_owner_id, feature_key, enabled FROM store_feature_flags');
    res.json({
      features: MANAGEABLE_FEATURES,
      stores,
      global_flags: globalFlags,
      store_flags: storeFlags
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load feature configuration' });
  }
});

router.put('/features/global', async (req, res) => {
  try {
    await ensureFeatureFlagsTables();
    const featureKey = String(req.body.feature_key || '').trim();
    const enabled = req.body.enabled === true ? 1 : 0;
    if (!MANAGEABLE_FEATURES.includes(featureKey)) {
      return res.status(400).json({ message: 'Invalid feature_key' });
    }
    await db.query(
      `INSERT INTO global_feature_flags (feature_key, enabled)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
      [featureKey, enabled]
    );
    res.json({ message: 'Global feature updated', feature_key: featureKey, enabled: enabled === 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update global feature' });
  }
});

router.put('/features/store/:storeId', async (req, res) => {
  try {
    await ensureFeatureFlagsTables();
    const storeId = parseInt(req.params.storeId, 10);
    if (!storeId) return res.status(400).json({ message: 'Invalid storeId' });
    const featureKey = String(req.body.feature_key || '').trim();
    const enabled = req.body.enabled === true ? 1 : 0;
    if (!MANAGEABLE_FEATURES.includes(featureKey)) {
      return res.status(400).json({ message: 'Invalid feature_key' });
    }
    await db.query(
      `INSERT INTO store_feature_flags (store_owner_id, feature_key, enabled)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
      [storeId, featureKey, enabled]
    );
    res.json({ message: 'Store feature updated', store_id: storeId, feature_key: featureKey, enabled: enabled === 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update store feature' });
  }
});

// One-shot: clear test orders/reports; keep stores + products
router.post('/maintenance/clear-test-data', async (req, res) => {
  if (String(req.body?.confirm || '') !== 'CLEAR_TEST_DATA') {
    return res.status(400).json({
      message: 'Send { "confirm": "CLEAR_TEST_DATA" } to run cleanup'
    });
  }

  const connection = await db.getConnection();
  const results = {};
  const tables = [
    'order_items',
    'shipments',
    'store3_savings_transactions',
    'reward_points_transactions',
    'orders',
    'admin_reports',
    'cash_transactions',
    'notifications',
    'customer_notifications',
    'admin_announcements',
    'data_integrity_blocks',
    'data_integrity_records',
    'customer_password_reset_otps',
    'customer_registration_otps'
  ];

  try {
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const t of tables) {
      try {
        const [[before]] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${t}\``);
        await connection.query(`DELETE FROM \`${t}\``);
        results[t] = Number(before.cnt || 0);
      } catch (err) {
        if (/doesn't exist/i.test(String(err.message || ''))) results[t] = 'missing';
        else throw err;
      }
    }

    try {
      await connection.query(
        `UPDATE reward_points_wallets
         SET balance = 0, lifetime_earned = 0, lifetime_redeemed = 0`
      );
      results.reward_points_wallets = 'reset';
    } catch (_) {
      results.reward_points_wallets = 'missing';
    }
    try {
      await connection.query(
        `UPDATE store3_savings_wallets
         SET total_contributed = 0, current_balance = 0`
      );
      results.store3_savings_wallets = 'reset';
    } catch (_) {
      results.store3_savings_wallets = 'missing';
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();

    const [[stores]] = await db.query('SELECT COUNT(*) AS cnt FROM store_owners');
    const [[products]] = await db.query('SELECT COUNT(*) AS cnt FROM products');
    const [[orders]] = await db.query('SELECT COUNT(*) AS cnt FROM orders');
    const [[reports]] = await db.query('SELECT COUNT(*) AS cnt FROM admin_reports');

    res.json({
      message: 'Test orders/reports cleared. Stores and products kept.',
      deleted: results,
      remaining: {
        stores: stores.cnt,
        products: products.cnt,
        orders: orders.cnt,
        admin_reports: reports.cnt
      }
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {
      /* ignore */
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to clear test data', error: err.message });
  } finally {
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (_) {
      /* ignore */
    }
    connection.release();
  }
});

module.exports = router;