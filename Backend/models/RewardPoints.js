const db = require('../config/database');

/** Defaults when a store has not customized settings yet. */
const DEFAULT_SETTINGS = {
  enabled: true,
  earn_pesos_per_point: 20,
  redeem_peso_per_point: 1,
  max_redeem_percent: 100,
  min_order_amount_to_earn: 0,
  customer_note: 'Earn points on delivered orders and redeem them as checkout discounts.'
};

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function toPoints(value) {
  const n = Math.floor(Number(value || 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

class RewardPoints {
  static tablesReady = false;
  static settingsTableReady = false;

  static get defaults() {
    return { ...DEFAULT_SETTINGS };
  }

  static get earnPesosPerPoint() {
    return DEFAULT_SETTINGS.earn_pesos_per_point;
  }

  static get redeemPesoPerPoint() {
    return DEFAULT_SETTINGS.redeem_peso_per_point;
  }

  static normalizeSettings(row) {
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      enabled: Number(row.enabled) !== 0,
      earn_pesos_per_point: Math.max(1, Math.floor(Number(row.earn_pesos_per_point) || DEFAULT_SETTINGS.earn_pesos_per_point)),
      redeem_peso_per_point: Math.max(0.01, Number(row.redeem_peso_per_point) || DEFAULT_SETTINGS.redeem_peso_per_point),
      max_redeem_percent: clampNumber(row.max_redeem_percent, 0, 100, DEFAULT_SETTINGS.max_redeem_percent),
      min_order_amount_to_earn: Math.max(0, Number(row.min_order_amount_to_earn) || 0),
      customer_note: String(row.customer_note || DEFAULT_SETTINGS.customer_note).slice(0, 255)
    };
  }

  static pointsFromSpend(amount, settings = DEFAULT_SETTINGS) {
    const cfg = this.normalizeSettings(settings);
    if (!cfg.enabled) return 0;
    const pesos = Math.max(0, Number(amount || 0));
    if (pesos < cfg.min_order_amount_to_earn) return 0;
    const rate = Math.max(1, cfg.earn_pesos_per_point);
    return Math.floor(pesos / rate);
  }

  static discountFromPoints(points, settings = DEFAULT_SETTINGS) {
    const cfg = this.normalizeSettings(settings);
    return roundMoney(toPoints(points) * cfg.redeem_peso_per_point);
  }

  static async ensureTables(connection = db) {
    if (this.tablesReady) return;

    await connection.query(
      `CREATE TABLE IF NOT EXISTS reward_points_wallets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT NOT NULL UNIQUE,
        balance INT NOT NULL DEFAULT 0,
        lifetime_earned INT NOT NULL DEFAULT 0,
        lifetime_redeemed INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_reward_wallet_customer
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS reward_points_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        wallet_id INT NOT NULL,
        customer_id INT NOT NULL,
        order_id INT NULL,
        points INT NOT NULL,
        type ENUM('accrual','redemption','adjustment') NOT NULL,
        note VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_reward_tx_wallet
          FOREIGN KEY (wallet_id) REFERENCES reward_points_wallets(id) ON DELETE CASCADE,
        CONSTRAINT fk_reward_tx_customer
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        CONSTRAINT fk_reward_tx_order
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      )`
    );

    try {
      await connection.query(
        `CREATE UNIQUE INDEX uq_reward_accrual_order
         ON reward_points_transactions (order_id, type)`
      );
    } catch (err) {
      if (!/Duplicate|exists|ER_DUP_KEYNAME/i.test(String(err?.message || err?.code || ''))) {
        console.warn('reward points unique index note:', err.message || err);
      }
    }

    this.tablesReady = true;
  }

  static async ensureStoreSettingsTable(connection = db) {
    if (this.settingsTableReady) return;
    await connection.query(
      `CREATE TABLE IF NOT EXISTS store_reward_settings (
        store_owner_id INT PRIMARY KEY,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        earn_pesos_per_point INT NOT NULL DEFAULT 20,
        redeem_peso_per_point DECIMAL(10,2) NOT NULL DEFAULT 1.00,
        max_redeem_percent DECIMAL(5,2) NOT NULL DEFAULT 100.00,
        min_order_amount_to_earn DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        customer_note VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_store_reward_settings_store
          FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
      )`
    );
    this.settingsTableReady = true;
  }

  static async ensureOrderDiscountColumns(connection = db) {
    const ensure = async (column, ddl) => {
      const [[row]] = await connection.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'orders'
           AND COLUMN_NAME = ?`,
        [column]
      );
      if (Number(row?.cnt || 0) > 0) return;
      try {
        await connection.query(ddl);
      } catch (err) {
        if (!/Duplicate column name/i.test(String(err?.message || ''))) throw err;
      }
    };

    await ensure(
      'discount_amount',
      'ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00'
    );
    await ensure(
      'points_redeemed',
      'ALTER TABLE orders ADD COLUMN points_redeemed INT NOT NULL DEFAULT 0'
    );
  }

  static async getStoreSettings(storeOwnerId, connection = db) {
    const id = Number(storeOwnerId || 0);
    if (!id) return { ...DEFAULT_SETTINGS, store_owner_id: null };

    await this.ensureStoreSettingsTable(connection);
    const [[row]] = await connection.query(
      `SELECT store_owner_id, enabled, earn_pesos_per_point, redeem_peso_per_point,
              max_redeem_percent, min_order_amount_to_earn, customer_note
       FROM store_reward_settings
       WHERE store_owner_id = ?
       LIMIT 1`,
      [id]
    );

    return {
      store_owner_id: id,
      ...this.normalizeSettings(row)
    };
  }

  static async upsertStoreSettings(storeOwnerId, payload, connection = db) {
    const id = Number(storeOwnerId || 0);
    if (!id) throw new Error('Invalid store');

    await this.ensureStoreSettingsTable(connection);
    const next = this.normalizeSettings({
      enabled: payload?.enabled === false || payload?.enabled === 0 || payload?.enabled === '0' ? 0 : 1,
      earn_pesos_per_point: payload?.earn_pesos_per_point,
      redeem_peso_per_point: payload?.redeem_peso_per_point,
      max_redeem_percent: payload?.max_redeem_percent,
      min_order_amount_to_earn: payload?.min_order_amount_to_earn,
      customer_note: payload?.customer_note
    });

    await connection.query(
      `INSERT INTO store_reward_settings
        (store_owner_id, enabled, earn_pesos_per_point, redeem_peso_per_point,
         max_redeem_percent, min_order_amount_to_earn, customer_note)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         enabled = VALUES(enabled),
         earn_pesos_per_point = VALUES(earn_pesos_per_point),
         redeem_peso_per_point = VALUES(redeem_peso_per_point),
         max_redeem_percent = VALUES(max_redeem_percent),
         min_order_amount_to_earn = VALUES(min_order_amount_to_earn),
         customer_note = VALUES(customer_note)`,
      [
        id,
        next.enabled ? 1 : 0,
        next.earn_pesos_per_point,
        next.redeem_peso_per_point,
        next.max_redeem_percent,
        next.min_order_amount_to_earn,
        next.customer_note
      ]
    );

    return this.getStoreSettings(id, connection);
  }

  static async ensureWallet(customerId, connection = db) {
    await this.ensureTables(connection);
    await connection.query(
      `INSERT INTO reward_points_wallets (customer_id)
       VALUES (?)
       ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id)`,
      [customerId]
    );
    const [[wallet]] = await connection.query(
      `SELECT id, customer_id, balance, lifetime_earned, lifetime_redeemed, created_at, updated_at
       FROM reward_points_wallets
       WHERE customer_id = ?
       LIMIT 1`,
      [customerId]
    );
    return wallet || null;
  }

  static async getWalletByCustomer(customerId, connection = db) {
    const wallet = await this.ensureWallet(customerId, connection);
    await this.seedOpeningBalanceIfNeeded(customerId, wallet, connection);
    const fresh = await this.ensureWallet(customerId, connection);
    return {
      customer_id: Number(customerId),
      balance: Number(fresh?.balance || 0),
      lifetime_earned: Number(fresh?.lifetime_earned || 0),
      lifetime_redeemed: Number(fresh?.lifetime_redeemed || 0),
      earn_pesos_per_point: DEFAULT_SETTINGS.earn_pesos_per_point,
      redeem_peso_per_point: DEFAULT_SETTINGS.redeem_peso_per_point,
      redeemable: true
    };
  }

  /** One-time opening balance from past delivered spend (matches old dashboard ÷20). */
  static async seedOpeningBalanceIfNeeded(customerId, wallet, connection = db) {
    if (!wallet || Number(wallet.lifetime_earned || 0) > 0 || Number(wallet.balance || 0) > 0) return;
    const [[agg]] = await connection.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total_spent
       FROM orders
       WHERE customer_id = ? AND status = 'delivered'`,
      [customerId]
    );
    const points = this.pointsFromSpend(agg?.total_spent, DEFAULT_SETTINGS);
    if (points <= 0) return;

    const [[existing]] = await connection.query(
      `SELECT id FROM reward_points_transactions
       WHERE customer_id = ? AND type = 'adjustment'
       LIMIT 1`,
      [customerId]
    );
    if (existing) return;

    await connection.query(
      `UPDATE reward_points_wallets
       SET balance = ?, lifetime_earned = ?
       WHERE id = ? AND balance = 0 AND lifetime_earned = 0`,
      [points, points, wallet.id]
    );
    await connection.query(
      `INSERT INTO reward_points_transactions
        (wallet_id, customer_id, order_id, points, type, note)
       VALUES (?, ?, NULL, ?, 'adjustment', ?)`,
      [
        wallet.id,
        customerId,
        points,
        `Opening balance from past delivered purchases (₱${Number(agg.total_spent || 0).toFixed(2)})`
      ]
    );
  }

  static async listTransactionsByCustomer(customerId, limit = 30, connection = db) {
    await this.ensureTables(connection);
    const [rows] = await connection.query(
      `SELECT id, order_id, points, type, note, created_at
       FROM reward_points_transactions
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [customerId, Math.min(100, Math.max(1, Number(limit) || 30))]
    );
    return rows;
  }

  /**
   * Clamp requested points against balance, store rules, and payable total.
   */
  static resolveRedemption({ balance, pointsRequested, payableTotal, settings = DEFAULT_SETTINGS }) {
    const cfg = this.normalizeSettings(settings);
    if (!cfg.enabled) {
      return { points: 0, discount: 0, settings: cfg };
    }

    const bal = toPoints(balance);
    const requested = toPoints(pointsRequested);
    const payable = Math.max(0, Number(payableTotal || 0));
    const maxByPercent = roundMoney(payable * (cfg.max_redeem_percent / 100));
    const redeemableMoney = Math.min(payable, maxByPercent);
    const maxByMoney = Math.floor(redeemableMoney / cfg.redeem_peso_per_point);
    const points = Math.min(bal, requested, maxByMoney);
    const discount = this.discountFromPoints(points, cfg);
    return { points, discount, settings: cfg };
  }

  static async creditForDeliveredOrder(order, connection = db) {
    const customerId = Number(order?.customer_id || 0);
    const orderId = Number(order?.id);
    const storeId = Number(order?.store_id || order?.store_owner_id || 0);
    const purchaseAmount = roundMoney(order?.total_amount);
    if (!customerId || !orderId || purchaseAmount <= 0) {
      return { credited: false, reason: 'not_eligible' };
    }

    const settings = await this.getStoreSettings(storeId, connection);
    if (!settings.enabled) {
      return { credited: false, reason: 'disabled' };
    }

    const points = this.pointsFromSpend(purchaseAmount, settings);
    if (points <= 0) {
      return { credited: false, reason: 'zero_points' };
    }

    await this.ensureTables(connection);
    const wallet = await this.ensureWallet(customerId, connection);

    try {
      await connection.query(
        `INSERT INTO reward_points_transactions
          (wallet_id, customer_id, order_id, points, type, note)
         VALUES (?, ?, ?, ?, 'accrual', ?)`,
        [
          wallet.id,
          customerId,
          orderId,
          points,
          `Earned ${points} pt from delivered order #${orderId} (₱${purchaseAmount.toFixed(2)}; ₱${settings.earn_pesos_per_point}/pt)`
        ]
      );
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') {
        return { credited: false, reason: 'already_credited' };
      }
      throw err;
    }

    await connection.query(
      `UPDATE reward_points_wallets
       SET balance = balance + ?,
           lifetime_earned = lifetime_earned + ?
       WHERE id = ?`,
      [points, points, wallet.id]
    );

    return { credited: true, points, purchaseAmount, settings };
  }

  static async redeemForOrder({ customerId, orderId, points, settings = DEFAULT_SETTINGS, note }, connection = db) {
    const pts = toPoints(points);
    if (!customerId || pts <= 0) {
      return { redeemed: false, reason: 'nothing_to_redeem' };
    }

    const cfg = this.normalizeSettings(settings);
    if (!cfg.enabled) {
      throw new Error('Reward points are disabled for this store');
    }

    await this.ensureTables(connection);
    const wallet = await this.ensureWallet(customerId, connection);
    if (Number(wallet.balance || 0) < pts) {
      throw new Error('Insufficient reward points');
    }

    const [result] = await connection.query(
      `UPDATE reward_points_wallets
       SET balance = balance - ?,
           lifetime_redeemed = lifetime_redeemed + ?
       WHERE id = ? AND balance >= ?`,
      [pts, pts, wallet.id, pts]
    );
    if (!result?.affectedRows) {
      throw new Error('Insufficient reward points');
    }

    const discount = this.discountFromPoints(pts, cfg);
    await connection.query(
      `INSERT INTO reward_points_transactions
        (wallet_id, customer_id, order_id, points, type, note)
       VALUES (?, ?, ?, ?, 'redemption', ?)`,
      [
        wallet.id,
        customerId,
        orderId || null,
        -pts,
        note || `Redeemed ${pts} pt for ₱${discount.toFixed(2)} discount`
      ]
    );

    return { redeemed: true, points: pts, discount };
  }
}

module.exports = RewardPoints;
