const db = require('../config/database');

async function columnExists(table, column, connection = db) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(row?.cnt || 0) > 0;
}

async function main() {
  try {
    const exists = await columnExists('orders', 'delivery_address');
    if (!exists) {
      await db.query('ALTER TABLE orders ADD COLUMN delivery_address VARCHAR(255) NULL AFTER shipping_method');
      console.log('Added delivery_address column to orders.');
    } else {
      console.log('delivery_address column already exists.');
    }
    process.exit(0);
  } catch (err) {
    console.error('Failed to add delivery_address column:', err);
    process.exit(1);
  }
}

main();