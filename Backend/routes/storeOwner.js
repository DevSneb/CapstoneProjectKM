const express = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware, isStoreOwner } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const Shipment = require('../models/Shipment');
const StoreOwner = require('../models/StoreOwner');
const CashTransaction = require('../models/CashTransaction');
const Store3Savings = require('../models/Store3Savings');
const RewardPoints = require('../models/RewardPoints');
const { getStoreForecast, getProductTrends } = require('../services/salesForecastService');
const {
  retrainFromLiveOrders,
  scheduleLearningAfterDelivery,
  readRetrainStatus
} = require('../services/mlLearningService');
const PosUser = require('../models/PosUser');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/database');

const router = express.Router();
const PRODUCT_IMAGE_DIR = path.resolve(__dirname, '..', 'uploads', 'products');
const POS_REPORT_UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads', 'admin-reports', 'pos');
const MANAGEABLE_FEATURES = ['products', 'orders', 'inventory', 'customers', 'reports', 'cashflow', 'cashflow2', 'forecasting', 'logistics', 'notifications', 'pos', 'rewards', 'maps'];

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

const posReportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const okExt = /\.(pdf|xlsx|xls|csv|doc|docx)$/i.test(name);
    const okMime = /^(application\/(pdf|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|octet-stream)|text\/csv|text\/plain)$/i.test(
      String(file.mimetype || '')
    );
    if (okExt || okMime) return cb(null, true);
    return cb(new Error('Only PDF, Excel, CSV, or Word files are allowed'));
  }
});

async function ensureAdminReportsExtras() {
  const [[sourceCol]] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'admin_reports'
       AND COLUMN_NAME = 'report_source'`
  );
  if (Number(sourceCol?.cnt || 0) === 0) {
    try {
      await db.query(
        `ALTER TABLE admin_reports
         ADD COLUMN report_source VARCHAR(32) NOT NULL DEFAULT 'kadiwa' AFTER total_revenue`
      );
    } catch (err) {
      if (!/Duplicate column name/i.test(String(err?.message || ''))) throw err;
    }
  }

  const [[notesCol]] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'admin_reports'
       AND COLUMN_NAME = 'notes'`
  );
  if (Number(notesCol?.cnt || 0) === 0) {
    try {
      await db.query(
        `ALTER TABLE admin_reports
         ADD COLUMN notes TEXT NULL AFTER report_file_path`
      );
    } catch (err) {
      if (!/Duplicate column name/i.test(String(err?.message || ''))) throw err;
    }
  }
}

