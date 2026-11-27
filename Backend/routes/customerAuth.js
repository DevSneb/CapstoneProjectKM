const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const RegistrationOtp = require('../models/RegistrationOtp');
const { sendRegistrationOtpEmail, sendPasswordResetOtpEmail, getSmtpConfig } = require('../services/emailService');
const PasswordResetOtp = require('../models/PasswordResetOtp');

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PHONE_RULE = /^09\d{9}$/;

function mapAuthError(error) {
  if (error && typeof error.message === 'string' && error.message.includes('secretOrPrivateKey')) {
    return { status: 500, message: 'Server configuration error (JWT secret missing)' };
  }

  if (error && error.code === 'ER_ACCESS_DENIED_ERROR') {
    return { status: 500, message: 'Database access denied' };
  }

  if (error && (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND')) {
    return { status: 500, message: 'Database connection failed' };
  }

  return { status: 500, message: 'Server error' };
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[\s-]/g, '');
}

async function issueRegistrationOtp(payload) {
  const otp = RegistrationOtp.generateOtp();
  await RegistrationOtp.upsertPending({
    email: payload.email,
    username: payload.username,
    payload,
    otp
  });
  const mail = await sendRegistrationOtpEmail({
    to: payload.email,
    otp,
    fullName: payload.full_name
  });
  return { otp, mail };
}

// Customer Login
router.post('/login', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    const customer = await Customer.findByUsername(username);
    if (!customer) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await Customer.comparePassword(password, customer.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: customer.id, username: customer.username, role: customer.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: customer.id,
        username: customer.username,
        email: customer.email,
        full_name: customer.full_name,
        phone: customer.phone,
        address: customer.address,
        home_address: customer.home_address,
        work_address: customer.work_address,
        latitude: customer.latitude,
        longitude: customer.longitude,
        role: customer.role
      }
    });
  } catch (error) {
    console.error('Customer login failed:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    const mapped = mapAuthError(error);
    res.status(mapped.status).json({ message: mapped.message });
  }
});

const registerValidators = [
  body('username').notEmpty().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password')
    .matches(PASSWORD_RULE)
    .withMessage('Password must be at least 8 characters and include a letter, a number, and a special character'),
  body('full_name').notEmpty().withMessage('Full name is required'),
  body('phone')
    .notEmpty().withMessage('Phone is required')
    .custom((value) => PHONE_RULE.test(normalizePhone(value)))
    .withMessage('Phone must be an 11-digit number starting with 09'),
  body('address').optional({ nullable: true }).isString()
];

// Start registration: validate + send email OTP (account created only after verify)
router.post('/register', registerValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const full_name = String(req.body.full_name || '').trim();
    const phoneRaw = normalizePhone(req.body.phone);
    const phone = phoneRaw || null;
    const address = req.body.address ? String(req.body.address).trim() : null;

    if (phone && !PHONE_RULE.test(phone)) {
      return res.status(400).json({ message: 'Phone must be an 11-digit number starting with 09' });
    }

    const existingUsername = await Customer.findByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const existingEmail = await Customer.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    await RegistrationOtp.cleanupExpired();

    const payload = { username, email, password, full_name, phone, address };
    const { mail } = await issueRegistrationOtp(payload);

    const response = {
      message: mail.sent
        ? 'Verification code sent to your email. Enter the OTP to finish registration.'
        : (mail.reason === 'SMTP not configured'
          ? 'Verification code generated, but email is not configured on the server yet.'
          : `Verification code generated, but email could not be sent (${mail.reason || 'SMTP error'}). Check server logs for the OTP.`),
      requires_otp: true,
      email,
      smtp_configured: getSmtpConfig().configured,
      email_sent: !!mail.sent
    };

    // Help local/dev testing when SMTP is not set
    if (!getSmtpConfig().configured && process.env.NODE_ENV !== 'production') {
      response.dev_hint = 'SMTP is not configured; OTP was logged on the server console.';
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Customer registration OTP failed:', {
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      message: error.message,
      stack: error.stack
    });
    if (error && error.code === 'MODULE_NOT_FOUND') {
      return res.status(500).json({ message: 'Server missing registration files. Redeploy Backend OTP files.' });
    }
    if (error && (error.code === 'ER_ACCESS_DENIED_ERROR' || error.code === 'ER_TABLEACCESS_DENIED_ERROR')) {
      return res.status(500).json({ message: 'Database permission error creating OTP table.' });
    }
    const mapped = mapAuthError(error);
    res.status(mapped.status).json({
      message: mapped.message,
      detail: process.env.NODE_ENV === 'production' ? undefined : (error.sqlMessage || error.message)
    });
  }
});

