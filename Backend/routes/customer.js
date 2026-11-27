const express = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware, isCustomer } = require('../middleware/auth');
const db = require('../config/database');
const Store3Savings = require('../models/Store3Savings');
const RewardPoints = require('../models/RewardPoints');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');

const router = express.Router();

function calculateDistanceKm(fromLat, fromLng, toLat, toLng) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function parseQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function isVariableWeightUnit(unit) {
  return /(^|[\s/.-])(kg|kgs|kilo|kilos|kilogram|kilograms|g|gram|grams|mg|milligram|lb|lbs|pound|pounds|oz|ounce|ounces)(?=$|[\s/.-])/i.test(String(unit || '').trim());
}

async function columnExists(table, column, connection = db) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(row?.cnt || 0) > 0;
}

async function ensureOrderGcashReferenceColumn(connection = db) {
  const exists = await columnExists('orders', 'gcash_reference', connection);
  if (exists) return true;
  try {
    await connection.query('ALTER TABLE orders ADD COLUMN gcash_reference VARCHAR(100) NULL AFTER payment_method');
    return true;
  } catch (err) {
    if (/Duplicate column name/i.test(String(err?.message || ''))) return true;
    throw err;
  }
}

async function ensureOrderPreferredDeliveryDateColumn(connection = db) {
  const exists = await columnExists('orders', 'preferred_delivery_date', connection);
  if (exists) return true;
  try {
    await connection.query('ALTER TABLE orders ADD COLUMN preferred_delivery_date DATE NULL AFTER payment_method');
    return true;
  } catch (err) {
    if (/Duplicate column name/i.test(String(err?.message || ''))) return true;
    throw err;
  }
}

async function ensureOrderDeliveryAddressColumn(connection = db) {
  const exists = await columnExists('orders', 'delivery_address', connection);
  if (exists) return true;
  try {
    await connection.query('ALTER TABLE orders ADD COLUMN delivery_address VARCHAR(255) NULL AFTER shipping_method');
    return true;
  } catch (err) {
    if (/Duplicate column name/i.test(String(err?.message || ''))) return true;
    throw err;
  }
}

function isValidCoordinatePair(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

function computeDeliveryFee({ store, customer }) {
  const baseFee = Number(store?.delivery_base_fee || 0);
  const perKmFee = Number(store?.delivery_per_km_fee || 0);
  const feeCap = Number(store?.delivery_fee_cap || 0);

  const storeLat = Number(store?.latitude);
  const storeLng = Number(store?.longitude);
  const customerLat = Number(customer?.latitude);
  const customerLng = Number(customer?.longitude);

  const hasCoordinates =
    isValidCoordinatePair(storeLat, storeLng) &&
    isValidCoordinatePair(customerLat, customerLng);

  if (!hasCoordinates || perKmFee <= 0) {
    return roundMoney(baseFee);
  }

  const distanceKm = calculateDistanceKm(
    storeLat,
    storeLng,
    customerLat,
    customerLng
  );

  if (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 200) {
    return roundMoney(baseFee);
  }

  let fee = baseFee + (distanceKm * perKmFee);
  if (feeCap > 0) {
    fee = Math.min(fee, feeCap);
  }

  return roundMoney(fee);
}

function extractBarangayFromAddress(address) {
  const text = String(address || '').trim();
  if (!text) return '';
  return text.split(',')[0].trim();
}

async function getStoreBarangayDeliveryFee(connection, storeOwnerId, address) {
  const barangay = extractBarangayFromAddress(address);
  if (!barangay) {
    throw new Error('Barangay is required for delivery');
  }

  const [[row]] = await connection.query(
    `SELECT barangay_name, delivery_fee
     FROM store_delivery_barangays
     WHERE store_owner_id = ? AND LOWER(barangay_name) = LOWER(?)
     LIMIT 1`,
    [storeOwnerId, barangay]
  );

  if (!row) {
    throw new Error(`Delivery is not available for ${barangay}`);
  }

  return roundMoney(row.delivery_fee);
}

// All customer routes require auth
router.use(authMiddleware, isCustomer);

// List public products (active), optional storeOwnerId and search q
router.get('/products', async (req, res) => {
  try {
    const { storeOwnerId, q } = req.query;
    let sql = 'SELECT * FROM products WHERE status = \'active\'';
    const params = [];
    if (storeOwnerId) { sql += ' AND store_owner_id = ?'; params.push(parseInt(storeOwnerId, 10)); }
    if (q) { sql += ' AND (name LIKE ? OR description LIKE ? OR category LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY name ASC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load products' });
  }
});

