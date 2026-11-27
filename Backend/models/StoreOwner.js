const db = require('../config/database');
const bcrypt = require('bcryptjs');

const BARANGAYS = [
  'Balingayan', 'Balite', 'Baruyan', 'Batino', 'Bayanan I', 'Bayanan II', 'Biga', 'Bondoc',
  'Bucayao', 'Buhuan', 'Bulusan', 'Calero', 'Camansihan', 'Camilmil', 'Canubing I', 'Canubing II',
  'Comunal', 'Guinobatan', 'Gulod', 'Gutad', 'Ibaba East', 'Ibaba West', 'Ilaya', 'Lalud',
  'Lazareto', 'Libis', 'Lumang Bayan', 'Mahal na Pangalan', 'Maidlang', 'Malad', 'Malamig', 'Managpi',
  'Masipit', 'Nag-iba I', 'Nag-iba II', 'Navotas', 'Pachoca', 'Palhi', 'Panggalaan', 'Parang',
  'Patas', 'Personas', 'Putingtubig', 'Salong (also known as San Raphael)', 'San Antonio',
  'San Vicente Central', 'San Vicente East', 'San Vicente North', 'San Vicente South', 'San Vicente West',
  'Santa Cruz', 'Santa Isabel', 'Santa Maria Village', 'Santa Rita', 'Santo Niño', 'Sapul',
  'Silonay', 'Suqui', 'Tawagan', 'Tawiran', 'Tibag', 'Wawa'
];

class StoreOwner {
  static async findByUsername(username) {
    const [rows] = await db.query('SELECT * FROM store_owners WHERE username = ?', [username]);
    return rows[0];
  }

  static async findByEmail(email) {
    const [rows] = await db.query('SELECT * FROM store_owners WHERE email = ?', [email]);
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await db.query(
      'SELECT id, username, email, full_name, store_name, phone, address, latitude, longitude, delivery_enabled, delivery_base_fee, delivery_per_km_fee, delivery_fee_cap, role, status FROM store_owners WHERE id = ?',
      [id]
    );
    return rows[0];
  }

  static async findWithPasswordById(id) {
    const [rows] = await db.query('SELECT * FROM store_owners WHERE id = ?', [id]);
    return rows[0];
  }

  static async create(ownerData) {
    const hashedPassword = await bcrypt.hash(ownerData.password, 10);
    const [result] = await db.query(
      'INSERT INTO store_owners (username, email, password, full_name, store_name, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ownerData.username, ownerData.email, hashedPassword, ownerData.full_name, ownerData.store_name, ownerData.phone, ownerData.address]
    );
    const storeOwnerId = result.insertId;
    
    // Initialize delivery barangays for this new store
    try {
      for (const barangay of BARANGAYS) {
        await db.query(
          `INSERT INTO store_delivery_barangays (store_owner_id, barangay_name, delivery_fee)
           VALUES (?, ?, ?)`,
          [storeOwnerId, barangay, 0]
        );
      }
    } catch (err) {
      console.error('Failed to initialize delivery barangays for new store:', err);
      // Don't fail the store creation if barangay initialization fails
    }
    
    return storeOwnerId;
  }

  static async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async updateProfile(id, { full_name, store_name, email, phone, address }) {
    const [result] = await db.query(
      'UPDATE store_owners SET full_name = ?, store_name = ?, email = ?, phone = ?, address = ? WHERE id = ?',
      [full_name, store_name, email, phone || null, address || null, id]
    );
    return result.affectedRows > 0;
  }

  static async updateLocation(id, { latitude, longitude, address }) {
    const lat = latitude !== undefined ? latitude : null;
    const lng = longitude !== undefined ? longitude : null;
    const [result] = await db.query(
      'UPDATE store_owners SET latitude = ?, longitude = ?, address = COALESCE(?, address) WHERE id = ?',
      [lat, lng, address || null, id]
    );
    return result.affectedRows > 0;
  }

  static async updatePassword(id, newPassword) {
    const hashed = await bcrypt.hash(newPassword, 10);
    const [result] = await db.query('UPDATE store_owners SET password = ? WHERE id = ?', [hashed, id]);
    return result.affectedRows > 0;
  }

  static async getDeliveryService(id) {
    const [rows] = await db.query(
      `SELECT id, store_name, latitude, longitude,
              delivery_enabled, delivery_base_fee, delivery_per_km_fee, delivery_fee_cap
       FROM store_owners
       WHERE id = ?`,
      [id]
    );
    return rows[0];
  }

  static async updateDeliveryService(id, { delivery_enabled, delivery_base_fee, delivery_per_km_fee, delivery_fee_cap }) {
    const [result] = await db.query(
      `UPDATE store_owners
       SET delivery_enabled = ?,
           delivery_base_fee = ?,
           delivery_per_km_fee = ?,
           delivery_fee_cap = ?
       WHERE id = ?`,
      [delivery_enabled ? 1 : 0, delivery_base_fee, delivery_per_km_fee, delivery_fee_cap, id]
    );
    return result.affectedRows > 0;
  }

  static async getDeliveryBarangays(id) {
    const [rows] = await db.query(
      `SELECT barangay_name, delivery_fee FROM store_delivery_barangays
       WHERE store_owner_id = ?
       ORDER BY barangay_name ASC`,
      [id]
    );
    return rows;
  }

  static async updateDeliveryBarangays(id, barangayFees) {
    // barangayFees is an object: { 'Barangay Name': 100, ... }
    try {
      for (const [rawBarangay, fee] of Object.entries(barangayFees)) {
        const barangay = String(rawBarangay || '').trim();
        const deliveryFee = Number(fee);
        if (!barangay) continue;

        await db.query(
          `INSERT INTO store_delivery_barangays (store_owner_id, barangay_name, delivery_fee)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE delivery_fee = VALUES(delivery_fee)`,
          [id, barangay, Number.isFinite(deliveryFee) ? deliveryFee : 0]
        );
      }
      return true;
    } catch (err) {
      console.error('Failed to update delivery barangays:', err);
      return false;
    }
  }
}

module.exports = StoreOwner;
