require('dotenv').config();
const db = require('../config/database');

async function run() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('UPDATE store_owners SET store_name = ? WHERE id = ?', ['Calsedeco Kadiwa', 1]);
    await conn.query('UPDATE store_owners SET store_name = ? WHERE id = ?', ['Papandungin Kadiwa', 2]);
    await conn.query('UPDATE store_owners SET store_name = ? WHERE id = ?', ['Jubilee Kadiwa', 3]);

    await conn.commit();
    console.log('Store names updated successfully.');
  } catch (err) {
    await conn.rollback();
    console.error('Failed to update store names:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit();
  }
}

run();