// List stores for filter
router.get('/stores', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, store_name, address, latitude, longitude FROM store_owners ORDER BY store_name ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load stores' });
  }
});

router.get('/stores/:storeId/delivery-service', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId, 10);
    if (!storeId) return res.status(400).json({ message: 'Invalid storeId' });

    const [[store]] = await db.query(
      `SELECT id, store_name, delivery_enabled, delivery_base_fee, delivery_per_km_fee, delivery_fee_cap,
              latitude, longitude
       FROM store_owners
       WHERE id = ?`,
      [storeId]
    );
    if (!store) return res.status(404).json({ message: 'Store not found' });

    res.json({
      store_id: store.id,
      store_name: store.store_name,
      delivery_enabled: Number(store.delivery_enabled || 0) === 1,
      delivery_base_fee: Number(store.delivery_base_fee || 30),
      delivery_per_km_fee: Number(store.delivery_per_km_fee || 10),
      delivery_fee_cap: Number(store.delivery_fee_cap || 0),
      latitude: store.latitude,
      longitude: store.longitude
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load delivery service settings' });
  }
});

// Estimate checkout totals without creating an order
router.post('/orders/estimate', async (req, res) => {
  const { items, shipping_method, address, points_to_redeem } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'items required' });
  }

  try {
    const [[cust]] = await db.query('SELECT address, latitude, longitude FROM customers WHERE id = ?', [req.user.id]);
    if (!cust) return res.status(404).json({ message: 'Customer not found' });

    let subtotal = 0;
    let storeOwnerId = null;
    for (const it of items) {
      const pid = parseInt(it.product_id, 10);
      const qty = parseQuantity(it.quantity);
      if (!pid || qty === null) return res.status(400).json({ message: 'Invalid item' });

      const [[p]] = await db.query(
        'SELECT id, price, stock, unit, store_owner_id FROM products WHERE id = ? AND status = \'active\'',
        [pid]
      );
      if (!p) return res.status(400).json({ message: 'Product not found or inactive' });
      const normalizedQty = isVariableWeightUnit(p.unit) ? qty : 1;
      if (storeOwnerId === null) storeOwnerId = p.store_owner_id;
      else if (storeOwnerId !== p.store_owner_id) return res.status(400).json({ message: 'All items must be from the same store' });
      if (p.stock !== null && p.stock !== undefined && p.stock < normalizedQty) {
        return res.status(400).json({ message: 'Insufficient stock for one or more items' });
      }

      subtotal += Number(p.price) * normalizedQty;
    }

    const shipMethod = (shipping_method === 'delivery' ? 'delivery' : 'pickup');
    let deliveryFee = 0;

    if (shipMethod === 'delivery') {
      const [[store]] = await db.query(
        `SELECT delivery_enabled, delivery_base_fee, delivery_per_km_fee, delivery_fee_cap, latitude, longitude
         FROM store_owners
         WHERE id = ?`,
        [storeOwnerId]
      );

      const deliveryEnabled = Number(store?.delivery_enabled || 0) === 1;
      if (!deliveryEnabled) {
        return res.status(400).json({ message: 'Delivery service is not available for this store' });
      }

      const deliveryAddress = String(address || cust.address || '').trim();
      deliveryFee = await getStoreBarangayDeliveryFee(db, storeOwnerId, deliveryAddress);
    }

    const payableBeforeDiscount = roundMoney(subtotal + deliveryFee);
    const storeSettings = await RewardPoints.getStoreSettings(storeOwnerId);
    const wallet = await RewardPoints.getWalletByCustomer(req.user.id);
    const redemption = RewardPoints.resolveRedemption({
      balance: wallet.balance,
      pointsRequested: storeSettings.enabled ? points_to_redeem : 0,
      payableTotal: payableBeforeDiscount,
      settings: storeSettings
    });
    const totalAmount = roundMoney(Math.max(0, payableBeforeDiscount - redemption.discount));
    const earnPreview = RewardPoints.pointsFromSpend(totalAmount, storeSettings);

    return res.json({
      subtotal: roundMoney(subtotal),
      delivery_fee: deliveryFee,
      discount_amount: redemption.discount,
      points_to_redeem: redemption.points,
      points_balance: wallet.balance,
      points_value_php: RewardPoints.discountFromPoints(wallet.balance, storeSettings),
      points_enabled: storeSettings.enabled,
      earn_pesos_per_point: storeSettings.earn_pesos_per_point,
      redeem_peso_per_point: storeSettings.redeem_peso_per_point,
      max_redeem_percent: storeSettings.max_redeem_percent,
      min_order_amount_to_earn: storeSettings.min_order_amount_to_earn,
      rewards_note: storeSettings.customer_note,
      points_earn_preview: earnPreview,
      total_amount: totalAmount,
      shipping_method: shipMethod
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to estimate order totals' });
  }
});

