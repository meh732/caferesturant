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

const DEFAULT_CHART_OF_ACCOUNTS = [
  { code: '1', name: 'دارایی‌های جاری', level: 'group', nature: 'debtor', isSystem: true, isActive: true },
  { code: '10', name: 'موجودی نقد و بانک', level: 'ledger', parentCode: '1', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1001', name: 'صندوق‌های فروشگاه و سالن', level: 'subsidiary', parentCode: '10', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1002', name: 'حساب‌های بانکی و پوز', level: 'subsidiary', parentCode: '10', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1003', name: 'تنخواه‌گردان‌ها', level: 'subsidiary', parentCode: '10', nature: 'debtor', isSystem: true, isActive: true },
  { code: '11', name: 'اسناد دریافتنی تجاری (چک‌ها)', level: 'ledger', parentCode: '1', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1101', name: 'چک‌های دریافتنی در جریان وصول', level: 'subsidiary', parentCode: '11', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1102', name: 'چک‌های دریافتنی واگذارشده / خرج‌شده', level: 'subsidiary', parentCode: '11', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1103', name: 'چک‌های دریافتنی واخواست‌شده / برگشتی', level: 'subsidiary', parentCode: '11', nature: 'debtor', isSystem: true, isActive: true },
  { code: '12', name: 'حساب‌های دریافتنی تجاری (مشتریان)', level: 'ledger', parentCode: '1', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1201', name: 'بستانکاری و مطالبات از خریداران و مشتریان', level: 'subsidiary', parentCode: '12', nature: 'debtor', isSystem: true, isActive: true },
  { code: '13', name: 'موجودی کالا و مواد اولیه', level: 'ledger', parentCode: '1', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1301', name: 'موجودی انبار مرکزی و تدارکات', level: 'subsidiary', parentCode: '13', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1302', name: 'موجودی پای خط تولید و آشپزخانه', level: 'subsidiary', parentCode: '13', nature: 'debtor', isSystem: true, isActive: true },
  { code: '14', name: 'پیش‌پرداخت‌ها', level: 'ledger', parentCode: '1', nature: 'debtor', isSystem: true, isActive: true },
  { code: '1401', name: 'پیش‌پرداخت خرید کالا و خدمات', level: 'subsidiary', parentCode: '14', nature: 'debtor', isSystem: true, isActive: true },
  { code: '2', name: 'دارایی‌های غیرجاری', level: 'group', nature: 'debtor', isSystem: true, isActive: true },
  { code: '20', name: 'دارایی‌های ثابت مشهود', level: 'ledger', parentCode: '2', nature: 'debtor', isSystem: true, isActive: true },
  { code: '2001', name: 'ماشین‌آلات و تجهیزات آماده‌سازی و پخت', level: 'subsidiary', parentCode: '20', nature: 'debtor', isSystem: true, isActive: true },
  { code: '2002', name: 'اثاثه، دکوراسیون و تجهیزات سالن', level: 'subsidiary', parentCode: '20', nature: 'debtor', isSystem: true, isActive: true },
  { code: '2003', name: 'استهلاک انباشته دارایی‌های ثابت', level: 'subsidiary', parentCode: '20', nature: 'creditor', isSystem: true, isActive: true },
  { code: '3', name: 'بدهی‌های جاری', level: 'group', nature: 'creditor', isSystem: true, isActive: true },
  { code: '30', name: 'حساب‌های پرداختنی تجاری (تأمین‌کنندگان)', level: 'ledger', parentCode: '3', nature: 'creditor', isSystem: true, isActive: true },
  { code: '3001', name: 'بستانکاران تجاری و فروشندگان مواد اولیه', level: 'subsidiary', parentCode: '30', nature: 'creditor', isSystem: true, isActive: true },
  { code: '31', name: 'اسناد پرداختنی تجاری (چک‌های صادره)', level: 'ledger', parentCode: '3', nature: 'creditor', isSystem: true, isActive: true },
  { code: '3101', name: 'چک‌های صادره سررسیدنشده', level: 'subsidiary', parentCode: '31', nature: 'creditor', isSystem: true, isActive: true },
  { code: '3102', name: 'چک‌های صادره برگشتی و پرداخت‌نشده', level: 'subsidiary', parentCode: '31', nature: 'creditor', isSystem: true, isActive: true },
  { code: '32', name: 'سایر حساب‌ها و اسناد پرداختنی', level: 'ledger', parentCode: '3', nature: 'creditor', isSystem: true, isActive: true },
  { code: '3201', name: 'حقوق و دستمزد پرداختنی پرسنل', level: 'subsidiary', parentCode: '32', nature: 'creditor', isSystem: true, isActive: true },
  { code: '3202', name: 'مالیات بر ارزش افزوده پرداختنی', level: 'subsidiary', parentCode: '32', nature: 'creditor', isSystem: true, isActive: true },
  { code: '3203', name: 'بیمه پرداختنی تأمین اجتماعی', level: 'subsidiary', parentCode: '32', nature: 'creditor', isSystem: true, isActive: true },
  { code: '33', name: 'پیش‌دریافت‌ها', level: 'ledger', parentCode: '3', nature: 'creditor', isSystem: true, isActive: true },
  { code: '3301', name: 'پیش‌دریافت سفارشات و بیعانه', level: 'subsidiary', parentCode: '33', nature: 'creditor', isSystem: true, isActive: true },
  { code: '4', name: 'حقوق صاحبان سهام و سرمایه', level: 'group', nature: 'creditor', isSystem: true, isActive: true },
  { code: '40', name: 'سرمایه اولیه و ثبت‌شده', level: 'ledger', parentCode: '4', nature: 'creditor', isSystem: true, isActive: true },
  { code: '4001', name: 'سرمایه ثبت‌شده موسسین و شرکا', level: 'subsidiary', parentCode: '40', nature: 'creditor', isSystem: true, isActive: true },
  { code: '41', name: 'اندوخته‌ها و سود/زیان انباشته', level: 'ledger', parentCode: '4', nature: 'both', isSystem: true, isActive: true },
  { code: '4101', name: 'سود (زیان) انباشته سنواتی', level: 'subsidiary', parentCode: '41', nature: 'both', isSystem: true, isActive: true },
  { code: '4102', name: 'سود (زیان) جاری دوره مالی', level: 'subsidiary', parentCode: '41', nature: 'both', isSystem: true, isActive: true },
  { code: '42', name: 'جاری شرکا و مالکان', level: 'ledger', parentCode: '4', nature: 'both', isSystem: true, isActive: true },
  { code: '4201', name: 'برداشت‌ها و واریزهای جاری شرکا', level: 'subsidiary', parentCode: '42', nature: 'both', isSystem: true, isActive: true },
  { code: '5', name: 'درآمدها و فروش', level: 'group', nature: 'creditor', isSystem: true, isActive: true },
  { code: '50', name: 'فروش ناخالص و درآمدهای عملیاتی', level: 'ledger', parentCode: '5', nature: 'creditor', isSystem: true, isActive: true },
  { code: '5001', name: 'درآمد حاصل از فروش غذا و سفارشات', level: 'subsidiary', parentCode: '50', nature: 'creditor', isSystem: true, isActive: true },
  { code: '5002', name: 'تخفیفات اعطایی به مشتریان (کاهنده)', level: 'subsidiary', parentCode: '50', nature: 'debtor', isSystem: true, isActive: true },
  { code: '6', name: 'بهای تمام‌شده کالای فروش‌رفته (COGS)', level: 'group', nature: 'debtor', isSystem: true, isActive: true },
  { code: '60', name: 'بهای تمام‌شده کالای فروش‌رفته', level: 'ledger', parentCode: '6', nature: 'debtor', isSystem: true, isActive: true },
  { code: '6001', name: 'مصرف مستقیم مواد اولیه در تولید غذا', level: 'subsidiary', parentCode: '60', nature: 'debtor', isSystem: true, isActive: true },
  { code: '6002', name: 'افت، ضایعات و دورریز مواد غذایی', level: 'subsidiary', parentCode: '60', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7', name: 'هزینه‌های عمومی، اداری و تشکیلاتی', level: 'group', nature: 'debtor', isSystem: true, isActive: true },
  { code: '70', name: 'هزینه‌های حقوق و دستمزد', level: 'ledger', parentCode: '7', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7001', name: 'حقوق و دستمزد پایه پرسنل', level: 'subsidiary', parentCode: '70', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7002', name: 'اضافه کاری، عیدی و پاداش پرسنل', level: 'subsidiary', parentCode: '70', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7003', name: 'حق بیمه سهم کارفرما', level: 'subsidiary', parentCode: '70', nature: 'debtor', isSystem: true, isActive: true },
  { code: '71', name: 'هزینه‌های اجاره و نگهداری', level: 'ledger', parentCode: '7', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7101', name: 'هزینه اجاره محل کسب', level: 'subsidiary', parentCode: '71', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7102', name: 'هزینه سرویس و نگهداری تجهیزات', level: 'subsidiary', parentCode: '71', nature: 'debtor', isSystem: true, isActive: true },
  { code: '72', name: 'هزینه‌های انرژی و قبوض', level: 'ledger', parentCode: '7', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7201', name: 'قبوض آب، برق، گاز و اینترنت', level: 'subsidiary', parentCode: '72', nature: 'debtor', isSystem: true, isActive: true },
  { code: '73', name: 'هزینه‌های تبلیغات و بازاریابی', level: 'ledger', parentCode: '7', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7301', name: 'تبلیغات آنلاین و محیطی و منو', level: 'subsidiary', parentCode: '73', nature: 'debtor', isSystem: true, isActive: true },
  { code: '74', name: 'هزینه‌های حمل و ارسال پیک', level: 'ledger', parentCode: '7', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7401', name: 'هزینه پیک موتوری و حمل سفارشات', level: 'subsidiary', parentCode: '74', nature: 'debtor', isSystem: true, isActive: true },
  { code: '75', name: 'سایر هزینه‌های جاری و استهلاک', level: 'ledger', parentCode: '7', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7501', name: 'لوازم مصرفی، بهداشتی و بسته‌بندی', level: 'subsidiary', parentCode: '75', nature: 'debtor', isSystem: true, isActive: true },
  { code: '7502', name: 'هزینه استهلاک اموال و اثاثه', level: 'subsidiary', parentCode: '75', nature: 'debtor', isSystem: true, isActive: true },
  { code: '8', name: 'درآمدها و هزینه‌های غیرعملیاتی', level: 'group', nature: 'both', isSystem: true, isActive: true },
  { code: '80', name: 'درآمدها و هزینه‌های غیرعملیاتی', level: 'ledger', parentCode: '8', nature: 'both', isSystem: true, isActive: true },
  { code: '8001', name: 'سود سپرده‌های بانکی و سرمایه‌گذاری (درآمد)', level: 'subsidiary', parentCode: '80', nature: 'creditor', isSystem: true, isActive: true },
  { code: '8002', name: 'کارمزد و هزینه‌های خدمات بانکی (هزینه)', level: 'subsidiary', parentCode: '80', nature: 'debtor', isSystem: true, isActive: true }
];

const DEFAULT_RAW_MATERIAL_CATEGORIES = [
  { id: 1, name: 'پروتئینی (گوشت، مرغ، ماهی)', order: 1 },
  { id: 2, name: 'لبنیات و پنیر', order: 2 },
  { id: 3, name: 'برنج، حبوبات و غلات', order: 3 },
  { id: 4, name: 'نان و خمیر پیتزا', order: 4 },
  { id: 5, name: 'روغن، سس و چاشنی‌ها', order: 5 },
  { id: 6, name: 'سبزیجات، صیفی‌جات و ترشی', order: 6 },
  { id: 7, name: 'نوشیدنی‌ها و شربت‌ها', order: 7 },
  { id: 8, name: 'ملزومات بسته‌بندی و ظروف', order: 8 },
  { id: 9, name: 'ادویه‌جات و طعم‌دهنده‌ها', order: 9 },
  { id: 10, name: 'سایر اقلام مصرفی', order: 10 },
];

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
  // Guarantee Chart of Accounts always has standard default coding
  if (!Array.isArray(serverDbState.data.chartOfAccounts) || serverDbState.data.chartOfAccounts.length === 0) {
    serverDbState.data.chartOfAccounts = DEFAULT_CHART_OF_ACCOUNTS;
  }
  // Guarantee Raw Material Categories always has default categories
  if (!Array.isArray(serverDbState.data.rawMaterialCategories) || serverDbState.data.rawMaterialCategories.length === 0) {
    serverDbState.data.rawMaterialCategories = DEFAULT_RAW_MATERIAL_CATEGORIES;
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
      chartOfAccounts: (Array.isArray(serverDbState?.data?.chartOfAccounts) && serverDbState.data.chartOfAccounts.length > 0) ? serverDbState.data.chartOfAccounts : DEFAULT_CHART_OF_ACCOUNTS,
      rawMaterialCategories: (Array.isArray(serverDbState?.data?.rawMaterialCategories) && serverDbState.data.rawMaterialCategories.length > 0) ? serverDbState.data.rawMaterialCategories : DEFAULT_RAW_MATERIAL_CATEGORIES,
      journalEntries: [],
      customerWalletTransactions: []
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

// 5. Customer Club Portal API (Live Wallet, Invoices & Requests over LAN/Web)
app.get('/api/network/customer-portal', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

  const customers = serverDbState.data.customers || [];
  const customer = customers.find(
    c => String(c.subscriptionCode || '').trim() === q || String(c.phone || '').trim() === q
  );

  if (!customer) {
    return res.json({ customer: null, orders: [], walletTransactions: [] });
  }

  const allOrders = serverDbState.data.orders || [];
  const orders = allOrders
    .filter(
      o =>
        o.customerId === customer.id ||
        (customer.phone && o.customerPhone === customer.phone) ||
        (customer.subscriptionCode && o.customerSubscriptionCode === customer.subscriptionCode)
    )
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const allTxns = serverDbState.data.customerWalletTransactions || [];
  const walletTransactions = allTxns
    .filter(t => t.customerId === customer.id)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  res.json({
    customer,
    orders,
    walletTransactions
  });
});

app.post('/api/network/customer-portal/request', async (req, res) => {
  try {
    const body = req.body || {};
    const { type, subscriptionCode, phone, name, amount, trackingCode, note } = body;

    if (!Array.isArray(serverDbState.data.systemNotifications)) {
      serverDbState.data.systemNotifications = [];
    }

    const notifTitle =
      type === 'wallet_topup'
        ? `درخواست شارژ کیف پول مشترک #${subscriptionCode || ''}`
        : `درخواست خرید مشترک #${subscriptionCode || ''}`;

    const notifMsg =
      type === 'wallet_topup'
        ? `${name || 'مشترک'} (${phone || ''}) درخواست شارژ کیف پول به مبلغ ${Number(amount || 0).toLocaleString('fa-IR')} تومان ثبت کرد.${trackingCode ? ` کد پیگیری: ${trackingCode}` : ''}`
        : `${name || 'مشترک'} درخواست سفارش جدید ثبت نمود.`;

    serverDbState.data.systemNotifications.unshift({
      id: Date.now(),
      type: 'new_order',
      title: notifTitle,
      message: notifMsg,
      category: `club-${subscriptionCode || Date.now()}`,
      targetTab: 'customers',
      isRead: false,
      createdAt: new Date().toISOString()
    });

    serverDbState.version = (serverDbState.version || 0) + 1;
    serverDbState.lastUpdated = Date.now();
    saveServerDb();
    broadcastDbChange();

    // Forward notification to configured Telegram & Bale bots
    const activeSettings = (serverDbState.data.settings || [])[0];
    if (activeSettings) {
      const botText = `💳 <b>${notifTitle}</b>\n👤 نام: ${name || '-'}\n📱 موبایل: ${phone || '-'}\n🔢 کد اشتراک: #${subscriptionCode || '-'}\n💰 مبلغ: ${Number(amount || 0).toLocaleString('fa-IR')} تومان\n🧾 کد پیگیری: ${trackingCode || '-'}\n📝 توضیحات: ${note || '-'}`;
      if (activeSettings.baleBotToken && activeSettings.baleChatId) {
        fetch(`https://tapi.bale.ai/bot${String(activeSettings.baleBotToken).trim()}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: String(activeSettings.baleChatId).trim(),
            text: botText.replace(/<\/?[^>]+(>|$)/g, '')
          })
        }).catch(() => {});
      }
      if (activeSettings.telegramBotToken && activeSettings.telegramChatId) {
        fetch(`https://api.telegram.org/bot${String(activeSettings.telegramBotToken).trim()}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: String(activeSettings.telegramChatId).trim(),
            text: botText,
            parse_mode: 'HTML'
          })
        }).catch(() => {});
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 6. Interactive Customer Club Bot Polling (Bale & Telegram Commands for Wallet, Statement, Payment & Order)
let lastBaleUpdateId = 0;
let lastTelegramUpdateId = 0;

function getLocalLanBaseUrl() {
  const activeSettings = (serverDbState.data.settings || [])[0];
  if (activeSettings?.localServerUrl && String(activeSettings.localServerUrl).trim()) {
    let u = String(activeSettings.localServerUrl).trim().replace(/\/$/, '');
    if (!u.startsWith('http')) u = `http://${u}`;
    return u;
  }
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        return `http://${net.address}:${port}`;
      }
    }
  }
  return `http://localhost:${port}`;
}

function handleBotCustomerCommand(rawText, chatId) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const customers = serverDbState.data.customers || [];
  const orders = serverDbState.data.orders || [];
  const baseUrl = getLocalLanBaseUrl();

  if (text === '/start' || text === 'راهنما' || text === '/help' || text === 'منو') {
    return (
      `👑 به ربات باشگاه مشتریان خوش آمدید!\n\n` +
      `جهت استفاده از خدمات باشگاه، یکی از دستورات زیر را ارسال کنید:\n\n` +
      `🔹 مشاهده کیف پول و صورتحساب:\n` +
      `ارسال کد اشتراک یا شماره موبایل (مثال: 1001 یا 09121234567)\n\n` +
      `🔹 ثبت درخواست شارژ کیف پول / پرداخت:\n` +
      `شارژ [کد اشتراک/موبایل] [مبلغ به تومان] [کد پیگیری]\n` +
      `مثال: شارژ 1001 500000 123456\n\n` +
      `🔹 ثبت درخواست خرید سریع:\n` +
      `سفارش [کد اشتراک/موبایل] [شرح اقلام درخواستی]\n` +
      `مثال: سفارش 1001 ۲ عدد پیتزا مخصوص با پرداخت از کیف پول`
    );
  }

  // Command: شارژ <code/phone> <amount> [tracking]
  if (text.startsWith('شارژ ') || text.startsWith('/pay ')) {
    const parts = text.replace(/^(\/pay|شارژ)\s+/, '').trim().split(/\s+/);
    const codeOrPhone = parts[0] || '';
    const amount = Number(parts[1] || 0);
    const tracking = parts.slice(2).join(' ');

    const customer = customers.find(
      c => String(c.subscriptionCode || '') === codeOrPhone || String(c.phone || '') === codeOrPhone
    );
    if (!customer) {
      return `❌ مشترکی با کد اشتراک یا شماره موبایل «${codeOrPhone}» در باشگاه مشتریان یافت نشد.`;
    }
    if (!amount || amount <= 0) {
      return `⚠️ لطفاً مبلغ شارژ یا پرداخت را به درستی وارد کنید.\nمثال: شارژ ${customer.subscriptionCode} 500000`;
    }

    const tempId = 'BOT-PAY-' + Math.floor(1000 + Math.random() * 9000);
    if (!Array.isArray(serverDbState.data.networkOrders)) serverDbState.data.networkOrders = [];
    serverDbState.data.networkOrders.unshift({
      id: Date.now(),
      tempId,
      tableNumber: 0,
      tableTitle: `شارژ کیف پول ربات (${customer.name})`,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerSubscriptionCode: customer.subscriptionCode,
      requestType: 'wallet_topup',
      topupAmount: amount,
      trackingCode: tracking || undefined,
      notes: `درخواست شارژ کیف پول از طریق ربات به مبلغ ${amount.toLocaleString('fa-IR')} تومان`,
      items: [{ menuItemId: 0, name: `شارژ کیف پول کد #${customer.subscriptionCode}`, price: amount, quantity: 1 }],
      subtotal: amount,
      source: 'bot',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    if (!Array.isArray(serverDbState.data.systemNotifications)) serverDbState.data.systemNotifications = [];
    serverDbState.data.systemNotifications.unshift({
      id: Date.now() + 1,
      type: 'new_order',
      title: `شارژ کیف پول از ربات (#${customer.subscriptionCode})`,
      message: `${customer.name} مبلغ ${amount.toLocaleString('fa-IR')} تومان درخواست شارژ کیف پول ثبت نمود.`,
      category: `bot-pay-${tempId}`,
      targetTab: 'customers',
      isRead: false,
      createdAt: new Date().toISOString()
    });

    serverDbState.version = (serverDbState.version || 0) + 1;
    serverDbState.lastUpdated = Date.now();
    saveServerDb();
    broadcastDbChange();

    return (
      `✅ درخواست شارژ کیف پول / پرداخت شما ثبت و به صندوق ارسال شد.\n\n` +
      `👤 مشترک: ${customer.name} (#${customer.subscriptionCode})\n` +
      `💰 مبلغ اعلامی: ${amount.toLocaleString('fa-IR')} تومان\n` +
      `🔖 کد رهگیری درخواست: ${tempId}`
    );
  }

  // Command: سفارش <code/phone> <description>
  if (text.startsWith('سفارش ') || text.startsWith('/order ')) {
    const parts = text.replace(/^(\/order|سفارش)\s+/, '').trim().split(/\s+/);
    const codeOrPhone = parts[0] || '';
    const orderDesc = parts.slice(1).join(' ');

    const customer = customers.find(
      c => String(c.subscriptionCode || '') === codeOrPhone || String(c.phone || '') === codeOrPhone
    );
    if (!customer) {
      return `❌ مشترکی با کد اشتراک یا شماره موبایل «${codeOrPhone}» یافت نشد.`;
    }
    if (!orderDesc) {
      return `⚠️ لطفاً شرح اقلام سفارش خود را بعد از کد اشتراک بنویسید.\nمثال: سفارش ${customer.subscriptionCode} ۲ عدد پیتزا مخصوص`;
    }

    const tempId = 'BOT-ORD-' + Math.floor(1000 + Math.random() * 9000);
    if (!Array.isArray(serverDbState.data.networkOrders)) serverDbState.data.networkOrders = [];
    serverDbState.data.networkOrders.unshift({
      id: Date.now(),
      tempId,
      tableNumber: 0,
      tableTitle: `سفارش ربات (#${customer.subscriptionCode})`,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerSubscriptionCode: customer.subscriptionCode,
      requestType: 'order',
      paymentMethod: 'wallet',
      notes: `سفارش ثبت شده از ربات باشگاه: ${orderDesc}`,
      items: [{ menuItemId: 0, name: orderDesc, price: 0, quantity: 1 }],
      subtotal: 0,
      source: 'bot',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    if (!Array.isArray(serverDbState.data.systemNotifications)) serverDbState.data.systemNotifications = [];
    serverDbState.data.systemNotifications.unshift({
      id: Date.now() + 1,
      type: 'new_order',
      title: `سفارش خرید از ربات (${customer.name})`,
      message: `شرح سفارش: ${orderDesc}`,
      category: `bot-ord-${tempId}`,
      targetTab: 'pos',
      isRead: false,
      createdAt: new Date().toISOString()
    });

    serverDbState.version = (serverDbState.version || 0) + 1;
    serverDbState.lastUpdated = Date.now();
    saveServerDb();
    broadcastDbChange();

    return (
      `🛍 درخواست خرید شما در صندوق ثبت گردید!\n\n` +
      `👤 مشترک: ${customer.name} (#${customer.subscriptionCode})\n` +
      `📝 شرح سفارش: ${orderDesc}\n` +
      `💳 موجودی کیف پول: ${(customer.walletBalance || 0).toLocaleString('fa-IR')} تومان\n` +
      `🔖 کد پیگیری سفارش: ${tempId}`
    );
  }

  // Lookup by subscription code or mobile phone
  const cleanQuery = text.replace(/^(\/wallet|کیف پول|صورتحساب)\s*/i, '').trim();
  const matchedCustomer = customers.find(
    c =>
      String(c.subscriptionCode || '').trim() === cleanQuery ||
      String(c.phone || '').trim() === cleanQuery
  );

  if (matchedCustomer) {
    const custOrders = orders
      .filter(
        o =>
          o.customerId === matchedCustomer.id ||
          (matchedCustomer.phone && o.customerPhone === matchedCustomer.phone) ||
          (matchedCustomer.subscriptionCode && o.customerSubscriptionCode === matchedCustomer.subscriptionCode)
      )
      .slice(-3);

    const recentOrdersStr =
      custOrders.length > 0
        ? custOrders
            .map(
              o =>
                `• فاکتور #${o.orderNumber}: ${Number(o.total || 0).toLocaleString('fa-IR')} تومان (${
                  o.paymentMethod === 'wallet'
                    ? 'کیف پول'
                    : o.paymentMethod === 'credit'
                    ? 'نسیه'
                    : 'تسویه شده'
                })`
            )
            .join('\n')
        : '• فاکتوری ثبت نشده است.';

    const debtStatus =
      (matchedCustomer.balance || 0) < 0
        ? `${Math.abs(matchedCustomer.balance).toLocaleString('fa-IR')} تومان بدهکار (نسیه)`
        : (matchedCustomer.balance || 0) > 0
        ? `${Number(matchedCustomer.balance).toLocaleString('fa-IR')} تومان بستانکار`
        : 'تسویه کامل (۰ تومان)';

    const portalLink = `${baseUrl}/?mode=wallet&sub=${encodeURIComponent(matchedCustomer.subscriptionCode)}&phone=${encodeURIComponent(matchedCustomer.phone)}`;

    return (
      `👑 صورتحساب و کیف پول باشگاه مشتریان\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 نام مشترک: ${matchedCustomer.name}\n` +
      `🔢 کد اشتراک: #${matchedCustomer.subscriptionCode}\n` +
      `📱 شماره همراه: ${matchedCustomer.phone}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💳 موجودی کیف پول: ${(matchedCustomer.walletBalance || 0).toLocaleString('fa-IR')} تومان\n` +
      `📒 وضعیت حساب نسیه: ${debtStatus}\n` +
      `⭐ امتیاز وفاداری: ${(matchedCustomer.loyaltyPoints || 0).toLocaleString('fa-IR')} امتیاز\n` +
      `🛍 مجموع کل خریدها: ${(matchedCustomer.totalSpent || 0).toLocaleString('fa-IR')} تومان (${matchedCustomer.OrderCount || 0} فاکتور)\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🧾 آخرین فاکتورهای شما:\n${recentOrdersStr}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🔗 لینک مستقیم کیف پول، پرداخت و سفارش آنلاین:\n${portalLink}`
    );
  }

  return null;
}

setInterval(async () => {
  const activeSettings = (serverDbState.data.settings || [])[0];
  if (!activeSettings) return;

  // 1. Poll Bale Bot Updates
  if (activeSettings.baleBotToken) {
    try {
      const cleanToken = String(activeSettings.baleBotToken).trim();
      const res = await fetch(
        `https://tapi.bale.ai/bot${cleanToken}/getUpdates?offset=${lastBaleUpdateId + 1}&limit=10`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.result)) {
          for (const upd of data.result) {
            if (upd.update_id > lastBaleUpdateId) {
              lastBaleUpdateId = upd.update_id;
            }
            const msg = upd.message;
            if (msg && msg.text && msg.chat?.id) {
              const reply = handleBotCustomerCommand(msg.text, msg.chat.id);
              if (reply) {
                await fetch(`https://tapi.bale.ai/bot${cleanToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: String(msg.chat.id), text: reply })
                }).catch(() => {});
              }
            }
          }
        }
      }
    } catch {}
  }

  // 2. Poll Telegram Bot Updates
  if (activeSettings.telegramBotToken) {
    try {
      const cleanToken = String(activeSettings.telegramBotToken).trim();
      const res = await fetch(
        `https://api.telegram.org/bot${cleanToken}/getUpdates?offset=${lastTelegramUpdateId + 1}&limit=10`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.result)) {
          for (const upd of data.result) {
            if (upd.update_id > lastTelegramUpdateId) {
              lastTelegramUpdateId = upd.update_id;
            }
            const msg = upd.message;
            if (msg && msg.text && msg.chat?.id) {
              const reply = handleBotCustomerCommand(msg.text, msg.chat.id);
              if (reply) {
                await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: String(msg.chat.id), text: reply })
                }).catch(() => {});
              }
            }
          }
        }
      }
    } catch {}
  }
}, 6000);

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
