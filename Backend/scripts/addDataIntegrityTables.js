require('dotenv').config();
const db = require('../config/database');

async function run() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`
      CREATE TABLE IF NOT EXISTS data_integrity_records (
        id INT PRIMARY KEY AUTO_INCREMENT,
        record_ref VARCHAR(80) NOT NULL UNIQUE,
        customer_data_uri VARCHAR(255) NOT NULL,
        document_uri VARCHAR(255) NOT NULL,
        customer_data_payload LONGTEXT NOT NULL,
        document_payload LONGTEXT NOT NULL,
        customer_data_hash CHAR(64) NOT NULL,
        document_hash CHAR(64) NOT NULL,
        customer_block_id INT NULL,
        document_block_id INT NULL,
        created_by_admin_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_integrity_records_admin FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    const [customerPayloadCol] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'data_integrity_records'
         AND COLUMN_NAME = 'customer_data_payload'`
    );
    if (Number(customerPayloadCol?.[0]?.cnt || 0) === 0) {
      await conn.query(
        `ALTER TABLE data_integrity_records
         ADD COLUMN customer_data_payload LONGTEXT NULL AFTER document_uri`
      );
    }

    const [documentPayloadCol] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'data_integrity_records'
         AND COLUMN_NAME = 'document_payload'`
    );
    if (Number(documentPayloadCol?.[0]?.cnt || 0) === 0) {
      await conn.query(
        `ALTER TABLE data_integrity_records
         ADD COLUMN document_payload LONGTEXT NULL AFTER customer_data_payload`
      );
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS data_integrity_blocks (
        id INT PRIMARY KEY AUTO_INCREMENT,
        block_type ENUM('customer_data','document') NOT NULL,
        record_ref VARCHAR(80) NOT NULL,
        offchain_uri VARCHAR(255) NOT NULL,
        payload_hash CHAR(64) NOT NULL,
        previous_hash CHAR(64) NOT NULL,
        current_hash CHAR(64) NOT NULL,
        provider ENUM('local','fabric') NOT NULL DEFAULT 'local',
        external_tx_id VARCHAR(160) NULL,
        external_block_ref VARCHAR(160) NULL,
        block_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_data_integrity_blocks_record_ref (record_ref)
      )
    `);

    const [providerCol] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'data_integrity_blocks'
         AND COLUMN_NAME = 'provider'`
    );
    if (Number(providerCol?.[0]?.cnt || 0) === 0) {
      await conn.query(
        `ALTER TABLE data_integrity_blocks
         ADD COLUMN provider ENUM('local','fabric') NOT NULL DEFAULT 'local' AFTER current_hash`
      );
    }

    const [txCol] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'data_integrity_blocks'
         AND COLUMN_NAME = 'external_tx_id'`
    );
    if (Number(txCol?.[0]?.cnt || 0) === 0) {
      await conn.query(
        `ALTER TABLE data_integrity_blocks
         ADD COLUMN external_tx_id VARCHAR(160) NULL AFTER provider`
      );
    }

    const [refCol] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'data_integrity_blocks'
         AND COLUMN_NAME = 'external_block_ref'`
    );
    if (Number(refCol?.[0]?.cnt || 0) === 0) {
      await conn.query(
        `ALTER TABLE data_integrity_blocks
         ADD COLUMN external_block_ref VARCHAR(160) NULL AFTER external_tx_id`
      );
    }

    await conn.commit();
    console.log('Data integrity tables are ready.');
  } catch (err) {
    await conn.rollback();
    console.error('Failed to create data integrity tables:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit();
  }
}

run();
