const db = require('../config/database');

async function addDeliveryTiersTable() {
  try {
    console.log('Creating store_delivery_tiers table...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS store_delivery_tiers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        store_owner_id INT NOT NULL,
        tier_id INT NOT NULL,
        delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_store_tier (store_owner_id, tier_id),
        CONSTRAINT fk_store_delivery_tier FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
      )
    `);
    
    console.log('✓ store_delivery_tiers table created');
    
    // Get all existing store owners
    const [stores] = await db.query('SELECT id FROM store_owners');
    console.log(`Found ${stores.length} existing stores`);
    
    // Initialize default tiers for each store
    const defaultTiers = [
      { tier_id: 1, delivery_fee: 50 },
      { tier_id: 2, delivery_fee: 70 },
      { tier_id: 3, delivery_fee: 100 }
    ];
    
    for (const store of stores) {
      for (const tier of defaultTiers) {
        try {
          await db.query(
            `INSERT IGNORE INTO store_delivery_tiers (store_owner_id, tier_id, delivery_fee) 
             VALUES (?, ?, ?)`,
            [store.id, tier.tier_id, tier.delivery_fee]
          );
        } catch (err) {
          // Ignore duplicate key errors
          if (err.code !== 'ER_DUP_ENTRY') {
            throw err;
          }
        }
      }
    }
    
    console.log('✓ Initialized default tiers for all stores');
    console.log('Migration complete!');
    process.exit(0);
    
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

addDeliveryTiersTable();
