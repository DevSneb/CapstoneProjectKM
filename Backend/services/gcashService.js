const axios = require('axios');
const crypto = require('crypto');

/**
 * GCash Payment Service
 * - PayMongo GCash Sources when PAYMONGO_SECRET_KEY is set
 * - Local demo mode otherwise (capstone / sandbox without merchant keys)
 */

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || '';
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET || '';
const GCASH_ENVIRONMENT = process.env.GCASH_ENVIRONMENT || (PAYMONGO_SECRET_KEY ? 'live' : 'demo');
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

/** In-memory demo session store (also mirrored in MySQL by the route layer) */
const demoSessions = new Map();

function isPayMongoEnabled() {
  return Boolean(PAYMONGO_SECRET_KEY && PAYMONGO_SECRET_KEY.startsWith('sk_'));
}

function paymongoAuthHeader() {
  const token = Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64');
  return `Basic ${token}`;
}

function buildQrImageUrl(payload) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&ecc=M&data=${encodeURIComponent(payload)}`;
}

function toCentavos(amount) {
  return Math.round(parseFloat(amount) * 100);
}

function createSessionId(prefix = 'gcash') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Initiate a payment session
 * @returns {Promise<{success, sessionId, paymentUrl, deepLinkUrl, qrCodeUrl, orderId, amount, expiresAt, provider}>}
 */
async function initiatePayment(paymentData) {
  const {
    orderId,
    amount,
    currency = 'PHP',
    description,
    customerName,
    customerEmail,
    customerPhone,
    returnUrl,
    cancelUrl,
    webhookUrl,
    storeId,
    backendBaseUrl,
  } = paymentData;

  if (!orderId || !amount || !customerEmail || !returnUrl) {
    throw new Error('Missing required payment parameters');
  }

  if (isPayMongoEnabled()) {
    return initiatePayMongoPayment({
      orderId,
      amount,
      currency,
      description,
      returnUrl,
      cancelUrl,
      storeId,
      customerName,
      customerEmail,
      customerPhone,
      webhookUrl,
    });
  }

  return initiateDemoPayment({
    orderId,
    amount,
    currency,
    description,
    returnUrl,
    cancelUrl,
    storeId,
    customerName,
    customerEmail,
    backendBaseUrl: backendBaseUrl || BACKEND_URL,
  });
}

async function initiatePayMongoPayment({
  orderId,
  amount,
  currency,
  description,
  returnUrl,
  cancelUrl,
  storeId,
}) {
  console.log(`[GCash/PayMongo] Initiating payment for order ${orderId}, amount: ${amount} PHP`);

  const response = await axios.post(
    'https://api.paymongo.com/v1/sources',
    {
      data: {
        attributes: {
          amount: toCentavos(amount),
          redirect: {
            success: returnUrl,
            failed: cancelUrl,
          },
          type: 'gcash',
          currency: currency || 'PHP',
          description: description || `Order #${orderId}`,
          metadata: {
            order_id: String(orderId),
            store_id: String(storeId),
          },
        },
      },
    },
    {
      headers: {
        Authorization: paymongoAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    }
  );

  const source = response.data?.data;
  const attrs = source?.attributes || {};
  const checkoutUrl = attrs.redirect?.checkout_url;

  if (!source?.id || !checkoutUrl) {
    throw new Error('PayMongo did not return a GCash checkout URL');
  }

  const expiresAt = attrs.expires_at
    ? new Date(attrs.expires_at * 1000).toISOString()
    : new Date(Date.now() + 30 * 60 * 1000).toISOString();

  return {
    success: true,
    sessionId: source.id,
    paymentUrl: checkoutUrl,
    deepLinkUrl: checkoutUrl,
    qrCodeUrl: buildQrImageUrl(checkoutUrl),
    orderId,
    amount,
    expiresAt,
    provider: 'paymongo',
  };
}

