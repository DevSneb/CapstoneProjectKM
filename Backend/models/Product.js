const db = require('../config/database');

class Product {
  static _hasImageUrlColumn = null;

  static async hasImageUrlColumn() {
    if (Product._hasImageUrlColumn !== null) return Product._hasImageUrlColumn;
    const [rows] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'products'
         AND COLUMN_NAME = 'image_url'`
    );
    Product._hasImageUrlColumn = Number(rows?.[0]?.cnt || 0) > 0;
    return Product._hasImageUrlColumn;
  }

  static async ensureImageUrlColumn() {
    const hasColumn = await Product.hasImageUrlColumn();
    if (hasColumn) return true;
    try {
      await db.query('ALTER TABLE products ADD COLUMN image_url VARCHAR(255) NULL AFTER category');
      Product._hasImageUrlColumn = true;
      return true;
    } catch (err) {
      if (/Duplicate column name/i.test(String(err?.message || ''))) {
        Product._hasImageUrlColumn = true;
        return true;
      }
      throw err;
    }
  }

  static async listByStoreOwner(storeOwnerId, { q } = {}) {
    let sql = 'SELECT * FROM products WHERE store_owner_id = ?';
    const params = [storeOwnerId];
    if (q) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY name ASC, id ASC';
    const [rows] = await db.query(sql, params);
    return rows;
  }

  static async create(storeOwnerId, data) {
    if (data.image_url) {
      await Product.ensureImageUrlColumn();
    }
    const hasImageUrlColumn = await Product.hasImageUrlColumn();
    const columns = ['store_owner_id', 'name', 'description', 'price', 'cost', 'srp', 'srp_vat', 'stock', 'status', 'unit', 'category'];
    const values = [
      storeOwnerId,
      data.name,
      data.description || null,
      data.price,
      data.cost ?? null,
      data.srp ?? null,
      data.srp_vat ?? null,
      data.stock || 0,
      data.status || 'active',
      data.unit || null,
      data.category || null
    ];

    if (hasImageUrlColumn) {
      columns.push('image_url');
      values.push(data.image_url || null);
    }

    const placeholders = columns.map(() => '?').join(', ');
    const [result] = await db.query(
      `INSERT INTO products (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );
    return result.insertId;
  }

  static async update(storeOwnerId, id, data) {
    const sets = [
      'name = ?',
      'description = ?',
      'price = ?',
      'cost = ?',
      'srp = ?',
      'srp_vat = ?',
      'stock = ?',
      'status = ?',
      'unit = ?',
      'category = ?'
    ];
    const params = [
      data.name,
      data.description || null,
      data.price,
      data.cost ?? null,
      data.srp ?? null,
      data.srp_vat ?? null,
      data.stock,
      data.status || 'active',
      data.unit || null,
      data.category || null
    ];

    if (typeof data.image_url === 'string') {
      await Product.ensureImageUrlColumn();
      sets.push('image_url = ?');
      params.push(data.image_url);
    }

    params.push(id, storeOwnerId);
    const [result] = await db.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = ? AND store_owner_id = ?`,
      params
    );
    return result.affectedRows > 0;
  }

  static async remove(storeOwnerId, id) {
    const [result] = await db.query('DELETE FROM products WHERE id = ? AND store_owner_id = ?', [id, storeOwnerId]);
    return result.affectedRows > 0;
  }

  static async lowStocks(storeOwnerId, threshold = 10) {
    const [rows] = await db.query(
      'SELECT * FROM products WHERE store_owner_id = ? AND stock > 0 AND stock <= ? ORDER BY stock ASC',
      [storeOwnerId, threshold]
    );
    return rows;
  }

  static async outOfStock(storeOwnerId) {
    const [rows] = await db.query(
      'SELECT * FROM products WHERE store_owner_id = ? AND stock = 0 ORDER BY name ASC, id ASC',
      [storeOwnerId]
    );
    return rows;
  }
}

module.exports = Product;
