require('dotenv').config();
const db = require('../config/database');

async function main(){
  const names = [
    'Organic Rice (5kg)',
    'Fresh Eggs (dozen)',
    'Brown Sugar (1kg)'
  ];
  try{
    const [res] = await db.query(`DELETE FROM products WHERE name IN (?)`, [names]);
    console.log(`Removed ${res.affectedRows || 0} sample products.`);
    process.exit(0);
  }catch(err){
    console.error('Failed to remove sample products:', err);
    process.exit(1);
  }
}

main();
