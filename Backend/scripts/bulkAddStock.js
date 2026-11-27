require('dotenv').config();
const db = require('../config/database');

async function run() {
  const args = process.argv.slice(2);
  const incArg = args.find(a => a.startsWith('--inc='));
  const setArg = args.find(a => a.startsWith('--set='));
  const storeArg = args.find(a => a.startsWith('--store='));

  const inc = incArg ? parseInt(incArg.split('=')[1], 10) : 20; // default +20
  const setVal = setArg ? parseInt(setArg.split('=')[1], 10) : null;
  const storeId = storeArg ? parseInt(storeArg.split('=')[1], 10) : null;

  if (Number.isNaN(inc) || (setVal !== null && Number.isNaN(setVal))) {
    console.error('Invalid --inc or --set value.');
    process.exit(1);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    let sql, params;
    if (setVal !== null) {
      sql = 'UPDATE products SET stock = ?' + (storeId ? ' WHERE store_owner_id = ?' : '');
      params = storeId ? [setVal, storeId] : [setVal];
    } else {
      sql = 'UPDATE products SET stock = COALESCE(stock, 0) + ?' + (storeId ? ' WHERE store_owner_id = ?' : '');
      params = storeId ? [inc, storeId] : [inc];
    }

    const [result] = await connection.query(sql, params);
    await connection.commit();

    console.log(`${result.affectedRows} product(s) updated.`);
    if (storeId) console.log(`Store owner id: ${storeId}`);
    if (setVal !== null) console.log(`Set stock to: ${setVal}`); else console.log(`Incremented stock by: ${inc}`);
  } catch (err) {
    await connection.rollback();
    console.error('Failed to update stock:', err.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    process.exit();
  }
}

run();
