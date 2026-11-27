require('dotenv').config();
const db = require('../config/database');

async function run(){
  const conn = await db.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query(`ALTER TABLE orders 
      ADD COLUMN payment_method ENUM('cod','gcash') NOT NULL DEFAULT 'cod'`);
    await conn.commit();
    console.log('Added payment_method column to orders.');
  }catch(err){
    await conn.rollback();
    if(/Duplicate column name/i.test(err.message)){
      console.log('Column already exists. No changes applied.');
    }else{
      console.error('Failed to alter orders:', err.message);
      process.exitCode = 1;
    }
  }finally{
    conn.release();
    process.exit();
  }
}

run();