// Create order (checkout)
// body: { items: [{ product_id, quantity }] }
// Derives store_owner_id from products; ensures all items from same store and checks stock
router.post('/orders', async (req, res) => {
  const { items, shipping_method, payment_method, preferred_delivery_date, gcash_reference, points_to_redeem } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'items required' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const hasDeliveryAddressColumn = await ensureOrderDeliveryAddressColumn(connection);
    if (shipping_method === 'delivery' && preferred_delivery_date) {
      await ensureOrderPreferredDeliveryDateColumn(connection);
    }
    const hasPreferredDeliveryDateColumn = await columnExists('orders', 'preferred_delivery_date', connection);
    await RewardPoints.ensureOrderDiscountColumns(connection);
    const hasDiscountColumn = await columnExists('orders', 'discount_amount', connection);
    const hasPointsRedeemedColumn = await columnExists('orders', 'points_redeemed', connection);

    // Validate customer profile details
    const [[cust]] = await connection.query('SELECT full_name, phone, address, latitude, longitude FROM customers WHERE id = ?', [req.user.id]);
    if (!cust) throw new Error('Customer not found');
    if (!cust.full_name) throw new Error('Full name required');
    if (!cust.phone) throw new Error('Phone required');
    if (!cust.address) throw new Error('Provide address in profile');

    let total = 0;
    const preparedItems = [];
    let storeOwnerId = null;
    for (const it of items) {
      const pid = parseInt(it.product_id, 10);
      const qty = parseQuantity(it.quantity);
      if (!pid || qty === null) throw new Error('Invalid item');
      const [[p]] = await connection.query(
        'SELECT id, name, price, stock, unit, store_owner_id FROM products WHERE id = ? AND status = \'active\' FOR UPDATE',
        [pid]
      );
      if (!p) throw new Error('Product not found or inactive');
      const normalizedQty = isVariableWeightUnit(p.unit) ? qty : 1;
      if (storeOwnerId === null) storeOwnerId = p.store_owner_id; else if (storeOwnerId !== p.store_owner_id) throw new Error('All items must be from the same store');
      if (p.stock !== null && p.stock !== undefined && p.stock < normalizedQty) throw new Error('Insufficient stock for one or more items');
      const unit = Number(p.price);
      const subtotal = unit * normalizedQty;
      total += subtotal;
      preparedItems.push({
        product_id: pid,
        name: p.name,
        quantity: normalizedQty,
        unit_price: unit,
        subtotal,
        previous_stock: Number(p.stock || 0),
        remaining_stock: Math.max(0, Number(p.stock || 0) - normalizedQty)
      });
    }

    // Shipping method validation
    const shipMethod = (shipping_method === 'delivery' ? 'delivery' : 'pickup');
    const deliveryAddressValue = shipMethod === 'delivery' ? String(req.body.address || cust.address || '').trim() : null;
    // Payment method: 'cod' | 'gcash'
    // GCash reference is optional here — payment gateway (PayMongo/demo) fills it after pay.
    let payMethod = (payment_method === 'gcash' ? 'gcash' : 'cod');
    const gcashReference = String(gcash_reference || '').trim();
    if (payMethod === 'gcash') {
      if (gcashReference && !/^[A-Za-z0-9-]{6,40}$/.test(gcashReference)) {
        throw new Error('Invalid GCash reference number');
      }
      // Allow creating the order with null reference; /api/gcash flow completes payment
      await ensureOrderGcashReferenceColumn(connection);
    }

    // Delivery fee logic: store barangay fee
    let deliveryFee = 0;
    if (shipMethod === 'delivery') {
      const [[store]] = await connection.query(
        `SELECT delivery_enabled, delivery_base_fee, delivery_per_km_fee, delivery_fee_cap, latitude, longitude
         FROM store_owners
         WHERE id = ?`,
        [storeOwnerId]
      );

      const deliveryEnabled = Number(store?.delivery_enabled || 0) === 1;
      if (!deliveryEnabled) {
        throw new Error('Delivery service is not available for this store');
      }

      const deliveryAddress = String(req.body.address || cust.address || '').trim();
      deliveryFee = await getStoreBarangayDeliveryFee(connection, storeOwnerId, deliveryAddress);
    }

    const payableBeforeDiscount = roundMoney(total + deliveryFee);
    const storeSettings = await RewardPoints.getStoreSettings(storeOwnerId, connection);
    const wallet = await RewardPoints.getWalletByCustomer(req.user.id, connection);
    const redemption = RewardPoints.resolveRedemption({
      balance: wallet.balance,
      pointsRequested: storeSettings.enabled ? points_to_redeem : 0,
      payableTotal: payableBeforeDiscount,
      settings: storeSettings
    });
    const discountAmount = redemption.discount;
    const pointsRedeemed = redemption.points;
    const orderTotal = roundMoney(Math.max(0, payableBeforeDiscount - discountAmount));

    if (!storeSettings.enabled && Number(points_to_redeem || 0) > 0) {
      throw new Error('Reward points are disabled for this store');
    }

    // Fully covered by points — no GCash charge needed
    if (orderTotal <= 0 && payMethod === 'gcash') {
      payMethod = 'cod';
    }

    let preferredDeliveryDateValue = null;
    if (shipMethod === 'delivery' && preferred_delivery_date) {
      const preferredDate = new Date(preferred_delivery_date);
      if (Number.isNaN(preferredDate.getTime())) {
        throw new Error('Invalid preferred delivery date');
      }

      const localDate = new Date(preferredDate);
      localDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (localDate < today) {
        throw new Error('Preferred delivery date cannot be in the past');
      }

      preferredDeliveryDateValue = localDate.toISOString().slice(0, 10);
    }

    const hasGcashReferenceColumn = await columnExists('orders', 'gcash_reference', connection);
    let orderRes;
    if (hasDeliveryAddressColumn && hasPreferredDeliveryDateColumn && hasGcashReferenceColumn) {
      [orderRes] = await connection.query(
        'INSERT INTO orders (store_owner_id, customer_id, status, total_amount, delivery_fee, shipping_method, delivery_address, payment_method, gcash_reference, preferred_delivery_date) VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?, ?, ?)',
        [storeOwnerId, req.user.id, orderTotal, deliveryFee, shipMethod, deliveryAddressValue, payMethod, payMethod === 'gcash' ? gcashReference : null, preferredDeliveryDateValue]
      );
    } else if (hasDeliveryAddressColumn && hasPreferredDeliveryDateColumn) {
      [orderRes] = await connection.query(
        'INSERT INTO orders (store_owner_id, customer_id, status, total_amount, delivery_fee, shipping_method, delivery_address, payment_method, preferred_delivery_date) VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?, ?)',
        [storeOwnerId, req.user.id, orderTotal, deliveryFee, shipMethod, deliveryAddressValue, payMethod, preferredDeliveryDateValue]
      );
    } else if (hasDeliveryAddressColumn && hasGcashReferenceColumn) {
      [orderRes] = await connection.query(
        'INSERT INTO orders (store_owner_id, customer_id, status, total_amount, delivery_fee, shipping_method, delivery_address, payment_method, gcash_reference) VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?, ?)',
        [storeOwnerId, req.user.id, orderTotal, deliveryFee, shipMethod, deliveryAddressValue, payMethod, payMethod === 'gcash' ? gcashReference : null]
      );
    } else if (hasDeliveryAddressColumn) {
      [orderRes] = await connection.query(
        'INSERT INTO orders (store_owner_id, customer_id, status, total_amount, delivery_fee, shipping_method, delivery_address, payment_method) VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?)',
        [storeOwnerId, req.user.id, orderTotal, deliveryFee, shipMethod, deliveryAddressValue, payMethod]
      );
    } else if (hasPreferredDeliveryDateColumn && hasGcashReferenceColumn) {
      [orderRes] = await connection.query(
        'INSERT INTO orders (store_owner_id, customer_id, status, total_amount, delivery_fee, shipping_method, payment_method, gcash_reference, preferred_delivery_date) VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?, ?)',
        [storeOwnerId, req.user.id, orderTotal, deliveryFee, shipMethod, payMethod, payMethod === 'gcash' ? gcashReference : null, preferredDeliveryDateValue]
      );
    } else if (hasPreferredDeliveryDateColumn) {
      [orderRes] = await connection.query(
        'INSERT INTO orders (store_owner_id, customer_id, status, total_amount, delivery_fee, shipping_method, payment_method, preferred_delivery_date) VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?)',
        [storeOwnerId, req.user.id, orderTotal, deliveryFee, shipMethod, payMethod, preferredDeliveryDateValue]
      );
    } else if (hasGcashReferenceColumn) {
      [orderRes] = await connection.query(
        'INSERT INTO orders (store_owner_id, customer_id, status, total_amount, delivery_fee, shipping_method, payment_method, gcash_reference) VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?)',
        [storeOwnerId, req.user.id, orderTotal, deliveryFee, shipMethod, payMethod, payMethod === 'gcash' ? gcashReference : null]
      );
    } else {
      [orderRes] = await connection.query(
        'INSERT INTO orders (store_owner_id, customer_id, status, total_amount, delivery_fee, shipping_method, payment_method) VALUES (?, ?, \'pending\', ?, ?, ?, ?)',
        [storeOwnerId, req.user.id, orderTotal, deliveryFee, shipMethod, payMethod]
      );
    }
    const orderId = orderRes.insertId;

    if (hasDiscountColumn || hasPointsRedeemedColumn) {
      const sets = [];
      const vals = [];
      if (hasDiscountColumn) {
        sets.push('discount_amount = ?');
        vals.push(discountAmount);
      }
      if (hasPointsRedeemedColumn) {
        sets.push('points_redeemed = ?');
        vals.push(pointsRedeemed);
      }
      vals.push(orderId);
      await connection.query(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`, vals);
    }

    for (const oi of preparedItems) {
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
        [orderId, oi.product_id, oi.quantity, oi.unit_price, oi.subtotal]
      );
      // Decrement stock
      await connection.query('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [oi.quantity, oi.product_id]);
    }

    if (pointsRedeemed > 0) {
      await RewardPoints.redeemForOrder({
        customerId: req.user.id,
        orderId,
        points: pointsRedeemed,
        settings: storeSettings
      }, connection);
    }

    await connection.commit();

    try {
      await Notification.notifyCustomer(req.user.id, {
        type: 'order',
        subject: `Order #${orderId} received`,
        message: `Your order #${orderId} was placed successfully. Total: ₱${orderTotal.toFixed(2)} · ${shipMethod === 'delivery' ? 'Delivery' : 'Pickup'}. The store will update its status soon.`
      });
      await Notification.notifyStoreOwner(storeOwnerId, {
        type: 'customer_order',
        subject: `New customer order #${orderId}`,
        message: `New order #${orderId} from ${cust.full_name}. Total: ₱${orderTotal.toFixed(2)} · ${shipMethod === 'delivery' ? 'Delivery' : 'Pickup'}.`
      });

      const threshold = Notification.lowStockThreshold;
      const newlyLow = preparedItems.filter(item =>
        (item.previous_stock > threshold && item.remaining_stock <= threshold)
        || (item.previous_stock > 0 && item.remaining_stock === 0)
      );
      if (newlyLow.length) {
        const stockMessage = newlyLow
          .map(item => `${item.name}: ${item.remaining_stock} left`)
          .join(', ');
        await Notification.notifyStoreOwner(storeOwnerId, {
          type: 'stock',
          subject: 'Low stock alert',
          message: `Stock needs attention after order #${orderId}: ${stockMessage}.`
        });
      }
    } catch (notificationErr) {
      console.error('Order notification failed:', notificationErr.message || notificationErr);
    }

    res.status(201).json({
      id: orderId,
      total_amount: orderTotal,
      delivery_fee: deliveryFee,
      discount_amount: discountAmount,
      points_redeemed: pointsRedeemed,
      payment_method: payMethod,
      status: 'pending'
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'Checkout failed' });
  } finally {
    connection.release();
  }
});

