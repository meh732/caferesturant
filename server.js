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

// CORS headers for LAN & cross-device access
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Central Persistent Storage
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}
const dbFilePath = path.join(dataDir, 'arka_db.json');

let serverDbState = {
  version: 1,
  lastUpdated: Date.now(),
  data: {}
};

// Connected SSE clients for instant live push to all computers, tablets, and phones
let sseClients = [];

function broadcastDbChange() {
  const payload = JSON.stringify({
    type: 'DB_CHANGED',
    version: serverDbState.version,
    lastUpdated: serverDbState.lastUpdated
  });
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(`data: ${payload}\n\n`);
    } catch (err) {
      sseClients.splice(i, 1);
    }
  }
}

function ensureDefaultSeedData() {
  if (!serverDbState.data || typeof serverDbState.data !== 'object') {
    serverDbState.data = {};
  }

  // Ensure default admin user
  if (!Array.isArray(serverDbState.data.users) || serverDbState.data.users.length === 0) {
    serverDbState.data.users = [{
      id: 1,
      name: 'مدیر ارشد سیستم',
      username: 'admin',
      password: '1234',
      role: 'admin',
      isActive: true,
      createdAt: new Date().toISOString()
    }];
  }

  // Ensure default tables
  if (!Array.isArray(serverDbState.data.restaurantTables) || serverDbState.data.restaurantTables.length === 0) {
    serverDbState.data.restaurantTables = [
      { id: 1, number: 1, title: 'میز ۱', section: 'سالن اصلی', capacity: 4, status: 'empty', createdAt: new Date().toISOString() },
      { id: 2, number: 2, title: 'میز ۲', section: 'سالن اصلی', capacity: 4, status: 'empty', createdAt: new Date().toISOString() },
      { id: 3, number: 3, title: 'میز ۳', section: 'سالن اصلی', capacity: 2, status: 'empty', createdAt: new Date().toISOString() },
      { id: 4, number: 4, title: 'میز ۴', section: 'سالن اصلی', capacity: 6, status: 'empty', createdAt: new Date().toISOString() },
      { id: 5, number: 5, title: 'میز ۵', section: 'سالن اصلی', capacity: 4, status: 'empty', createdAt: new Date().toISOString() },
      { id: 6, number: 6, title: 'میز ۶ (تراس)', section: 'تراس و فضای باز', capacity: 4, status: 'empty', createdAt: new Date().toISOString() },
      { id: 7, number: 7, title: 'میز ۷ (تراس)', section: 'تراس و فضای باز', capacity: 4, status: 'empty', createdAt: new Date().toISOString() },
      { id: 8, number: 8, title: 'میز VIP', section: 'بخش VIP', capacity: 8, status: 'empty', createdAt: new Date().toISOString() }
    ];
  }

  // Ensure default settings
  if (!Array.isArray(serverDbState.data.settings) || serverDbState.data.settings.length === 0) {
    serverDbState.data.settings = [{
      id: 1,
      restaurantName: 'فروشگاه من',
      phone: '',
      address: '',
      website: '',
      instagram: '',
      telegram: '',
      logoUrl: '',
      taxEnabled: false,
      taxPercentage: 9,
      requireCustomerPhone: false,
      localServerPort: port
    }];
  }
}

function loadServerDb() {
  const bakPath = `${dbFilePath}.bak`;
  let loaded = false;

  if (fs.existsSync(dbFilePath)) {
    try {
      const raw = fs.readFileSync(dbFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        serverDbState = {
          version: parsed.version || 1,
          lastUpdated: parsed.lastUpdated || Date.now(),
          data: parsed.data || {}
        };
        loaded = true;
      }
    } catch (err) {
      console.error('[Server DB] Primary arka_db.json read error, trying backup...', err);
    }
  }

  if (!loaded && fs.existsSync(bakPath)) {
    try {
      const raw = fs.readFileSync(bakPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        serverDbState = {
          version: parsed.version || 1,
          lastUpdated: parsed.lastUpdated || Date.now(),
          data: parsed.data || {}
        };
        loaded = true;
      }
    } catch (err) {
      console.error('[Server DB] Error reading arka_db.json.bak:', err);
    }
  }

  ensureDefaultSeedData();
  saveServerDb();
}

function saveServerDb() {
  try {
    const tempPath = `${dbFilePath}.tmp`;
    const bakPath = `${dbFilePath}.bak`;
    const jsonStr = JSON.stringify(serverDbState, null, 2);

    // 1. Atomic write to temporary file first
    fs.writeFileSync(tempPath, jsonStr, 'utf-8');

    // 2. Keep previous good backup
    if (fs.existsSync(dbFilePath)) {
      try {
        fs.copyFileSync(dbFilePath, bakPath);
      } catch (e) {}
    }

    // 3. Atomic rename replace
    fs.renameSync(tempPath, dbFilePath);
  } catch (err) {
    console.error('[Server DB] Error writing arka_db.json:', err);
  }
}

// Initial load & seed
loadServerDb();

// Smart merge table records by ID
function mergeTableData(existingArr = [], incomingArr = [], deletedIds = []) {
  const deletedSet = new Set((deletedIds || []).map(String));
  const map = new Map();

  if (Array.isArray(existingArr)) {
    for (const item of existingArr) {
      if (!item) continue;
      const key = item.id !== undefined ? String(item.id) : (item.tempId ? String(item.tempId) : JSON.stringify(item));
      if (!deletedSet.has(key)) {
        map.set(key, item);
      }
    }
  }

  if (Array.isArray(incomingArr)) {
    for (const item of incomingArr) {
      if (!item) continue;
      const key = item.id !== undefined ? String(item.id) : (item.tempId ? String(item.tempId) : JSON.stringify(item));
      if (!deletedSet.has(key)) {
        map.set(key, item);
      }
    }
  }

  return Array.from(map.values());
}

