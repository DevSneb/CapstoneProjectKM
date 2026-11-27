-- Create database
CREATE DATABASE IF NOT EXISTS kadiwa_db;
USE kadiwa_db;

-- Admin table
CREATE TABLE IF NOT EXISTS admins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin') DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Store Owner table
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
);

-- Customer table
CREATE TABLE IF NOT EXISTS customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  is_kadiwa_member TINYINT(1) NOT NULL DEFAULT 0,
  role ENUM('customer') DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed users via application script (npm run seed)

-- Products table (unified: includes former meta fields)
CREATE TABLE IF NOT EXISTS products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  market_price DECIMAL(10,2) NULL,
  stock DECIMAL(10,3) NOT NULL DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  -- Unified meta fields
  unit VARCHAR(50),
  cost DECIMAL(10,2),
  srp DECIMAL(10,2),
  srp_vat DECIMAL(10,2),
  category VARCHAR(100),
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  customer_id INT,
  status ENUM('pending','completed','cancelled') DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  preferred_delivery_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- Cash transactions table
CREATE TABLE IF NOT EXISTS cash_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_id INT NOT NULL,
  `date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  type ENUM('Cash In', 'Cash Out') NOT NULL,
  reference VARCHAR(255) NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_cash_transactions_store_owner FOREIGN KEY (store_id) REFERENCES store_owners(id) ON DELETE CASCADE
);

-- Store 3 savings rewards wallet (investment-only, non-redeemable)
CREATE TABLE IF NOT EXISTS store3_savings_wallets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL UNIQUE,
  total_contributed DECIMAL(12,2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_store3_wallet_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

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
);

-- Redeemable reward points (1 pt per ₱20 spent; 1 pt = ₱1 checkout discount)
CREATE TABLE IF NOT EXISTS reward_points_wallets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL UNIQUE,
  balance INT NOT NULL DEFAULT 0,
  lifetime_earned INT NOT NULL DEFAULT 0,
  lifetime_redeemed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reward_wallet_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reward_points_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  wallet_id INT NOT NULL,
  customer_id INT NOT NULL,
  order_id INT NULL,
  points INT NOT NULL,
  type ENUM('accrual','redemption','adjustment') NOT NULL,
  note VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reward_tx_wallet FOREIGN KEY (wallet_id) REFERENCES reward_points_wallets(id) ON DELETE CASCADE,
  CONSTRAINT fk_reward_tx_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_reward_tx_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- Per-store editable reward conditions
CREATE TABLE IF NOT EXISTS store_reward_settings (
  store_owner_id INT PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  earn_pesos_per_point INT NOT NULL DEFAULT 20,
  redeem_peso_per_point DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  max_redeem_percent DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  min_order_amount_to_earn DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  customer_note VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_store_reward_settings_store FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_owner_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_store_owner FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
);

-- Customer order and order-status notifications
CREATE TABLE IF NOT EXISTS customer_notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_customer_notifications_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- DA Admin announcements to stores
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
);

-- Data integrity module: encrypted off-chain object references + anchored hashes
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
);

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
);

-- Shipments / Logistics table
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
);
