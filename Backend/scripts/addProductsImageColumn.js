require('dotenv').config();
const db = require('../config/database');

async function run() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('ALTER TABLE products ADD COLUMN image_url VARCHAR(255) NULL AFTER category');
    await conn.commit();
    console.log('Added image_url column to products.');
  } catch (err) {
    await conn.rollback();
    if (/Duplicate column name/i.test(err.message)) {
      console.log('Column already exists. No changes applied.');
    } else {
      console.error('Failed to alter products:', err.message);
      process.exitCode = 1;
    }
  } finally {
    conn.release();
    process.exit();
  }
}

run();
