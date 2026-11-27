const XENDIT_BASE_URL = 'https://api.xendit.co';

function isXenditConfigured() {
  return Boolean(process.env.XENDIT_API_KEY && String(process.env.XENDIT_API_KEY).trim());
}

function getXenditAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
}

function buildInvoicePayload({
  amount,
  externalId,
  description,
  customerName,
  email,
  phone,
  successRedirectUrl,
  failureRedirectUrl
}) {
  const payload = {
    external_id: externalId,
    amount: Number(amount || 0),
    description: description || 'Kadiwa GCash payment',
    currency: 'PHP',
    payment_methods: ['GCASH']
  };

  const customer = {};
  if (customerName) {
    const nameParts = String(customerName).trim().split(/\s+/);
    customer.given_names = nameParts[0] || customerName;
    customer.surname = nameParts.slice(1).join(' ');
  }
  if (email) customer.email = email;
  if (phone) customer.mobile_number = phone;

  if (Object.keys(customer).length > 0) {
    payload.customer = customer;
  }

  if (successRedirectUrl) payload.success_redirect_url = successRedirectUrl;
  if (failureRedirectUrl) payload.failure_redirect_url = failureRedirectUrl;

  return payload;
}

async function createGcashInvoice(options = {}) {
  const apiKey = process.env.XENDIT_API_KEY;
  if (!apiKey) {
    throw new Error('XENDIT_API_KEY is not configured. Set it in Backend/.env to enable GCash via Xendit.');
  }

  const amount = Number(options.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('A valid amount is required to create a Xendit GCash invoice.');
  }

  const payload = buildInvoicePayload(options);
  const controller = new AbortController();
  const timeoutMs = Number(process.env.XENDIT_TIMEOUT_MS || 15000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${XENDIT_BASE_URL}/v2/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': getXenditAuthHeader(apiKey),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      body = { raw: text };
    }

    if (!response.ok) {
      const details = body?.message || body?.error_code || 'Xendit invoice creation failed';
      throw new Error(details);
    }

    return {
      id: body.id,
      status: body.status,
      amount: Number(body.amount || amount),
      currency: body.currency || 'PHP',
      invoice_url: body.invoice_url,
      payment_method: body.payment_method || 'GCASH'
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Xendit payment gateway timed out. Please try again in a moment or use manual GCash reference payment.');
    }

    const message = error?.message || 'Xendit payment gateway request failed.';
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  XENDIT_BASE_URL,
  isXenditConfigured,
  buildInvoicePayload,
  createGcashInvoice
};
