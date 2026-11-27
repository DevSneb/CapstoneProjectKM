require('dotenv').config();
const db = require('../config/database');
const RewardPoints = require('../models/RewardPoints');

async function run() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await RewardPoints.ensureTables(conn);
    await RewardPoints.ensureOrderDiscountColumns(conn);

    // Backfill wallets from historical delivered spend (display parity with old ÷20 formula)
    const [customers] = await conn.query('SELECT id FROM customers');
    for (const c of customers) {
      const [[agg]] = await conn.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_spent
         FROM orders
         WHERE customer_id = ? AND status = 'delivered'`,
        [c.id]
      );
      const points = RewardPoints.pointsFromSpend(agg?.total_spent);
      const wallet = await RewardPoints.ensureWallet(c.id, conn);
      if (points > 0 && Number(wallet.lifetime_earned || 0) === 0 && Number(wallet.balance || 0) === 0) {
        await conn.query(
          `UPDATE reward_points_wallets
           SET balance = ?, lifetime_earned = ?
           WHERE id = ?`,
          [points, points, wallet.id]
        );
        await conn.query(
          `INSERT INTO reward_points_transactions
            (wallet_id, customer_id, order_id, points, type, note)
           VALUES (?, ?, NULL, ?, 'adjustment', ?)`,
          [
            wallet.id,
            c.id,
            points,
            `Opening balance from past delivered purchases (₱${Number(agg.total_spent || 0).toFixed(2)})`
          ]
        );
      }
    }

    await conn.commit();
    console.log('Reward points tables ready (with historical opening balances where applicable).');
  } catch (err) {
    await conn.rollback();
    console.error('Failed to create reward points tables:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit();
  }
}

run();
