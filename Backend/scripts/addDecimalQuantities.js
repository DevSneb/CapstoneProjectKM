require('dotenv').config();
const db = require('../config/database');

async function run() {
  try {
    await db.query('ALTER TABLE products MODIFY COLUMN stock DECIMAL(10,3) NOT NULL DEFAULT 0');
    await db.query('ALTER TABLE order_items MODIFY COLUMN quantity DECIMAL(10,3) NOT NULL');
    console.log('Updated stock and order item quantities to support decimals.');
  } catch (err) {
    console.error('Failed to update decimal quantities:', err.message || err);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

run();
