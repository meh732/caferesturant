import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || process.argv[2] || '3000', 10);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

let networkOrders = [];
let cachedMenu = { categories: [], menuItems: [] };
let waiterCalls = [];

// 1. GET /api/network/info
app.get('/api/network/info', (req, res) => {
  const nets = os.networkInterfaces();
  const localIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        localIps.push(net.address);
      }
    }
  }
  res.json({
    status: 'ok',
    localIps: localIps.length > 0 ? localIps : ['127.0.0.1'],
    port,
    host: req.headers.host,
    timestamp: Date.now()
  });
});

// 2. Menu API
app.get('/api/network/menu', (req, res) => {
  res.json(cachedMenu);
});
app.post('/api/network/menu', (req, res) => {
  cachedMenu = req.body || { categories: [], menuItems: [] };
  res.json({ status: 'ok', count: cachedMenu.menuItems?.length || 0 });
});

// 3. Orders API
app.get('/api/network/orders', (req, res) => {
  res.json(networkOrders);
});
app.post('/api/network/orders', (req, res) => {
  const orderData = req.body;
  orderData.id = orderData.id || Date.now();
  orderData.createdAt = orderData.createdAt || new Date().toISOString();
  orderData.status = orderData.status || 'pending';
  networkOrders.unshift(orderData);
  if (networkOrders.length > 100) networkOrders.pop();
  res.status(201).json({ status: 'ok', order: orderData });
});

// 4. Waiter Call API
app.get('/api/network/waiter-call', (req, res) => {
  res.json(waiterCalls);
});
app.post('/api/network/waiter-call', (req, res) => {
  const callData = req.body;
  callData.id = Date.now();
  callData.createdAt = new Date().toISOString();
  waiterCalls.unshift(callData);
  if (waiterCalls.length > 50) waiterCalls.pop();
  res.status(201).json({ status: 'ok' });
});

// Static assets
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  console.log(`==============================================================================`);
  console.log(` Arka POS Network Server successfully running on Port ${port}`);
  console.log(` Accessible in Local Network (Wi-Fi / LAN) at:`);
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   -> http://${net.address}:${port}`);
      }
    }
  }
  console.log(`==============================================================================`);
});
