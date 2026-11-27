const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

async function isPosFeatureEnabled(storeOwnerId) {
  try {
    const [globalRows] = await db.query(
      'SELECT enabled FROM global_feature_flags WHERE feature_key = ? LIMIT 1',
      ['pos']
    );
    const [storeRows] = await db.query(
      'SELECT enabled FROM store_feature_flags WHERE store_owner_id = ? AND feature_key = ? LIMIT 1',
      [storeOwnerId, 'pos']
    );
    const globalEnabled = globalRows.length ? Number(globalRows[0].enabled) === 1 : true;
    return storeRows.length ? Number(storeRows[0].enabled) === 1 : globalEnabled;
  } catch (_) {
    return true;
  }
}

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value || ''));
}

async function findPosUserByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;

  const [byUser] = await db.query(
    'SELECT * FROM pos_users WHERE username = ? OR LOWER(username) = LOWER(?) LIMIT 1',
    [value, value]
  );
  if (byUser[0]) return byUser[0];

  if (value.includes('@')) {
    const [byEmail] = await db.query(
      'SELECT * FROM pos_users WHERE email = ? OR LOWER(email) = LOWER(?) LIMIT 1',
      [value, value]
    );
    if (byEmail[0]) return byEmail[0];
  }
  return null;
}

async function comparePosPassword(plainPassword, storedPassword) {
  const plain = String(plainPassword || '');
  const stored = String(storedPassword || '');
  if (!plain || !stored) return false;
  if (isBcryptHash(stored)) return bcrypt.compare(plain, stored);
  return plain === stored;
}

// POS User Login (email + password; username still accepted for older accounts)
router.post('/login', [
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const identifier = String(req.body.email || req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!identifier) {
      return res.status(400).json({ message: 'Email is required' });
    }

    let posUser;
    try {
      posUser = await findPosUserByIdentifier(identifier);
    } catch (lookupErr) {
      console.error('POS user lookup failed:', lookupErr);
      return res.status(500).json({ message: 'Server error', detail: 'pos_lookup_failed' });
    }

    if (!posUser) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const status = String(posUser.status || '').trim().toLowerCase();
    if (status && status !== 'approved') {
      return res.status(403).json({ message: 'POS account is disabled' });
    }

    let isPasswordValid = false;
    try {
      isPasswordValid = await comparePosPassword(password, posUser.password);
    } catch (pwErr) {
      console.error('POS password compare failed:', pwErr);
      return res.status(500).json({ message: 'Server error', detail: 'pos_password_compare_failed' });
    }
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Upgrade legacy plaintext passwords
    if (!isBcryptHash(posUser.password)) {
      try {
        const hashed = await bcrypt.hash(password, 10);
        await db.query('UPDATE pos_users SET `password` = ? WHERE id = ?', [hashed, posUser.id]);
      } catch (upgradeErr) {
        console.error('Failed to upgrade POS password hash:', upgradeErr.message);
      }
    }

    const [storeRows] = await db.query(
      'SELECT id, store_name, status FROM store_owners WHERE id = ? LIMIT 1',
      [posUser.store_owner_id]
    );
    const store = storeRows[0];
    if (!store || String(store.status) !== 'approved') {
      return res.status(403).json({ message: 'Assigned store is not approved' });
    }
    const posEnabled = await isPosFeatureEnabled(posUser.store_owner_id);
    if (!posEnabled) {
      return res.status(403).json({ message: 'POS is disabled for this store' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET missing');
      return res.status(500).json({ message: 'Server error', detail: 'jwt_secret_missing' });
    }

    const token = jwt.sign(
      {
        id: posUser.id,
        username: posUser.username,
        role: 'pos_user',
        store_owner_id: posUser.store_owner_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: posUser.id,
        username: posUser.username,
        email: posUser.email,
        full_name: posUser.full_name,
        role: 'pos_user',
        store_owner_id: posUser.store_owner_id,
        store_name: store.store_name || 'Store'
      }
    });
  } catch (error) {
    console.error('POS login failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