function initiateDemoPayment({
  orderId,
  amount,
  description,
  returnUrl,
  cancelUrl,
  storeId,
  customerName,
  customerEmail,
  backendBaseUrl,
}) {
  const sessionId = createSessionId('demo');
  const base = (backendBaseUrl || BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
  const paymentUrl = `${base}/api/gcash/demo-checkout/${sessionId}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  demoSessions.set(sessionId, {
    sessionId,
    orderId,
    storeId,
    amount: parseFloat(amount),
    status: 'pending',
    description: description || `Order #${orderId}`,
    customerName,
    customerEmail,
    returnUrl,
    cancelUrl,
    referenceNumber: null,
    transactionId: null,
    createdAt: new Date().toISOString(),
    expiresAt,
  });

  console.log(`[GCash/Demo] Session ${sessionId} created for order ${orderId}`);

  return {
    success: true,
    sessionId,
    paymentUrl,
    deepLinkUrl: paymentUrl,
    qrCodeUrl: buildQrImageUrl(paymentUrl),
    orderId,
    amount,
    expiresAt,
    provider: 'demo',
  };
}

/**
 * Verify payment status
 */
async function verifyPayment(sessionId) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  if (sessionId.startsWith('demo_') || !isPayMongoEnabled()) {
    return verifyDemoPayment(sessionId);
  }

  return verifyPayMongoPayment(sessionId);
}

