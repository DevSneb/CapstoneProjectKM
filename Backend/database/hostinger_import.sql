-- =============================================================================
-- Kadiwa e-commerce — initial schema for Hostinger MySQL (phpMyAdmin import)
-- =============================================================================
-- BEFORE IMPORT:
--   1. Open phpMyAdmin → select your database (e.g. u457086663_kadiwamart).
--   2. Click **Import** → choose this file → Go.
-- Do NOT create a new database in this script; Hostinger already created yours.
--
-- AFTER IMPORT:
--   Create admin/store users via your app or: npm run seed (from Backend, with .env).
-- Charset: utf8mb4 to avoid collation issues with mixed text.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- admins
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin') DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- store_owners
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_owners (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  store_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  delivery_enabled TINYINT(1) NOT NULL DEFAULT 0,
  delivery_base_fee DECIMAL(10,2) NOT NULL DEFAULT 30.00,
  delivery_per_km_fee DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  delivery_fee_cap DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  role ENUM('store_owner') DEFAULT 'store_owner',
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- customers (includes columns from addCustomer* / addCustomersCoordinates scripts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  home_address TEXT NULL,
  work_address TEXT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  is_kadiwa_member TINYINT(1) NOT NULL DEFAULT 0,
  role ENUM('customer') DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  market_price DECIMAL(10,2) NULL,
  stock DECIMAL(10,3) NOT NULL DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  unit VARCHAR(50),
  cost DECIMAL(10,2),
  srp DECIMAL(10,2),
  srp_vat DECIMAL(10,2),
  category VARCHAR(100),
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- orders (status enum + columns from migration scripts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  customer_id INT NULL,
  status ENUM('pending','on_the_way','delivered','rejected') DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  preferred_delivery_date DATE NULL,
  shipping_method ENUM('pickup','delivery') NOT NULL DEFAULT 'pickup',
  delivery_address VARCHAR(255) NULL,
  payment_method ENUM('cod','gcash') NOT NULL DEFAULT 'cod',
  gcash_reference VARCHAR(100) NULL,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- order_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- cash_transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_id INT NOT NULL,
  `date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  type ENUM('Cash In', 'Cash Out') NOT NULL,
  reference VARCHAR(255) NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_cash_transactions_store_owner FOREIGN KEY (store_id) REFERENCES store_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Store 3 savings rewards
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store3_savings_wallets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL UNIQUE,
  total_contributed DECIMAL(12,2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_store3_wallet_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store3_savings_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  wallet_id INT NOT NULL,
  customer_id INT NOT NULL,
  order_id INT NOT NULL,
  store_id INT NOT NULL,
  purchase_amount DECIMAL(12,2) NOT NULL,
  reward_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
  reward_amount DECIMAL(12,2) NOT NULL,
  type ENUM('accrual') NOT NULL DEFAULT 'accrual',
  note VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_store3_savings_order UNIQUE (order_id),
  CONSTRAINT fk_store3_savings_wallet FOREIGN KEY (wallet_id) REFERENCES store3_savings_wallets(id) ON DELETE CASCADE,
  CONSTRAINT fk_store3_savings_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_store3_savings_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_store3_savings_store FOREIGN KEY (store_id) REFERENCES store_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- customer_notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_customer_notifications_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- admin_announcements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_announcements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admin_id INT NOT NULL,
  target_scope ENUM('all','store') NOT NULL DEFAULT 'all',
  target_store_id INT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_announcements_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_announcements_store FOREIGN KEY (target_store_id) REFERENCES store_owners(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Feature flags (ensureFeatureFlagsTables in admin / storeOwner routes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS global_feature_flags (
  feature_key VARCHAR(50) PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_feature_flags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  feature_key VARCHAR(50) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_feature (store_owner_id, feature_key),
  CONSTRAINT fk_store_feature_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- POS users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'pos_user',
  status ENUM('approved','disabled') NOT NULL DEFAULT 'approved',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pos_users_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- admin_reports (includes addAdminReportsFileColumns)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_reports (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  period_type ENUM('weekly','monthly','yearly') NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  orders_count INT NOT NULL DEFAULT 0,
  items_sold INT NOT NULL DEFAULT 0,
  total_revenue DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  report_file_name VARCHAR(255) NULL,
  report_file_path VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_reports_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Delivery tiers & barangays
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_delivery_tiers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  tier_id INT NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_tier (store_owner_id, tier_id),
  CONSTRAINT fk_store_delivery_tier FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_delivery_barangays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_owner_id INT NOT NULL,
  barangay_name VARCHAR(100) NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_store_barangay (store_owner_id, barangay_name),
  CONSTRAINT fk_store_delivery_barangays_store FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Data integrity module
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_integrity_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  record_ref VARCHAR(80) NOT NULL UNIQUE,
  customer_data_uri VARCHAR(255) NOT NULL,
  document_uri VARCHAR(255) NOT NULL,
  customer_data_hash CHAR(64) NOT NULL,
  document_hash CHAR(64) NOT NULL,
  customer_block_id INT NULL,
  document_block_id INT NULL,
  created_by_admin_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_integrity_records_admin FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- shipments / logistics
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  order_id INT NOT NULL,
  carrier VARCHAR(100),
  tracking_number VARCHAR(100),
  status ENUM('preparing','shipped','in_transit','delivered','returned') DEFAULT 'preparing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shipments_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE,
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- End of schema. No seed data — register users through the app or Backend/scripts/seed.js
