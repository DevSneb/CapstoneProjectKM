const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const db = require('../config/database');

const ML_ROOT = path.resolve(__dirname, '..', '..', 'ml');
const LIVE_DIR = path.join(ML_ROOT, 'dataset', 'Live');
const LIVE_CSV = path.join(LIVE_DIR, 'kadiwa_live_sales.csv');
const STATUS_PATH = path.join(ML_ROOT, 'models', 'last_retrain.json');
const RETRAIN_SCRIPT = path.join(ML_ROOT, 'retrain_from_live.py');

const STORE_MODEL_KEY_BY_ID = {
  1: 'CALSEDECO',
  2: 'PAPANDUNGIN',
  3: 'JUBILEE'
};

const MIN_RETRAIN_INTERVAL_MS = Math.max(
  15 * 60 * 1000,
  Number(process.env.ML_RETRAIN_MIN_INTERVAL_MS || 6 * 60 * 60 * 1000)
);

let retrainInFlight = null;
let pendingRetrain = false;
let lastScheduledAttemptAt = 0;

function resolvePythonRunners(scriptArgs) {
  const bundledVenvPython = process.platform === 'win32'
    ? path.join(ML_ROOT, '.venv', 'Scripts', 'python.exe')
    : path.join(ML_ROOT, '.venv', 'bin', 'python');
  const preferredPython = String(process.env.ML_PYTHON_EXECUTABLE || '').trim();
  const runners = [];

  if (preferredPython && fs.existsSync(preferredPython)) {
    runners.push({ command: preferredPython, args: scriptArgs });
  }
  if (fs.existsSync(bundledVenvPython)) {
    runners.push({ command: bundledVenvPython, args: scriptArgs });
  }
  if (process.platform === 'win32') {
    runners.push({ command: 'py', args: ['-3', ...scriptArgs] });
  }
  runners.push({ command: 'python3', args: scriptArgs });
  runners.push({ command: 'python', args: scriptArgs });
  return runners;
}

function runPythonScript(scriptArgs, timeoutMs = 10 * 60 * 1000) {
  const runners = resolvePythonRunners(scriptArgs);
  return new Promise((resolve, reject) => {
    const errors = [];
    const tryRunner = (index) => {
      if (index >= runners.length) {
        reject(new Error(errors.slice(0, 3).join(' | ') || 'No Python runner available'));
        return;
      }
      const current = runners[index];
      execFile(
        current.command,
        current.args,
        { cwd: ML_ROOT, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            errors.push(`${current.command}: ${error.message}${stderr ? ` (${String(stderr).slice(0, 200)})` : ''}`);
            tryRunner(index + 1);
            return;
          }
          resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        }
      );
    };
    tryRunner(0);
  });
}

function inferModelKey(storeOwner) {
  const byId = STORE_MODEL_KEY_BY_ID[Number(storeOwner?.id)];
  if (byId) return byId;
  const normalized = String(storeOwner?.store_name || '').toUpperCase();
  if (normalized.includes('CALSEDECO') || normalized.includes('STORE 1')) return 'CALSEDECO';
  if (normalized.includes('PAPANDUNGIN') || normalized.includes('STORE 2')) return 'PAPANDUNGIN';
  if (normalized.includes('JUBILEE') || normalized.includes('STORE 3')) return 'JUBILEE';
  return null;
}

async function exportLiveSalesCsv() {
  const [owners] = await db.query('SELECT id, store_name FROM store_owners ORDER BY id ASC');
  const [rows] = await db.query(
    `SELECT
       o.store_owner_id,
       DATE(o.created_at) AS day,
       COALESCE(SUM(o.total_amount), 0) AS sales
     FROM orders o
     WHERE o.status IN ('delivered', 'completed', 'paid', 'pickup')
     GROUP BY o.store_owner_id, DATE(o.created_at)
     ORDER BY day ASC`
  );

  const ownerKeyById = new Map();
  for (const owner of owners) {
    const key = inferModelKey(owner);
    if (key) ownerKeyById.set(Number(owner.id), key);
  }

  const lines = ['date,store_id,sales'];
  let exportedRows = 0;
  for (const row of rows) {
    const storeKey = ownerKeyById.get(Number(row.store_owner_id));
    if (!storeKey) continue;
    const day = String(row.day).slice(0, 10);
    const sales = Number(row.sales || 0).toFixed(2);
    lines.push(`${day},${storeKey},${sales}`);
    exportedRows += 1;
  }

  fs.mkdirSync(LIVE_DIR, { recursive: true });
  fs.writeFileSync(LIVE_CSV, `${lines.join('\n')}\n`, 'utf8');

  return {
    path: LIVE_CSV,
    exported_rows: exportedRows,
    stores_mapped: ownerKeyById.size
  };
}

