require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');

function main(){
  const args = process.argv.slice(2);
  const fileArgIndex = args.indexOf('--file');
  const sheetArgIndex = args.indexOf('--sheet');
  const file = fileArgIndex !== -1 ? args[fileArgIndex+1] : './products_store2.xlsx';
  const sheetName = sheetArgIndex !== -1 ? args[sheetArgIndex+1] : null;
  const fullPath = path.resolve(__dirname, file);
  const wb = XLSX.readFile(fullPath);
  const name = sheetName || wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if(!sheet){
    console.error('Sheet not found:', name);
    process.exit(1);
  }
  const rowsRaw = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  const header = rowsRaw[0];
  console.log('Sheet:', name);
  console.log('Header columns:', header);
  console.log('First 3 data rows:', rowsRaw.slice(1,4));
}

main();
