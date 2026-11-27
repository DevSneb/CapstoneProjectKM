const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({host:'localhost', port:3306, user:'root', password:'', database:'kadiwa_db'});
    const [rows] = await conn.query('SELECT id, username, email, full_name, store_name, role, status FROM store_owners LIMIT 20');
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (err) {
    console.error('ERR', err.message);
    process.exit(1);
  }
})();