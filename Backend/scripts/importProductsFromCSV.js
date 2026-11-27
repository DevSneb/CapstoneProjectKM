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
    if (!rows.length) throw new Error(`Store owner with store_name="${options.storeName}" not found`);
    return rows[0].id;
  }
  throw new Error('Provide --storeId or --storeName or set STORE_OWNER_ID env');
}

function readCSV(filePath) {
  const fullPath = path.resolve(__dirname, filePath || './products_store1.csv');
  if (!fs.existsSync(fullPath)) throw new Error(`Input file not found: ${fullPath}`);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  // Parse header and normalise keys
  const headerCells = splitCSVLine(lines[0]);
  const headers = headerCells.map(h => normaliseHeader(h));
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = cells[c] !== undefined ? cells[c] : '';
    }
    records.push(row);
  }
  return records;
}

function splitCSVLine(line) {
  // Splits by commas while respecting quoted fields
  const regex = /\s*(?:"([^"]*)"|([^,]*))\s*(?:,|$)/g;
  const result = [];
  let match;
  while ((match = regex.exec(line)) !== null) {
    const value = match[1] !== undefined ? match[1] : match[2];
    result.push(value);
  }
  // Remove possible trailing empty capture
  if (result.length && result[result.length - 1] === '') result.pop();
  return result;
}

function normaliseHeader(h) {
  const raw = String(h || '').trim().toLowerCase();
  const key = raw.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (key === 'product') return 'product';
  if (key === 'description') return 'description';
  if (key === 'unit') return 'unit';
  if (key === 'cost') return 'cost';
  if (key === 'srp') return 'srp';
  if (key.includes('srp') && key.includes('vat')) return 'srp_vat';
  if (key === 'category') return 'category';
  return key.replace(/\s+/g, '_');
}

function toValidatedEntry(row, index) {
  const required = ['product', 'description', 'unit', 'cost', 'srp', 'srp_vat', 'category'];
  for (const key of required) {
    if (!(key in row)) throw new Error(`Row ${index + 2} missing column: ${key}`);
  }
  return {
    name: String(row.product).trim(),
    description: row.description ? String(row.description).trim() : null,
    unit: row.unit ? String(row.unit).trim() : null,
    cost: Number(String(row.cost).replace(/,/g, '')),
    srp: Number(String(row.srp).replace(/,/g, '')),
    srp_vat: Number(String(row.srp_vat).replace(/,/g, '')),
    category: row.category ? String(row.category).trim() : null
  };
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
        [storeOwnerId, v.name, v.description, price, 0, 'active', v.unit, v.cost, v.srp, v.srp_vat, v.category]
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
    const rows = readCSV(options.file);
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