// Resend OTP for pending registration
router.post('/register/resend-otp', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const pending = await RegistrationOtp.findByEmail(email);
    if (!pending) {
      return res.status(404).json({ message: 'No pending registration found for this email. Start registration again.' });
    }

    let payload = pending.payload_json;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { payload = null; }
    }
    if (!payload || !payload.password) {
      return res.status(400).json({ message: 'Pending registration expired. Please register again.' });
    }

    const { mail } = await issueRegistrationOtp(payload);
    res.json({
      message: mail.sent ? 'A new verification code was sent to your email.' : 'A new verification code was generated.',
      email,
      smtp_configured: getSmtpConfig().configured
    });
  } catch (error) {
    console.error('Resend OTP failed:', error);
    const mapped = mapAuthError(error);
    res.status(mapped.status).json({ message: mapped.message });
  }
});

// Verify OTP and create customer account
router.post('/register/verify-otp', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('otp').notEmpty().isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();

    const pending = await RegistrationOtp.findByEmail(email);
    if (!pending) {
      return res.status(404).json({ message: 'No pending registration found. Please register again.' });
    }

    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await RegistrationOtp.removeByEmail(email);
      return res.status(400).json({ message: 'Verification code expired. Please register again.' });
    }

    if (Number(pending.attempts || 0) >= 5) {
      await RegistrationOtp.removeByEmail(email);
      return res.status(429).json({ message: 'Too many invalid attempts. Please register again.' });
    }

    const ok = await RegistrationOtp.compareOtp(otp, pending.otp_hash);
    if (!ok) {
      await RegistrationOtp.bumpAttempts(pending.id);
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    let payload = pending.payload_json;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { payload = null; }
    }
    if (!payload) {
      await RegistrationOtp.removeByEmail(email);
      return res.status(400).json({ message: 'Pending registration is invalid. Please register again.' });
    }

    // Re-check uniqueness right before create
    if (await Customer.findByUsername(payload.username)) {
      await RegistrationOtp.removeByEmail(email);
      return res.status(400).json({ message: 'Username already exists' });
    }
    if (await Customer.findByEmail(payload.email)) {
      await RegistrationOtp.removeByEmail(email);
      return res.status(400).json({ message: 'Email already exists' });
    }

    const customerId = await Customer.create({
      username: payload.username,
      email: payload.email,
      password: payload.password,
      full_name: payload.full_name,
      phone: payload.phone,
      address: payload.address
    });

    await RegistrationOtp.removeByEmail(email);

    res.status(201).json({
      message: 'Email verified. Customer registration successful.',
      customerId
    });
  } catch (error) {
    console.error('Verify OTP failed:', error);
    const mapped = mapAuthError(error);
    res.status(mapped.status).json({ message: mapped.message });
  }
});

// Forgot password: send OTP to the account email
router.post('/forgot-password', [
  body('identifier').notEmpty().withMessage('Username or email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Server configuration error (JWT secret missing)' });
    }

    const identifier = String(req.body.identifier || '').trim();
    const customer = await findCustomerByIdentifier(identifier);

    // Always return a generic success message to avoid account enumeration
    const generic = {
      message: 'If an account matches that username or email, a reset code was sent.',
      requires_otp: true
    };

    if (!customer || !customer.email) {
      return res.json({ ...generic, reset_session: null, email_sent: false });
    }

    await PasswordResetOtp.cleanupExpired();
    const otp = PasswordResetOtp.generateOtp();
    const email = String(customer.email).toLowerCase();
    await PasswordResetOtp.upsert({
      customerId: customer.id,
      email,
      otp
    });

    const mail = await sendPasswordResetOtpEmail({
      to: customer.email,
      otp,
      fullName: customer.full_name
    });

    const resetSession = jwt.sign(
      {
        purpose: 'password_reset',
        cid: customer.id,
        email
      },
      process.env.JWT_SECRET,
      { expiresIn: '20m' }
    );

    const response = {
      ...generic,
      reset_session: resetSession,
      email_hint: maskEmail(customer.email),
      email_sent: !!mail.sent,
      smtp_configured: getSmtpConfig().configured
    };

    if (!getSmtpConfig().configured && process.env.NODE_ENV !== 'production') {
      response.dev_hint = 'SMTP is not configured; OTP was logged on the server console.';
    }

    res.json(response);
  } catch (error) {
    console.error('Forgot password failed:', error);
    res.status(500).json({
      message: 'Could not start password reset. Please try again.',
      detail: error.code || error.message
    });
  }
});

