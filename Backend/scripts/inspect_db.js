const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../config/database');

(async () => {
  try {
    console.log('Inspecting database...');
    const [admins] = await db.query('SELECT id,username,email,full_name,role,created_at FROM admins ORDER BY id ASC LIMIT 10');
    console.log('\nAdmins (up to 10):');
    console.log(JSON.stringify(admins, null, 2));

    const [stores] = await db.query('SELECT id,username,email,full_name,store_name,status,created_at FROM store_owners ORDER BY id ASC LIMIT 10');
    console.log('\nStore owners (up to 10):');
    console.log(JSON.stringify(stores, null, 2));

    const [pos] = await db.query('SELECT id,username,email,full_name,role,status,created_at FROM pos_users ORDER BY id ASC LIMIT 10');
    console.log('\nPOS users (up to 10):');
    console.log(JSON.stringify(pos, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('DB inspect failed:', err.message || err);
    process.exit(1);
  }
})();
