const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const sourceDbPath = path.join(__dirname, 'database.sqlite');
const dbPath = isVercel ? path.join('/tmp', 'database.sqlite') : sourceDbPath;

if (isVercel && !fs.existsSync(dbPath) && fs.existsSync(sourceDbPath)) {
  fs.copyFileSync(sourceDbPath, dbPath);
}

const db = new sqlite3.Database(dbPath);

function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create products table
      db.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          price REAL NOT NULL,
          imageUrl TEXT,
          size TEXT,
          color TEXT,
          stock INTEGER DEFAULT 0
        )
      `);

      // Create orders table
      db.run(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          orderNumber TEXT UNIQUE NOT NULL,
          date TEXT NOT NULL,
          status TEXT NOT NULL,
          customer TEXT NOT NULL, -- JSON string
          items TEXT NOT NULL,    -- JSON string
          total REAL NOT NULL
        )
      `, () => {
        migrateData().then(resolve).catch(reject);
      });
    });
  });
}

async function migrateData() {
  const productsFile = path.join(__dirname, 'products.json');
  const ordersFile = path.join(__dirname, 'orders.json');

  // Check if products table is empty
  const prodCount = await new Promise((res, rej) => {
    db.get('SELECT COUNT(*) as count FROM products', (err, row) => err ? rej(err) : res(row.count));
  });

  if (prodCount === 0 && fs.existsSync(productsFile)) {
    console.log('Migrating products from JSON to SQLite...');
    const products = JSON.parse(fs.readFileSync(productsFile, 'utf-8'));
    const stmt = db.prepare('INSERT INTO products (id, name, category, price, imageUrl, size, color, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of products) {
      stmt.run(p.id, p.name, p.category, p.price, p.imageUrl, p.size || '', p.color || '', p.stock || 0);
    }
    stmt.finalize();
  }

  // Check if orders table is empty
  const ordCount = await new Promise((res, rej) => {
    db.get('SELECT COUNT(*) as count FROM orders', (err, row) => err ? rej(err) : res(row.count));
  });

  if (ordCount === 0 && fs.existsSync(ordersFile)) {
    console.log('Migrating orders from JSON to SQLite...');
    const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf-8'));
    const stmt = db.prepare('INSERT INTO orders (id, orderNumber, date, status, customer, items, total) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const o of orders) {
      stmt.run(
        o.id,
        o.orderNumber,
        o.date,
        o.status,
        JSON.stringify(o.customer || {}),
        JSON.stringify(o.items || []),
        o.total || 0
      );
    }
    stmt.finalize();
  }
}

// Product Queries
function getProducts(page = 1, limit = 20, category = null) {
  const offset = (page - 1) * limit;
  return new Promise((resolve, reject) => {
    let sql = 'SELECT * FROM products';
    const params = [];
    if (category && category !== 'All Products') {
      if (category === 'Flats & Juttis') {
        sql += ' WHERE category = ? OR category = ?';
        params.push('Flats', 'Juttis');
      } else {
        sql += ' WHERE category = ?';
        params.push(category);
      }
    }
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getTotalProductsCount(category = null) {
  return new Promise((resolve, reject) => {
    let sql = 'SELECT COUNT(*) as count FROM products';
    const params = [];
    if (category && category !== 'All Products') {
      if (category === 'Flats & Juttis') {
        sql += ' WHERE category = ? OR category = ?';
        params.push('Flats', 'Juttis');
      } else {
        sql += ' WHERE category = ?';
        params.push(category);
      }
    }
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row.count);
    });
  });
}

function getProductById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function addProduct(p) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('INSERT INTO products (name, category, price, imageUrl, size, color, stock) VALUES (?, ?, ?, ?, ?, ?, ?)');
    stmt.run([p.name, p.category, p.price, p.imageUrl, p.size || '', p.color || '', p.stock || 0], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, ...p });
    });
  });
}

function updateProduct(id, p) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE products SET name = ?, category = ?, price = ?, imageUrl = ?, size = ?, color = ?, stock = ? WHERE id = ?',
      [p.name, p.category, p.price, p.imageUrl, p.size || '', p.color || '', p.stock || 0, id],
      function (err) {
        if (err) return reject(err);
        resolve({ updated: this.changes });
      }
    );
  });
}

function deleteProduct(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM products WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve({ deleted: this.changes });
    });
  });
}

// Order Queries
function getOrders() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM orders ORDER BY id DESC', (err, rows) => {
      if (err) return reject(err);
      // Parse JSON strings back to objects
      const parsedOrders = rows.map(r => ({
        ...r,
        customer: JSON.parse(r.customer),
        items: JSON.parse(r.items)
      }));
      resolve(parsedOrders);
    });
  });
}

function addOrder(o) {
  return new Promise((resolve, reject) => {
    db.get('SELECT MAX(id) as maxId FROM orders', (err, row) => {
      if (err) return reject(err);
      const nextId = (row.maxId || 1043) + 1;
      const nextOrderNumber = `L72-${nextId}`;
      const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      
      const stmt = db.prepare('INSERT INTO orders (id, orderNumber, date, status, customer, items, total) VALUES (?, ?, ?, ?, ?, ?, ?)');
      stmt.run([nextId, nextOrderNumber, date, 'Pending', JSON.stringify(o.customer || {}), JSON.stringify(o.items || []), o.total || 0], function(err) {
        if (err) return reject(err);
        resolve({
          id: nextId,
          orderNumber: nextOrderNumber,
          date,
          status: 'Pending',
          customer: o.customer,
          items: o.items,
          total: o.total
        });
      });
    });
  });
}

function updateOrderStatus(id, status) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, id], function(err) {
      if (err) return reject(err);
      resolve({ updated: this.changes });
    });
  });
}

module.exports = {
  initDb,
  getProducts,
  getTotalProductsCount,
  getProductById,
  addProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  addOrder,
  updateOrderStatus
};
