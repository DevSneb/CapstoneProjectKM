const CashTransaction = require('../models/CashTransaction');
const db = require('../config/database');

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function toIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

const createExpense = async (req, res) => {
  try {
    const storeId = Number(req.user.id);
    const description = String(req.body.description || '').trim();
    const amount = Number(req.body.amount || 0);

    const transactionId = await CashTransaction.createTransaction({
      store_id: storeId,
      type: 'Cash Out',
      reference: description,
      description,
      amount
    });

    return res.status(201).json({
      message: 'Cash expense recorded',
      id: transactionId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to record cash expense' });
  }
};

const getSummary = async (req, res) => {
  try {
    const storeId = Number(req.user.id);
    await CashTransaction.syncMissingCashInForDeliveredOrders(storeId);

    const [totalCashIn, totalCashOut, netCash] = await Promise.all([
      CashTransaction.getTotalCashInByStore(storeId),
      CashTransaction.getTotalCashOutByStore(storeId),
      CashTransaction.getNetCashByStore(storeId)
    ]);

    return res.json({
      store_id: storeId,
      total_cash_in: Number(totalCashIn.toFixed(2)),
      total_cash_out: Number(totalCashOut.toFixed(2)),
      net_cash: Number(netCash.toFixed(2))
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to load cash summary' });
  }
};

const getStatement = async (req, res) => {
  try {
    const storeId = Number(req.user.id);
    const today = new Date().toISOString().slice(0, 10);

    const defaultFromDate = new Date();
    defaultFromDate.setDate(defaultFromDate.getDate() - 30);
    const defaultFrom = defaultFromDate.toISOString().slice(0, 10);

    const from = toIsoDate(req.query.from) || defaultFrom;
    const to = toIsoDate(req.query.to) || today;

    if (from > to) {
      return res.status(400).json({ message: 'Invalid date range: from must be on or before to' });
    }

    await CashTransaction.ensureTableExists();
    await CashTransaction.syncMissingCashInForDeliveredOrders(storeId);

    const [[[openingRow]], [[periodTotalsRow]], [[actualClosingRow]], [[revenueRow]], [[cogsRow]], [transactions]] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(CASE WHEN type = 'Cash In' THEN amount ELSE -amount END), 0) AS opening_balance
         FROM cash_transactions
         WHERE store_id = ? AND DATE(\`date\`) < ?`,
        [storeId, from]
      ),
      db.query(
        `SELECT
            COALESCE(SUM(CASE WHEN type = 'Cash In' THEN amount ELSE 0 END), 0) AS total_cash_in,
            COALESCE(SUM(CASE WHEN type = 'Cash Out' THEN amount ELSE 0 END), 0) AS total_cash_out
         FROM cash_transactions
         WHERE store_id = ? AND DATE(\`date\`) BETWEEN ? AND ?`,
        [storeId, from, to]
      ),
      db.query(
        `SELECT COALESCE(SUM(CASE WHEN type = 'Cash In' THEN amount ELSE -amount END), 0) AS closing_balance
         FROM cash_transactions
         WHERE store_id = ? AND DATE(\`date\`) <= ?`,
        [storeId, to]
      ),
      db.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS revenue
         FROM orders
         WHERE store_owner_id = ? AND status = 'delivered' AND DATE(created_at) BETWEEN ? AND ?`,
        [storeId, from, to]
      ),
      db.query(
        `SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost, 0)), 0) AS cogs
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE o.store_owner_id = ? AND o.status = 'delivered' AND DATE(o.created_at) BETWEEN ? AND ?`,
        [storeId, from, to]
      ),
      db.query(
        `SELECT id, \`date\`, type, reference, description, amount
         FROM cash_transactions
         WHERE store_id = ? AND DATE(\`date\`) BETWEEN ? AND ?
         ORDER BY \`date\` ASC, id ASC`,
        [storeId, from, to]
      )
    ]);

    const openingBalance = roundMoney(openingRow?.opening_balance || 0);
    const totalCashIn = roundMoney(periodTotalsRow?.total_cash_in || 0);
    const totalCashOut = roundMoney(periodTotalsRow?.total_cash_out || 0);
    const netCashChange = roundMoney(totalCashIn - totalCashOut);
    const computedClosing = roundMoney(openingBalance + netCashChange);
    const actualClosing = roundMoney(actualClosingRow?.closing_balance || 0);
    const balanceDifference = roundMoney(actualClosing - computedClosing);

    const revenue = roundMoney(revenueRow?.revenue || 0);
    const cogs = roundMoney(cogsRow?.cogs || 0);
    const grossProfit = roundMoney(revenue - cogs);
    const operatingExpenses = totalCashOut;
    const netProfitLoss = roundMoney(grossProfit - operatingExpenses);

    let runningBalance = openingBalance;
    const ledger = (transactions || []).map(tx => {
      const amount = roundMoney(tx.amount || 0);
      const signedAmount = tx.type === 'Cash In' ? amount : -amount;
      runningBalance = roundMoney(runningBalance + signedAmount);
      return {
        id: Number(tx.id),
        date: tx.date,
        type: tx.type,
        reference: tx.reference,
        description: tx.description,
        amount,
        signed_amount: signedAmount,
        running_balance: runningBalance
      };
    });

    return res.json({
      store_id: storeId,
      period: { from, to },
      cash_flow: {
        opening_balance: openingBalance,
        total_cash_in: totalCashIn,
        total_cash_out: totalCashOut,
        net_cash_change: netCashChange,
        closing_balance: computedClosing
      },
      accounting: {
        revenue,
        cogs,
        gross_profit: grossProfit,
        operating_expenses: operatingExpenses,
        net_profit_loss: netProfitLoss,
        result: netProfitLoss >= 0 ? 'gain' : 'loss'
      },
      balancing: {
        computed_closing: computedClosing,
        actual_closing: actualClosing,
        difference: balanceDifference,
        is_balanced: Math.abs(balanceDifference) < 0.01
      },
      transactions: ledger
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to load cash flow statement' });
  }
};

module.exports = {
  createExpense,
  getSummary,
  getStatement
};
