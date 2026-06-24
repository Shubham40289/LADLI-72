const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all('SELECT * FROM products', (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('Total products in DB:', rows.length);
  console.log('Categories present in DB:', [...new Set(rows.map(r => r.category))]);
  
  // Test query for High Heels
  const sql = 'SELECT * FROM products WHERE category = ? LIMIT ? OFFSET ?';
  const params = ['High Heels', 20, 0];
  db.all(sql, params, (err2, rows2) => {
    if (err2) {
      console.error(err2);
      return;
    }
    console.log('High Heels query returned:', rows2.length, 'items');
    console.log(rows2);
  });
});
