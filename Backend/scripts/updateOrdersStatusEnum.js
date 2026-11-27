require('dotenv').config();
const db = require('../config/database');

async function run(){
  const conn = await db.getConnection();
  try{
    await conn.beginTransaction();
    // Convert existing legacy statuses
    await conn.query("UPDATE orders SET status='delivered' WHERE status='completed'");
    await conn.query("UPDATE orders SET status='rejected' WHERE status='cancelled'");
    // Modify ENUM to new set
    await conn.query("ALTER TABLE orders MODIFY COLUMN status ENUM('pending','on_the_way','delivered','rejected') DEFAULT 'pending'");
    await conn.commit();
    console.log("Updated orders.status enum and migrated legacy values.");
  }catch(err){
    await conn.rollback();
    console.error('Failed to update orders.status enum:', err.message);
    process.exitCode = 1;
  }finally{
    conn.release();
    process.exit();
  }
}

run();
