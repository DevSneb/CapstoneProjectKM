require('dotenv').config();
const db = require('../config/database');

async function run(){
  const connection = await db.getConnection();
  try{
    await connection.beginTransaction();
    await connection.query(`ALTER TABLE store_owners
      ADD COLUMN delivery_enabled TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN delivery_base_fee DECIMAL(10,2) NOT NULL DEFAULT 30.00,
      ADD COLUMN delivery_per_km_fee DECIMAL(10,2) NOT NULL DEFAULT 10.00,
      ADD COLUMN delivery_fee_cap DECIMAL(10,2) NOT NULL DEFAULT 0.00`);
    await connection.commit();
    console.log('Added delivery service columns to store_owners.');
  }catch(err){
    await connection.rollback();
    if(/Duplicate column name/i.test(err.message)){
      console.log('Columns already exist. No changes applied.');
    }else{
      console.error('Failed to alter table:', err.message);
      process.exitCode = 1;
    }
  }finally{
    connection.release();
    process.exit();
  }
}

run();
