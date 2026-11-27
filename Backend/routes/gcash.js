const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const gcashService = require('../services/gcashService');
const { authMiddleware, isCustomer } = require('../middleware/auth');

/**
 * GCash Payment Routes
 * Handles payment initiation, verification, and webhook callbacks
 */

/**
 * POST /api/gcash/initiate-payment
 * Initiates a GCash payment session for an order
 * Body: { orderId, amount, storeId, customerName, customerEmail, customerPhone }
 */
router.post(
  '/initiate-payment',
  authMiddleware,
  isCustomer,
  [
    body('orderId').isInt({ min: 1 }).withMessage('Invalid order ID'),
    body('amount').isFloat({ min: 1 }).withMessage('Invalid amount'),
    body('storeId').isInt({ min: 1 }).withMessage('Invalid store ID'),
    body('customerName').trim().notEmpty().withMessage('Customer name required'),
    body('customerEmail').isEmail().withMessage('Invalid email'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const connection = await db.getConnection();
    try {
      const { orderId, amount, storeId, customerName, customerEmail, customerPhone } = req.body;

      // Verify order exists and belongs to the customer
      const [[order]] = await connection.query(
        'SELECT id, status, total_amount FROM orders WHERE id = ? AND customer_id = ? AND store_owner_id = ?',
        [orderId, req.user.id, storeId]
      );

      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      if (order.status !== 'pending') {
        return res.status(400).json({ message: 'Order is no longer pending. Cannot initiate payment.' });
      }

      // Verify amount matches order total
      if (parseFloat(amount).toFixed(2) !== parseFloat(order.total_amount).toFixed(2)) {
        return res.status(400).json({ message: 'Payment amount does not match order total' });
      }

      // Ensure gcash_payment_sessions table exists
      await ensureGcashSessionsTable(connection);

      // Generate return URLs
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
      const returnUrl = `${baseUrl}/payment-success?orderId=${orderId}`;
      const cancelUrl = `${baseUrl}/payment-cancelled?orderId=${orderId}`;
      // Prefer request host on local so demo QR/Open links hit this API, not production
      const requestHost = req.get('host') || '';
      const isLocalReq = /localhost|127\.0\.0\.1/i.test(requestHost);
      const backendBase = (
        isLocalReq
          ? `${req.protocol}://${requestHost}`
          : process.env.BACKEND_URL || `${req.protocol}://${requestHost}` || 'http://localhost:5000'
      ).replace(/\/$/, '');
      const webhookUrl = `${backendBase}/api/gcash/webhook`;

      // Initiate payment with GCash service
      const paymentResult = await gcashService.initiatePayment({
        orderId,
        amount,
        currency: 'PHP',
        description: `Order #${orderId} - Kadiwa`,
        customerName,
        customerEmail,
        customerPhone: customerPhone || '',
        returnUrl,
        cancelUrl,
        webhookUrl,
        storeId,
        backendBaseUrl: backendBase,
      });

      if (!paymentResult.success) {
        return res.status(500).json({ message: paymentResult.error || 'Failed to initiate payment' });
      }

      // Store payment session in database
      const hasGcashSessionIdColumn = await columnExists('orders', 'gcash_session_id', connection);
      if (hasGcashSessionIdColumn) {
        await connection.query(
          'UPDATE orders SET gcash_session_id = ?, payment_status = ? WHERE id = ?',
          [paymentResult.sessionId, 'pending', orderId]
        );
      }

      // Log payment session
      await connection.query(
        `INSERT INTO gcash_payment_sessions 
         (order_id, customer_id, store_id, session_id, status, amount, reference_number, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [orderId, req.user.id, storeId, paymentResult.sessionId, 'initiated', amount, paymentResult.sessionId]
      );

      console.log(`[Payment] GCash session initiated for order ${orderId}, session: ${paymentResult.sessionId}`);

      return res.json({
        success: true,
        message: 'Payment session created',
        data: {
          sessionId: paymentResult.sessionId,
          paymentUrl: paymentResult.paymentUrl,
          deepLinkUrl: paymentResult.deepLinkUrl || paymentResult.paymentUrl,
          qrCodeUrl: paymentResult.qrCodeUrl || null,
          provider: paymentResult.provider || 'demo',
          orderId,
          amount,
          expiresAt: paymentResult.expiresAt,
        },
      });
    } catch (error) {
      console.error('[GCash] Initiate payment error:', error.message);
      return res.status(500).json({ message: error.message });
    } finally {
      connection.release();
    }
  }
);

/**
 * GET /api/gcash/verify-payment/:sessionId
 * Verify payment status from GCash
 */
router.get(
  '/verify-payment/:sessionId',
  authMiddleware,
  isCustomer,
  async (req, res) => {
    const connection = await db.getConnection();
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({ message: 'Session ID is required' });
      }

      // Verify session belongs to the customer
      const [[session]] = await connection.query(
        'SELECT * FROM gcash_payment_sessions WHERE session_id = ? AND customer_id = ?',
        [sessionId, req.user.id]
      );

      if (!session) {
        return res.status(404).json({ message: 'Payment session not found' });
      }

      // Prefer DB if already marked success (e.g. demo-complete / webhook)
      if (session.status === 'success') {
        await markOrderPaid(connection, session.order_id, session.reference_number);
        return res.json({
          success: true,
          data: {
            status: 'success',
            referenceNumber: session.reference_number,
            transactionId: session.transaction_id,
            amount: session.amount,
            orderId: session.order_id,
          },
        });
      }

      // Verify payment status with provider
      const verificationResult = await gcashService.verifyPayment(sessionId);

      if (!verificationResult.success) {
        return res.status(500).json({
          message: 'Failed to verify payment',
          error: verificationResult.error,
        });
      }

      // Update session status in database
      await connection.query(
        'UPDATE gcash_payment_sessions SET status = ?, reference_number = ?, transaction_id = ?, updated_at = NOW() WHERE session_id = ?',
        [verificationResult.status, verificationResult.referenceNumber, verificationResult.transactionId, sessionId]
      );

      // If payment successful, update order status
      if (verificationResult.status === 'success') {
        await markOrderPaid(connection, session.order_id, verificationResult.referenceNumber);
      }

      return res.json({
        success: true,
        data: {
          status: verificationResult.status,
          referenceNumber: verificationResult.referenceNumber,
          transactionId: verificationResult.transactionId,
          amount: verificationResult.amount,
          orderId: session.order_id,
        },
      });
    } catch (error) {
      console.error('[GCash] Verify payment error:', error.message);
      return res.status(500).json({ message: error.message });
    } finally {
      connection.release();
    }
  }
);

/**
 * GET /api/gcash/demo-checkout/:sessionId
 * Hosted demo gateway page (Open in GCash / QR style) for sandbox without PayMongo keys
 */
router.get('/demo-checkout/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = gcashService.getDemoSession(sessionId);

  if (!session) {
    return res.status(404).send('<h1>Payment session not found</h1><p>It may have expired. Return to Kadiwa and try again.</p>');
  }

  const qrUrl = gcashService.buildQrImageUrl(
    `${(process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '')}/api/gcash/demo-checkout/${sessionId}`
  );
  const amount = Number(session.amount).toFixed(2);
  const alreadyPaid = session.status === 'success';
  const frontendBase = (process.env.FRONTEND_URL || 'https://kadiwamart.com').replace(/\/$/, '');
  const returnUrl = `${frontendBase}/customer/dashboard/orders?gcash=paid&orderId=${session.orderId}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GCash Payment</title>
  <style>
    :root { --gcash-blue: #007dff; --gcash-blue-dark: #005ce6; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #eef1f5; color: #1a1a1a; }
    .header { background: var(--gcash-blue); color: #fff; padding: 14px 18px; display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.15rem; }
    .logo { width: 28px; height: 28px; border-radius: 50%; background: #fff; color: var(--gcash-blue); display: grid; place-items: center; font-weight: 800; font-size: 0.95rem; }
    .wrap { padding: 20px 16px 32px; max-width: 420px; margin: 0 auto; }
    .card { background: #fff; border-radius: 16px; padding: 28px 22px; box-shadow: 0 2px 12px rgba(0,0,0,.06); text-align: center; }
    .card p { margin: 0 0 18px; line-height: 1.45; color: #333; }
    .amount { font-size: 1.35rem; font-weight: 700; color: #111; margin-bottom: 8px; }
    .meta { font-size: 0.85rem; color: #666; margin-bottom: 20px; }
    .btn { display: block; width: 100%; border: 0; border-radius: 999px; padding: 14px 18px; font-size: 1rem; font-weight: 700; cursor: pointer; text-decoration: none; }
    .btn-primary { background: var(--gcash-blue); color: #fff; }
    .btn-primary:hover { background: var(--gcash-blue-dark); }
    .btn-primary:disabled { opacity: .6; cursor: default; }
    .or { margin: 22px 0 14px; color: #555; font-size: 0.95rem; }
    .qr { width: 220px; height: 220px; margin: 0 auto; display: block; }
    .ok { color: #0a7a43; font-weight: 700; }
    .hint { margin-top: 16px; font-size: 0.8rem; color: #888; }
  </style>
</head>
<body>
  <header class="header"><span class="logo">G</span> GCash</header>
  <main class="wrap">
    <div class="card">
      ${alreadyPaid
        ? `<p class="ok">Payment successful</p>
           <p class="meta">Order #${session.orderId} is paid and waiting for the store to process.</p>
           <a class="btn btn-primary" href="${returnUrl}">Return to Kadiwa</a>`
        : `
      <p>Securely complete the payment with your GCash app</p>
      <div class="amount">₱${amount}</div>
      <div class="meta">Order #${session.orderId} · Demo mode</div>
      <button class="btn btn-primary" id="payBtn" type="button">Open in GCash</button>
      <p class="or">or Log in to GCash and scan this QR with the QR Scanner.</p>
      <img class="qr" src="${qrUrl}" alt="GCash payment QR code" />
      <p class="hint">Sandbox: tapping the button simulates a successful GCash payment.</p>`}
    </div>
  </main>
  ${alreadyPaid ? '' : `<script>
    document.getElementById('payBtn').addEventListener('click', async function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Processing...';
      try {
        var res = await fetch('/api/gcash/demo-complete/${sessionId}', { method: 'POST' });
        var data = await res.json();
        if (data.success) {
          btn.textContent = 'Payment successful';
          setTimeout(function () { window.location.href = ${JSON.stringify(returnUrl)}; }, 700);
        } else {
          alert(data.message || 'Payment failed');
          btn.disabled = false;
          btn.textContent = 'Open in GCash';
        }
      } catch (e) {
        alert('Network error. Try again.');
        btn.disabled = false;
        btn.textContent = 'Open in GCash';
      }
    });
  </script>`}
</body>
</html>`);
});

/**
 * POST /api/gcash/demo-complete/:sessionId
 * Marks a demo GCash session as paid and updates the order
 */
router.post('/demo-complete/:sessionId', async (req, res) => {
  if (gcashService.isPayMongoEnabled()) {
    return res.status(403).json({ message: 'Demo complete is disabled when PayMongo is configured' });
  }

  const connection = await db.getConnection();
  try {
    const { sessionId } = req.params;
    const result = gcashService.completeDemoPayment(sessionId);

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error || 'Session not found' });
    }

    const session = result.data;

    await ensureGcashSessionsTable(connection);

    await connection.query(
      `UPDATE gcash_payment_sessions
       SET status = 'success', reference_number = ?, transaction_id = ?, updated_at = NOW()
       WHERE session_id = ?`,
      [session.referenceNumber, session.transactionId, sessionId]
    );

    await markOrderPaid(connection, session.orderId, session.referenceNumber);

    console.log(`[GCash/Demo] Payment completed for order ${session.orderId}`);

    return res.json({
      success: true,
      message: 'Demo payment completed',
      data: {
        status: 'success',
        referenceNumber: session.referenceNumber,
        orderId: session.orderId,
      },
    });
  } catch (error) {
    console.error('[GCash] Demo complete error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
});

/**
 * POST /api/gcash/webhook
 * Webhook endpoint for PayMongo / GCash payment notifications
 * Headers: X-Signature or Paymongo-Signature
 */
router.post('/webhook', async (req, res) => {
  const connection = await db.getConnection();
  try {
    const signature = req.headers['x-signature'] || req.headers['paymongo-signature'];
    const webhookData = req.body;

    // Process webhook with signature verification (optional when secret unset)
    const result = gcashService.processWebhook(webhookData, signature, req.rawBody);

    if (!result.success) {
      console.warn('[GCash] Invalid webhook signature');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const paymentData = result.data;

    // Ensure gcash_payment_sessions table exists
    await ensureGcashSessionsTable(connection);

    // Resolve order id from session when metadata is missing
    let orderId = paymentData.orderId;
    if (!orderId && paymentData.sessionId) {
      const [[sessionRow]] = await connection.query(
        'SELECT order_id FROM gcash_payment_sessions WHERE session_id = ? LIMIT 1',
        [paymentData.sessionId]
      );
      orderId = sessionRow?.order_id;
    }

    // Update payment session status
    if (paymentData.sessionId) {
      await connection.query(
        `UPDATE gcash_payment_sessions 
         SET status = ?, reference_number = ?, transaction_id = ?, updated_at = NOW()
         WHERE session_id = ?`,
        [paymentData.status, paymentData.referenceNumber, paymentData.transactionId, paymentData.sessionId]
      );
    }

    // If payment successful, update order
    if (paymentData.status === 'success' && orderId) {
      await markOrderPaid(connection, orderId, paymentData.referenceNumber);
      console.log(
        `[Webhook] GCash payment confirmed for order ${orderId}, ref: ${paymentData.referenceNumber}`
      );
    } else if ((paymentData.status === 'failed' || paymentData.status === 'cancelled') && orderId) {
      const hasPaymentStatus = await columnExists('orders', 'payment_status', connection);
      if (hasPaymentStatus) {
        await connection.query('UPDATE orders SET payment_status = ? WHERE id = ?', ['failed', orderId]);
      }

      console.log(`[Webhook] GCash payment ${paymentData.status} for order ${orderId}`);
    }

    // Return 200 OK to acknowledge webhook
    return res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('[GCash] Webhook processing error:', error.message);
    // Still return 200 to avoid webhook retries
    return res.json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
});

/**
 * POST /api/gcash/cancel-payment/:sessionId
 * Cancel a pending payment session
 */
router.post(
  '/cancel-payment/:sessionId',
  authMiddleware,
  isCustomer,
  async (req, res) => {
    const connection = await db.getConnection();
    try {
      const { sessionId } = req.params;

      // Verify session belongs to the customer
      const [[session]] = await connection.query(
        'SELECT * FROM gcash_payment_sessions WHERE session_id = ? AND customer_id = ?',
        [sessionId, req.user.id]
      );

      if (!session) {
        return res.status(404).json({ message: 'Payment session not found' });
      }

      if (session.status !== 'initiated') {
        return res.status(400).json({ message: 'Payment session cannot be cancelled' });
      }

      // Cancel payment with GCash
      const cancelResult = await gcashService.cancelPayment(sessionId);

      if (!cancelResult.success) {
        return res.status(500).json({ message: cancelResult.error || 'Failed to cancel payment' });
      }

      // Update session status
      await connection.query(
        'UPDATE gcash_payment_sessions SET status = ?, updated_at = NOW() WHERE session_id = ?',
        ['cancelled', sessionId]
      );

      // Update order back to pending
      await connection.query('UPDATE orders SET payment_status = ? WHERE id = ?', ['pending', session.order_id]);

      console.log(`[Payment] GCash payment cancelled for order ${session.order_id}`);

      return res.json({ success: true, message: 'Payment session cancelled' });
    } catch (error) {
      console.error('[GCash] Cancel payment error:', error.message);
      return res.status(500).json({ message: error.message });
    } finally {
      connection.release();
    }
  }
);

/**
 * GET /api/gcash/session-status/:sessionId
 * Get current status of a payment session
 */
router.get(
  '/session-status/:sessionId',
  authMiddleware,
  isCustomer,
  async (req, res) => {
    const connection = await db.getConnection();
    try {
      const { sessionId } = req.params;

      const [[session]] = await connection.query(
        'SELECT * FROM gcash_payment_sessions WHERE session_id = ? AND customer_id = ?',
        [sessionId, req.user.id]
      );

      if (!session) {
        return res.status(404).json({ message: 'Payment session not found' });
      }

      return res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      console.error('[GCash] Get session status error:', error.message);
      return res.status(500).json({ message: error.message });
    } finally {
      connection.release();
    }
  }
);

/**
 * Helper: Check if column exists in table
 */
async function columnExists(table, column, connection = db) {
  try {
    const [rows] = await connection.query(
      `SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=? AND COLUMN_NAME=? AND TABLE_SCHEMA=DATABASE()`,
      [table, column]
    );
    return rows.length > 0;
  } catch (error) {
    console.error(`[DB] Error checking column ${table}.${column}:`, error.message);
    return false;
  }
}

/**
 * Mark order as paid after successful GCash payment.
 * Keeps fulfillment status as pending so the store can process it.
 */
async function markOrderPaid(connection, orderId, referenceNumber) {
  if (!orderId) return;

  await ensureOrderPaymentColumns(connection);

  const hasPaymentStatus = await columnExists('orders', 'payment_status', connection);
  const hasGcashReference = await columnExists('orders', 'gcash_reference', connection);

  if (hasPaymentStatus && hasGcashReference) {
    await connection.query(
      `UPDATE orders
       SET payment_status = 'completed',
           gcash_reference = COALESCE(?, gcash_reference),
           status = CASE WHEN status = 'rejected' THEN status ELSE 'pending' END
       WHERE id = ?`,
      [referenceNumber || null, orderId]
    );
  } else if (hasPaymentStatus) {
    await connection.query(
      `UPDATE orders
       SET payment_status = 'completed',
           status = CASE WHEN status = 'rejected' THEN status ELSE 'pending' END
       WHERE id = ?`,
      [orderId]
    );
  } else if (hasGcashReference) {
    await connection.query(
      `UPDATE orders SET gcash_reference = COALESCE(?, gcash_reference) WHERE id = ?`,
      [referenceNumber || null, orderId]
    );
  }

  console.log(`[Payment] Order ${orderId} marked paid (ref: ${referenceNumber || 'n/a'})`);
}

async function ensureOrderPaymentColumns(connection = db) {
  try {
    const hasPaymentStatus = await columnExists('orders', 'payment_status', connection);
    if (!hasPaymentStatus) {
      await connection.query(
        `ALTER TABLE orders ADD COLUMN payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending' AFTER payment_method`
      );
      console.log('[DB] Added orders.payment_status');
    }
  } catch (error) {
    console.error('[DB] ensureOrderPaymentColumns payment_status:', error.message);
  }

  try {
    const hasGcashReference = await columnExists('orders', 'gcash_reference', connection);
    if (!hasGcashReference) {
      await connection.query(
        `ALTER TABLE orders ADD COLUMN gcash_reference VARCHAR(100) NULL AFTER payment_method`
      );
      console.log('[DB] Added orders.gcash_reference');
    }
  } catch (error) {
    console.error('[DB] ensureOrderPaymentColumns gcash_reference:', error.message);
  }
}

/**
 * Helper: Ensure GCash payment sessions table exists
 */
async function ensureGcashSessionsTable(connection = db) {
  try {
    const tableExists = await columnExists('gcash_payment_sessions', 'id', connection);
    if (!tableExists) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS gcash_payment_sessions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          customer_id INT NOT NULL,
          store_id INT NOT NULL,
          session_id VARCHAR(100) NOT NULL UNIQUE,
          status ENUM('initiated', 'success', 'failed', 'cancelled', 'pending') NOT NULL DEFAULT 'initiated',
          amount DECIMAL(12, 2) NOT NULL,
          reference_number VARCHAR(100),
          transaction_id VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
          FOREIGN KEY (store_id) REFERENCES store_owners(id) ON DELETE CASCADE,
          INDEX idx_session_id (session_id),
          INDEX idx_order_id (order_id),
          INDEX idx_customer_id (customer_id)
        )
      `);
      console.log('[DB] Created gcash_payment_sessions table');
    }
  } catch (error) {
    console.error('[DB] Error creating gcash_payment_sessions table:', error.message);
  }
}

module.exports = router;
