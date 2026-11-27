const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({host:'localhost', port:3306, user:'root', password:'', database:'kadiwa_db'});
    await conn.query(`CREATE TABLE IF NOT EXISTS store_delivery_barangays (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_owner_id INT NOT NULL,
      barangay_name VARCHAR(100) NOT NULL,
      delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_store_barangay (store_owner_id, barangay_name),
      CONSTRAINT fk_store_delivery_barangays_store FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('DELIVERY TABLE CREATED');
    await conn.end();
  } catch (err) {
    console.error('ERR', err.message);
    process.exit(1);
  }
})();