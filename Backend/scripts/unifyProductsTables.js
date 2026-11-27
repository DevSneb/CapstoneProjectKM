require('dotenv').config();
const db = require('../config/database');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dropOld: false, cleanupMeta: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--store2Id') opts.store2Id = parseInt(args[++i], 10);
    else if (a === '--store3Id') opts.store3Id = parseInt(args[++i], 10);
    else if (a === '--dropOld') opts.dropOld = true;
    else if (a === '--keepMeta') opts.cleanupMeta = false;
  }
  return opts;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function ensureUnifiedColumns(connection) {
  const adds = [];
  if (!(await columnExists(connection, 'products', 'unit'))) adds.push('ADD COLUMN unit VARCHAR(50)');
  if (!(await columnExists(connection, 'products', 'cost'))) adds.push('ADD COLUMN cost DECIMAL(10,2)');
  if (!(await columnExists(connection, 'products', 'srp'))) adds.push('ADD COLUMN srp DECIMAL(10,2)');
  if (!(await columnExists(connection, 'products', 'srp_vat'))) adds.push('ADD COLUMN srp_vat DECIMAL(10,2)');
  if (!(await columnExists(connection, 'products', 'category'))) adds.push('ADD COLUMN category VARCHAR(100)');
  if (adds.length) {
    await connection.query(`ALTER TABLE products ${adds.join(', ')}`);
    console.log('Altered products table to add unified meta columns');
  } else {
    console.log('Unified meta columns already present');
  }
}

async function mergeMetaIntoProducts(connection) {
  if (!(await tableExists(connection, 'product_meta'))) {
    console.log('product_meta table not found; skipping merge');
    return;
  }
  const [[{ cnt }]] = await connection.query('SELECT COUNT(*) AS cnt FROM product_meta');
  if (cnt === 0) {
    console.log('No rows in product_meta to merge');
    return;
  }
  await connection.query(
    `UPDATE products p INNER JOIN product_meta m ON m.product_id = p.id
     SET p.unit = m.unit, p.cost = m.cost, p.srp = m.srp, p.srp_vat = m.srp_vat, p.category = m.category`
  );
  console.log('Merged product_meta into products');
}

async function importStoreTable(connection, storeNo, storeOwnerId) {
  const pTable = `products_store${storeNo}`;
  const mTable = `product_meta_store${storeNo}`;
  const [[{ cnt: pCnt }]] = await connection.query(`SELECT COUNT(*) AS cnt FROM ${pTable}`);
  if (pCnt === 0) {
    console.log(`${pTable} is empty; skipping`);
    return;
  }
  if (!storeOwnerId || isNaN(storeOwnerId)) {
    console.log(`No storeOwnerId provided for store${storeNo}; skipping import`);
    return;
  }
  await connection.query(
    `INSERT INTO products (store_owner_id, name, description, price, stock, status, unit, cost, srp, srp_vat, category, created_at, updated_at)
     SELECT ?, p.name, p.description, p.price, p.stock, p.status, m.unit, m.cost, m.srp, m.srp_vat, m.category, p.created_at, p.updated_at
     FROM ${pTable} p LEFT JOIN ${mTable} m ON m.product_id = p.id`,
    [storeOwnerId]
  );
  console.log(`Imported ${pTable} (+ ${mTable}) into products for store_owner_id=${storeOwnerId}`);
}

async function dropOldTables(connection, dropMeta) {
  // Disable FK checks to avoid drop order issues
  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  // Drop meta tables first (they reference products_storeX)
  await connection.query('DROP TABLE IF EXISTS product_meta_store2');
  await connection.query('DROP TABLE IF EXISTS product_meta_store3');
  // Then drop products_storeX tables
  await connection.query('DROP TABLE IF EXISTS products_store2');
  await connection.query('DROP TABLE IF EXISTS products_store3');
  // Optionally drop global product_meta
  if (dropMeta) {
    await connection.query('DROP TABLE IF EXISTS product_meta');
  }
  await connection.query('SET FOREIGN_KEY_CHECKS=1');
  console.log('Dropped old store-specific tables' + (dropMeta ? ' and product_meta' : ''));
}

async function main() {
  const opts = parseArgs();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await ensureUnifiedColumns(connection);
    await mergeMetaIntoProducts(connection);

    await importStoreTable(connection, 2, opts.store2Id);
    await importStoreTable(connection, 3, opts.store3Id);

    if (opts.dropOld) {
      await dropOldTables(connection, opts.cleanupMeta);
    }

    await connection.commit();
    console.log('Unified products migration complete.');
    process.exit(0);
  } catch (err) {
    await connection.rollback();
    console.error('Unify migration failed:', err);
    process.exit(1);
  } finally {
    connection.release();
  }
}

main();