// Reset password with OTP
router.post('/reset-password', [
  body('otp').notEmpty().withMessage('Reset code is required')
    .bail()
    .matches(/^\d{6}$/).withMessage('OTP must be 6 digits'),
  body('new_password')
    .matches(PASSWORD_RULE)
    .withMessage('Password must be at least 8 characters and include a letter, a number, and a special character'),
  body('reset_session').optional({ nullable: true }).isString(),
  body('identifier').optional({ nullable: true }).isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Server configuration error (JWT secret missing)' });
    }

    const otp = String(req.body.otp || '').trim();
    const newPassword = String(req.body.new_password || '');
    const resetSession = String(req.body.reset_session || '').trim();
    const identifier = String(req.body.identifier || '').trim();

    let customerId = null;
    let email = null;

    if (resetSession) {
      try {
        const payload = jwt.verify(resetSession, process.env.JWT_SECRET);
        if (!payload || payload.purpose !== 'password_reset' || !payload.cid || !payload.email) {
          return res.status(400).json({ message: 'Reset session expired. Request a new code.' });
        }
        customerId = Number(payload.cid);
        email = String(payload.email).toLowerCase();
      } catch (_) {
        return res.status(400).json({ message: 'Reset session expired. Request a new code.' });
      }
    } else if (identifier) {
      const customer = await findCustomerByIdentifier(identifier);
      if (!customer || !customer.email) {
        return res.status(400).json({ message: 'Invalid reset request. Check your username/email and try again.' });
      }
      customerId = Number(customer.id);
      email = String(customer.email).toLowerCase();
    } else {
      return res.status(400).json({ message: 'Reset session missing. Request a new code.' });
    }

    const pending = await PasswordResetOtp.findByEmail(email);
    if (!pending) {
      return res.status(400).json({ message: 'No reset code found. Request a new one.' });
    }

    if (Number(pending.customer_id) !== customerId) {
      return res.status(400).json({ message: 'Invalid reset request.' });
    }

    if (PasswordResetOtp.isExpiredRow(pending)) {
      await PasswordResetOtp.removeByEmail(email);
      return res.status(400).json({ message: 'Reset code expired. Request a new one.' });
    }

    if (Number(pending.attempts || 0) >= 5) {
      await PasswordResetOtp.removeByEmail(email);
      return res.status(429).json({ message: 'Too many invalid attempts. Request a new code.' });
    }

    const ok = await PasswordResetOtp.compareOtp(otp, pending.otp_hash);
    if (!ok) {
      await PasswordResetOtp.bumpAttempts(pending.id);
      return res.status(400).json({ message: 'Invalid reset code. Use the newest code from your email.' });
    }

    const updated = await Customer.updatePassword(customerId, newPassword);
    if (!updated) {
      return res.status(500).json({ message: 'Failed to update password. Please try again.' });
    }
    await PasswordResetOtp.removeByEmail(email);

    res.json({ message: 'Password updated successfully. You can log in with your new password.' });
  } catch (error) {
    console.error('Reset password failed:', error);
    res.status(500).json({
      message: 'Could not reset password. Please request a new code and try again.',
      detail: error.code || error.message
    });
  }
});

async function findCustomerByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  if (value.includes('@')) {
    const byEmail = await Customer.findByEmail(value.toLowerCase());
    if (byEmail) return byEmail;
    return Customer.findByUsername(value);
  }
  const byUsername = await Customer.findByUsername(value);
  if (byUsername) return byUsername;
  return Customer.findByEmail(value.toLowerCase());
}

function maskEmail(email) {
  const value = String(email || '');
  const [user, domain] = value.split('@');
  if (!user || !domain) return '';
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${'*'.repeat(Math.max(3, user.length - visible.length))}@${domain}`;
}

module.exports = router;
