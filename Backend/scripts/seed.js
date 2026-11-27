const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../config/database');
const bcrypt = require('bcryptjs');

function toTitleCase(str) {
  return str
    .replace(/[_.-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

async function upsertAdmin({ email, password, full_name, username }) {
  const [existing] = await db.query('SELECT id FROM admins WHERE email = ?', [email]);
  if (existing.length) {
    console.log(`Admin already exists: ${email}`);
    return existing[0].id;
  }
  const hashed = await bcrypt.hash(password, 10);
  const uname = username || email.split('@')[0];
  const fname = full_name || toTitleCase(uname);
  const [result] = await db.query(
    'INSERT INTO admins (username, email, password, full_name) VALUES (?, ?, ?, ?)',
    [uname, email, hashed, fname]
  );
  console.log(`Inserted admin: ${email}`);
  return result.insertId;
}

async function upsertStoreOwner({ email, password, full_name, username, store_name, phone, address }) {
  const [existing] = await db.query('SELECT id FROM store_owners WHERE email = ?', [email]);
  if (existing.length) {
    console.log(`Store owner already exists: ${email}`);
    return existing[0].id;
  }
  const hashed = await bcrypt.hash(password, 10);
  const uname = username || email.split('@')[0];
  const fname = full_name || toTitleCase(uname);
  let sname = store_name;
  if (!sname) {
    const match = uname.match(/(\d+)$/);
    sname = match ? `Kadiwa Store ${match[1]}` : `Kadiwa Store`;
  }
  const [result] = await db.query(
    'INSERT INTO store_owners (username, email, password, full_name, store_name, phone, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [uname, email, hashed, fname, sname, phone || null, address || null, 'approved']
  );
  console.log(`Inserted store owner: ${email}`);
  return result.insertId;
}

async function main() {
  try {
    console.log('Starting seed...');

    // Admin from user input
    await upsertAdmin({
      email: 'amad_kadiwa@gmail.com',
      password: 'amad123',
      full_name: 'Amad Kadiwa',
      username: 'amad_kadiwa'
    });

    // Store owners from user input
    await upsertStoreOwner({
      email: 'kadiwa1@gmail.com',
      password: 'kadiwastore1',
      full_name: 'Store Admin 1'
    });
    await upsertStoreOwner({
      email: 'kadiwa2@gmail.com',
      password: 'kadiwastore2',
      full_name: 'Store Admin 2'
    });
    await upsertStoreOwner({
      email: 'kadiwa3@gmail.com',
      password: 'kadiwastore3',
      full_name: 'Store Admin 3'
    });

    // Optional: seed sample products only when explicitly enabled via env
    if (process.env.SEED_SAMPLE_PRODUCTS === '1') {
      const [owners] = await db.query('SELECT id FROM store_owners ORDER BY id ASC LIMIT 1');
      if (owners.length) {
        const storeOwnerId = owners[0].id;
        const [existingProducts] = await db.query('SELECT COUNT(*) as count FROM products WHERE store_owner_id = ?', [storeOwnerId]);
        if (existingProducts[0].count === 0) {
          const products = [
            { name: 'Organic Rice (5kg)', description: 'Locally farmed premium rice', price: 320.0, stock: 50 },
            { name: 'Fresh Eggs (dozen)', description: 'Free-range eggs', price: 120.0, stock: 30 },
            { name: 'Brown Sugar (1kg)', description: 'Unrefined cane sugar', price: 65.0, stock: 80 }
          ];
          for (const p of products) {
            await db.query(
              'INSERT INTO products (store_owner_id, name, description, price, stock, status) VALUES (?, ?, ?, ?, ?, "active")',
              [storeOwnerId, p.name, p.description, p.price, p.stock]
            );
          }
          console.log('Inserted sample products for first store owner');
        } else {
          console.log('Products already exist for first store owner, skipping sample products...');
        }
      }
    } else {
      console.log('Skipping sample products (SEED_SAMPLE_PRODUCTS != 1)');
    }

    console.log('Seed complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

main();
