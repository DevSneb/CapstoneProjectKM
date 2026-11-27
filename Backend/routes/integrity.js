const express = require('express');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const DataIntegrityService = require('../services/dataIntegrityService');

const router = express.Router();

// Restrict module to DA Admin for controlled handling of customer PII and reports.
router.use(authMiddleware, isAdmin);

router.get('/records', async (req, res) => {
  try {
    const data = await DataIntegrityService.listRecords(req.query.limit || 50);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || 'Failed to list secured records' });
  }
});

// Create a secured record:
// - encrypt customer details and document using AES-256-GCM
// - store encrypted blobs off-chain
// - hash encrypted payloads using SHA-256
// - anchor hashes in blockchain-like ledger blocks
router.post('/records', async (req, res) => {
  try {
    const result = await DataIntegrityService.createSecuredRecord(req.body, req.user.id);
    return res.status(201).json({
      message: 'Secured record created and anchored on ledger',
      ...result
    });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ message: err.message || 'Failed to create secured record' });
  }
});

// Verify integrity for one target:
// target=customer or target=document
router.get('/records/:recordRef/verify', async (req, res) => {
  try {
    const target = String(req.query.target || 'customer').toLowerCase();
    const result = await DataIntegrityService.verifyRecordIntegrity(req.params.recordRef, target);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(400).json({ message: err.message || 'Failed to verify integrity' });
  }
});

module.exports = router;
