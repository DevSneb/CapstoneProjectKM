require('dotenv').config();
const db = require('../config/database');

async function run(){
  const args = Object.fromEntries(process.argv.slice(2).map(a=>{
    const [k,v] = a.split('='); return [k.replace(/^--/,''), v];
  }));
  const id = parseInt(args.storeId || args.id, 10);
  const lat = parseFloat(args.lat);
  const lng = parseFloat(args.lng || args.lon || args.longitude);
  if(!id || Number.isNaN(lat) || Number.isNaN(lng)){
    console.error('Usage: node scripts/setStoreCoordinates.js --storeId=1 --lat=14.5995 --lng=120.9842');
    process.exit(1);
  }
  const [res] = await db.query('UPDATE store_owners SET latitude=?, longitude=? WHERE id=?', [lat, lng, id]);
  console.log(res.affectedRows ? `Updated store ${id} to (${lat}, ${lng})` : 'No rows updated');
  process.exit();
}

run();