async function verifyPayMongoPayment(sessionId) {
  try {
    console.log(`[GCash/PayMongo] Verifying source: ${sessionId}`);

    const response = await axios.get(`https://api.paymongo.com/v1/sources/${sessionId}`, {
      headers: {
        Authorization: paymongoAuthHeader(),
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    const source = response.data?.data;
    const attrs = source?.attributes || {};
    const rawStatus = attrs.status; // pending | chargeable | paid | failed | cancelled | expired

    let status = 'pending';
    if (rawStatus === 'chargeable' || rawStatus === 'paid') status = 'success';
    else if (rawStatus === 'failed' || rawStatus === 'expired') status = 'failed';
    else if (rawStatus === 'cancelled') status = 'cancelled';

    // When chargeable, create the Payment to capture funds
    if (rawStatus === 'chargeable') {
      try {
        await createPayMongoPaymentFromSource(source);
        status = 'success';
      } catch (err) {
        console.error('[GCash/PayMongo] Create payment failed:', err.message);
      }
    }

    return {
      success: true,
      status,
      referenceNumber: attrs.provider_id || source.id,
      transactionId: source.id,
      amount: attrs.amount != null ? attrs.amount / 100 : null,
      paidAt: status === 'success' ? new Date().toISOString() : null,
      metadata: attrs.metadata || {},
      provider: 'paymongo',
    };
  } catch (error) {
    console.error('[GCash/PayMongo] Verification error:', error.response?.data || error.message);
    return {
      success: false,
      status: 'error',
      error: error.response?.data?.errors?.[0]?.detail || error.message,
    };
  }
}

async function createPayMongoPaymentFromSource(source) {
  const amount = source.attributes.amount;
  const response = await axios.post(
    'https://api.paymongo.com/v1/payments',
    {
      data: {
        attributes: {
          amount,
          source: { id: source.id, type: 'source' },
          currency: source.attributes.currency || 'PHP',
          description: source.attributes.description || 'GCash payment',
        },
      },
    },
    {
      headers: {
        Authorization: paymongoAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    }
  );
  return response.data?.data;
}

function verifyDemoPayment(sessionId) {
  const session = demoSessions.get(sessionId);
  if (!session) {
    // Session may exist only in DB (server restart). Treat as pending for polling.
    return {
      success: true,
      status: 'pending',
      referenceNumber: null,
      transactionId: sessionId,
      amount: null,
      paidAt: null,
      provider: 'demo',
    };
  }

  return {
    success: true,
    status: session.status,
    referenceNumber: session.referenceNumber,
    transactionId: session.transactionId || sessionId,
    amount: session.amount,
    paidAt: session.paidAt || null,
    metadata: { order_id: session.orderId, store_id: session.storeId },
    provider: 'demo',
  };
}

/**
 * Mark demo session as paid (used by demo checkout page)
 */
function completeDemoPayment(sessionId) {
  const session = demoSessions.get(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }
  if (session.status === 'success') {
    return { success: true, data: session };
  }

  session.status = 'success';
  session.referenceNumber = `DEMO-${Date.now()}`;
  session.transactionId = sessionId;
  session.paidAt = new Date().toISOString();
  demoSessions.set(sessionId, session);

  return { success: true, data: session };
}

function getDemoSession(sessionId) {
  return demoSessions.get(sessionId) || null;
}

function cancelDemoPayment(sessionId) {
  const session = demoSessions.get(sessionId);
  if (!session) return { success: false, error: 'Session not found' };
  session.status = 'cancelled';
  demoSessions.set(sessionId, session);
  return { success: true, message: 'Payment cancelled' };
}

/**
 * Process webhook (PayMongo or legacy HMAC)
 */
function processWebhook(webhookData, signature, rawBody) {
  if (isPayMongoEnabled()) {
    return processPayMongoWebhook(webhookData, signature, rawBody);
  }

  try {
    const signatureData = typeof rawBody === 'string' ? rawBody : JSON.stringify(webhookData);
    const expected = crypto
      .createHmac('sha256', process.env.GCASH_SECRET_KEY || 'TEST_SECRET_KEY')
      .update(signatureData)
      .digest('hex');

    if (signature && signature !== expected) {
      return { success: false, error: 'Invalid signature' };
    }

    return {
      success: true,
      data: {
        status: webhookData.status,
        sessionId: webhookData.session_id,
        referenceNumber: webhookData.reference_number,
        transactionId: webhookData.transaction_id,
        orderId: webhookData.metadata?.order_id,
        storeId: webhookData.metadata?.store_id,
        amount: webhookData.amount,
        currency: webhookData.currency,
        paidAt: webhookData.paid_at,
        eventType: webhookData.event_type,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function processPayMongoWebhook(webhookData, signature, rawBody) {
  try {
    // Optional signature check when webhook secret is configured
    if (PAYMONGO_WEBHOOK_SECRET && signature) {
      const expected = crypto
        .createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
        .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(webhookData))
        .digest('hex');
      if (signature !== expected && signature !== `sha256=${expected}`) {
        console.warn('[GCash/PayMongo] Invalid webhook signature');
        return { success: false, error: 'Invalid signature' };
      }
    }

    const eventType = webhookData?.data?.attributes?.type || webhookData?.type;
    const resource = webhookData?.data?.attributes?.data || webhookData?.data;
    const attrs = resource?.attributes || {};
    const sessionId = resource?.id;

    let status = 'pending';
    if (
      eventType === 'source.chargeable' ||
      attrs.status === 'chargeable' ||
      attrs.status === 'paid' ||
      eventType === 'payment.paid'
    ) {
      status = 'success';
    } else if (attrs.status === 'failed' || eventType === 'payment.failed') {
      status = 'failed';
    } else if (attrs.status === 'cancelled') {
      status = 'cancelled';
    }

    return {
      success: true,
      data: {
        status,
        sessionId,
        referenceNumber: attrs.provider_id || sessionId,
        transactionId: sessionId,
        orderId: attrs.metadata?.order_id,
        storeId: attrs.metadata?.store_id,
        amount: attrs.amount != null ? attrs.amount / 100 : null,
        currency: attrs.currency || 'PHP',
        paidAt: new Date().toISOString(),
        eventType,
      },
    };
  } catch (error) {
    console.error('[GCash/PayMongo] Webhook error:', error.message);
    return { success: false, error: error.message };
  }
}

async function cancelPayment(sessionId) {
  if (!sessionId) throw new Error('Session ID is required');

  if (sessionId.startsWith('demo_') || !isPayMongoEnabled()) {
    return cancelDemoPayment(sessionId);
  }

  // PayMongo sources are not always cancellable via API; mark locally
  return { success: true, message: 'Payment session marked cancelled' };
}

async function refundPayment() {
  return {
    success: false,
    error: 'Refunds must be processed in the PayMongo dashboard for this integration',
  };
}

function generateSignature(data, secretKey = process.env.GCASH_SECRET_KEY || 'TEST_SECRET_KEY') {
  return crypto.createHmac('sha256', secretKey).update(data).digest('hex');
}

module.exports = {
  initiatePayment,
  verifyPayment,
  processWebhook,
  cancelPayment,
  refundPayment,
  generateSignature,
  completeDemoPayment,
  getDemoSession,
  isPayMongoEnabled,
  buildQrImageUrl,
  GCASH_ENVIRONMENT,
};
