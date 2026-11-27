const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Admin = require('../models/Admin');
const StoreOwner = require('../models/StoreOwner');
const PosUser = require('../models/PosUser');

// Admin Login
router.post('/login/admin', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;
    const identifier = username;

    // Find admin by username or email
    const admin = identifier && identifier.includes('@')
      ? await Admin.findByEmail(identifier)
      : await Admin.findByUsername(identifier);
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await Admin.comparePassword(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Store Owner Login
router.post('/login/store-owner', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;
    const identifier = username;

    // Find store owner by username or email
    const trimmed = String(identifier || '').trim();
    let storeOwner = await StoreOwner.findByUsername(trimmed);
    if (!storeOwner && trimmed.includes('@')) {
      storeOwner = await StoreOwner.findByEmail(trimmed);
    }
    if (!storeOwner) {
      // Helpful hint when a POS cashier uses the store-owner login page
      try {
        if (typeof PosUser.findByLoginIdentifier === 'function') {
          const posUser = await PosUser.findByLoginIdentifier(trimmed);
          if (posUser) {
            return res.status(401).json({
              message: 'This is a POS cashier account. Please sign in at /pos/login or use the POS tab'
            });
          }
        }
      } catch (_) { /* ignore hint lookup errors */ }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if account is approved
    if (storeOwner.status !== 'approved') {
      return res.status(403).json({ 
        message: `Your account is ${storeOwner.status}. Please wait for admin approval.` 
      });
    }

    // Verify password
    const isPasswordValid = await StoreOwner.comparePassword(password, storeOwner.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: storeOwner.id, username: storeOwner.username, role: storeOwner.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: storeOwner.id,
        username: storeOwner.username,
        email: storeOwner.email,
        full_name: storeOwner.full_name,
        store_name: storeOwner.store_name,
        role: storeOwner.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Store Owner Registration
router.post('/register/store-owner', [
  body('username').notEmpty().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('full_name').notEmpty().withMessage('Full name is required'),
  body('store_name').notEmpty().withMessage('Store name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, full_name, store_name, phone, address } = req.body;

    // Check if username exists
    const existingUsername = await StoreOwner.findByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Check if email exists
    const existingEmail = await StoreOwner.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Create store owner
    const storeOwnerId = await StoreOwner.create({
      username,
      email,
      password,
      full_name,
      store_name,
      phone,
      address
    });

    res.status(201).json({
      message: 'Store owner registration successful. Please wait for admin approval.',
      storeOwnerId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