function sanitizeUploadName(name) {
  return String(name || 'pos-report')
    .replace(/[^\w.\-() ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

router.use(authMiddleware, isStoreOwner);

function saveProductImageFromDataUrl(dataUrl, storeOwnerId) {
  if (!dataUrl) return null;
  const match = String(dataUrl).match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extMap[mimeType];
  if (!ext) return null;

  const rawBase64 = match[3];
  const buffer = Buffer.from(rawBase64, 'base64');
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) return null;

  fs.mkdirSync(PRODUCT_IMAGE_DIR, { recursive: true });
  const fileName = `store_${storeOwnerId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const absolutePath = path.join(PRODUCT_IMAGE_DIR, fileName);
  fs.writeFileSync(absolutePath, buffer);
  return `/uploads/products/${fileName}`;
}

async function ensureFeatureFlagsTables() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS global_feature_flags (
      feature_key VARCHAR(50) PRIMARY KEY,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );
  await db.query(
    `CREATE TABLE IF NOT EXISTS store_feature_flags (
      id INT PRIMARY KEY AUTO_INCREMENT,
      store_owner_id INT NOT NULL,
      feature_key VARCHAR(50) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_store_feature (store_owner_id, feature_key),
      CONSTRAINT fk_store_feature_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
    )`
  );
}

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function ensureDeliveryBarangaysTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS store_delivery_barangays (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_owner_id INT NOT NULL,
      barangay_name VARCHAR(100) NOT NULL,
      delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_store_barangay (store_owner_id, barangay_name),
      CONSTRAINT fk_store_delivery_barangays_store FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

function getDefaultDeliveryBarangays() {
  return [
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
}

async function ensureCompleteDeliveryBarangays(storeOwnerId) {
  const [existingRows] = await db.query(
    'SELECT barangay_name FROM store_delivery_barangays WHERE store_owner_id = ?',
    [storeOwnerId]
  );
  const existingNames = new Set(existingRows.map(r => String(r.barangay_name || '').trim()));
  const missing = getDefaultDeliveryBarangays().filter(name => !existingNames.has(name));
  for (const barangay of missing) {
    await db.query(
      `INSERT INTO store_delivery_barangays (store_owner_id, barangay_name, delivery_fee)
       VALUES (?, ?, 0)`,
      [storeOwnerId, barangay]
    );
  }
}

const DA_MAIN_CATEGORY_COLUMNS = [
  { key: 'lowland', label: 'LOWLAND' },
  { key: 'highland', label: 'HIGHLAND' },
  { key: 'fruits', label: 'FRUITS' },
  { key: 'rice', label: 'RICE' },
  { key: 'eggs', label: 'EGGS (pc)' },
  { key: 'seafood', label: 'SEAFOOD' },
  { key: 'pork', label: 'PORK' },
  { key: 'beef', label: 'BEEF' },
  { key: 'chicken', label: 'CHICKEN' }
];

const DA_OTHER_SUB_COLUMNS = [
  { key: 'product', label: 'Product', isText: true },
  { key: 'pc', label: 'PC/S' },
  { key: 'kg', label: 'KG/S' },
  { key: 'lt', label: 'LT/S' }
];

const DA_MONTH_LABELS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

/** YYYY-MM-DD → [y,m,d]; month 1–12 */
function parseIsoDateParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '').trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Every calendar month (YYYY-MM) that overlaps [from, to], inclusive */
function enumerateMonthKeysInRange(startIso, endIso) {
  const sp = parseIsoDateParts(startIso);
  const ep = parseIsoDateParts(endIso || startIso);
  if (!sp || !ep) return [];
  let sy = sp[0];
  let sm = sp[1];
  let ey = ep[0];
  let em = ep[1];
  if (sy > ey || (sy === ey && sm > em)) {
    ;[sy, sm, ey, em] = [ey, em, sy, sm];
  }
  const keys = [];
  let y = sy;
  let mo = sm;
  for (;;) {
    keys.push(`${y}-${String(mo).padStart(2, '0')}`);
    if (y === ey && mo === em) break;
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
  }
  return keys;
}

function monthKeyToLabel(monthKey) {
  const mo = Number(String(monthKey).slice(5, 7));
  if (!mo || mo < 1 || mo > 12) return String(monthKey);
  return DA_MONTH_LABELS[mo - 1];
}

const normalizeCategory = (value) => {
  const category = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const normalized = category.replace(/[()]/g, '').trim();

  if (!normalized || normalized === 'uncategorized' || normalized === 'other' || normalized === 'other product' || normalized === 'other products') {
    return 'other';
  }

  const exactMap = {
    lowland: 'lowland',
    highland: 'highland',
    fruits: 'fruits',
    fruit: 'fruits',
    rice: 'rice',
    eggs: 'eggs',
    egg: 'eggs',
    'eggs pc': 'eggs',
    seafood: 'seafood',
    pork: 'pork',
    beef: 'beef',
    chicken: 'chicken'
  };

  if (exactMap[normalized]) return exactMap[normalized];

  if (normalized.includes('egg')) return 'eggs';
  if (normalized.includes('fruit')) return 'fruits';
  if (normalized.includes('lowland')) return 'lowland';
  if (normalized.includes('highland')) return 'highland';
  if (normalized.includes('rice')) return 'rice';
  if (normalized.includes('seafood')) return 'seafood';
  if (normalized.includes('pork')) return 'pork';
  if (normalized.includes('beef')) return 'beef';
  if (normalized.includes('chicken')) return 'chicken';

  return 'other';
};

function inferUnitBucket(unitRaw) {
  const u = String(unitRaw || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!u) return 'pc';
  if ((/\bkg\b|\bkgs\b|kilo|kilogram/.test(u)) || /^kg\b/.test(u)) return 'kg';
  if (/\bml\b|millilit|liter|litre|\bltrs?\b|^l\b|\/l\b/.test(u)) return 'lt';
  return 'pc';
}

function buildEmptyOtherCell() {
  return { volume: { pc: 0, kg: 0, lt: 0 }, revenue: { pc: 0, kg: 0, lt: 0 }, names: [] };
}

/** Roll up order lines that fall under normalized category `other`. */
function buildMonthlyOtherBuckets(otherRows, monthKeys) {
  const byMonth = monthKeys.reduce((acc, mk) => {
    acc[mk] = buildEmptyOtherCell();
    return acc;
  }, {});
  (otherRows || []).forEach((row) => {
    const mk = String(row.month_key || '');
    if (!byMonth[mk]) return;
    const bucket = inferUnitBucket(row.unit);
    const q = Number(row.volume || 0);
    const r = Number(row.revenue || 0);
    const target = byMonth[mk];
    target.volume[bucket] += q;
    target.revenue[bucket] += r;
    const name = String(row.product_name || '').trim();
    if (name && !target.names.includes(name)) target.names.push(name);
  });
  monthKeys.forEach((mk) => {
    byMonth[mk].names.sort((a, b) => a.localeCompare(b));
  });
  return byMonth;
}

function truncateProductNames(names, maxLen) {
  if (!names.length) return '';
  const joined = names.join(', ');
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
}

const DA_SUMMARY_MONTHLY_SQL = `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS month_key,
              LOWER(TRIM(IFNULL(p.category, 'other'))) AS category_key,
              COALESCE(SUM(oi.quantity), 0) AS volume,
              COALESCE(SUM(oi.subtotal), 0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.store_owner_id = ?
         AND o.status = 'delivered'
         AND DATE(o.created_at) BETWEEN ? AND ?
       GROUP BY month_key, category_key
       ORDER BY month_key ASC, category_key ASC`;

/** Per-product split for categories bucketed into "OTHER" on the DA form (by unit → PC/S, KG/S, LT/S). */
const DA_OTHER_PRODUCT_LINES_SQL = `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS month_key,
              LOWER(TRIM(IFNULL(p.category, 'other'))) AS category_key,
              LOWER(TRIM(IFNULL(p.unit, ''))) AS unit,
              p.name AS product_name,
              COALESCE(SUM(oi.quantity), 0) AS volume,
              COALESCE(SUM(oi.subtotal), 0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.store_owner_id = ?
         AND o.status = 'delivered'
         AND DATE(o.created_at) BETWEEN ? AND ?
       GROUP BY month_key, category_key, p.id, p.name, p.unit
       ORDER BY month_key ASC, p.name ASC`;

function createDaSalesReportPdf({ storeName, storeAddress, startDate, endDate, summaryRows, otherProductRows, channelSummary }) {
  let monthKeys = enumerateMonthKeysInRange(startDate, endDate);
  if (!monthKeys.length) {
    const p = parseIsoDateParts(startDate) || parseIsoDateParts(endDate);
    if (p) monthKeys = [`${p[0]}-${String(p[1]).padStart(2, '0')}`];
  }
  if (!monthKeys.length) {
    const t = new Date();
    monthKeys = [`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`];
  }

  const monthlySummary = monthKeys.reduce((acc, monthKey) => {
    acc[monthKey] = DA_MAIN_CATEGORY_COLUMNS.reduce((row, column) => {
      row[column.key] = { volume: 0, revenue: 0 };
      return row;
    }, {});
    return acc;
  }, {});

  summaryRows.forEach((row) => {
    const monthKey = String(row.month_key || '');
    if (!monthlySummary[monthKey]) return;
    const categoryKey = normalizeCategory(row.category_key);
    if (categoryKey === 'other') return;
    monthlySummary[monthKey][categoryKey] = {
      volume: Number(row.volume || 0),
      revenue: Number(row.revenue || 0)
    };
  });

  const monthlyOther = buildMonthlyOtherBuckets(otherProductRows, monthKeys);
  const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 24 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const drawFormTable = ({ x, y, title, metric }) => {
    const monthWidth = 46;
    const mainWidths = [40, 40, 39, 39, 44, 40, 39, 39, 44];
    const otherWidths = [68, 30, 30, 30];
    const widths = [monthWidth, ...mainWidths, ...otherWidths];
    const headerTop = 12;
    const headerBottom = 12;
    const headerBlock = headerTop + headerBottom;
    const rowHeight = 18;
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const otherSpan = otherWidths.reduce((sum, width) => sum + width, 0);
    let currentXForOther = x + widths[0] + mainWidths.reduce((sum, width) => sum + width, 0);

    const formatter = metric === 'volume'
      ? (value) => String(Number(value || 0).toFixed(0))
      : (value) => `₱${Number(value || 0).toFixed(2)}`;

    doc.save();
    doc.rect(x, y, totalWidth, 22).fill(metric === 'volume' ? '#b8d08f' : '#f2aa74');
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11).text(title, x, y + 6, { width: totalWidth, align: 'center' });
    doc.restore();

    let currentY = y + 22;
    doc.fontSize(6.5).font('Helvetica-Bold');
    let currentX = x;
    doc.rect(currentX, currentY, widths[0], headerBlock).fillAndStroke('#fff3c8', '#000');
    doc.fillColor('#000').text('MONTH', currentX + 2, currentY + 8, { width: widths[0] - 4, align: 'center' });
    currentX += widths[0];

    DA_MAIN_CATEGORY_COLUMNS.forEach((column, index) => {
      doc.rect(currentX, currentY, mainWidths[index], headerBlock).fillAndStroke('#fff3c8', '#000');
      doc.fillColor('#000').text(column.label, currentX + 1, currentY + 8, { width: mainWidths[index] - 2, align: 'center' });
      currentX += mainWidths[index];
    });

    doc.rect(currentXForOther, currentY, otherSpan, headerTop).fillAndStroke('#fff3c8', '#000');
    doc.fillColor('#000').text('OTHER PRODUCTS', currentXForOther + 2, currentY + 3, { width: otherSpan - 4, align: 'center' });
    let subX = currentXForOther;
    DA_OTHER_SUB_COLUMNS.forEach((col, idx) => {
      doc.rect(subX, currentY + headerTop, otherWidths[idx], headerBottom).fillAndStroke('#fff3c8', '#000');
      doc.fillColor('#000').text(col.label, subX + 1, currentY + headerTop + 2, { width: otherWidths[idx] - 2, align: 'center' });
      subX += otherWidths[idx];
    });

    currentY += headerBlock;
    doc.font('Helvetica').fontSize(6.5);
    monthKeys.forEach((monthKey, monthIdx) => {
      currentX = x;
      const rowData = monthlySummary[monthKey];
      const other = monthlyOther[monthKey] || buildEmptyOtherCell();
      const rowFill = monthIdx % 2 === 0 ? '#dbe8ff' : '#ffffff';
      doc.rect(currentX, currentY, widths[0], rowHeight).fillAndStroke(rowFill, '#000');
      doc.fillColor('#000').text(monthKeyToLabel(monthKey), currentX + 2, currentY + 5, { width: widths[0] - 4, align: 'left' });
      currentX += widths[0];

      DA_MAIN_CATEGORY_COLUMNS.forEach((column, index) => {
        const raw = metric === 'volume' ? (rowData[column.key] || {}).volume : (rowData[column.key] || {}).revenue;
        doc.rect(currentX, currentY, mainWidths[index], rowHeight).fillAndStroke(rowFill, '#000');
        doc.fillColor('#000').text(formatter(raw), currentX + 1, currentY + 5, { width: mainWidths[index] - 2, align: 'center' });
        currentX += mainWidths[index];
      });

      const productCell = truncateProductNames(other.names, 48);
      doc.rect(currentX, currentY, otherWidths[0], rowHeight).fillAndStroke(rowFill, '#000');
      doc.fillColor('#000').text(productCell || '—', currentX + 2, currentY + 4, { width: otherWidths[0] - 4, align: 'left' });
      currentX += otherWidths[0];

      ['pc', 'kg', 'lt'].forEach((bucket, bucketIdx) => {
        const raw = metric === 'volume' ? other.volume[bucket] : other.revenue[bucket];
        doc.rect(currentX, currentY, otherWidths[bucketIdx + 1], rowHeight).fillAndStroke(rowFill, '#000');
        doc.fillColor('#000').text(formatter(raw), currentX + 1, currentY + 5, { width: otherWidths[bucketIdx + 1] - 2, align: 'center' });
        currentX += otherWidths[bucketIdx + 1];
      });

      currentY += rowHeight;
    });

    return { tableWidth: totalWidth };
  };

  const resolvedStoreName = storeName || 'Unknown Store';
  const resolvedStoreAddress = storeAddress || 'N/A';

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#000').text('KADIWA SALES REPORT FORM - DA SUBMISSION', { align: 'left' });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).text(`Kadiwa Operator: ${resolvedStoreName}`);
  doc.text(`Address of Kadiwa Store: ${resolvedStoreAddress}`);
  doc.text(`Date of Operation: ${startDate} to ${endDate}`);
  doc.text(
    `Sales Channels: Pickup ${Number(channelSummary?.pickup_orders || 0)} orders / ₱${Number(channelSummary?.pickup_revenue || 0).toFixed(2)} | ` +
    `Delivery ${Number(channelSummary?.delivery_orders || 0)} orders / ₱${Number(channelSummary?.delivery_revenue || 0).toFixed(2)}`
  );
  doc.moveDown(0.6);

  const leftDrawn = drawFormTable({ x: 24, y: 100, title: 'VOLUME SOLD (kg/pc/L)', metric: 'volume' });
  drawFormTable({ x: 24 + leftDrawn.tableWidth + 24, y: 100, title: 'VALUE IN PHP', metric: 'revenue' });

  doc.end();
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// All routes below require store_owner auth
router.get('/reports/submissions/:id/file', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'Invalid submission id' });

    const [[row]] = await db.query(
      `SELECT id, store_owner_id, report_file_name, report_file_path
       FROM admin_reports
       WHERE id = ? AND store_owner_id = ?`,
      [id, req.user.id]
    );

    if (!row) return res.status(404).json({ message: 'Submission not found' });
    if (!row.report_file_path) return res.status(404).json({ message: 'No file attached to this submission' });

    const absolutePath = path.resolve(__dirname, '..', row.report_file_path);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'Report file not found on server' });
    }

    const ext = path.extname(row.report_file_name || '').toLowerCase();
    const contentType = ext === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const fallbackName = ext === '.pdf' ? `submission_${id}.pdf` : `submission_${id}.xlsx`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${row.report_file_name || fallbackName}"`);
    return res.sendFile(absolutePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to download report file' });
  }
});

// Reports: Daily sales breakdown (delivered vs pickup channels)
router.get('/reports/sales', async (req, res) => {
  try {
    const fromQ = req.query.from || req.query.dateFrom;
    const toQ = req.query.to || req.query.dateTo;
    const from = parseIsoDateParts(fromQ)
      ? String(fromQ).slice(0, 10)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = parseIsoDateParts(toQ)
      ? String(toQ).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const [rows] = await db.query(
      `SELECT DATE(o.created_at) AS day,
              CASE WHEN COALESCE(o.shipping_method, 'delivery') = 'pickup' THEN 'pickup' ELSE 'delivered' END AS channel,
              COALESCE(SUM(o.total_amount), 0) AS revenue,
              COUNT(*) AS orders
       FROM orders o
       WHERE o.store_owner_id = ?
         AND o.status = 'delivered'
         AND DATE(o.created_at) BETWEEN ? AND ?
       GROUP BY day, channel
       ORDER BY day ASC, channel ASC`,
      [req.user.id, from, to]
    );

    res.json(rows.map((r) => ({
      day: r.day,
      channel: r.channel,
      revenue: Number(r.revenue || 0),
      orders: Number(r.orders || 0)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load sales report' });
  }
});

// Reports: Finalized (delivered) orders list for the selected range
router.get('/reports/orders', async (req, res) => {
  try {
    const fromQ = req.query.from || req.query.dateFrom;
    const toQ = req.query.to || req.query.dateTo;
    const from = parseIsoDateParts(fromQ)
      ? String(fromQ).slice(0, 10)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = parseIsoDateParts(toQ)
      ? String(toQ).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const [rows] = await db.query(
      `SELECT o.id, o.total_amount, o.delivery_fee, o.created_at, o.shipping_method, o.payment_method,
              CASE WHEN COALESCE(o.shipping_method, 'delivery') = 'pickup' THEN 'pickup' ELSE 'delivered' END AS channel,
              c.full_name AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.store_owner_id = ?
         AND o.status = 'delivered'
         AND DATE(o.created_at) BETWEEN ? AND ?
       ORDER BY o.created_at DESC`,
      [req.user.id, from, to]
    );

    res.json(rows.map((r) => ({
      id: r.id,
      total_amount: Number(r.total_amount || 0),
      delivery_fee: Number(r.delivery_fee || 0),
      created_at: r.created_at,
      shipping_method: r.shipping_method || 'delivery',
      payment_method: r.payment_method || 'cod',
      channel: r.channel,
      customer_name: r.customer_name || null
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load orders report' });
  }
});

// Reports: Download DA Excel Form (sales report workbook)
router.get('/reports/da-excel-form', authMiddleware, isStoreOwner, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');

    const [[storeData]] = await db.query(
      `SELECT store_name, address FROM store_owners WHERE id = ?`,
      [req.user.id]
    );

    if (!storeData) return res.status(404).json({ message: 'Store not found' });

    const fromQ = req.query.from || req.query.dateFrom;
    const toQ = req.query.to || req.query.dateTo;
    const excelFrom = parseIsoDateParts(fromQ)
      ? String(fromQ).slice(0, 10)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const excelTo = parseIsoDateParts(toQ)
      ? String(toQ).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const [dailyRows] = await db.query(
      `SELECT DATE(o.created_at) AS day,
              CASE WHEN COALESCE(o.shipping_method, 'delivery') = 'pickup' THEN 'pickup' ELSE 'delivered' END AS channel,
              COALESCE(SUM(o.total_amount), 0) AS revenue,
              COUNT(*) AS orders
       FROM orders o
       WHERE o.store_owner_id = ?
         AND o.status = 'delivered'
         AND DATE(o.created_at) BETWEEN ? AND ?
       GROUP BY day, channel
       ORDER BY day ASC, channel ASC`,
      [req.user.id, excelFrom, excelTo]
    );

    const [orderRows] = await db.query(
      `SELECT o.id, o.total_amount, o.delivery_fee, o.created_at, o.shipping_method, o.payment_method,
              CASE WHEN COALESCE(o.shipping_method, 'delivery') = 'pickup' THEN 'pickup' ELSE 'delivered' END AS channel,
              c.full_name AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.store_owner_id = ?
         AND o.status = 'delivered'
         AND DATE(o.created_at) BETWEEN ? AND ?
       ORDER BY COALESCE(c.full_name, ''), o.created_at DESC`,
      [req.user.id, excelFrom, excelTo]
    );

    const deliveredRevenue = dailyRows
      .filter((row) => String(row.channel) === 'delivered')
      .reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const pickupRevenue = dailyRows
      .filter((row) => String(row.channel) === 'pickup')
      .reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const totalRevenue = orderRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KADIWA';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Report', {
      views: [{ state: 'frozen', ySplit: 10 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    const border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    const styleCell = (cell, options = {}) => {
      cell.border = options.border || border;
      cell.alignment = options.alignment || { vertical: 'middle', horizontal: 'center', wrapText: true };
      if (options.fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fill } };
      }
      if (options.font) {
        cell.font = options.font;
      }
    };

    const formatCurrency = (value) => `₱${Number(value || 0).toFixed(2)}`;

    worksheet.columns = [
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }
    ];

    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = 'KADIWA SALES REPORT';
    styleCell(worksheet.getCell('A1'), {
      fill: 'B6D7A8',
      font: { name: 'Arial', size: 16, bold: true },
      alignment: { horizontal: 'center', vertical: 'middle' }
    });

    worksheet.mergeCells('A2:H2');
    worksheet.getCell('A2').value = `Kadiwa Operator: ${storeData.store_name || 'Unknown Store'}`;
    styleCell(worksheet.getCell('A2'), {
      font: { name: 'Arial', size: 10, bold: true },
      alignment: { horizontal: 'left', vertical: 'middle' }
    });

    worksheet.mergeCells('A3:H3');
    worksheet.getCell('A3').value = `Address of Kadiwa Store: ${storeData.address || 'N/A'}`;
    styleCell(worksheet.getCell('A3'), {
      font: { name: 'Arial', size: 10 },
      alignment: { horizontal: 'left', vertical: 'middle' }
    });

    worksheet.mergeCells('A4:H4');
    worksheet.getCell('A4').value = `Date of Operation: ${excelFrom} to ${excelTo}`;
    styleCell(worksheet.getCell('A4'), {
      font: { name: 'Arial', size: 10 },
      alignment: { horizontal: 'left', vertical: 'middle' }
    });

    worksheet.mergeCells('A6:B6');
    worksheet.getCell('A6').value = 'Delivered Sales';
    styleCell(worksheet.getCell('A6'), { fill: 'E2F0D9', font: { name: 'Arial', size: 10, bold: true } });
    worksheet.mergeCells('C6:D6');
    worksheet.getCell('C6').value = 'Pickup Sales';
    styleCell(worksheet.getCell('C6'), { fill: 'E2F0D9', font: { name: 'Arial', size: 10, bold: true } });
    worksheet.mergeCells('E6:F6');
    worksheet.getCell('E6').value = 'Orders Count';
    styleCell(worksheet.getCell('E6'), { fill: 'E2F0D9', font: { name: 'Arial', size: 10, bold: true } });
    worksheet.mergeCells('G6:H6');
    worksheet.getCell('G6').value = 'Total Revenue';
    styleCell(worksheet.getCell('G6'), { fill: 'E2F0D9', font: { name: 'Arial', size: 10, bold: true } });

    worksheet.mergeCells('A7:B8');
    worksheet.getCell('A7').value = formatCurrency(deliveredRevenue);
    styleCell(worksheet.getCell('A7'), { fill: 'F4F8EE', font: { name: 'Arial', size: 16, bold: true } });
    worksheet.mergeCells('C7:D8');
    worksheet.getCell('C7').value = formatCurrency(pickupRevenue);
    styleCell(worksheet.getCell('C7'), { fill: 'F4F8EE', font: { name: 'Arial', size: 16, bold: true } });
    worksheet.mergeCells('E7:F8');
    worksheet.getCell('E7').value = orderRows.length;
    styleCell(worksheet.getCell('E7'), { fill: 'F4F8EE', font: { name: 'Arial', size: 16, bold: true } });
    worksheet.mergeCells('G7:H8');
    worksheet.getCell('G7').value = formatCurrency(totalRevenue);
    styleCell(worksheet.getCell('G7'), { fill: 'F4F8EE', font: { name: 'Arial', size: 16, bold: true } });

    worksheet.mergeCells('A10:D10');
    worksheet.getCell('A10').value = 'Daily Revenue';
    styleCell(worksheet.getCell('A10'), { fill: 'B6D7A8', font: { name: 'Arial', size: 11, bold: true } });

    ['Day', 'Channel', 'Orders', 'Revenue'].forEach((label, index) => {
      const cell = worksheet.getCell(11, index + 1);
      cell.value = label;
      styleCell(cell, { fill: 'FFF2CC', font: { name: 'Arial', size: 10, bold: true } });
    });

    const dailyStartRow = 12;
    if (!dailyRows.length) {
      worksheet.mergeCells(`A${dailyStartRow}:D${dailyStartRow}`);
      const emptyDaily = worksheet.getCell(`A${dailyStartRow}`);
      emptyDaily.value = 'No data for the selected range.';
      styleCell(emptyDaily, { alignment: { horizontal: 'center', vertical: 'middle' } });
    } else {
      dailyRows.forEach((row, index) => {
        const rowNumber = dailyStartRow + index;
        const fillColor = index % 2 === 0 ? 'FFFFFF' : 'F9FCF5';
        const values = [
          row.day,
          String(row.channel || '').toLowerCase() === 'pickup' ? 'Pickup' : 'Delivered',
          Number(row.orders || 0),
          Number(row.revenue || 0)
        ];
        values.forEach((value, colIndex) => {
          const cell = worksheet.getCell(rowNumber, colIndex + 1);
          cell.value = value;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
          cell.font = { name: 'Arial', size: 10 };
          cell.alignment = { vertical: 'middle', horizontal: colIndex === 0 ? 'left' : 'center' };
          if (colIndex === 3) cell.numFmt = '₱#,##0.00';
          styleCell(cell);
        });
      });
    }

    const ordersTitleRow = dailyStartRow + Math.max(dailyRows.length, 1) + 3;
    worksheet.mergeCells(`A${ordersTitleRow}:H${ordersTitleRow}`);
    worksheet.getCell(`A${ordersTitleRow}`).value = 'Finalized Orders';
    styleCell(worksheet.getCell(`A${ordersTitleRow}`), { fill: 'B6D7A8', font: { name: 'Arial', size: 11, bold: true } });

    ['ID', 'Date', 'Customer', 'Channel', 'Shipping', 'Payment', 'Delivery Fee', 'Total'].forEach((label, index) => {
      const cell = worksheet.getCell(ordersTitleRow + 1, index + 1);
      cell.value = label;
      styleCell(cell, { fill: 'FFF2CC', font: { name: 'Arial', size: 10, bold: true } });
    });

    const ordersStartRow = ordersTitleRow + 2;
    if (!orderRows.length) {
      worksheet.mergeCells(`A${ordersStartRow}:H${ordersStartRow}`);
      const emptyOrders = worksheet.getCell(`A${ordersStartRow}`);
      emptyOrders.value = 'No orders for the selected range.';
      styleCell(emptyOrders, { alignment: { horizontal: 'center', vertical: 'middle' } });
    } else {
      orderRows.forEach((row, index) => {
        const rowNumber = ordersStartRow + index;
        const fillColor = index % 2 === 0 ? 'FFFFFF' : 'F9FCF5';
        const values = [
          `#${row.id}`,
          new Date(row.created_at).toLocaleString(),
          row.customer_name || '—',
          String(row.channel || '').toLowerCase() === 'pickup' ? 'Pickup' : 'Delivered',
          row.shipping_method || '—',
          row.payment_method || '—',
          Number(row.delivery_fee || 0),
          Number(row.total_amount || 0)
        ];
        values.forEach((value, colIndex) => {
          const cell = worksheet.getCell(rowNumber, colIndex + 1);
          cell.value = value;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
          cell.font = { name: 'Arial', size: 10 };
          cell.alignment = { vertical: 'middle', horizontal: colIndex === 2 ? 'left' : 'center', wrapText: true };
          if (colIndex === 6 || colIndex === 7) cell.numFmt = '₱#,##0.00';
          styleCell(cell);
        });
      });
    }

    const fileName = `KADIWA-Sales-Report-Form_${req.user.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('DA Excel form error:', err);
    res.status(500).json({ message: 'Failed to generate DA Excel form' });
  }
});

// Reports: Generate PDF report for store
router.post('/reports/generate-pdf', authMiddleware, isStoreOwner, async (req, res) => {
  try {
    const { period, from, to } = req.body;

    const [storeRows] = await db.query(
      `SELECT store_name, address FROM store_owners WHERE id = ?`,
      [req.user.id]
    );

    if (!storeRows.length) return res.status(404).json({ message: 'Store not found' });

    const startDate = from || `${new Date().getFullYear()}-01-01`;
    const endDate = to || new Date().toISOString().slice(0, 10);

    const [summaryRows] = await db.query(DA_SUMMARY_MONTHLY_SQL, [req.user.id, startDate, endDate]);
    const [otherCandidates] = await db.query(DA_OTHER_PRODUCT_LINES_SQL, [req.user.id, startDate, endDate]);
    const otherProductRows = otherCandidates.filter((r) => normalizeCategory(r.category_key) === 'other');
    const [[channelSummary]] = await db.query(
      `SELECT
         SUM(CASE WHEN COALESCE(shipping_method, 'delivery') = 'pickup' THEN 1 ELSE 0 END) AS pickup_orders,
         COALESCE(SUM(CASE WHEN COALESCE(shipping_method, 'delivery') = 'pickup' THEN total_amount ELSE 0 END), 0) AS pickup_revenue,
         SUM(CASE WHEN COALESCE(shipping_method, 'delivery') <> 'pickup' THEN 1 ELSE 0 END) AS delivery_orders,
         COALESCE(SUM(CASE WHEN COALESCE(shipping_method, 'delivery') <> 'pickup' THEN total_amount ELSE 0 END), 0) AS delivery_revenue
       FROM orders
       WHERE store_owner_id = ? AND status = 'delivered' AND DATE(created_at) BETWEEN ? AND ?`,
      [req.user.id, startDate, endDate]
    );

    const pdfBuffer = await createDaSalesReportPdf({
      storeName: storeRows[0].store_name || 'Unknown Store',
      storeAddress: storeRows[0].address || 'N/A',
      startDate,
      endDate,
      summaryRows,
      otherProductRows,
      channelSummary
    });

    const fileName = `sales_report_form_${req.user.id}_${startDate}_to_${endDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Generate PDF error:', err);
    res.status(500).json({ message: 'Failed to generate PDF report' });
  }
});

// Reports: Submit report to DA
router.post('/reports/submit-to-da', authMiddleware, isStoreOwner, async (req, res) => {
  try {
    const { period, from, to } = req.body;
    
    const [[storeData]] = await db.query(
      `SELECT store_name, address FROM store_owners WHERE id = ?`,
      [req.user.id]
    );
    if (!storeData) return res.status(404).json({ message: 'Store not found' });

    const startDate = from || `${new Date().getFullYear()}-01-01`;
    const endDate = to || new Date().toISOString().slice(0, 10);

    const [[ordersAgg]] = await db.query(
      `SELECT COUNT(*) AS orders_count,
              COALESCE(SUM(total_amount), 0) AS total_revenue
       FROM orders
       WHERE store_owner_id = ?
         AND status = 'delivered'
         AND DATE(created_at) BETWEEN ? AND ?`,
      [req.user.id, startDate, endDate]
    );

    const [[itemsAgg]] = await db.query(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS items_sold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.store_owner_id = ?
         AND o.status = 'delivered'
         AND DATE(o.created_at) BETWEEN ? AND ?`,
      [req.user.id, startDate, endDate]
    );

    const [summaryRows] = await db.query(DA_SUMMARY_MONTHLY_SQL, [req.user.id, startDate, endDate]);
    const [otherCandidates] = await db.query(DA_OTHER_PRODUCT_LINES_SQL, [req.user.id, startDate, endDate]);
    const otherProductRows = otherCandidates.filter((r) => normalizeCategory(r.category_key) === 'other');
    const [[channelSummary]] = await db.query(
      `SELECT
         SUM(CASE WHEN COALESCE(shipping_method, 'delivery') = 'pickup' THEN 1 ELSE 0 END) AS pickup_orders,
         COALESCE(SUM(CASE WHEN COALESCE(shipping_method, 'delivery') = 'pickup' THEN total_amount ELSE 0 END), 0) AS pickup_revenue,
         SUM(CASE WHEN COALESCE(shipping_method, 'delivery') <> 'pickup' THEN 1 ELSE 0 END) AS delivery_orders,
         COALESCE(SUM(CASE WHEN COALESCE(shipping_method, 'delivery') <> 'pickup' THEN total_amount ELSE 0 END), 0) AS delivery_revenue
       FROM orders
       WHERE store_owner_id = ? AND status = 'delivered' AND DATE(created_at) BETWEEN ? AND ?`,
      [req.user.id, startDate, endDate]
    );

    const pdfBuffer = await createDaSalesReportPdf({
      storeName: storeData.store_name || 'Unknown Store',
      storeAddress: storeData.address || 'N/A',
      startDate,
      endDate,
      summaryRows,
      otherProductRows,
      channelSummary
    });

    const uploadsDir = path.resolve(__dirname, '..', 'uploads', 'admin-reports');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const reportFileName = `sales_report_${req.user.id}_${period}_${startDate}_to_${endDate}.pdf`;
    const absoluteFilePath = path.join(uploadsDir, reportFileName);
    fs.writeFileSync(absoluteFilePath, pdfBuffer);

    const relativeFilePath = path.join('uploads', 'admin-reports', reportFileName).replace(/\\/g, '/');

    await ensureAdminReportsExtras();
    const [result] = await db.query(
      `INSERT INTO admin_reports (
        store_owner_id,
        period_type,
        period_start,
        period_end,
        orders_count,
        items_sold,
        total_revenue,
        report_source,
        report_file_name,
        report_file_path,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'kadiwa', ?, ?, NULL)`,
      [
        req.user.id,
        period,
        startDate,
        endDate,
        Number(ordersAgg.orders_count || 0),
        Number(itemsAgg.items_sold || 0),
        Number(ordersAgg.total_revenue || 0),
        reportFileName,
        relativeFilePath
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Report submitted to DA successfully',
      submission_id: result.insertId,
      period,
      from: startDate,
      to: endDate,
      file_name: reportFileName,
      file_path: relativeFilePath,
      report_source: 'kadiwa'
    });
  } catch (err) {
    console.error('Submit to DA error:', err);
    res.status(500).json({ message: 'Failed to submit report to DA' });
  }
});

// Reports: Upload external POS report file and submit to DA
router.post('/reports/upload-pos-to-da', (req, res) => {
  posReportUpload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max 12MB)'
        : (uploadErr.message || 'Invalid upload');
      return res.status(400).json({ message: msg });
    }

    try {
      await ensureAdminReportsExtras();
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: 'POS report file is required' });
      }

      const period = String(req.body?.period || 'monthly').toLowerCase();
      if (!['weekly', 'monthly', 'yearly'].includes(period)) {
        return res.status(400).json({ message: 'Invalid period' });
      }

      const startDate = req.body?.from || `${new Date().getFullYear()}-01-01`;
      const endDate = req.body?.to || new Date().toISOString().slice(0, 10);
      const notes = String(req.body?.notes || '').trim().slice(0, 1000) || null;
      const ordersCount = Math.max(0, parseInt(req.body?.orders_count || '0', 10) || 0);
      const itemsSold = Math.max(0, parseInt(req.body?.items_sold || '0', 10) || 0);
      const totalRevenue = Math.max(0, Number(req.body?.total_revenue || 0) || 0);

      const [[storeData]] = await db.query(
        'SELECT store_name FROM store_owners WHERE id = ?',
        [req.user.id]
      );
      if (!storeData) return res.status(404).json({ message: 'Store not found' });

      fs.mkdirSync(POS_REPORT_UPLOAD_DIR, { recursive: true });
      const original = sanitizeUploadName(req.file.originalname);
      const stamp = Date.now();
      const reportFileName = `pos_report_${req.user.id}_${period}_${startDate}_to_${endDate}_${stamp}_${original}`;
      const absoluteFilePath = path.join(POS_REPORT_UPLOAD_DIR, reportFileName);
      fs.writeFileSync(absoluteFilePath, req.file.buffer);
      const relativeFilePath = path
        .join('uploads', 'admin-reports', 'pos', reportFileName)
        .replace(/\\/g, '/');

      const [result] = await db.query(
        `INSERT INTO admin_reports (
          store_owner_id,
          period_type,
          period_start,
          period_end,
          orders_count,
          items_sold,
          total_revenue,
          report_source,
          report_file_name,
          report_file_path,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'external_pos', ?, ?, ?)`,
        [
          req.user.id,
          period,
          startDate,
          endDate,
          ordersCount,
          itemsSold,
          totalRevenue,
          reportFileName,
          relativeFilePath,
          notes
        ]
      );

      res.status(201).json({
        success: true,
        message: 'POS report uploaded and submitted to DA',
        submission_id: result.insertId,
        period,
        from: startDate,
        to: endDate,
        file_name: reportFileName,
        file_path: relativeFilePath,
        report_source: 'external_pos',
        store_name: storeData.store_name
      });
    } catch (err) {
      console.error('Upload POS report to DA error:', err);
      res.status(500).json({ message: 'Failed to upload POS report to DA' });
    }
  });
});

// Reports: list this store's DA submissions (Kadiwa + external POS)
router.get('/reports/submissions', async (req, res) => {
  try {
    await ensureAdminReportsExtras();
    const [rows] = await db.query(
      `SELECT id, period_type, period_start, period_end, orders_count, items_sold, total_revenue,
              report_source, report_file_name, report_file_path, notes, created_at
       FROM admin_reports
       WHERE store_owner_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load report submissions' });
  }
});

// Reports: Sales forecast for store
router.get('/reports/forecast', async (req, res) => {
  try {
    const horizon = Math.max(1, Math.min(30, Number(req.query.horizon) || 7));
    const result = await getStoreForecast(req.user.id, horizon);
    res.json({
      ...result,
      learning: readRetrainStatus()
    });
  } catch (err) {
    console.error('Forecast error:', err);
    res.status(500).json({ message: err.message || 'Failed to load forecast' });
  }
});

// ML continuous learning status
router.get('/reports/ml-learning', async (req, res) => {
  try {
    res.json(readRetrainStatus());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to load ML learning status' });
  }
});

// Manually retrain models from delivered orders (learns from live system activity)
router.post('/reports/ml-retrain', async (req, res) => {
  try {
    const result = await retrainFromLiveOrders({ force: true, reason: 'store_manual' });
    res.json(result);
  } catch (err) {
    console.error('ML retrain error:', err);
    res.status(500).json({ message: err.message || 'Failed to retrain ML models' });
  }
});

// Reports: delivered-product sales trends for the store
router.get('/reports/product-trends', async (req, res) => {
  try {
    const days = Math.floor(Math.max(7, Math.min(90, Number(req.query.days) || 30)));
    const trends = await getProductTrends(req.user.id, days);
    res.json({
      days,
      comparison: `Latest ${days} days vs previous ${days} days`,
      trends
    });
  } catch (err) {
    console.error('Product trends error:', err);
    res.status(500).json({ message: err.message || 'Failed to load product trends' });
  }
});

// 4.2 Products
router.get('/products', async (req, res) => {
  try {
    const { q } = req.query;
    const rows = await Product.listByStoreOwner(req.user.id, { q });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to list products' });
  }
});

router.get('/features/me', async (req, res) => {
  try {
    await ensureFeatureFlagsTables();
    const [globalRows] = await db.query('SELECT feature_key, enabled FROM global_feature_flags');
    const [storeRows] = await db.query('SELECT feature_key, enabled FROM store_feature_flags WHERE store_owner_id = ?', [req.user.id]);
    const globalMap = new Map(globalRows.map(r => [String(r.feature_key), Number(r.enabled) === 1]));
    const storeMap = new Map(storeRows.map(r => [String(r.feature_key), Number(r.enabled) === 1]));
    const features = {};
    for (const key of MANAGEABLE_FEATURES) {
      const globalEnabled = globalMap.has(key) ? globalMap.get(key) : true;
      features[key] = storeMap.has(key) ? storeMap.get(key) : globalEnabled;
    }
    res.json({
      store_owner_id: req.user.id,
      features,
      feature_keys: MANAGEABLE_FEATURES
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load store feature flags' });
  }
});

router.put('/features/me', async (req, res) => {
  try {
    const { feature_key, enabled } = req.body;
    if (!MANAGEABLE_FEATURES.includes(feature_key)) {
      return res.status(400).json({ message: 'Invalid feature key' });
    }
    const enabledBool = Boolean(enabled);
    await ensureFeatureFlagsTables();
    await db.query(
      `INSERT INTO store_feature_flags (store_owner_id, feature_key, enabled)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
      [req.user.id, feature_key, enabledBool ? 1 : 0]
    );
    res.json({ message: 'Feature updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update feature' });
  }
});

router.post('/products', [
  body('name').notEmpty(),
  body('price').isFloat({ gt: 0 }),
  body('cost').optional({ nullable: true }).isFloat({ min: 0 }),
  body('srp').optional({ nullable: true }).isFloat({ min: 0 }),
  body('srp_vat').optional({ nullable: true }).isFloat({ min: 0 }),
  body('stock').isInt({ min: 0 }),
  body('unit').notEmpty().withMessage('unit is required'),
  body('category').notEmpty().withMessage('category is required'),
  body('description').notEmpty().withMessage('description is required'),
  body('image_data_url').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 3000000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    let imageUrl = null;
    if (req.body.image_data_url) {
      imageUrl = saveProductImageFromDataUrl(req.body.image_data_url, req.user.id);
      if (!imageUrl) {
        return res.status(400).json({ message: 'Invalid image. Use PNG, JPG, WEBP, or GIF up to 2MB.' });
      }
    }
    const id = await Product.create(req.user.id, { ...req.body, image_url: imageUrl });
    if (Number(req.body.stock || 0) <= Notification.lowStockThreshold) {
      try {
        await Notification.notifyStoreOwner(req.user.id, {
          type: 'stock',
          subject: 'Low stock alert',
          message: `${req.body.name} was added with only ${Number(req.body.stock || 0)} item(s) in stock.`
        });
      } catch (notificationErr) {
        console.error('Stock notification failed:', notificationErr.message || notificationErr);
      }
    }
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create product' });
  }
});

router.put('/products/:id', [
  body('name').notEmpty(),
  body('price').isFloat({ min: 0 }),
  body('cost').optional({ nullable: true }).isFloat({ min: 0 }),
  body('srp').optional({ nullable: true }).isFloat({ min: 0 }),
  body('srp_vat').optional({ nullable: true }).isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
  body('image_data_url').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 3000000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const [[previousProduct]] = await db.query(
      'SELECT name, stock FROM products WHERE id = ? AND store_owner_id = ? LIMIT 1',
      [req.params.id, req.user.id]
    );
    let imageUrl;
    if (req.body.image_data_url) {
      imageUrl = saveProductImageFromDataUrl(req.body.image_data_url, req.user.id);
      if (!imageUrl) {
        return res.status(400).json({ message: 'Invalid image. Use PNG, JPG, WEBP, or GIF up to 2MB.' });
      }
    }
    const payload = { ...req.body };
    if (typeof imageUrl === 'string') payload.image_url = imageUrl;
    const ok = await Product.update(req.user.id, req.params.id, payload);
    if (!ok) return res.status(404).json({ message: 'Product not found' });
    const previousStock = Number(previousProduct?.stock || 0);
    const hasStockUpdate = payload.stock !== undefined && payload.stock !== null && payload.stock !== '';
    const nextStock = hasStockUpdate ? Number(payload.stock) : previousStock;
    const threshold = Notification.lowStockThreshold;
    const crossedLowThreshold = previousStock > threshold && nextStock <= threshold;
    const becameOutOfStock = previousStock > 0 && nextStock === 0;
    if (previousProduct && hasStockUpdate && (crossedLowThreshold || becameOutOfStock)) {
      try {
        await Notification.notifyStoreOwner(req.user.id, {
          type: 'stock',
          subject: nextStock === 0 ? 'Out of stock alert' : 'Low stock alert',
          message: `${payload.name || previousProduct.name} now has ${nextStock} item(s) in stock.`
        });
      } catch (notificationErr) {
        console.error('Stock notification failed:', notificationErr.message || notificationErr);
      }
    }
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update product' });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const ok = await Product.remove(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete product' });
  }
});

// 4.2.1 POS (feature-flag controlled per store)
async function ensurePosEnabled(req, res) {
  try {
    await ensureFeatureFlagsTables();
    const [globalRows] = await db.query(
      'SELECT enabled FROM global_feature_flags WHERE feature_key = ? LIMIT 1',
      ['pos']
    );
    const [storeRows] = await db.query(
      'SELECT enabled FROM store_feature_flags WHERE store_owner_id = ? AND feature_key = ? LIMIT 1',
      [req.user.id, 'pos']
    );
    const globalEnabled = globalRows.length ? Number(globalRows[0].enabled) === 1 : true;
    const effectiveEnabled = storeRows.length ? Number(storeRows[0].enabled) === 1 : globalEnabled;
    if (!effectiveEnabled) {
      res.status(403).json({ message: 'POS is disabled for this store.' });
      return false;
    }
    return true;
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to validate POS access' });
    return false;
  }
}

// POS user management for this store (only when POS feature is enabled)
router.get('/pos/users', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    await PosUser.ensureTableExists();
    const [rows] = await db.query(
      `SELECT id, store_owner_id, username, email, full_name, status, created_at
       FROM pos_users
       WHERE store_owner_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load POS users' });
  }
});

router.post('/pos/users', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    await PosUser.ensureTableExists();

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return res.status(400).json({ message: 'Valid email is required' });
    if (!password || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    // Keep username column filled for uniqueness; login is email + password
    const username = email;
    const fullName = String(req.body.full_name || '').trim() || email.split('@')[0];

    const [existingE] = await db.query(
      'SELECT id FROM pos_users WHERE email = ? OR username = ? LIMIT 1',
      [email, username]
    );
    if (existingE.length) return res.status(400).json({ message: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO pos_users (store_owner_id, username, email, \`password\`, full_name, role, status)
       VALUES (?, ?, ?, ?, ?, 'pos_user', 'approved')`,
      [req.user.id, username, email, hashed, fullName]
    );
    res.status(201).json({
      id: result.insertId,
      email,
      message: 'POS user created',
      login_url: '/pos/login'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create POS user' });
  }
});

router.put('/pos/users/:posUserId/password', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    const posUserId = parseInt(req.params.posUserId, 10);
    const newPassword = String(req.body.password || '');
    if (!posUserId) return res.status(400).json({ message: 'Invalid POS user id' });
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    await PosUser.ensureTableExists();
    const [[row]] = await db.query(
      'SELECT id FROM pos_users WHERE id = ? AND store_owner_id = ? LIMIT 1',
      [posUserId, req.user.id]
    );
    if (!row) return res.status(404).json({ message: 'POS user not found for this store' });
    await PosUser.updatePassword(posUserId, newPassword);
    res.json({ message: 'POS user password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update POS user password' });
  }
});

router.put('/pos/users/:posUserId/status', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    const posUserId = parseInt(req.params.posUserId, 10);
    const status = String(req.body.status || '').trim().toLowerCase();
    if (!posUserId) return res.status(400).json({ message: 'Invalid POS user id' });
    if (!['approved', 'disabled'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    await PosUser.ensureTableExists();
    const [result] = await db.query(
      'UPDATE pos_users SET status = ? WHERE id = ? AND store_owner_id = ?',
      [status, posUserId, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'POS user not found for this store' });
    res.json({ message: 'POS user status updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update POS user status' });
  }
});

router.delete('/pos/users/:posUserId', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    const posUserId = parseInt(req.params.posUserId, 10);
    if (!posUserId) return res.status(400).json({ message: 'Invalid POS user id' });
    await PosUser.ensureTableExists();
    const [result] = await db.query(
      'DELETE FROM pos_users WHERE id = ? AND store_owner_id = ?',
      [posUserId, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'POS user not found for this store' });
    res.json({ message: 'POS user deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete POS user' });
  }
});

router.get('/pos/products', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    const q = String(req.query.q || '').trim();
    const limit = 20;
    let sql = `SELECT id, name, price, stock, status, category, image_url, updated_at
               FROM products
               WHERE store_owner_id = ? AND status = 'active'`;
    const params = [req.user.id];
    if (q) {
      sql += ' AND (name LIKE ? OR category LIKE ? OR description LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY stock DESC, name ASC LIMIT ?';
    params.push(limit);
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load POS products' });
  }
});

router.get('/pos/sales', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const [rows] = await db.query(
      `SELECT o.id, o.total_amount, o.payment_method, o.created_at,
              (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
       FROM orders o
       WHERE o.store_owner_id = ?
         AND o.customer_id IS NULL
         AND o.shipping_method = 'pickup'
       ORDER BY o.id DESC
       LIMIT ?`,
      [req.user.id, limit]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load POS sales' });
  }
});

router.get('/pos/sales/:id', async (req, res) => {
  if (!(await ensurePosEnabled(req, res))) return;
  try {
    const saleId = parseInt(req.params.id, 10);
    if (!saleId) return res.status(400).json({ message: 'Invalid sale id' });

    const [[order]] = await db.query(
      `SELECT o.id, o.store_owner_id, o.total_amount, o.payment_method, o.shipping_method,
              o.delivery_fee, o.status, o.created_at
       FROM orders o
       WHERE o.id = ?
         AND o.store_owner_id = ?
         AND o.customer_id IS NULL
         AND o.shipping_method = 'pickup'`,
      [saleId, req.user.id]
    );

    if (!order) return res.status(404).json({ message: 'POS sale not found' });

    const [items] = await db.query(
      `SELECT oi.id, oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price, oi.subtotal
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [saleId]
    );

    const subtotalAmount = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const totalAmount = Number(order.total_amount || 0);
    const discountAmount = Math.max(0, Number((subtotalAmount - totalAmount).toFixed(2)));

    res.json({
      order: {
        id: order.id,
        payment_method: order.payment_method,
        shipping_method: order.shipping_method,
        delivery_fee: Number(order.delivery_fee || 0),
        status: order.status,
        created_at: order.created_at,
        subtotal_amount: Number(subtotalAmount.toFixed(2)),
        discount_amount: discountAmount,
        total_amount: totalAmount
      },
      items: items.map(item => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        subtotal: Number(item.subtotal || 0)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load POS sale details' });
  }
});

router.post('/pos/checkout', [
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('payment_method').optional().isIn(['cash', 'cod', 'gcash']).withMessage('Invalid payment method'),
  body('discount_amount').optional().isFloat({ min: 0 }).withMessage('discount_amount must be >= 0'),
  body('cash_received').optional().isFloat({ min: 0 }).withMessage('cash_received must be >= 0'),
  body('notes').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 500 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  if (!(await ensurePosEnabled(req, res))) return;

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const paymentMethodRaw = String(req.body.payment_method || 'cash').toLowerCase();
  const paymentMethod = paymentMethodRaw === 'gcash' ? 'gcash' : 'cod';
  const discountAmount = Math.max(0, Number(req.body.discount_amount || 0));
  const cashReceived = Math.max(0, Number(req.body.cash_received || 0));
  const notes = req.body.notes || null;

  const normalized = [];
  for (const rawItem of items) {
    const productId = Number(rawItem?.product_id);
    const quantity = Number(rawItem?.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'Each item must contain valid product_id and quantity' });
    }
    normalized.push({ productId, quantity });
  }

  const aggregatedMap = new Map();
  for (const item of normalized) {
    const current = aggregatedMap.get(item.productId) || 0;
    aggregatedMap.set(item.productId, current + item.quantity);
  }
  const aggregatedItems = Array.from(aggregatedMap.entries()).map(([productId, quantity]) => ({ productId, quantity }));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const productIds = aggregatedItems.map(x => x.productId);
    const placeholders = productIds.map(() => '?').join(',');
    const [products] = await conn.query(
      `SELECT id, name, price, stock, status
       FROM products
       WHERE store_owner_id = ? AND id IN (${placeholders})
       FOR UPDATE`,
      [req.user.id, ...productIds]
    );

    if (products.length !== aggregatedItems.length) {
      await conn.rollback();
      return res.status(400).json({ message: 'One or more products are invalid for this store' });
    }

    const productById = new Map(products.map(p => [Number(p.id), p]));
    let subtotalAmount = 0;
    const lineItems = [];

    for (const entry of aggregatedItems) {
      const p = productById.get(entry.productId);
      if (!p) {
        await conn.rollback();
        return res.status(400).json({ message: `Product ${entry.productId} not found` });
      }
      if (p.status !== 'active') {
        await conn.rollback();
        return res.status(400).json({ message: `${p.name} is inactive` });
      }
      if (Number(p.stock) < entry.quantity) {
        await conn.rollback();
        return res.status(400).json({ message: `Insufficient stock for ${p.name}` });
      }
      const unitPrice = Number(p.price);
      const lineSubtotal = unitPrice * entry.quantity;
      subtotalAmount += lineSubtotal;
      lineItems.push({
        productId: Number(p.id),
        productName: p.name,
        quantity: entry.quantity,
        unitPrice,
        subtotal: lineSubtotal,
        previousStock: Number(p.stock || 0),
        remainingStock: Math.max(0, Number(p.stock || 0) - entry.quantity)
      });
    }

    const appliedDiscount = Math.min(discountAmount, subtotalAmount);
    const netTotal = Number((subtotalAmount - appliedDiscount).toFixed(2));

    if (paymentMethod === 'cod' && cashReceived > 0 && cashReceived < netTotal) {
      await conn.rollback();
      return res.status(400).json({ message: 'Insufficient cash received' });
    }

    const changeAmount = paymentMethod === 'cod' ? Math.max(0, Number((cashReceived - netTotal).toFixed(2))) : 0;
    const [orderResult] = await conn.query(
      `INSERT INTO orders (store_owner_id, customer_id, status, total_amount, payment_method, shipping_method, delivery_fee)
       VALUES (?, NULL, 'delivered', ?, ?, 'pickup', 0)`,
      [req.user.id, netTotal, paymentMethod]
    );
    const orderId = orderResult.insertId;

    for (const line of lineItems) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, line.productId, line.quantity, line.unitPrice, line.subtotal]
      );

      await conn.query(
        `UPDATE products
         SET stock = stock - ?
         WHERE id = ? AND store_owner_id = ?`,
        [line.quantity, line.productId, req.user.id]
      );
    }

    await CashTransaction.createCashInForOrder({
      id: orderId,
      store_id: req.user.id,
      total_amount: netTotal
    }, conn);

    await conn.commit();

    const threshold = Notification.lowStockThreshold;
    const newlyLow = lineItems.filter(line =>
      (line.previousStock > threshold && line.remainingStock <= threshold)
      || (line.previousStock > 0 && line.remainingStock === 0)
    );
    if (newlyLow.length) {
      try {
        await Notification.notifyStoreOwner(req.user.id, {
          type: 'stock',
          subject: 'POS low stock alert',
          message: `Stock needs attention after POS sale #${orderId}: ${newlyLow.map(line => `${line.productName}: ${line.remainingStock} left`).join(', ')}.`
        });
      } catch (notificationErr) {
        console.error('POS stock notification failed:', notificationErr.message || notificationErr);
      }
    }

    return res.status(201).json({
      message: 'POS checkout completed',
      order: {
        id: orderId,
        subtotal_amount: Number(subtotalAmount.toFixed(2)),
        discount_amount: Number(appliedDiscount.toFixed(2)),
        total_amount: netTotal,
        notes: notes,
        cash_received: Number(cashReceived.toFixed(2)),
        change_amount: changeAmount,
        payment_method: paymentMethod,
        status: 'delivered',
        shipping_method: 'pickup'
      },
      items: lineItems.map(x => ({
        product_id: x.productId,
        product_name: x.productName,
        quantity: x.quantity,
        unit_price: Number(x.unitPrice.toFixed(2)),
        subtotal: Number(x.subtotal.toFixed(2))
      }))
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    console.error(err);
    return res.status(500).json({ message: 'Failed to complete POS checkout' });
  } finally {
    conn.release();
  }
});

// 4.3 Orders
router.get('/orders', async (req, res) => {
  try {
    const { status, q } = req.query;
    const rows = await Order.listByStoreOwner(req.user.id, { status, q });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to list orders' });
  }
});

router.get('/orders/:id/items', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!orderId) return res.status(400).json({ message: 'Invalid order id' });

    const hasPreferredDeliveryDateColumn = await columnExists('orders', 'preferred_delivery_date');
    const preferredDeliveryDateSelect = hasPreferredDeliveryDateColumn
      ? 'o.preferred_delivery_date'
      : 'NULL AS preferred_delivery_date';

    const [[order]] = await require('../config/database').query(
      `SELECT o.id, o.store_owner_id, o.customer_id, o.status, o.total_amount, o.delivery_fee,
              o.shipping_method, o.delivery_address, o.payment_method, ${preferredDeliveryDateSelect}, o.created_at, c.full_name AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ?`,
      [orderId]
    );

    if (!order || Number(order.store_owner_id) !== Number(req.user.id)) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const [items] = await require('../config/database').query(
      `SELECT oi.id, oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price, oi.subtotal
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [orderId]
    );

    res.json({ order, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load order details' });
  }
});

router.put('/orders/:id/quantities', async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const quantities = Array.isArray(req.body.quantities) ? req.body.quantities : [];
  if (!orderId || !quantities.length) {
    return res.status(400).json({ message: 'Quantities are required' });
  }

  const connection = await require('../config/database').getConnection();
  try {
    await connection.beginTransaction();
    const [[order]] = await connection.query(
      'SELECT id, store_owner_id, status, delivery_fee, total_amount FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (!order || Number(order.store_owner_id) !== Number(req.user.id)) {
      await connection.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }
    if (['delivered', 'rejected'].includes(String(order.status))) {
      await connection.rollback();
      return res.status(400).json({ message: 'Actual quantities can only be updated before completion' });
    }

    const requested = new Map();
    for (const entry of quantities) {
      const itemId = Number(entry?.item_id);
      const quantity = Number(entry?.quantity);
      if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Each quantity must be a positive number');
      }
      requested.set(itemId, quantity);
    }

    const [items] = await connection.query(
      `SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ? AND p.store_owner_id = ?
       FOR UPDATE`,
      [orderId, req.user.id]
    );
    if (!items.length || items.some(item => !requested.has(Number(item.id)))) {
      throw new Error('Provide an actual quantity for every order item');
    }

    let subtotal = 0;
    for (const item of items) {
      const oldQuantity = Number(item.quantity);
      const newQuantity = requested.get(Number(item.id));
      const delta = newQuantity - oldQuantity;
      if (delta !== 0) {
        const [stockResult] = await connection.query(
          'UPDATE products SET stock = stock - ? WHERE id = ? AND store_owner_id = ? AND stock - ? >= 0',
          [delta, item.product_id, req.user.id, delta]
        );
        if (!stockResult.affectedRows) throw new Error('Insufficient stock for the actual quantity');
      }
      const lineSubtotal = Number(item.unit_price) * newQuantity;
      subtotal += lineSubtotal;
      await connection.query(
        'UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ? AND order_id = ?',
        [newQuantity, lineSubtotal, item.id, orderId]
      );
    }

    const discount = Math.max(0, Number(order.total_amount) - items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0) - Number(order.delivery_fee || 0));
    const total = Math.max(0, roundMoney(subtotal + Number(order.delivery_fee || 0) - discount));
    await connection.query('UPDATE orders SET total_amount = ? WHERE id = ?', [total, orderId]);
    await connection.commit();
    return res.json({ message: 'Actual quantities saved', subtotal: roundMoney(subtotal), total_amount: total });
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    console.error(err);
    return res.status(400).json({ message: err.message || 'Failed to save actual quantities' });
  } finally {
    connection.release();
  }
});

// 4.3.1 Update Order Status
router.put('/orders/:id/status', [
  body('status').isIn(['pending','on_the_way','delivered','pickup','rejected','completed','paid']).withMessage('Invalid status')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const orderId = parseInt(req.params.id, 10);
  const nextStatusRaw = String(req.body.status || '').toLowerCase();

  const statusMap = {
    completed: 'delivered',
    paid: 'delivered'
  };
  const nextStatus = statusMap[nextStatusRaw] || nextStatusRaw;

  try {
    // Ensure order belongs to this store owner
    const [[order]] = await require('../config/database').query('SELECT id, store_owner_id, customer_id, status, shipping_method, total_amount FROM orders WHERE id = ?', [orderId]);
    if (!order || order.store_owner_id !== req.user.id) return res.status(404).json({ message: 'Order not found' });

    let updatedStatus = nextStatus;
    if (nextStatus === 'pickup') {
      await require('../config/database').query('UPDATE orders SET status = ?, shipping_method = ? WHERE id = ?', ['delivered', 'pickup', orderId]);
      updatedStatus = 'delivered';
    } else {
      await require('../config/database').query('UPDATE orders SET status = ? WHERE id = ?', [nextStatus, orderId]);
    }

    if (updatedStatus === 'delivered' && String(order.status) !== 'delivered') {
      await CashTransaction.createCashInForOrder({
        id: order.id,
        store_id: order.store_owner_id,
        total_amount: order.total_amount
      });

      try {
        await Store3Savings.creditForDeliveredOrder({
          id: order.id,
          store_id: order.store_owner_id,
          customer_id: order.customer_id,
          total_amount: order.total_amount
        });
      } catch (rewardErr) {
        console.error('Store 3 savings credit failed:', rewardErr.message || rewardErr);
      }

      try {
        await RewardPoints.creditForDeliveredOrder({
          id: order.id,
          store_id: order.store_owner_id,
          customer_id: order.customer_id,
          total_amount: order.total_amount
        });
      } catch (pointsErr) {
        console.error('Reward points credit failed:', pointsErr.message || pointsErr);
      }

      // Continuous ML learning: delivered sales become future training data.
      scheduleLearningAfterDelivery();
    }

    if (order.customer_id && String(order.status) !== String(updatedStatus)) {
      const statusLabels = {
        pending: 'Pending',
        on_the_way: 'On the way',
        delivered: 'Delivered',
        rejected: 'Rejected'
      };
      const statusLabel = statusLabels[updatedStatus] || updatedStatus.replace(/_/g, ' ');
      try {
        await Notification.notifyCustomer(order.customer_id, {
          type: 'order_status',
          subject: `Order #${orderId} is ${statusLabel}`,
          message: updatedStatus === 'rejected'
            ? `Your order #${orderId} was rejected by the store. Please open Kadiwa Mart for details.`
            : `Your order #${orderId} status is now ${statusLabel}.`
        });
      } catch (notificationErr) {
        console.error('Customer status notification failed:', notificationErr.message || notificationErr);
      }
    }

    res.json({ message: 'Status updated', id: orderId, status: nextStatus === 'pickup' ? 'pickup' : updatedStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

// 4.3.2 Customers (Kadiwa Consumer Membership)
router.get('/customers', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const storeId = Number(req.user.id);
    const isStore1 = storeId === 1;
    const isStore3 = storeId === 3;
    const hasMembershipColumn = await columnExists('customers', 'is_kadiwa_member');
    const membershipSelect = hasMembershipColumn ? 'COALESCE(c.is_kadiwa_member, 0)' : '0';

    if (isStore1) {
      const params = [];
      let where = '';
      if (q) {
        where = 'WHERE (c.full_name LIKE ? OR c.username LIKE ? OR c.email LIKE ?)';
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }

      const [rows] = await db.query(
        `SELECT c.id, c.username, c.email, c.full_name, c.phone,
                ${membershipSelect} AS is_kadiwa_member,
                COALESCE(s.delivered_orders, 0) AS delivered_orders,
                COALESCE(s.total_spent, 0) AS total_spent
         FROM customers c
         LEFT JOIN (
           SELECT o.customer_id,
                  COUNT(*) AS delivered_orders,
                  COALESCE(SUM(o.total_amount), 0) AS total_spent
           FROM orders o
           WHERE o.status = 'delivered'
           GROUP BY o.customer_id
         ) s ON s.customer_id = c.id
         ${where}
         ORDER BY c.full_name ASC`,
        params
      );

      const normalized = rows.map(r => {
        const totalSpent = Number(r.total_spent || 0);
        const isMember = Number(r.is_kadiwa_member || 0) === 1;
        const purchaseBlocks = Math.floor(totalSpent / 500);
        const points = purchaseBlocks * (isMember ? 1 : 0.5);
        return {
          ...r,
          is_kadiwa_member: isMember,
          total_spent: totalSpent,
          points
        };
      });

      return res.json(normalized);
    }

    if (isStore3) {
      await Store3Savings.ensureTables();

      const params = [storeId];
      let where = '';
      if (q) {
        where = 'WHERE (c.full_name LIKE ? OR c.username LIKE ? OR c.email LIKE ?)';
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }

      const [rows] = await db.query(
        `SELECT c.id, c.username, c.email, c.full_name, c.phone,
                ${membershipSelect} AS is_kadiwa_member,
                COALESCE(s.delivered_orders, 0) AS delivered_orders,
                COALESCE(s.total_spent, 0) AS total_spent,
                COALESCE(w.current_balance, 0) AS savings_balance,
                COALESCE(w.total_contributed, 0) AS savings_total
         FROM customers c
         LEFT JOIN (
           SELECT o.customer_id,
                  COUNT(*) AS delivered_orders,
                  COALESCE(SUM(o.total_amount), 0) AS total_spent
           FROM orders o
           WHERE o.store_owner_id = ? AND o.status = 'delivered' AND o.customer_id IS NOT NULL
           GROUP BY o.customer_id
         ) s ON s.customer_id = c.id
         LEFT JOIN store3_savings_wallets w ON w.customer_id = c.id
         ${where}
         ORDER BY c.full_name ASC`,
        params
      );

      const normalized = rows.map(r => ({
        ...r,
        rewards_mode: 'store3_savings',
        reward_rate: 0.05,
        is_kadiwa_member: Number(r.is_kadiwa_member || 0) === 1,
        total_spent: Number(r.total_spent || 0),
        savings_balance: Number(r.savings_balance || 0),
        savings_total: Number(r.savings_total || 0),
        points: 0
      }));

      return res.json(normalized);
    }

    const params = [req.user.id];
    let where = '';
    if (q) {
      where = 'AND (c.full_name LIKE ? OR c.username LIKE ? OR c.email LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const [rows] = await db.query(
      `SELECT c.id, c.username, c.email, c.full_name, c.phone,
              ${membershipSelect} AS is_kadiwa_member,
              COALESCE(s.delivered_orders, 0) AS delivered_orders,
              COALESCE(s.total_spent, 0) AS total_spent
       FROM customers c
       JOIN (
         SELECT o.customer_id,
                COUNT(*) AS delivered_orders,
                COALESCE(SUM(o.total_amount), 0) AS total_spent
         FROM orders o
         WHERE o.store_owner_id = ? AND o.status = 'delivered' AND o.customer_id IS NOT NULL
         GROUP BY o.customer_id
       ) s ON s.customer_id = c.id
       WHERE 1 = 1
       ${where}
       ORDER BY c.full_name ASC`,
      params
    );

    const normalized = rows.map(r => {
      return {
        ...r,
        rewards_mode: 'none',
        is_kadiwa_member: Number(r.is_kadiwa_member || 0) === 1,
        total_spent: Number(r.total_spent || 0),
        points: 0
      };
    });

    res.json(normalized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load customers' });
  }
});

router.put('/customers/:id/membership', [
  body('is_member').isBoolean().withMessage('is_member must be boolean')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (Number(req.user.id) !== 1) {
    return res.status(403).json({ message: 'Only Store 1 can manage Kadiwa consumer membership' });
  }

  try {
    const customerId = parseInt(req.params.id, 10);
    if (!customerId) return res.status(400).json({ message: 'Invalid customer id' });

    const hasMembershipColumn = await columnExists('customers', 'is_kadiwa_member');
    if (!hasMembershipColumn) {
      return res.status(400).json({ message: 'Membership feature is not enabled in database yet' });
    }

    const isMember = req.body.is_member === true ? 1 : 0;
    const [result] = await db.query(
      'UPDATE customers SET is_kadiwa_member = ? WHERE id = ?',
      [isMember, customerId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Customer not found' });

    res.json({ message: 'Membership updated', id: customerId, is_member: isMember === 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update membership' });
  }
});

// 4.4 Inventory
router.get('/inventory/low', async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold || '10', 10);
    const rows = await Product.lowStocks(req.user.id, threshold);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load low stock items' });
  }
});

router.get('/inventory/out', async (req, res) => {
  try {
    const rows = await Product.outOfStock(req.user.id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load out of stock items' });
  }
});

// 4.5 Notifications
router.get('/notifications', async (req, res) => {
  try {
    const rows = await Notification.listByStoreOwner(req.user.id, parseInt(req.query.limit || '20', 10));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load notifications' });
  }
});

router.get('/notifications/unread-count', async (req, res) => {
  try {
    const count = await Notification.unreadCountForStoreOwner(req.user.id);
    res.json({ unread_count: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load unread notification count' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  try {
    await Notification.markAllStoreRead(req.user.id);
    res.json({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to mark notifications as read' });
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  try {
    const ok = await Notification.markRead(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update notification' });
  }
});

// 4.6 Logistics
router.get('/shipments', async (req, res) => {
  try {
    const rows = await Shipment.listByStoreOwner(req.user.id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to list shipments' });
  }
});

router.put('/shipments/:id', async (req, res) => {
  try {
    const ok = await Shipment.update(req.user.id, req.params.id, req.body);
    if (!ok) return res.status(404).json({ message: 'Shipment not found' });
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update shipment' });
  }
});

// 4.6.0 Reward points conditions (per store)
router.get('/rewards/settings', async (req, res) => {
  try {
    const settings = await RewardPoints.getStoreSettings(req.user.id);
    res.json({
      settings,
      defaults: RewardPoints.defaults,
      help: {
        earn_pesos_per_point: 'Customer earns 1 point for every N pesos on a delivered order.',
        redeem_peso_per_point: 'Each redeemed point gives N pesos off at checkout.',
        max_redeem_percent: 'Maximum percent of the order total that points can cover.',
        min_order_amount_to_earn: 'Minimum delivered order total required before points are earned.'
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load reward settings' });
  }
});

router.put('/rewards/settings', [
  body('enabled').optional().isBoolean().withMessage('enabled must be boolean'),
  body('earn_pesos_per_point').optional().isFloat({ min: 1 }).withMessage('earn_pesos_per_point must be >= 1'),
  body('redeem_peso_per_point').optional().isFloat({ min: 0.01 }).withMessage('redeem_peso_per_point must be >= 0.01'),
  body('max_redeem_percent').optional().isFloat({ min: 0, max: 100 }).withMessage('max_redeem_percent must be 0-100'),
  body('min_order_amount_to_earn').optional().isFloat({ min: 0 }).withMessage('min_order_amount_to_earn must be >= 0'),
  body('customer_note').optional().isString().isLength({ max: 255 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const settings = await RewardPoints.upsertStoreSettings(req.user.id, {
      enabled: req.body.enabled,
      earn_pesos_per_point: req.body.earn_pesos_per_point,
      redeem_peso_per_point: req.body.redeem_peso_per_point,
      max_redeem_percent: req.body.max_redeem_percent,
      min_order_amount_to_earn: req.body.min_order_amount_to_earn,
      customer_note: req.body.customer_note
    });
    res.json({ message: 'Reward settings saved', settings });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message || 'Failed to save reward settings' });
  }
});

// 4.6.1 Delivery Service Settings - Barangay Based
router.get('/delivery-barangays', async (req, res) => {
  try {
    await ensureDeliveryBarangaysTable();
    await ensureCompleteDeliveryBarangays(req.user.id);
    const barangays = await StoreOwner.getDeliveryBarangays(req.user.id);

    res.json({
      barangays: barangays.map(b => ({ name: b.barangay_name, fee: Number(b.delivery_fee || 0) }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load delivery barangays' });
  }
});

router.put('/delivery-barangays', [
  body('barangays').isObject().withMessage('barangays must be an object'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    await ensureDeliveryBarangaysTable();
    await ensureCompleteDeliveryBarangays(req.user.id);
    const success = await StoreOwner.updateDeliveryBarangays(req.user.id, req.body.barangays);
    if (!success) {
      return res.status(500).json({ message: 'Failed to update delivery barangay settings' });
    }

    const barangays = await StoreOwner.getDeliveryBarangays(req.user.id);
    res.json({
      message: 'Delivery barangay settings updated',
      barangays: barangays.map(b => ({ name: b.barangay_name, fee: Number(b.delivery_fee || 0) }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update delivery barangays' });
  }
});

// 4.7 Account Settings
router.get('/account/me', async (req, res) => {
  try {
    const me = await StoreOwner.findById(req.user.id);
    res.json(me);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load profile' });
  }
});

router.put('/account/profile', [
  body('full_name').notEmpty(),
  body('store_name').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const ok = await StoreOwner.updateProfile(req.user.id, req.body);
    if (!ok) return res.status(400).json({ message: 'No changes' });
    const me = await StoreOwner.findById(req.user.id);
    res.json({ message: 'Profile updated', user: me });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

router.put('/account/password', [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const full = await StoreOwner.findWithPasswordById(req.user.id);
    const okCurrent = await StoreOwner.comparePassword(req.body.current_password, full.password);
    if (!okCurrent) return res.status(400).json({ message: 'Current password incorrect' });
    await StoreOwner.updatePassword(req.user.id, req.body.new_password);
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update password' });
  }
});

router.put('/account/email', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('current_password').notEmpty().withMessage('Current password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const email = String(req.body.email || '').trim();
    const full = await StoreOwner.findWithPasswordById(req.user.id);
    if (!full) return res.status(404).json({ message: 'Store owner not found' });

    const okCurrent = await StoreOwner.comparePassword(req.body.current_password, full.password);
    if (!okCurrent) return res.status(400).json({ message: 'Current password incorrect' });

    if (email.toLowerCase() === String(full.email || '').toLowerCase()) {
      return res.status(400).json({ message: 'New email is the same as current email' });
    }

    const existing = await StoreOwner.findByEmail(email);
    if (existing && existing.id !== req.user.id) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    await StoreOwner.updateEmail(req.user.id, email);
    const me = await StoreOwner.findById(req.user.id);
    res.json({ message: 'Email updated', user: me });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update email' });
  }
});

// 4.7.1 Account Location: set lat/lng and optional address
router.get('/account/location', async (req, res) => {
  try {
    const me = await StoreOwner.findById(req.user.id);
    res.json({ latitude: me.latitude, longitude: me.longitude, address: me.address, store_name: me.store_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load location' });
  }
});

router.put('/account/location', [
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('address').optional().isString()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const ok = await StoreOwner.updateLocation(req.user.id, req.body);
    if (!ok) return res.status(400).json({ message: 'No changes' });
    const me = await StoreOwner.findById(req.user.id);
    res.json({ message: 'Location updated', location: { latitude: me.latitude, longitude: me.longitude, address: me.address } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update location' });
  }
});

module.exports = router;
