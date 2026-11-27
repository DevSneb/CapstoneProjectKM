const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({host:'localhost', port:3306, user:'root', password:'', database:'kadiwa_db'});
    const [rows] = await conn.query('SELECT id, store_owner_id, barangay_name, delivery_fee FROM store_delivery_barangays WHERE store_owner_id = 1 ORDER BY barangay_name ASC LIMIT 10');
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (err) {
    console.error('ERR', err.message);
    process.exit(1);
  }
})();