// List my orders
router.get('/orders', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT o.*, so.store_name,
       (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
       FROM orders o JOIN store_owners so ON so.id = o.store_owner_id
       WHERE o.customer_id = ? ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load orders' });
  }
});

// Get items for a specific order that belongs to the current customer
router.get('/orders/:id/items', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!orderId) return res.status(400).json({ message: 'Invalid order id' });

    const hasPreferredDeliveryDateColumn = await columnExists('orders', 'preferred_delivery_date');
    const preferredDeliveryDateSelect = hasPreferredDeliveryDateColumn
      ? 'o.preferred_delivery_date'
      : 'NULL AS preferred_delivery_date';

    const [[order]] = await db.query(
      `SELECT o.id, o.customer_id, o.store_owner_id, o.status, o.total_amount, o.delivery_fee,
              o.shipping_method, o.payment_method, ${preferredDeliveryDateSelect}, o.created_at, so.store_name
       FROM orders o
       JOIN store_owners so ON so.id = o.store_owner_id
       WHERE o.id = ?` ,
      [orderId]
    );

    if (!order || Number(order.customer_id) !== Number(req.user.id)) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const [items] = await db.query(
      `SELECT oi.id, oi.product_id, COALESCE(NULLIF(p.description, ''), '—') AS product_name, oi.quantity, oi.unit_price, oi.subtotal
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [orderId]
    );

    res.json({ order, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load order items' });
  }
});

// Customer order and status notifications
router.get('/notifications', async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.listByCustomer(req.user.id, req.query.limit),
      Notification.unreadCountForCustomer(req.user.id)
    ]);
    res.json({ notifications, unread_count: unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load notifications' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  try {
    await Notification.markAllCustomerRead(req.user.id);
    res.json({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to mark notifications as read' });
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  try {
    const ok = await Notification.markCustomerRead(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// Customer summary for dashboard
router.get('/summary', async (req, res) => {
  try {
    const [[agg]] = await db.query(
      `SELECT 
         (SELECT COUNT(*) FROM orders WHERE customer_id = ?) AS orders_count,
         (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE customer_id = ? AND status='delivered') AS total_spent` ,
      [req.user.id, req.user.id]
    );

    const wallet = await Store3Savings.getWalletByCustomer(req.user.id);
    const points = await RewardPoints.getWalletByCustomer(req.user.id);

    res.json({
      ...agg,
      reward_points: points.balance,
      reward_points_lifetime_earned: points.lifetime_earned,
      reward_points_lifetime_redeemed: points.lifetime_redeemed,
      reward_points_earn_pesos_per_point: points.earn_pesos_per_point,
      reward_points_redeem_peso_per_point: points.redeem_peso_per_point,
      reward_points_redeemable: true,
      store3_savings_balance: Number(wallet.current_balance || 0),
      store3_savings_total: Number(wallet.total_contributed || 0),
      store3_savings_reward_rate: 0.05,
      store3_savings_redeemable: false,
      store3_savings_note: 'Store 3 savings rewards are investment-only and cannot be used for checkout payment.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load summary' });
  }
});

router.get('/rewards/points', async (req, res) => {
  try {
    const wallet = await RewardPoints.getWalletByCustomer(req.user.id);
    const transactions = await RewardPoints.listTransactionsByCustomer(req.user.id, 30);
    res.json({
      wallet,
      redeemable: true,
      note: 'Earn 1 point per ₱20 spent on delivered orders. Redeem 1 point = ₱1 off at checkout.',
      transactions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load reward points' });
  }
});

router.get('/rewards/store3-savings', async (req, res) => {
  try {
    const wallet = await Store3Savings.getWalletByCustomer(req.user.id);
    const transactions = await Store3Savings.listTransactionsByCustomer(req.user.id, 30);

    res.json({
      wallet,
      reward_rate: 0.05,
      redeemable: false,
      note: 'Store 3 savings rewards are investment-only and cannot be used to buy products.',
      transactions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load Store 3 savings rewards' });
  }
});

// Get latest profile basics
router.get('/account/profile', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, email, full_name, phone, address, role, latitude, longitude FROM customers WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Customer not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load profile' });
  }
});

// Get address book (default/profile + home + work)
router.get('/account/addresses', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, address, home_address, work_address, latitude, longitude FROM customers WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Customer not found' });
    res.json({ addresses: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load addresses' });
  }
});

// Update profile basics (full_name, phone, address)
router.put('/account/profile', async (req, res) => {
  const { full_name, phone, address } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE customers SET full_name = ?, phone = ?, address = ? WHERE id = ?',
      [full_name || null, phone || null, address || null, req.user.id]
    );
    if (!result.affectedRows) return res.status(400).json({ message: 'No changes' });
    const [rows] = await db.query('SELECT id, username, email, full_name, phone, address, role FROM customers WHERE id = ?', [req.user.id]);
    res.json({ message: 'Profile updated', user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// Change email (requires current password)
router.put('/account/email', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('current_password').notEmpty().withMessage('Current password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const email = String(req.body.email || '').trim();
    const full = await Customer.findWithPasswordById(req.user.id);
    if (!full) return res.status(404).json({ message: 'Customer not found' });

    const okCurrent = await Customer.comparePassword(req.body.current_password, full.password);
    if (!okCurrent) return res.status(400).json({ message: 'Current password incorrect' });

    if (email.toLowerCase() === String(full.email || '').toLowerCase()) {
      return res.status(400).json({ message: 'New email is the same as current email' });
    }

    const existing = await Customer.findByEmail(email);
    if (existing && existing.id !== req.user.id) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    await Customer.updateEmail(req.user.id, email);
    const user = await Customer.findById(req.user.id);
    res.json({ message: 'Email updated', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update email' });
  }
});

// Change password (requires current password)
router.put('/account/password', [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const full = await Customer.findWithPasswordById(req.user.id);
    if (!full) return res.status(404).json({ message: 'Customer not found' });

    const okCurrent = await Customer.comparePassword(req.body.current_password, full.password);
    if (!okCurrent) return res.status(400).json({ message: 'Current password incorrect' });

    await Customer.updatePassword(req.user.id, req.body.new_password);
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update password' });
  }
});

// Update address book (and optionally default checkout address)
router.put('/account/addresses', async (req, res) => {
  const { address, home_address, work_address } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE customers SET address = ?, home_address = ?, work_address = ? WHERE id = ?',
      [address || null, home_address || null, work_address || null, req.user.id]
    );
    if (!result.affectedRows) return res.status(400).json({ message: 'No changes' });
    const [rows] = await db.query(
      'SELECT id, username, email, full_name, phone, address, home_address, work_address, role, latitude, longitude FROM customers WHERE id = ?',
      [req.user.id]
    );
    res.json({ message: 'Address book updated', user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update addresses' });
  }
});

module.exports = router;
