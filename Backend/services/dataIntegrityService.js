const crypto = require('crypto');
const db = require('../config/database');
const BlockchainLedgerService = require('./blockchainLedgerService');

// Supported document types for this module.
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'text/plain']);

// Derive a 32-byte key for AES-256-GCM using scrypt.
// In production, replace with cloud KMS envelope encryption.
function deriveEncryptionKey() {
  const master = String(process.env.DATA_ENCRYPTION_MASTER_KEY || process.env.JWT_SECRET || '').trim();
  if (!master) {
    throw new Error('DATA_ENCRYPTION_MASTER_KEY is required for encryption module');
  }
  return crypto.scryptSync(master, 'kadiwa-data-protection', 32);
}

// Encrypt arbitrary bytes with AES-256-GCM.
function encryptBuffer(buffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    auth_tag: authTag.toString('base64')
  };
}

// Create SHA-256 hash from encrypted blob components.
function hashEncryptedBlob(enc) {
  const payload = Buffer.concat([
    Buffer.from(enc.iv, 'base64'),
    Buffer.from(enc.ciphertext, 'base64'),
    Buffer.from(enc.auth_tag, 'base64')
  ]);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function createRecordRef() {
  return `REC-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function parseDocumentInput(documentInput) {
  const filename = String(documentInput?.filename || '').trim();
  const mimeType = String(documentInput?.mime_type || '').trim().toLowerCase();

  if (!filename) throw new Error('document.filename is required');
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Only PDF or text files are supported (application/pdf, text/plain)');
  }

  let rawBuffer = null;
  if (documentInput?.content_base64) {
    rawBuffer = Buffer.from(String(documentInput.content_base64), 'base64');
  } else if (mimeType === 'text/plain' && typeof documentInput?.text === 'string') {
    rawBuffer = Buffer.from(documentInput.text, 'utf8');
  }

  if (!rawBuffer || !rawBuffer.length) {
    throw new Error('document.content_base64 (or document.text for text/plain) is required');
  }

  return { filename, mime_type: mimeType, rawBuffer };
}

// Ensure required tables exist for integrity records and blockchain-like ledger blocks.
async function ensureTables(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS data_integrity_records (
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
    )`
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS data_integrity_blocks (
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
    )`
  );

  const [providerCol] = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'data_integrity_blocks'
       AND COLUMN_NAME = 'provider'`
  );
  if (Number(providerCol?.[0]?.cnt || 0) === 0) {
    await connection.query(
      `ALTER TABLE data_integrity_blocks
       ADD COLUMN provider ENUM('local','fabric') NOT NULL DEFAULT 'local' AFTER current_hash`
    );
  }

  const [externalTxCol] = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'data_integrity_blocks'
       AND COLUMN_NAME = 'external_tx_id'`
  );
  if (Number(externalTxCol?.[0]?.cnt || 0) === 0) {
    await connection.query(
      `ALTER TABLE data_integrity_blocks
       ADD COLUMN external_tx_id VARCHAR(160) NULL AFTER provider`
    );
  }

  const [externalRefCol] = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'data_integrity_blocks'
       AND COLUMN_NAME = 'external_block_ref'`
  );
  if (Number(externalRefCol?.[0]?.cnt || 0) === 0) {
    await connection.query(
      `ALTER TABLE data_integrity_blocks
       ADD COLUMN external_block_ref VARCHAR(160) NULL AFTER external_tx_id`
    );
  }
}

