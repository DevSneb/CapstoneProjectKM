require('dotenv').config();
const db = require('../config/database');
const Notification = require('../models/Notification');

async function run() {
  try {
    await Notification.ensureTables(db);
    console.log('Store and customer notification tables are ready.');
  } catch (err) {
    console.error('Failed to create notification tables:', err.message || err);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

run();
