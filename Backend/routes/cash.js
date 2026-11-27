const express = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware, isStoreOwner } = require('../middleware/auth');
const cashController = require('../controllers/cashController');

const router = express.Router();

router.use(authMiddleware, isStoreOwner);

router.post(
  '/expense',
  [
    body('description').trim().notEmpty().withMessage('description is required').isLength({ max: 255 }).withMessage('description must be at most 255 characters'),
    body('amount').isFloat({ gt: 0 }).withMessage('amount must be greater than 0')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorArray = errors.array()
      return res.status(400).json({
        message: errorArray[0]?.msg || 'Validation failed',
        errors: errorArray
      })
    }
    return cashController.createExpense(req, res);
  }
);

router.get('/summary', cashController.getSummary);
router.get('/statement', cashController.getStatement);

module.exports = router;
