const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Prefer Backend/.env over empty/stale PM2 env vars
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const app = express();

const REQUIRED_ENV_VARS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
const isEnvValuePresent = (key) => {
  const value = process.env[key];
  if (key === 'DB_PASSWORD') return value !== undefined;
  return value !== undefined && value !== null && String(value).trim() !== '';
};
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !isEnvValuePresent(key));
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const frontendDist = path.join(__dirname, '..', 'Frontend', 'dist');

// Explicit SEO / favicon routes MUST run before express.static + SPA fallback
// so Google gets a real ICO/PNG (not a renamed PNG or index.html).
const sendSeoFile = (fileName, contentType) => (req, res) => {
  const filePath = path.join(frontendDist, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).type('text/plain').send(`${fileName} not found`);
  }
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(path.resolve(filePath));
};

if (fs.existsSync(frontendDist)) {
  app.get('/sitemap.xml', sendSeoFile('sitemap.xml', 'application/xml; charset=utf-8'));
  app.get('/robots.txt', sendSeoFile('robots.txt', 'text/plain; charset=utf-8'));
  app.get('/favicon.ico', sendSeoFile('favicon.ico', 'image/x-icon'));
  app.get('/favicon-48.png', sendSeoFile('favicon-48.png', 'image/png'));
  app.get('/favicon-192.png', sendSeoFile('favicon-192.png', 'image/png'));
  app.get('/apple-touch-icon.png', sendSeoFile('apple-touch-icon.png', 'image/png'));
  app.get('/logo-512.png', sendSeoFile('logo-512.png', 'image/png'));
  app.get('/logo-full.png', sendSeoFile('logo-full.png', 'image/png'));
  app.get('/logo-icon.png', sendSeoFile('logo-icon.png', 'image/png'));
  app.get('/og-image.png', sendSeoFile('og-image.png', 'image/png'));
  app.get('/site.webmanifest', sendSeoFile('site.webmanifest', 'application/manifest+json; charset=utf-8'));
  app.use(express.static(frontendDist, { maxAge: '1d', index: false }));
}

// Routes
const adminAuthRoutes = require('./routes/adminAuth');
const adminRoutes = require('./routes/admin');
const customerAuthRoutes = require('./routes/customerAuth');
const customerRoutes = require('./routes/customer');
const storeOwnerRoutes = require('./routes/storeOwner');
const cashRoutes = require('./routes/cash');
const posRoutes = require('./routes/pos');
const posAuthRoutes = require('./routes/posAuth');
const integrityRoutes = require('./routes/integrity');
const gcashRoutes = require('./routes/gcash');
const db = require('./config/database');

app.get('/api/healthz', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({
      ok: true,
      database: 'connected',
      jwtSecret: process.env.JWT_SECRET ? 'set' : 'missing'
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      database: 'error',
      jwtSecret: process.env.JWT_SECRET ? 'set' : 'missing',
      code: error.code || 'UNKNOWN',
      message: error.message
    });
  }
});

app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customer/auth', customerAuthRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/store', storeOwnerRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/pos/auth', posAuthRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/admin/integrity', integrityRoutes);
app.use('/api/gcash', gcashRoutes);

const PORT = process.env.PORT || 5000;

if (fs.existsSync(frontendDist)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // Test route when frontend is not built / not available
  app.get('/', (req, res) => {
    res.json({ message: 'Kadiwa E-commerce API' });
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  try {
    const { startNightlyLearningScheduler } = require('./services/mlLearningService');
    startNightlyLearningScheduler();
  } catch (err) {
    console.warn('[ML Learning] scheduler not started:', err.message);
  }
});
