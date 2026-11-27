/**
 * Migration: Add GCash payment tracking columns to orders table
 * Adds columns to support GCash payment gateway integration
 */

const db = require('../config/database');

async function migrate() {
  const connection = await db.getConnection();
  try {
    console.log('[Migration] Starting GCash payment columns migration...');

    // Add gcash_session_id column if it doesn't exist
    try {
      const [sessionIdExists] = await connection.query(
        `SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_NAME='orders' AND COLUMN_NAME='gcash_session_id' AND TABLE_SCHEMA=DATABASE()`
      );

      if (sessionIdExists.length === 0) {
        await connection.query(
          `ALTER TABLE orders ADD COLUMN gcash_session_id VARCHAR(100) NULL AFTER gcash_reference`
        );
        console.log('[Migration] ✓ Added gcash_session_id column to orders table');
      } else {
        console.log('[Migration] gcash_session_id column already exists');
      }
    } catch (error) {
      console.error('[Migration] Error adding gcash_session_id column:', error.message);
    }

    // Add payment_status column if it doesn't exist
    try {
      const [statusExists] = await connection.query(
        `SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_NAME='orders' AND COLUMN_NAME='payment_status' AND TABLE_SCHEMA=DATABASE()`
      );

      if (statusExists.length === 0) {
        await connection.query(
          `ALTER TABLE orders ADD COLUMN payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending' AFTER payment_method`
        );
        console.log('[Migration] ✓ Added payment_status column to orders table');
      } else {
        console.log('[Migration] payment_status column already exists');
      }
    } catch (error) {
      console.error('[Migration] Error adding payment_status column:', error.message);
    }

    // Create gcash_payment_sessions table if it doesn't exist
    try {
      const [tableExists] = await connection.query(
        `SELECT * FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_NAME='gcash_payment_sessions' AND TABLE_SCHEMA=DATABASE()`
      );

      if (tableExists.length === 0) {
        await connection.query(`
          CREATE TABLE gcash_payment_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            customer_id INT NOT NULL,
            store_id INT NOT NULL,
            session_id VARCHAR(100) NOT NULL UNIQUE,
            status ENUM('initiated', 'success', 'failed', 'cancelled', 'pending') NOT NULL DEFAULT 'initiated',
            amount DECIMAL(12, 2) NOT NULL,
            reference_number VARCHAR(100),
            transaction_id VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
            FOREIGN KEY (store_id) REFERENCES store_owners(id) ON DELETE CASCADE,
            INDEX idx_session_id (session_id),
            INDEX idx_order_id (order_id),
            INDEX idx_customer_id (customer_id)
          )
        `);
        console.log('[Migration] ✓ Created gcash_payment_sessions table');
      } else {
        console.log('[Migration] gcash_payment_sessions table already exists');
      }
    } catch (error) {
      console.error('[Migration] Error creating gcash_payment_sessions table:', error.message);
    }

    console.log('[Migration] ✓ GCash payment migration completed successfully');
  } catch (error) {
    console.error('[Migration] Fatal error:', error.message);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

// Run migration
migrate();
