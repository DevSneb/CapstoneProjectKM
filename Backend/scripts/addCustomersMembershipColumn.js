require('dotenv').config();
const db = require('../config/database');

async function run(){
  const conn = await db.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query(`ALTER TABLE customers ADD COLUMN is_kadiwa_member TINYINT(1) NOT NULL DEFAULT 0`);
    await conn.commit();
    console.log('Added is_kadiwa_member column to customers.');
  }catch(err){
    await conn.rollback();
    if(/Duplicate column name/i.test(err.message)){
      console.log('Column is_kadiwa_member already exists. No changes applied.');
    }else{
      console.error('Failed to alter customers:', err.message);
      process.exitCode = 1;
    }
  }finally{
    conn.release();
    process.exit();
  }
}

run();
