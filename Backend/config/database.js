const mysql = require('mysql2');
const dotenv = require('dotenv');
const path = require('path');

// Load local env files when present, but keep Vercel/runtime env vars as the source of truth.
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function getBooleanEnv(name) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function buildPoolConfig() {
  const baseConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 3306,
      user: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
      database: decodeURIComponent((url.pathname || '').replace(/^\//, '')),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: getBooleanEnv('DB_SSL') ? { rejectUnauthorized: false } : undefined
    };
  }

  if (getBooleanEnv('DB_SSL')) {
    baseConfig.ssl = { rejectUnauthorized: false };
  }

  return baseConfig;
}

// Create connection pool
const pool = mysql.createPool(buildPoolConfig());

// Convert pool to use promises
const promisePool = pool.promise();

let isDatabaseConnected = false;

// Test connection and log failure without stopping the server
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to database:', err);
    console.error(`Check DB settings: host=${process.env.DB_HOST || '(from DATABASE_URL)'}, port=${process.env.DB_PORT || 3306}, user=${process.env.DB_USER || '(from DATABASE_URL)'}, database=${process.env.DB_NAME || '(from DATABASE_URL)'}, ssl=${getBooleanEnv('DB_SSL') ? 'on' : 'off'}`);
    return;
  }
  isDatabaseConnected = true;
  console.log('Connected to MySQL database: ' + process.env.DB_NAME);
  connection.release();
});

promisePool.isDatabaseConnected = () => isDatabaseConnected;
module.exports = promisePool;
