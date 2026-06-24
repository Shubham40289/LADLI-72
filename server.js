const express = require('express');
const path = require('path');
const NodeCache = require('node-cache');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize cache (stdTTL: 60 seconds)
const cache = new NodeCache({ stdTTL: 60 });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, '/')));

// Initialize SQLite database
db.initDb().then(() => {
  console.log('Database initialized and data migrated (if needed).');
}).catch(err => {
  console.error('Database initialization failed:', err);
});

// API routes - Products
app.get('/api/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Pagination added!
    const category = req.query.category || null;
    
    console.log(`[GET /api/products] page=${page}, limit=${limit}, category=${category}`);
    
    // Check Cache
    const cacheKey = `products_${page}_${limit}_${category}`;
    const cachedProducts = cache.get(cacheKey);
    if (cachedProducts) {
      console.log(`Serving products from cache: ${cacheKey}`);
      return res.json(cachedProducts);
    }

    const products = await db.getProducts(page, limit, category);
    console.log(`Queried DB for category: ${category}. Found ${products.length} products.`);
    
    // Save to Cache
    cache.set(cacheKey, products);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/count', async (req, res) => {
  try {
    const category = req.query.category || null;
    const count = await db.getTotalProductsCount(category);
    res.json({ total: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const product = await db.getProductById(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const newProduct = await db.addProduct(req.body);
    cache.flushAll(); // Clear cache since data changed
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add product' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await db.updateProduct(id, req.body);
    if (result.updated === 0) return res.status(404).json({ error: 'Product not found' });
    cache.flushAll(); // Clear cache
    res.json({ updated: 1 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await db.deleteProduct(id);
    if (result.deleted === 0) return res.status(404).json({ error: 'Product not found' });
    cache.flushAll(); // Clear cache
    res.json({ deleted: 1 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// API routes - Orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await db.getOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const newOrder = await db.addOrder(req.body);
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(500).json({ error: 'Failed to place order' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await db.updateOrderStatus(id, req.body.status || 'Pending');
    if (result.updated === 0) return res.status(404).json({ error: 'Order not found' });
    res.json({ updated: 1 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
