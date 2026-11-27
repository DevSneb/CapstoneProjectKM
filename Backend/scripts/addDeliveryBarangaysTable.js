const db = require('../config/database');

const BARANGAYS = [
  'Balingayan', 'Balite', 'Baruyan', 'Batino', 'Bayanan I', 'Bayanan II', 'Biga', 'Bondoc',
  'Bucayao', 'Buhuan', 'Bulusan', 'Calero', 'Camansihan', 'Camilmil', 'Canubing I', 'Canubing II',
  'Comunal', 'Guinobatan', 'Gulod', 'Gutad', 'Ibaba East', 'Ibaba West', 'Ilaya', 'Lalud',
  'Lazareto', 'Libis', 'Lumang Bayan', 'Mahal na Pangalan', 'Maidlang', 'Malad', 'Malamig', 'Managpi',
  'Masipit', 'Nag-iba I', 'Nag-iba II', 'Navotas', 'Pachoca', 'Palhi', 'Panggalaan', 'Parang',
  'Patas', 'Personas', 'Putingtubig', 'Salong (also known as San Raphael)', 'San Antonio',
  'San Vicente Central', 'San Vicente East', 'San Vicente North', 'San Vicente South', 'San Vicente West',
  'Santa Cruz', 'Santa Isabel', 'Santa Maria Village', 'Santa Rita', 'Santo Niño', 'Sapul',
  'Silonay', 'Suqui', 'Tawagan', 'Tawiran', 'Tibag', 'Wawa'
];

async function createTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS store_delivery_barangays (
        id INT AUTO_INCREMENT PRIMARY KEY,
        store_owner_id INT NOT NULL,
        barangay_name VARCHAR(100) NOT NULL,
        delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_store_barangay (store_owner_id, barangay_name),
        FOREIGN KEY (store_owner_id) REFERENCES store_owners(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Created store_delivery_barangays table');

    // Initialize barangays for existing stores
    const [stores] = await db.query('SELECT id FROM store_owners');
    
    for (const store of stores) {
      for (const barangay of BARANGAYS) {
        await db.query(
          `INSERT IGNORE INTO store_delivery_barangays (store_owner_id, barangay_name, delivery_fee)
           VALUES (?, ?, ?)`,
          [store.id, barangay, 0]
        );
      }
    }
    
    console.log(`✓ Initialized ${BARANGAYS.length} barangays for ${stores.length} existing store(s)`);
  } catch (err) {
    console.error('Error creating table:', err);
  }
}

createTable().then(() => {
  console.log('Migration complete!');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