// Append a new block to a blockchain-like hash chain.
// This simulates smart-contract write semantics in environments without Fabric.
async function appendIntegrityBlock(connection, { blockType, recordRef, offchainUri, payloadHash }) {
  const [[lastBlock]] = await connection.query(
    `SELECT id, current_hash
     FROM data_integrity_blocks
     ORDER BY id DESC
     LIMIT 1`
  );

  const previousHash = String(lastBlock?.current_hash || 'GENESIS');

  const anchored = await BlockchainLedgerService.anchorHashBlock({
    blockType,
    recordRef,
    offchainUri,
    payloadHash,
    previousHash
  });

  const [result] = await connection.query(
    `INSERT INTO data_integrity_blocks
      (block_type, record_ref, offchain_uri, payload_hash, previous_hash, current_hash, provider, external_tx_id, external_block_ref, block_timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      blockType,
      recordRef,
      offchainUri,
      payloadHash,
      anchored.previous_hash,
      anchored.current_hash,
      anchored.provider,
      anchored.external_tx_id,
      anchored.external_block_ref,
      anchored.ledger_timestamp
    ]
  );

  return {
    block_id: result.insertId,
    previous_hash: anchored.previous_hash,
    current_hash: anchored.current_hash,
    block_timestamp: anchored.ledger_timestamp,
    provider: anchored.provider,
    external_tx_id: anchored.external_tx_id,
    external_block_ref: anchored.external_block_ref
  };
}

function parseStoredPayload(payloadValue) {
  if (!payloadValue) {
    throw new Error('Off-chain payload not found');
  }
  return typeof payloadValue === 'string' ? JSON.parse(payloadValue) : payloadValue;
}

class DataIntegrityService {
  static async createSecuredRecord(input, adminId = null) {
    await ensureTables();

    const customer = input?.customer || {};
    const name = String(customer.name || '').trim();
    const email = String(customer.email || '').trim();
    const address = String(customer.address || '').trim();

    if (!name || !email || !address) {
      throw new Error('customer.name, customer.email, and customer.address are required');
    }

    const document = parseDocumentInput(input?.document || {});
    const recordRef = createRecordRef();

    const key = deriveEncryptionKey();

    // 1) Encrypt customer details JSON.
    const customerPlain = Buffer.from(JSON.stringify({ name, email, address }), 'utf8');
    const encryptedCustomer = encryptBuffer(customerPlain, key);
    const customerHash = hashEncryptedBlob(encryptedCustomer);

    // 2) Encrypt uploaded document bytes.
    const encryptedDocument = encryptBuffer(document.rawBuffer, key);
    const documentHash = hashEncryptedBlob(encryptedDocument);

    const customerPayload = JSON.stringify(
      {
        ...encryptedCustomer,
        meta: {
          content_type: 'application/json',
          encrypted_at: new Date().toISOString()
        }
      },
      null,
      2
    );

    const documentPayload = JSON.stringify(
      {
        ...encryptedDocument,
        meta: {
          filename: document.filename,
          mime_type: document.mime_type,
          encrypted_at: new Date().toISOString()
        }
      },
      null,
      2
    );

    const customerUri = `db://data-integrity/${recordRef}/customer`;
    const documentUri = `db://data-integrity/${recordRef}/document`;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 4) Anchor hashes in blockchain-like ledger blocks with timestamps.
      const customerBlock = await appendIntegrityBlock(conn, {
        blockType: 'customer_data',
        recordRef,
        offchainUri: customerUri,
        payloadHash: customerHash
      });

      const documentBlock = await appendIntegrityBlock(conn, {
        blockType: 'document',
        recordRef,
        offchainUri: documentUri,
        payloadHash: documentHash
      });

      // 5) Save master record linking off-chain URIs and on-chain hashes.
      await conn.query(
        `INSERT INTO data_integrity_records
          (record_ref, customer_data_uri, document_uri, customer_data_payload, document_payload, customer_data_hash, document_hash, customer_block_id, document_block_id, created_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recordRef,
          customerUri,
          documentUri,
          customerPayload,
          documentPayload,
          customerHash,
          documentHash,
          customerBlock.block_id,
          documentBlock.block_id,
          adminId || null
        ]
      );

      await conn.commit();

      return {
        record_ref: recordRef,
        customer_data: {
          offchain_uri: customerUri,
          hash_sha256: customerHash,
          ledger_block_id: customerBlock.block_id,
          ledger_timestamp: customerBlock.block_timestamp
        },
        document: {
          offchain_uri: documentUri,
          hash_sha256: documentHash,
          ledger_block_id: documentBlock.block_id,
          ledger_timestamp: documentBlock.block_timestamp,
          file_name: document.filename,
          mime_type: document.mime_type
        }
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async verifyRecordIntegrity(recordRef, target = 'customer') {
    await ensureTables();

    const safeTarget = target === 'document' ? 'document' : 'customer';

    const [[record]] = await db.query(
      `SELECT *
       FROM data_integrity_records
       WHERE record_ref = ?
       LIMIT 1`,
      [recordRef]
    );

    if (!record) {
      throw new Error('Integrity record not found');
    }

    const isDocument = safeTarget === 'document';
    const offchainUri = isDocument ? record.document_uri : record.customer_data_uri;
    const expectedHash = isDocument ? record.document_hash : record.customer_data_hash;
    const blockId = isDocument ? record.document_block_id : record.customer_block_id;

    const payloadValue = isDocument ? record.document_payload : record.customer_data_payload;
    const actualHash = hashEncryptedBlob(parseStoredPayload(payloadValue));

    const [[block]] = await db.query(
      `SELECT id, payload_hash, current_hash, block_timestamp
       FROM data_integrity_blocks
       WHERE id = ?
       LIMIT 1`,
      [blockId]
    );

    if (!block) {
      throw new Error('Ledger block not found for integrity record');
    }

    const blockchainHash = String(block.payload_hash || '');
    const isValid = expectedHash === actualHash && blockchainHash === actualHash;

    return {
      record_ref: recordRef,
      target: safeTarget,
      is_valid: isValid,
      expected_hash: expectedHash,
      offchain_recomputed_hash: actualHash,
      blockchain_hash: blockchainHash,
      ledger_block_id: Number(block.id),
      ledger_block_hash: block.current_hash,
      ledger_timestamp: block.block_timestamp
    };
  }

  static async listRecords(limit = 50) {
    await ensureTables();
    const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));

    const [rows] = await db.query(
      `SELECT r.id, r.record_ref, r.customer_data_uri, r.document_uri, r.customer_data_hash, r.document_hash,
              r.created_at,
              cb.provider AS customer_provider,
              cb.external_tx_id AS customer_tx_id,
              cb.block_timestamp AS customer_ledger_timestamp,
              dbb.provider AS document_provider,
              dbb.external_tx_id AS document_tx_id,
              dbb.block_timestamp AS document_ledger_timestamp
       FROM data_integrity_records r
       LEFT JOIN data_integrity_blocks cb ON cb.id = r.customer_block_id
       LEFT JOIN data_integrity_blocks dbb ON dbb.id = r.document_block_id
       ORDER BY r.id DESC
       LIMIT ?`,
      [safeLimit]
    );

    return rows;
  }
}

module.exports = DataIntegrityService;
