const http = require('http');
const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: 1, username: 'kadiwa1', role: 'store_owner' }, 'your_jwt_secret_key_change_this_in_production', { expiresIn: '24h' });
const data = JSON.stringify({ barangays: { 'Balingayan': 123.45, 'Balite': 67.89 } });
const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/store/delivery-barangays',
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Authorization': `Bearer ${token}`
  }
};
const req = http.request(options, (res) => {
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    console.log('STATUS', res.statusCode);
    console.log('HEADERS', res.headers);
    console.log('BODY', body);
  });
});
req.on('error', (err) => { console.error('REQUEST ERROR', err.message); });
req.write(data);
req.end();