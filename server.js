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

function broadcastDbChange(isReset = false) {
  const payload = JSON.stringify({
    type: isReset ? 'DB_RESET' : 'DB_CHANGED',
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
  if (!Array.isArray(serverDbState.data.users) || serverDbState.data.users.length === 0) {
    serverDbState.data.isRawClean = true;
    serverDbState.data.users = [];
    serverDbState.data.categories = [];
    serverDbState.data.menuItems = [];
    serverDbState.data.restaurantTables = [];
    serverDbState.data.warehouses = [];
    serverDbState.data.rawMaterials = [];
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
  const isRawClean = !!(serverDbState.data && serverDbState.data.isRawClean === true);
  res.json({
    status: 'ok',
    version: serverDbState.version,
    lastUpdated: serverDbState.lastUpdated,
    isRawClean,
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
        if (tableName === 'isRawClean') continue;
        const incomingTable = clientData[tableName];
        const existingTable = serverDbState.data[tableName] || [];
        const deletedIds = deleted[tableName] || [];

        // If client sent table or deletions, merge them
        if (Array.isArray(incomingTable) || deletedIds.length > 0) {
          serverDbState.data[tableName] = mergeTableData(existingTable, incomingTable, deletedIds);
        }
      }

      if (Array.isArray(serverDbState.data.users) && serverDbState.data.users.length > 0) {
        delete serverDbState.data.isRawClean;
      }

      serverDbState.version = (serverDbState.version || 0) + 1;
      serverDbState.lastUpdated = Date.now();
      saveServerDb();
      broadcastDbChange();
    }

    res.json({
      status: 'ok',
      version: serverDbState.version,
      lastUpdated: serverDbState.lastUpdated,
      isRawClean: !!(serverDbState.data && serverDbState.data.isRawClean === true)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync database', details: String(err) });
  }
});

app.post('/api/db/reset', (req, res) => {
  serverDbState = {
    version: (serverDbState.version || 0) + 1,
    lastUpdated: Date.now(),
    data: {
      isRawClean: true,
      categories: [],
      menuItems: [],
      orders: [],
      settings: [],
      customers: [],
      users: [],
      expenses: [],
      employees: [],
      salaryPayments: [],
      restaurantTables: [],
      networkOrders: [],
      warehouses: [],
      rawMaterials: [],
      warehouseStocks: [],
      warehouseTransfers: [],
      stockTransactions: [],
      recipes: [],
      chatMessages: [],
      systemNotifications: [],
      bankAccounts: [],
      cashBoxes: [],
      chequeBooks: [],
      cheques: [],
      financialTransactions: [],
      chartOfAccounts: [],
      journalEntries: []
    }
  };
  saveServerDb();
  broadcastDbChange(true);
  res.json({ status: 'ok', message: 'Central server database reset successful to 100% raw clean state' });
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
    menuItems: serverDbState.data.menuItems || [],
    recipes: serverDbState.data.recipes || []
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
  if (Array.isArray(body.recipes)) {
    serverDbState.data.recipes = body.recipes;
  }
  serverDbState.version = (serverDbState.version || 0) + 1;
  serverDbState.lastUpdated = Date.now();
  saveServerDb();
  broadcastDbChange();
  res.json({ status: 'ok', count: (serverDbState.data.menuItems || []).length });
});

// -----------------------------------------------------------------------------
// Direct Settings API (Instant Central Storage & Cross-Device Sync)
// -----------------------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  const settingsList = serverDbState.data.settings || [];
  const activeSettings = settingsList.length > 0 ? settingsList[0] : null;
  res.json({
    status: 'ok',
    settings: activeSettings
  });
});

app.post('/api/settings', (req, res) => {
  try {
    const incoming = req.body || {};
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    if (!Array.isArray(serverDbState.data.settings)) {
      serverDbState.data.settings = [];
    }

    // Preserve or assign ID 1
    const finalSettings = {
      ...incoming,
      id: incoming.id || 1,
      updatedAt: new Date().toISOString()
    };

    if (serverDbState.data.settings.length === 0) {
      serverDbState.data.settings.push(finalSettings);
    } else {
      serverDbState.data.settings[0] = {
        ...serverDbState.data.settings[0],
        ...finalSettings
      };
    }

    serverDbState.version = (serverDbState.version || 0) + 1;
    serverDbState.lastUpdated = Date.now();
    saveServerDb();
    broadcastDbChange();

    res.json({
      status: 'ok',
      message: 'Settings saved and synced across all devices',
      settings: serverDbState.data.settings[0]
    });
  } catch (err) {
    console.error('[Settings API Error]', err);
    res.status(500).json({ error: err.message || 'Failed to save settings' });
  }
});

// -----------------------------------------------------------------------------
// Bale Messenger & Telegram Bot Server-Side Proxies (CORS & Firewall Bypass)
// -----------------------------------------------------------------------------

// Bale - Test Bot Token
app.post('/api/bot/bale/test', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'توکن ربات بله الزامی است.' });
    const cleanToken = String(token).trim();

    const response = await fetch(`https://tapi.bale.ai/bot${cleanToken}/getMe`);
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      const errDesc = data?.description || `HTTP ${response.status} ${response.statusText}`;
      return res.status(200).json({
        ok: false,
        error: errDesc,
        error_code: data?.error_code || response.status
      });
    }

    res.json({
      ok: true,
      bot: data.result
    });
  } catch (err) {
    console.error('[Bale Bot Test Error]', err);
    res.status(500).json({ ok: false, error: `خطا در برقراری ارتباط با بله: ${err.message}` });
  }
});

