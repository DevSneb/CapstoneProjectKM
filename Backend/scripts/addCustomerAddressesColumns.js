require('dotenv').config();
const db = require('../config/database');

async function run(){
  const conn = await db.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query(`ALTER TABLE customers 
      ADD COLUMN home_address TEXT NULL,
      ADD COLUMN work_address TEXT NULL`);
    await conn.commit();
    console.log('Added home_address and work_address columns to customers.');
  }catch(err){
    await conn.rollback();
    if(/Duplicate column name/i.test(err.message)){
      console.log('Columns already exist. No changes applied.');
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