function readRetrainStatus() {
  if (!fs.existsSync(STATUS_PATH)) {
    return {
      ok: false,
      message: 'Model has not been retrained from live orders yet.',
      live_csv: LIVE_CSV
    };
  }
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  } catch (err) {
    return { ok: false, message: `Could not read retrain status: ${err.message}` };
  }
}

async function retrainFromLiveOrders({ force = false, reason = 'manual' } = {}) {
  const now = Date.now();
  if (!force && now - lastScheduledAttemptAt < MIN_RETRAIN_INTERVAL_MS) {
    return {
      ok: true,
      skipped: true,
      reason: 'cooldown',
      min_interval_ms: MIN_RETRAIN_INTERVAL_MS,
      last_status: readRetrainStatus()
    };
  }

  if (retrainInFlight) {
    pendingRetrain = true;
    return {
      ok: true,
      skipped: true,
      reason: 'in_flight',
      last_status: readRetrainStatus()
    };
  }

  lastScheduledAttemptAt = now;
  retrainInFlight = (async () => {
    const exportInfo = await exportLiveSalesCsv();
    const result = await runPythonScript([RETRAIN_SCRIPT, '--live-csv', LIVE_CSV]);
    let parsed = null;
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        parsed = JSON.parse(lines[index]);
        if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'results')) break;
      } catch (_err) {
        // keep scanning for the final JSON payload
      }
    }

    const status = parsed || readRetrainStatus();
    return {
      ok: Boolean(status?.ok),
      reason,
      export: exportInfo,
      status,
      stdout_tail: lines.slice(-8)
    };
  })();

  try {
    return await retrainInFlight;
  } finally {
    retrainInFlight = null;
    if (pendingRetrain) {
      pendingRetrain = false;
      setTimeout(() => {
        retrainFromLiveOrders({ force: false, reason: 'queued_after_delivery' }).catch((err) => {
          console.warn('[ML Learning] queued retrain failed:', err.message);
        });
      }, 5000);
    }
  }
}

function scheduleLearningAfterDelivery() {
  // Debounced continuous learning: delivered orders queue a retrain,
  // but not more often than MIN_RETRAIN_INTERVAL_MS.
  retrainFromLiveOrders({ force: false, reason: 'order_delivered' }).catch((err) => {
    console.warn('[ML Learning] delivery-triggered retrain failed:', err.message);
  });
}

function startNightlyLearningScheduler() {
  const intervalMs = Math.max(
    60 * 60 * 1000,
    Number(process.env.ML_RETRAIN_INTERVAL_MS || 24 * 60 * 60 * 1000)
  );

  const run = () => {
    retrainFromLiveOrders({ force: true, reason: 'scheduler' }).then((result) => {
      console.log('[ML Learning] scheduled retrain:', result.skipped ? result.reason : (result.ok ? 'ok' : 'failed'));
    }).catch((err) => {
      console.warn('[ML Learning] scheduled retrain failed:', err.message);
    });
  };

  // Kick once shortly after boot, then on interval.
  setTimeout(run, 45 * 1000);
  setInterval(run, intervalMs);
  console.log(`[ML Learning] continuous retrain scheduler started (every ${Math.round(intervalMs / 3600000)}h)`);
}

module.exports = {
  exportLiveSalesCsv,
  retrainFromLiveOrders,
  scheduleLearningAfterDelivery,
  startNightlyLearningScheduler,
  readRetrainStatus,
  LIVE_CSV,
  MIN_RETRAIN_INTERVAL_MS
};