// Bale - Send Message
app.post('/api/bot/bale/send', async (req, res) => {
  try {
    const { token, chatId, text } = req.body || {};
    if (!token || !chatId || !text) {
      return res.status(400).json({ ok: false, error: 'فیلدهای token، chatId و text الزامی هستند.' });
    }
    const cleanToken = String(token).trim();
    const cleanChatId = String(chatId).trim();

    const response = await fetch(`https://tapi.bale.ai/bot${cleanToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: String(text)
      })
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      const errDesc = data?.description || `HTTP ${response.status}`;
      return res.status(200).json({
        ok: false,
        error: errDesc,
        error_code: data?.error_code || response.status
      });
    }

    res.json({ ok: true, result: data.result });
  } catch (err) {
    console.error('[Bale Send Message Error]', err);
    res.status(500).json({ ok: false, error: `خطای سرور در ارسال پیام بله: ${err.message}` });
  }
});

// Bale - Send Document (Backup File)
app.post('/api/bot/bale/document', async (req, res) => {
  try {
    const { token, chatId, fileContent, fileName, caption } = req.body || {};
    if (!token || !chatId || !fileContent) {
      return res.status(400).json({ ok: false, error: 'فیلدهای token، chatId و fileContent الزامی هستند.' });
    }
    const cleanToken = String(token).trim();
    const cleanChatId = String(chatId).trim();

    const blob = new Blob([fileContent], { type: 'application/json' });
    const formData = new FormData();
    formData.append('chat_id', cleanChatId);
    formData.append('document', blob, fileName || 'arka_backup.json');
    if (caption) formData.append('caption', String(caption));

    const response = await fetch(`https://tapi.bale.ai/bot${cleanToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      const errDesc = data?.description || `HTTP ${response.status}`;
      return res.status(200).json({
        ok: false,
        error: errDesc,
        error_code: data?.error_code || response.status
      });
    }

    res.json({ ok: true, result: data.result });
  } catch (err) {
    console.error('[Bale Send Document Error]', err);
    res.status(500).json({ ok: false, error: `خطای سرور در ارسال فایل بکاپ به بله: ${err.message}` });
  }
});

// Telegram - Test Bot Token
app.post('/api/bot/telegram/test', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'توکن ربات تلگرام الزامی است.' });
    const cleanToken = String(token).trim();

    const response = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      const errDesc = data?.description || `HTTP ${response.status} ${response.statusText}`;
      return res.status(200).json({
        ok: false,
        error: errDesc,
        error_code: data?.error_code || response.status
      });
    }

    res.json({
      ok: true,
      bot: data.result
    });
  } catch (err) {
    console.error('[Telegram Bot Test Error]', err);
    res.status(500).json({ ok: false, error: `عدم برقراری ارتباط با تلگرام (احتمال فیلترینگ یا قطعی شبکه): ${err.message}` });
  }
});

// Telegram - Send Message
app.post('/api/bot/telegram/send', async (req, res) => {
  try {
    const { token, chatId, text } = req.body || {};
    if (!token || !chatId || !text) {
      return res.status(400).json({ ok: false, error: 'فیلدهای token، chatId و text الزامی هستند.' });
    }
    const cleanToken = String(token).trim();
    const cleanChatId = String(chatId).trim();

    const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: String(text),
        parse_mode: 'HTML'
      })
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      const errDesc = data?.description || `HTTP ${response.status}`;
      return res.status(200).json({
        ok: false,
        error: errDesc,
        error_code: data?.error_code || response.status
      });
    }

    res.json({ ok: true, result: data.result });
  } catch (err) {
    console.error('[Telegram Send Message Error]', err);
    res.status(500).json({ ok: false, error: `خطای سرور در ارسال پیام تلگرام: ${err.message}` });
  }
});

// Telegram - Send Document (Backup File)
app.post('/api/bot/telegram/document', async (req, res) => {
  try {
    const { token, chatId, fileContent, fileName, caption } = req.body || {};
    if (!token || !chatId || !fileContent) {
      return res.status(400).json({ ok: false, error: 'فیلدهای token، chatId و fileContent الزامی هستند.' });
    }
    const cleanToken = String(token).trim();
    const cleanChatId = String(chatId).trim();

    const blob = new Blob([fileContent], { type: 'application/json' });
    const formData = new FormData();
    formData.append('chat_id', cleanChatId);
    formData.append('document', blob, fileName || 'arka_backup.json');
    if (caption) {
      formData.append('caption', String(caption));
      formData.append('parse_mode', 'HTML');
    }

    const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      const errDesc = data?.description || `HTTP ${response.status}`;
      return res.status(200).json({
        ok: false,
        error: errDesc,
        error_code: data?.error_code || response.status
      });
    }

    res.json({ ok: true, result: data.result });
  } catch (err) {
    console.error('[Telegram Send Document Error]', err);
    res.status(500).json({ ok: false, error: `خطای سرور در ارسال فایل به تلگرام: ${err.message}` });
  }
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

// Explicit routes for PWA files to guarantee correct MIME types and avoid fallback to index.html
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  const swPath = path.join(distPath, 'sw.js');
  if (fs.existsSync(swPath)) {
    res.sendFile(swPath);
  } else {
    res.status(404).send('// Service worker not found');
  }
});

app.get(['/manifest.json', '/manifest.webmanifest'], (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const manifestPath = path.join(distPath, req.path === '/manifest.json' ? 'manifest.json' : 'manifest.webmanifest');
  if (fs.existsSync(manifestPath)) {
    res.sendFile(manifestPath);
  } else {
    res.status(404).send('{}');
  }
});

// Static assets (Serving React production build)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (filePath.endsWith('sw.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.endsWith('manifest.json') || filePath.endsWith('manifest.webmanifest')) {
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
