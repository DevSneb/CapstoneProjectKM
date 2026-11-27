const express = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware, isPosUser } = require('../middleware/auth');
const db = require('../config/database');
const CashTransaction = require('../models/CashTransaction');
const Notification = require('../models/Notification');

const router = express.Router();

router.use(authMiddleware, isPosUser);
router.use(async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT pu.id, pu.status, so.status AS store_status
       FROM pos_users pu
       JOIN store_owners so ON so.id = pu.store_owner_id
       WHERE pu.id = ? AND pu.store_owner_id = ?
       LIMIT 1`,
      [Number(req.user.id), Number(req.user.store_owner_id)]
    );
    if (!rows.length) return res.status(403).json({ message: 'POS user is not assigned to this store.' });
    if (rows[0].status !== 'approved') return res.status(403).json({ message: 'POS user is disabled.' });
    if (rows[0].store_status !== 'approved') return res.status(403).json({ message: 'Store is not approved.' });
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to verify POS account.' });
  }
});

async function ensurePosEnabled(req, res) {
  try {
    const storeOwnerId = Number(req.user.store_owner_id);
    const [globalRows] = await db.query(
      'SELECT enabled FROM global_feature_flags WHERE feature_key = ? LIMIT 1',
      ['pos']
    );
    const [storeRows] = await db.query(
      'SELECT enabled FROM store_feature_flags WHERE store_owner_id = ? AND feature_key = ? LIMIT 1',
      [storeOwnerId, 'pos']
    );
    const globalEnabled = globalRows.length ? Number(globalRows[0].enabled) === 1 : true;
    const effectiveEnabled = storeRows.length ? Number(storeRows[0].enabled) === 1 : globalEnabled;
    if (!effectiveEnabled) {
      res.status(403).json({ message: 'POS is disabled for this store.' });
      return false;
    }
    return true;
  } catch (_) {
    // Feature tables may not exist yet; default to enabled.
    return true;
  }
}

router.get('/products', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    const q = String(req.query.q || '').trim();
    const limit = 20;
    let sql = `SELECT id, name, price, stock, status, category, image_url, updated_at
               FROM products
               WHERE store_owner_id = ? AND status = 'active'`;
    const params = [req.user.store_owner_id];
    if (q) {
      sql += ' AND (name LIKE ? OR category LIKE ? OR description LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY stock DESC, name ASC LIMIT ?';
    params.push(limit);
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load POS products' });
  }
});

router.post('/products', [
  body('name').notEmpty(),
  body('price').isFloat({ gt: 0 }),
  body('stock').isInt({ min: 0 })
], async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const [result] = await db.query(
      `INSERT INTO products (store_owner_id, name, description, price, stock, status, unit, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.store_owner_id,
        req.body.name,
        req.body.description || req.body.name,
        Number(req.body.price),
        Number(req.body.stock),
        'active',
        req.body.unit || 'pc',
        req.body.category || 'General'
      ]
    );

    if (Number(req.body.stock || 0) <= Notification.lowStockThreshold) {
      try {
        await Notification.notifyStoreOwner(req.user.store_owner_id, {
          type: 'stock',
          subject: 'Low stock alert',
          message: `${req.body.name} was added through POS with only ${Number(req.body.stock || 0)} item(s) in stock.`
        });
      } catch (notificationErr) {
        console.error('POS stock notification failed:', notificationErr.message || notificationErr);
      }
    }

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create product' });
  }
});

router.get('/sales', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const [rows] = await db.query(
      `SELECT o.id, o.total_amount, o.payment_method, o.created_at,
              (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
       FROM orders o
       WHERE o.store_owner_id = ?
         AND o.customer_id IS NULL
         AND o.shipping_method = 'pickup'
       ORDER BY o.id DESC
       LIMIT ?`,
      [req.user.store_owner_id, limit]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load POS sales' });
  }
});