// -----------------------------------------------------------------------------
// Real-time Push Endpoint (SSE) - Instant notification to all connected clients
// -----------------------------------------------------------------------------
app.get('/api/db/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx proxy buffering
  res.flushHeaders?.();

  // Initial welcome event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', version: serverDbState.version, timestamp: Date.now() })}\n\n`);

  sseClients.push(res);

  // Keep connection alive with periodic heartbeat ping
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c !== res);
  });
});

// Central DB Sync Endpoints
app.get('/api/db/version', (req, res) => {
  res.json({
    status: 'ok',
    version: serverDbState.version,
    lastUpdated: serverDbState.lastUpdated
  });
});

app.get('/api/db/sync', (req, res) => {
  res.json({
    status: 'ok',
    version: serverDbState.version,
    lastUpdated: serverDbState.lastUpdated,
    data: serverDbState.data || {}
  });
});

app.post('/api/db/sync', (req, res) => {
  try {
    const payload = req.body || {};
    const clientData = payload.data || {};
    const deleted = payload.deleted || {};

    if (clientData && typeof clientData === 'object') {
      const allTableNames = new Set([
        ...Object.keys(serverDbState.data || {}),
        ...Object.keys(clientData),
        ...Object.keys(deleted)
      ]);

      for (const tableName of allTableNames) {
        const incomingTable = clientData[tableName];
        const existingTable = serverDbState.data[tableName] || [];
        const deletedIds = deleted[tableName] || [];

        // If client sent table or deletions, merge them
        if (Array.isArray(incomingTable) || deletedIds.length > 0) {
          serverDbState.data[tableName] = mergeTableData(existingTable, incomingTable, deletedIds);
        }
      }

      serverDbState.version = (serverDbState.version || 0) + 1;
      serverDbState.lastUpdated = Date.now();
      saveServerDb();
      broadcastDbChange();
    }

    res.json({
      status: 'ok',
      version: serverDbState.version,
      lastUpdated: serverDbState.lastUpdated
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync database', details: String(err) });
  }
});

app.post('/api/db/reset', (req, res) => {
  serverDbState = {
    version: (serverDbState.version || 0) + 1,
    lastUpdated: Date.now(),
    data: {}
  };
  ensureDefaultSeedData();
  saveServerDb();
  broadcastDbChange();
  res.json({ status: 'ok', message: 'Central server database reset successful' });
});

// -----------------------------------------------------------------------------
// Network APIs (Unified with central database)
// -----------------------------------------------------------------------------

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

// 2. Menu API (Unified with serverDbState)
app.get('/api/network/menu', (req, res) => {
  res.json({
    categories: serverDbState.data.categories || [],
    menuItems: serverDbState.data.menuItems || []
  });
});

app.post('/api/network/menu', (req, res) => {
  const body = req.body || {};
  if (Array.isArray(body.categories)) {
    serverDbState.data.categories = body.categories;
  }
  if (Array.isArray(body.menuItems)) {
    serverDbState.data.menuItems = body.menuItems;
  }
  serverDbState.version = (serverDbState.version || 0) + 1;
  serverDbState.lastUpdated = Date.now();
  saveServerDb();
  broadcastDbChange();
  res.json({ status: 'ok', count: (serverDbState.data.menuItems || []).length });
});

// 3. Orders API (Unified with serverDbState)
app.get('/api/network/orders', (req, res) => {
  res.json(serverDbState.data.networkOrders || []);
});

app.post('/api/network/orders', (req, res) => {
  const orderData = req.body;
  if (!orderData) return res.status(400).json({ error: 'Missing order data' });

  orderData.id = orderData.id || Date.now();
  orderData.createdAt = orderData.createdAt || new Date().toISOString();
  orderData.status = orderData.status || 'pending';

  if (!Array.isArray(serverDbState.data.networkOrders)) {
    serverDbState.data.networkOrders = [];
  }
  serverDbState.data.networkOrders.unshift(orderData);
  if (serverDbState.data.networkOrders.length > 200) {
    serverDbState.data.networkOrders.pop();
  }

  serverDbState.version = (serverDbState.version || 0) + 1;
  serverDbState.lastUpdated = Date.now();
  saveServerDb();
  broadcastDbChange();

  res.status(201).json({ status: 'ok', order: orderData });
});

// 4. Waiter Call API (Unified with serverDbState)
app.get('/api/network/waiter-call', (req, res) => {
  res.json(serverDbState.data.waiterCalls || []);
});

app.post('/api/network/waiter-call', (req, res) => {
  const callData = req.body || {};
  callData.id = Date.now();
  callData.createdAt = new Date().toISOString();

  if (!Array.isArray(serverDbState.data.waiterCalls)) {
    serverDbState.data.waiterCalls = [];
  }
  serverDbState.data.waiterCalls.unshift(callData);
  if (serverDbState.data.waiterCalls.length > 50) {
    serverDbState.data.waiterCalls.pop();
  }

  serverDbState.version = (serverDbState.version || 0) + 1;
  serverDbState.lastUpdated = Date.now();
  saveServerDb();
  broadcastDbChange();

  res.status(201).json({ status: 'ok' });
});

// Static assets (Serving React production build)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json') || filePath.endsWith('manifest.webmanifest')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  console.log(`==============================================================================`);
  console.log(` Arka POS Network Server successfully running on Port ${port}`);
  console.log(` Real-Time Server-Sent Events (SSE) active for all network devices`);
  console.log(` Accessible in Local Network (Wi-Fi / LAN) and Server IP at:`);
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   -> http://${net.address}:${port}`);
      }
    }
  }
  console.log(`==============================================================================`);
});
