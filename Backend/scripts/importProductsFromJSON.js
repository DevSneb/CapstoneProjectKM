require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--storeId') options.storeId = parseInt(args[++i], 10);
    else if (a === '--storeName') options.storeName = args[++i];
    else if (a === '--file') options.file = args[++i];
  }
  return options;
}

async function resolveStoreOwnerId(options) {
  if (options.storeId) return options.storeId;
  if (process.env.STORE_OWNER_ID) return parseInt(process.env.STORE_OWNER_ID, 10);
  if (options.storeName) {
    const [rows] = await db.query('SELECT id FROM store_owners WHERE store_name = ?', [options.storeName]);
    if (!rows.length) throw new Error(`Store owner with store_name=\"${options.storeName}\" not found`);
    return rows[0].id;
  }
  throw new Error('Provide --storeId or --storeName or set STORE_OWNER_ID env');
}

function readProductsJson(filePath) {
  const fullPath = path.resolve(__dirname, filePath || './products_store1.json');
  if (!fs.existsSync(fullPath)) throw new Error(`Input file not found: ${fullPath}`);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('JSON must be an array of products');
  return data;
}

function validateEntry(entry, index) {
  const required = ['product', 'description', 'unit', 'cost', 'srp', 'srp_vat', 'category'];
  for (const key of required) {
    if (!(key in entry)) throw new Error(`Entry ${index} missing field: ${key}`);
  }
  return {
    name: String(entry.product).trim(),
    description: entry.description ? String(entry.description).trim() : null,
    unit: entry.unit ? String(entry.unit).trim() : null,
    cost: Number(entry.cost),
    srp: Number(entry.srp),
    srp_vat: Number(entry.srp_vat),
    category: entry.category ? String(entry.category).trim() : null
  };
}

async function importProducts(storeOwnerId, products) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    for (let i = 0; i < products.length; i++) {
      const v = validateEntry(products[i], i);
      // Insert unified row into products: use srp_vat as price when available
      await connection.query(
        'INSERT INTO products (store_owner_id, name, description, price, stock, status, unit, cost, srp, srp_vat, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          storeOwnerId,
          v.name,
          v.description,
          isNaN(v.srp_vat) ? v.srp : v.srp_vat,
          0,
          'active',
          v.unit,
          v.cost,
          v.srp,
          v.srp_vat,
          v.category
        ]
      );
    }

    await connection.commit();
    console.log(`Imported ${products.length} products for store_owner_id=${storeOwnerId}`);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function main() {
  try {
    const options = parseArgs();
    const storeOwnerId = await resolveStoreOwnerId(options);
    const products = readProductsJson(options.file);
    await importProducts(storeOwnerId, products);
    process.exit(0);
  } catch (err) {
    console.error('Import failed:', err.message);
    process.exit(1);
  }
}

main();
