require('dotenv').config();
const db = require('../config/database');

async function run(){
  const conn = await db.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query(`CREATE TABLE IF NOT EXISTS admin_reports (
      id INT PRIMARY KEY AUTO_INCREMENT,
      store_owner_id INT NOT NULL,
      period_type ENUM('weekly','monthly','yearly') NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      orders_count INT NOT NULL DEFAULT 0,
      items_sold INT NOT NULL DEFAULT 0,
      total_revenue DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      report_file_name VARCHAR(255) NULL,
      report_file_data LONGTEXT NULL,
      report_file_mime_type VARCHAR(100) NULL,
      report_file_path VARCHAR(500) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_admin_reports_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
    )`);
    await conn.commit();
    console.log('Created admin_reports table (if not exists).');
  }catch(err){
    await conn.rollback();
    console.error('Failed creating admin_reports:', err.message);
    process.exitCode = 1;
  }finally{
    conn.release();
    process.exit();
  }
}

run();