router.get('/sales/:id', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    const saleId = parseInt(req.params.id, 10);
    if (!saleId) return res.status(400).json({ message: 'Invalid sale id' });

    const [[order]] = await db.query(
      `SELECT o.id, o.store_owner_id, o.total_amount, o.payment_method, o.shipping_method,
              o.delivery_fee, o.status, o.created_at
       FROM orders o
       WHERE o.id = ?
         AND o.store_owner_id = ?
         AND o.customer_id IS NULL
         AND o.shipping_method = 'pickup'`,
      [saleId, req.user.store_owner_id]
    );

    if (!order) return res.status(404).json({ message: 'POS sale not found' });

    const [items] = await db.query(
      `SELECT oi.id, oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price, oi.subtotal
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [saleId]
    );

    const subtotalAmount = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const totalAmount = Number(order.total_amount || 0);
    const discountAmount = Math.max(0, Number((subtotalAmount - totalAmount).toFixed(2)));

    res.json({
      order: {
        id: order.id,
        payment_method: order.payment_method,
        shipping_method: order.shipping_method,
        delivery_fee: Number(order.delivery_fee || 0),
        status: order.status,
        created_at: order.created_at,
        subtotal_amount: Number(subtotalAmount.toFixed(2)),
        discount_amount: discountAmount,
        total_amount: totalAmount
      },
      items: items.map(item => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        subtotal: Number(item.subtotal || 0)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load POS sale details' });
  }
});

router.post('/checkout', [
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('payment_method').optional().isIn(['cash', 'cod', 'gcash']).withMessage('Invalid payment method'),
  body('discount_amount').optional().isFloat({ min: 0 }).withMessage('discount_amount must be >= 0'),
  body('cash_received').optional().isFloat({ min: 0 }).withMessage('cash_received must be >= 0'),
  body('notes').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 500 })
], async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;

  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const paymentMethodRaw = String(req.body.payment_method || 'cash').toLowerCase();
  const paymentMethod = paymentMethodRaw === 'gcash' ? 'gcash' : 'cod';
  const discountAmount = Math.max(0, Number(req.body.discount_amount || 0));
  const cashReceived = Math.max(0, Number(req.body.cash_received || 0));
  const notes = req.body.notes || null;

  const normalized = [];
  for (const rawItem of items) {
    const productId = Number(rawItem?.product_id);
    const quantity = Number(rawItem?.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'Each item must contain valid product_id and quantity' });
    }
    normalized.push({ productId, quantity });
  }

  const aggregatedMap = new Map();
  for (const item of normalized) {
    const current = aggregatedMap.get(item.productId) || 0;
    aggregatedMap.set(item.productId, current + item.quantity);
  }
  const aggregatedItems = Array.from(aggregatedMap.entries()).map(([productId, quantity]) => ({ productId, quantity }));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const productIds = aggregatedItems.map(x => x.productId);
    const placeholders = productIds.map(() => '?').join(',');
    const [products] = await conn.query(
      `SELECT id, name, price, stock, status
       FROM products
       WHERE store_owner_id = ? AND id IN (${placeholders})
       FOR UPDATE`,
      [req.user.store_owner_id, ...productIds]
    );

    if (products.length !== aggregatedItems.length) {
      await conn.rollback();
      return res.status(400).json({ message: 'One or more products are invalid for this store' });
    }

    const productById = new Map(products.map(p => [Number(p.id), p]));
    let subtotalAmount = 0;
    const lineItems = [];

    for (const entry of aggregatedItems) {
      const p = productById.get(entry.productId);
      if (!p) {
        await conn.rollback();
        return res.status(400).json({ message: `Product ${entry.productId} not found` });
      }
      if (p.status !== 'active') {
        await conn.rollback();
        return res.status(400).json({ message: `${p.name} is inactive` });
      }
      if (Number(p.stock) < entry.quantity) {
        await conn.rollback();
        return res.status(400).json({ message: `Insufficient stock for ${p.name}` });
      }
      const unitPrice = Number(p.price);
      const lineSubtotal = unitPrice * entry.quantity;
      subtotalAmount += lineSubtotal;
      lineItems.push({
        productId: Number(p.id),
        productName: p.name,
        quantity: entry.quantity,
        unitPrice,
        subtotal: lineSubtotal,
        previousStock: Number(p.stock || 0),
        remainingStock: Math.max(0, Number(p.stock || 0) - entry.quantity)
      });
    }

    const appliedDiscount = Math.min(discountAmount, subtotalAmount);
    const netTotal = Number((subtotalAmount - appliedDiscount).toFixed(2));

    if (paymentMethod === 'cod' && cashReceived > 0 && cashReceived < netTotal) {
      await conn.rollback();
      return res.status(400).json({ message: 'Insufficient cash received' });
    }

    const changeAmount = paymentMethod === 'cod' ? Math.max(0, Number((cashReceived - netTotal).toFixed(2))) : 0;
    const [orderResult] = await conn.query(
      `INSERT INTO orders (store_owner_id, customer_id, status, total_amount, payment_method, shipping_method, delivery_fee)
       VALUES (?, NULL, 'delivered', ?, ?, 'pickup', 0)`,
      [req.user.store_owner_id, netTotal, paymentMethod]
    );
    const orderId = orderResult.insertId;

    for (const line of lineItems) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, line.productId, line.quantity, line.unitPrice, line.subtotal]
      );

      await conn.query(
        `UPDATE products
         SET stock = stock - ?
         WHERE id = ? AND store_owner_id = ?`,
        [line.quantity, line.productId, req.user.store_owner_id]
      );
    }

    await CashTransaction.createCashInForOrder({
      id: orderId,
      store_id: req.user.store_owner_id,
      total_amount: netTotal
    }, conn);

    await conn.commit();

    const threshold = Notification.lowStockThreshold;
    const newlyLow = lineItems.filter(line =>
      (line.previousStock > threshold && line.remainingStock <= threshold)
      || (line.previousStock > 0 && line.remainingStock === 0)
    );
    if (newlyLow.length) {
      try {
        await Notification.notifyStoreOwner(req.user.store_owner_id, {
          type: 'stock',
          subject: 'POS low stock alert',
          message: `Stock needs attention after POS sale #${orderId}: ${newlyLow.map(line => `${line.productName}: ${line.remainingStock} left`).join(', ')}.`
        });
      } catch (notificationErr) {
        console.error('POS stock notification failed:', notificationErr.message || notificationErr);
      }
    }

    return res.status(201).json({
      message: 'POS checkout completed',
      order: {
        id: orderId,
        subtotal_amount: Number(subtotalAmount.toFixed(2)),
        discount_amount: Number(appliedDiscount.toFixed(2)),
        total_amount: netTotal,
        notes: notes,
        cash_received: Number(cashReceived.toFixed(2)),
        change_amount: changeAmount,
        payment_method: paymentMethod,
        status: 'delivered',
        shipping_method: 'pickup'
      },
      items: lineItems.map(x => ({
        product_id: x.productId,
        product_name: x.productName,
        quantity: x.quantity,
        unit_price: Number(x.unitPrice.toFixed(2)),
        subtotal: Number(x.subtotal.toFixed(2))
      }))
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    console.error(err);
    return res.status(500).json({ message: 'Failed to complete POS checkout' });
  } finally {
    conn.release();
  }
});

module.exports = router;
