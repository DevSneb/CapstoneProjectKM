require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const db = require('../config/database');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--storeId') options.storeId = parseInt(args[++i], 10);
    else if (a === '--storeName') options.storeName = args[++i];
    else if (a === '--file') options.file = args[++i];
    else if (a === '--sheet') options.sheet = args[++i];
  }
  return options;
}

async function resolveStoreOwnerId(options) {
  if (options.storeId) return options.storeId;
  if (process.env.STORE_OWNER_ID) return parseInt(process.env.STORE_OWNER_ID, 10);
  if (options.storeName) {
    const [rows] = await db.query('SELECT id FROM store_owners WHERE store_name = ?', [options.storeName]);
    if (!rows.length) throw new Error(`Store owner with store_name="${options.storeName}" not found`);
    return rows[0].id;
  }
  throw new Error('Provide --storeId or --storeName or set STORE_OWNER_ID env');
}

function normaliseHeader(h) {
  const raw = String(h || '').trim().toLowerCase();
  const key = raw.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (key === 'product' || key === 'name' || key === 'item' || key === 'product name' || key === 'item name') return 'product';
  if (key === 'description' || key === 'desc') return 'description';
  if (key === 'unit' || key === 'uom' || key === 'measure') return 'unit';
  if (key === 'cost' || key === 'unit cost' || key === 'purchase cost') return 'cost';
  if (key === 'srp' || key === 'price' || key === 'selling price') return 'srp';
  if ((key.includes('srp') || key.includes('price')) && key.includes('vat')) return 'srp_vat';
  if (key === 'category' || key === 'cat' || key === 'type') return 'category';
  return key.replace(/\s+/g, '_');
}

function toValidatedEntry(row, index) {
  // Flexible headers: accept either srp or price, and allow missing cost/srp_vat
  const requiredMinimal = ['product', 'description', 'unit', 'category'];
  for (const key of requiredMinimal) {
    if (!(key in row)) throw new Error(`Row ${index + 2} missing column: ${key}`);
  }
  const priceRaw = row.srp !== undefined ? row.srp : row.price;
  const srp = Number(String(priceRaw ?? '0').replace(/,/g, ''));
  const srpVatRaw = row.srp_vat !== undefined ? row.srp_vat : row.price;
  const srp_vat = Number(String(srpVatRaw ?? srp).replace(/,/g, ''));
  const cost = row.cost !== undefined ? Number(String(row.cost).replace(/,/g, '')) : null;
  return {
    name: String(row.product).trim(),
    description: row.description ? String(row.description).trim() : null,
    unit: row.unit ? String(row.unit).trim() : null,
    cost: cost,
    srp: srp,
    srp_vat: srp_vat,
    category: row.category ? String(row.category).trim() : null,
    stock: row.stock !== undefined ? parseInt(String(row.stock).replace(/[^0-9-]/g, ''), 10) || 0 : 0,
    status: row.status ? String(row.status).trim().toLowerCase() : 'active'
  };
}

function readXLSX(filePath, sheetName) {
  const fullPath = path.resolve(__dirname, filePath || './products_store1.xlsx');
  const wb = XLSX.readFile(fullPath);
  const name = sheetName || wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`Sheet not found: ${name}`);
  const rowsRaw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  // Normalise keys
  return rowsRaw.map(r => {
    const out = {};
    Object.keys(r).forEach(k => {
      out[normaliseHeader(k)] = r[k];
    });
    return out;
  });
}

async function importProducts(storeOwnerId, rows) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    for (let i = 0; i < rows.length; i++) {
      const v = toValidatedEntry(rows[i], i);
      const price = isNaN(v.srp_vat) || v.srp_vat === 0 ? v.srp : v.srp_vat;
      await connection.query(
        'INSERT INTO products (store_owner_id, name, description, price, stock, status, unit, cost, srp, srp_vat, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [storeOwnerId, v.name, v.description, price, v.stock, v.status || 'active', v.unit, v.cost, v.srp, v.srp_vat, v.category]
      );
    }

    await connection.commit();
    console.log(`Imported ${rows.length} products for store_owner_id=${storeOwnerId}`);
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
    const rows = readXLSX(options.file, options.sheet);
    if (!rows.length) {
      console.log('No rows to import.');
      process.exit(0);
    }
    await importProducts(storeOwnerId, rows);
    process.exit(0);
  } catch (err) {
    console.error('Import failed:', err.message);
    process.exit(1);
  }
}

main();