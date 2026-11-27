require('dotenv').config();
const db = require('../config/database');

async function run(){
  const conn = await db.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query(`ALTER TABLE orders 
      ADD COLUMN shipping_method ENUM('pickup','delivery') NOT NULL DEFAULT 'pickup'`);
    await conn.commit();
    console.log('Added shipping_method column to orders.');
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
