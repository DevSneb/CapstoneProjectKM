require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { spawn } = require('child_process');

async function runSqlFile(sqlFilePath) {
  const sqlRaw = fs.readFileSync(sqlFilePath, 'utf8');
  // Remove single-line comments and trim
  const cleaned = sqlRaw
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  // Split statements by semicolon
  const statements = cleaned
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length);

  for (const stmt of statements) {
    try {
      await db.query(stmt);
      console.log('Executed:', stmt.substring(0, 80).replace(/\s+/g, ' ') + (stmt.length > 80 ? '...' : ''));
    } catch (err) {
      console.error('Failed statement:', stmt);
      throw err;
    }
  }
}

async function main() {
  try {
    console.log('Running migrations...');
    const sqlPath = path.resolve(__dirname, '../database/schema.sql');
    await runSqlFile(sqlPath);

    const postSchemaScripts = [
      './addAdminReportsFileColumns.js',
      './addDataIntegrityTables.js',
      './addDecimalQuantities.js'
    ];

    for (const script of postSchemaScripts) {
      console.log(`Running ${path.basename(script)}...`);
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.resolve(__dirname, script)], { stdio: 'inherit' });
        child.on('exit', code => {
          if (code === 0) resolve(); else reject(new Error(`${path.basename(script)} exited with code ${code}`));
        });
        child.on('error', reject);
      });
    }

    // Automatically run unify script to merge product_meta into products
    console.log('Running unifyProductsTables to merge meta into products...');
    await new Promise((resolve, reject) => {
      const unifyScript = path.resolve(__dirname, './unifyProductsTables.js');
      const args = [];
      // Optional environment-driven args
      if (process.env.STORE2_ID) { args.push('--store2Id', process.env.STORE2_ID); }
      if (process.env.STORE3_ID) { args.push('--store3Id', process.env.STORE3_ID); }
      if (process.env.UNIFY_DROP_OLD === '1') { args.push('--dropOld'); }
      if (process.env.UNIFY_KEEP_META === '1') { args.push('--keepMeta'); }
      const child = spawn(process.execPath, [unifyScript, ...args], { stdio: 'inherit' });
      child.on('exit', code => {
        if (code === 0) resolve(); else reject(new Error(`unifyProductsTables exited with code ${code}`));
      });
      child.on('error', reject);
    });

    console.log('Migrations complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
