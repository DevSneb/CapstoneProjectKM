require('dotenv').config();
const db = require('../config/database');

async function run(){
  const connection = await db.getConnection();
  try{
    await connection.beginTransaction();
    await connection.query(`ALTER TABLE store_owners
      ADD COLUMN latitude DECIMAL(10,7) NULL,
      ADD COLUMN longitude DECIMAL(10,7) NULL`);
    await connection.commit();
    console.log('Added latitude/longitude columns to store_owners.');
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
