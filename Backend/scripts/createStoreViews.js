require('dotenv').config();
const db = require('../config/database');

function parseArgs(){
  const args = process.argv.slice(2);
  const opts = {};
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(a==='--store2Id') opts.store2Id = parseInt(args[++i],10);
    else if(a==='--store3Id') opts.store3Id = parseInt(args[++i],10);
  }
  return opts;
}

async function createView(connection, viewName, storeOwnerId){
  if(!storeOwnerId || isNaN(storeOwnerId)){
    console.log(`Skip ${viewName}: missing storeOwnerId`);
    return;
  }
  await connection.query(`DROP VIEW IF EXISTS \`${viewName}\``);
  await connection.query(
    `CREATE VIEW \`${viewName}\` AS SELECT * FROM products WHERE store_owner_id = ?`,
    [storeOwnerId]
  );
  console.log(`Created view ${viewName} for store_owner_id=${storeOwnerId}`);
}

async function main(){
  const opts = parseArgs();
  const connection = await db.getConnection();
  try{
    await createView(connection, 'products_store2', opts.store2Id || parseInt(process.env.STORE2_ID||'0',10));
    await createView(connection, 'products_store3', opts.store3Id || parseInt(process.env.STORE3_ID||'0',10));
    process.exit(0);
  }catch(err){
    console.error('Create views failed:', err);
    process.exit(1);
  }finally{
    connection.release();
  }
}

main();
