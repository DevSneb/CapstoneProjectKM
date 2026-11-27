const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const db = require('../config/database');

const STORE_MODEL_KEY_BY_ID = {
  1: 'CALSEDECO',
  2: 'PAPANDUNGIN',
  3: 'JUBILEE'
};

function normalizeStoreName(name) {
  return String(name || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function inferModelKey(storeOwner) {
  const byId = STORE_MODEL_KEY_BY_ID[Number(storeOwner?.id)];
  if (byId) return byId;

  const normalized = normalizeStoreName(storeOwner?.store_name);
  if (normalized.includes('CALSEDECO')) return 'CALSEDECO';
  if (normalized.includes('PAPANDUNGIN')) return 'PAPANDUNGIN';
  if (normalized.includes('JUBILEE')) return 'JUBILEE';
  if (normalized.includes('STORE 1')) return 'CALSEDECO';
  if (normalized.includes('STORE 2')) return 'PAPANDUNGIN';
  if (normalized.includes('STORE 3')) return 'JUBILEE';

  return null;
}

async function getStoreOwner(storeOwnerId) {
  const [[row]] = await db.query(
    'SELECT id, store_name FROM store_owners WHERE id = ? LIMIT 1',
    [storeOwnerId]
  );
  return row || null;
}

// Finalized store sales: delivery + pickup (POS/pickup often lands as delivered,
// but also accept completed/paid/pickup statuses from older flows).
const FINALIZED_ORDER_STATUSES_SQL = `status IN ('delivered', 'completed', 'paid', 'pickup')`;

async function getRecentDailySales(storeOwnerId, daysBack = 30) {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(DATE(created_at), '%Y-%m-%d') AS day,
            COALESCE(SUM(total_amount), 0) AS total
     FROM orders
     WHERE store_owner_id = ?
       AND ${FINALIZED_ORDER_STATUSES_SQL}
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)
     ORDER BY day ASC`,
    [storeOwnerId, daysBack]
  );

  const totalsByDay = new Map(
    rows.map((row) => [String(row.day), Number(row.total || 0)])
  );
  const values = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - Math.max(0, daysBack - 1));

  for (let index = 0; index < daysBack; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = [
      day.getFullYear(),
      String(day.getMonth() + 1).padStart(2, '0'),
      String(day.getDate()).padStart(2, '0')
    ].join('-');
    values.push(Number(totalsByDay.get(key) || 0));
  }

  return values;
}

async function getProductTrends(storeOwnerId, days = 30) {
  const safeDays = Math.floor(Math.max(7, Math.min(90, Number(days) || 30)));
  const [rows] = await db.query(
    `SELECT
       oi.product_id,
       COALESCE(p.name, CONCAT('Product #', oi.product_id)) AS product_name,
       COALESCE(SUM(CASE
         WHEN o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         THEN oi.quantity ELSE 0 END), 0) AS current_quantity,
       COALESCE(SUM(CASE
         WHEN o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND o.created_at < DATE_SUB(CURDATE(), INTERVAL ? DAY)
         THEN oi.quantity ELSE 0 END), 0) AS previous_quantity,
       COALESCE(SUM(CASE
         WHEN o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         THEN oi.subtotal ELSE 0 END), 0) AS current_revenue,
       COALESCE(SUM(CASE
         WHEN o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND o.created_at < DATE_SUB(CURDATE(), INTERVAL ? DAY)
         THEN oi.subtotal ELSE 0 END), 0) AS previous_revenue
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.store_owner_id = ?
       AND o.status IN ('delivered', 'completed', 'paid', 'pickup')
       AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY oi.product_id, p.name
     HAVING current_quantity > 0 OR previous_quantity > 0
     ORDER BY current_quantity DESC, current_revenue DESC
     LIMIT 50`,
    [
      safeDays,
      safeDays * 2,
      safeDays,
      safeDays,
      safeDays * 2,
      safeDays,
      storeOwnerId,
      safeDays * 2
    ]
  );

  return rows.map((row) => {
    const currentQuantity = Number(row.current_quantity || 0);
    const previousQuantity = Number(row.previous_quantity || 0);
    const quantityChange = currentQuantity - previousQuantity;
    const trendPercent = previousQuantity > 0
      ? (quantityChange / previousQuantity) * 100
      : currentQuantity > 0 ? 100 : 0;

    return {
      product_id: Number(row.product_id),
      product_name: row.product_name,
      current_quantity: Number(currentQuantity.toFixed(3)),
      previous_quantity: Number(previousQuantity.toFixed(3)),
      current_revenue: Number(Number(row.current_revenue || 0).toFixed(2)),
      previous_revenue: Number(Number(row.previous_revenue || 0).toFixed(2)),
      quantity_change: Number(quantityChange.toFixed(3)),
      trend_percent: Number(trendPercent.toFixed(1)),
      trend: quantityChange > 0 ? 'up' : quantityChange < 0 ? 'down' : 'stable'
    };
  });
}

function runPythonForecast({ modelPath, horizon, recentSales }) {
  const scriptPath = path.resolve(__dirname, '..', '..', 'ml', 'predict_sales.py');
  const mlRoot = path.resolve(__dirname, '..', '..', 'ml');
  const bundledVenvPython = process.platform === 'win32'
    ? path.join(mlRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(mlRoot, '.venv', 'bin', 'python');
  const preferredPython = String(process.env.ML_PYTHON_EXECUTABLE || '').trim();
  const recentArg = recentSales.join(',');

  const predictArgs = [scriptPath, '--model-path', modelPath, '--horizon', String(horizon), '--recent', recentArg];
  const runners = [];

  // Prefer explicit env path (only if it exists), then project venv, then system Python.
  // Skipping missing env paths avoids a Linux VPS path breaking local Windows runs.
  if (preferredPython && fs.existsSync(preferredPython)) {
    runners.push({ command: preferredPython, args: predictArgs });
  }
  if (fs.existsSync(bundledVenvPython)) {
    runners.push({ command: bundledVenvPython, args: predictArgs });
  }

  if (process.platform === 'win32') {
    runners.push({ command: 'py', args: ['-3', ...predictArgs] });
    runners.push({ command: 'py', args: predictArgs });
  }

  runners.push({ command: 'python3', args: predictArgs });
  runners.push({ command: 'python', args: predictArgs });

  return new Promise((resolve, reject) => {
    const runnerErrors = [];

    const tryRunner = (index) => {
      if (index >= runners.length) {
        const detail = runnerErrors.slice(0, 3).join(' | ') || 'no python runner succeeded';
        reject(new Error(`Python ML engine is not available on this server. ${detail}`));
        return;
      }

      const current = runners[index];
      execFile(current.command, current.args, { timeout: 30000, cwd: mlRoot }, (error, stdout, stderr) => {
        if (error) {
          runnerErrors.push(`${current.command}: ${error.message}`);
          tryRunner(index + 1);
          return;
        }

        try {
          const output = JSON.parse(String(stdout || '').trim());
          if (!output.ok) {
            runnerErrors.push(`${current.command}: ${output.message || 'Forecast failed'}`);
            tryRunner(index + 1);
            return;
          }
          resolve(output);
        } catch (parseErr) {
          runnerErrors.push(`${current.command}: ${stderr || stdout || parseErr.message}`);
          tryRunner(index + 1);
        }
      });
    };

    tryRunner(0);
  });
}

function runFallbackForecast({ horizon, recentSales }) {
  const cleaned = recentSales
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value));

  const history = cleaned.length ? [...cleaned] : [0, 0, 0, 0, 0, 0, 0];
  const shortWindow = history.slice(-7);
  const base = shortWindow.reduce((sum, value) => sum + value, 0) / Math.max(1, shortWindow.length);

  const longWindow = history.slice(-14);
  const firstHalf = longWindow.slice(0, Math.floor(longWindow.length / 2));
  const secondHalf = longWindow.slice(Math.floor(longWindow.length / 2));
  const firstAvg = firstHalf.reduce((sum, value) => sum + value, 0) / Math.max(1, firstHalf.length || 1);
  const secondAvg = secondHalf.reduce((sum, value) => sum + value, 0) / Math.max(1, secondHalf.length || 1);
  const trendPerDay = (secondAvg - firstAvg) / Math.max(1, secondHalf.length || 1);

  const forecast = [];
  for (let day = 1; day <= horizon; day += 1) {
    const next = Math.max(0, base + trendPerDay * day);
    forecast.push(Number(next.toFixed(2)));
  }

  return {
    ok: true,
    horizon,
    recent_sales: history,
    forecast,
    engine: 'fallback'
  };
}

async function getStoreForecast(storeOwnerId, horizon = 7) {
  const storeOwner = await getStoreOwner(storeOwnerId);
  if (!storeOwner) throw new Error('Store not found');

  const modelKey = inferModelKey(storeOwner);
  if (!modelKey) {
    throw new Error('No ML model mapping found for this store');
  }

  const recentSales = await getRecentDailySales(storeOwnerId, 90);
  const safeRecentSales = recentSales.length ? recentSales : [0, 0, 0, 0, 0, 0, 0];
  const recentWindow = safeRecentSales.slice(-7);
  const midpoint = Math.floor(safeRecentSales.length / 2);
  const firstHalf = safeRecentSales.slice(0, midpoint);
  const secondHalf = safeRecentSales.slice(midpoint);
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const firstAverage = average(firstHalf);
  const secondAverage = average(secondHalf);
  const analytics = {
    history_days: safeRecentSales.length,
    zero_sales_days: safeRecentSales.filter((value) => value === 0).length,
    average_daily_sales: Number(average(safeRecentSales).toFixed(2)),
    recent_7_day_average: Number(average(recentWindow).toFixed(2)),
    trend: secondAverage > firstAverage * 1.05
      ? 'up'
      : secondAverage < firstAverage * 0.95 ? 'down' : 'stable'
  };

  // The evaluated model directory is independent of the scheduled retrainer's output.
  const evaluatedModelsDir = String(process.env.ML_EVALUATED_MODELS_DIR || '').trim();
  const modelPath = path.resolve(
    __dirname, '..', '..', evaluatedModelsDir || 'ml/models',
    `sales_forecaster_store_${modelKey}.joblib`
  );
  const safeHorizon = Math.max(1, Math.min(30, Number(horizon) || 7));

  if (!fs.existsSync(modelPath)) {
    const mlResult = runFallbackForecast({
      horizon: safeHorizon,
      recentSales: safeRecentSales
    });
    return {
      store_id: Number(storeOwnerId),
      store_name: storeOwner.store_name,
      model_key: modelKey,
      sales_source: 'finalized_orders_delivery_and_pickup',
      horizon: mlResult.horizon,
      recent_sales: mlResult.recent_sales,
      forecast: mlResult.forecast,
      engine: 'fallback',
      analytics,
      warning: `Trained model missing (${path.basename(modelPath)}). Upload ml/models and run training on the server.`
    };
  }

  let mlResult;
  try {
    mlResult = await runPythonForecast({
      modelPath,
      horizon: safeHorizon,
      recentSales: safeRecentSales
    });
  } catch (err) {
    console.warn('[Forecast] Falling back to JS estimator:', err.message);
    mlResult = runFallbackForecast({
      horizon: safeHorizon,
      recentSales: safeRecentSales
    });
    mlResult.warning = err.message || 'Python model unavailable; showing fallback estimate.';
  }

  const engine = mlResult.engine || 'python';
  return {
    store_id: Number(storeOwnerId),
    store_name: storeOwner.store_name,
    model_key: modelKey,
    sales_source: 'finalized_orders_delivery_and_pickup',
    horizon: mlResult.horizon,
    recent_sales: mlResult.recent_sales,
    forecast: mlResult.forecast,
    engine,
    ...(engine === 'python' && evaluatedModelsDir ? { model_source: 'evaluated_export' } : {}),
    analytics,
    warning: mlResult.warning || (engine === 'fallback'
      ? 'Python model unavailable; showing fallback estimate.'
      : null)
  };
}

module.exports = {
  getStoreForecast,
  getProductTrends
};
