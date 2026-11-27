require('dotenv').config();
const db = require('../config/database');

async function run() {
  try {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'products'
         AND COLUMN_NAME = 'market_price'`
    );
    if (Number(row?.cnt || 0) > 0) {
      console.log('products.market_price already exists.');
      return;
    }
    await db.query(
      'ALTER TABLE products ADD COLUMN market_price DECIMAL(10,2) NULL AFTER price'
    );
    console.log('Added products.market_price column.');
  } catch (err) {
    if (/Duplicate column name/i.test(String(err?.message || ''))) {
      console.log('products.market_price already exists.');
      return;
    }
    console.error('Failed to add market_price column:', err.message || err);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

run();
