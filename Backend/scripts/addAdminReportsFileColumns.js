require('dotenv').config();
const db = require('../config/database');

async function run(){
  const conn = await db.getConnection();
  try{
    await conn.beginTransaction();

    const [nameCol] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'admin_reports'
         AND COLUMN_NAME = 'report_file_name'`
    );
    if (Number(nameCol?.[0]?.cnt || 0) === 0) {
      await conn.query(`ALTER TABLE admin_reports ADD COLUMN report_file_name VARCHAR(255) NULL`);
    }

    const [dataCol] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'admin_reports'
         AND COLUMN_NAME = 'report_file_data'`
    );
    if (Number(dataCol?.[0]?.cnt || 0) === 0) {
      await conn.query(`ALTER TABLE admin_reports ADD COLUMN report_file_data LONGTEXT NULL`);
    }

    const [mimeCol] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'admin_reports'
         AND COLUMN_NAME = 'report_file_mime_type'`
    );
    if (Number(mimeCol?.[0]?.cnt || 0) === 0) {
      await conn.query(`ALTER TABLE admin_reports ADD COLUMN report_file_mime_type VARCHAR(100) NULL`);
    }

    const [pathCol] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'admin_reports'
         AND COLUMN_NAME = 'report_file_path'`
    );
    if (Number(pathCol?.[0]?.cnt || 0) === 0) {
      await conn.query(`ALTER TABLE admin_reports ADD COLUMN report_file_path VARCHAR(500) NULL`);
    }

    await conn.commit();
    console.log('Added report file columns to admin_reports.');
  }catch(err){
    await conn.rollback();
    console.error('Failed to alter admin_reports:', err.message);
    process.exitCode = 1;
  }finally{
    conn.release();
    process.exit();
  }
}

run();
