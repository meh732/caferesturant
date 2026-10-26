import express from 'express';
import http from 'http';
import https from 'https';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getHardwareFingerprint, checkServerLicenseStatus, activateServerLicense, computeActivationKey } from './server-license.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || process.argv[2] || '3000', 10);
const customDomain = process.env.DOMAIN || process.env.SERVER_DOMAIN || '';


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

// ------------------------------------------------------------------------------
// Hardware-Locked Server License Endpoints
// ------------------------------------------------------------------------------
app.get('/api/license/status', (req, res) => {
  try {
    const status = checkServerLicenseStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'LICENSE_ERROR', message: err.message });
  }
});

app.post('/api/license/activate', (req, res) => {
  try {
    const { licenseKey } = req.body || {};
    if (!licenseKey) {
      return res.status(400).json({ success: false, message: 'کد فعال‌سازی وارد نشده است.' });
    }
    const result = activateServerLicense(licenseKey);
    if (result.success) {
      console.log(`==============================================================================`);
      console.log(`[LICENSE SUCCESS] Server activated with key: ${licenseKey.toUpperCase()}`);
      console.log(`==============================================================================`);
      broadcastDbChange(false);
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/license/generate-key', (req, res) => {
  try {
    const { machineId } = req.body || {};
    if (!machineId) {
      return res.status(400).json({ success: false, message: 'شناسه سخت‌افزاری وارد نشده است.' });
    }
    const key = computeActivationKey(machineId);
    res.json({ success: true, machineId: machineId.trim().toUpperCase(), activationKey: key });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
  // Guarantee Chart of Accounts always has standard default coding with deterministic IDs and no duplicates
  if (!Array.isArray(serverDbState.data.chartOfAccounts) || serverDbState.data.chartOfAccounts.length === 0) {
    serverDbState.data.chartOfAccounts = DEFAULT_CHART_OF_ACCOUNTS.map(acc => ({
      ...acc,
      id: acc.id || Number(acc.code)
    }));
  } else {
    const byCode = new Map();
    for (const item of serverDbState.data.chartOfAccounts) {
      if (!item || !item.code) continue;
      const codeStr = String(item.code);
      const prev = byCode.get(codeStr);
      byCode.set(codeStr, {
        ...prev,
        ...item,
        id: item.id || prev?.id || Number(codeStr)
      });
    }
    serverDbState.data.chartOfAccounts = Array.from(byCode.values());
  }

  // Guarantee Raw Material Categories always has default categories without duplicates
  if (!Array.isArray(serverDbState.data.rawMaterialCategories) || serverDbState.data.rawMaterialCategories.length === 0) {
    serverDbState.data.rawMaterialCategories = DEFAULT_RAW_MATERIAL_CATEGORIES;
  }

  // Normalize settings to single record with id: 1
  if (Array.isArray(serverDbState.data.settings) && serverDbState.data.settings.length > 0) {
    const merged = serverDbState.data.settings.reduce((acc, item) => ({ ...acc, ...(item || {}) }), {});
    merged.id = 1;
    serverDbState.data.settings = [merged];
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

// Smart merge table records by ID (with singleton & natural-key deduplication where appropriate)
function mergeTableData(existingArr = [], incomingArr = [], deletedIds = [], tableName = '') {
  if (tableName === 'settings') {
    const combined = [
      ...(Array.isArray(existingArr) ? existingArr : []),
      ...(Array.isArray(incomingArr) ? incomingArr : [])
    ].filter(Boolean);
    if (combined.length === 0) return [];
    const merged = combined.reduce((acc, item) => ({ ...acc, ...item }), {});
    merged.id = 1;
    return [merged];
  }

  const deletedSet = new Set((deletedIds || []).map(String));

  if (tableName === 'chartOfAccounts') {
    const byCode = new Map();
    const processList = (list) => {
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (!item || !item.code) continue;
        const idStr = item.id !== undefined ? String(item.id) : '';
        if (idStr && deletedSet.has(idStr)) continue;
        const codeStr = String(item.code);
        const prev = byCode.get(codeStr);
        byCode.set(codeStr, {
          ...prev,
          ...item,
          id: item.id || prev?.id || Number(codeStr)
        });
      }
    };
    processList(existingArr);
    processList(incomingArr);
    return Array.from(byCode.values());
  }

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
          serverDbState.data[tableName] = mergeTableData(existingTable, incomingTable, deletedIds, tableName);
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

    const existingList = Array.isArray(serverDbState.data.settings) ? serverDbState.data.settings : [];
    const existingMerged = existingList.reduce((acc, item) => ({ ...acc, ...(item || {}) }), {});

    const finalSettings = {
      ...existingMerged,
      ...incoming,
      id: 1,
      updatedAt: new Date().toISOString()
    };

    serverDbState.data.settings = [finalSettings];

    serverDbState.version = (serverDbState.version || 0) + 1;
    serverDbState.lastUpdated = Date.now();
    saveServerDb();
    broadcastDbChange();

    res.json({
      status: 'ok',
      version: serverDbState.version,
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

    // Forward notification to configured Telegram & Bale bots (ALL configured admins)
    const activeSettings = (serverDbState.data.settings || [])[0];
    if (activeSettings) {
      const botText = `💳 <b>${notifTitle}</b>\n👤 نام: ${name || '-'}\n📱 موبایل: ${phone || '-'}\n🔢 کد اشتراک: #${subscriptionCode || '-'}\n💰 مبلغ: ${Number(amount || 0).toLocaleString('fa-IR')} تومان\n🧾 کد پیگیری: ${trackingCode || '-'}\n📝 توضیحات: ${note || '-'}`;
      
      // Notify all Bale admins
      if (activeSettings.baleBotToken) {
        const baleAdmins = parseAdminChatIds(activeSettings.baleAdminChatIds, activeSettings.baleChatId);
        for (const adminId of baleAdmins) {
          sendBaleMessageDirect(activeSettings.baleBotToken, adminId, botText).catch(() => {});
        }
      }
      // Notify all Telegram admins
      if (activeSettings.telegramBotToken) {
        const tgAdmins = parseAdminChatIds(activeSettings.telegramAdminChatIds, activeSettings.telegramChatId);
        for (const adminId of tgAdmins) {
          sendTelegramMessageDirect(activeSettings.telegramBotToken, adminId, botText).catch(() => {});
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ------------------------------------------------------------------------------
// 6. MULTI-ADMIN & GLASS BUTTON TELEGRAM & BALE BOT ENGINE
// ------------------------------------------------------------------------------
function parseAdminChatIds(rawIds, fallbackId) {
  const ids = new Set();
  if (fallbackId && String(fallbackId).trim()) {
    ids.add(String(fallbackId).trim());
  }
  if (rawIds && typeof rawIds === 'string') {
    const split = rawIds.split(/[\s,;\n]+/);
    for (const item of split) {
      const clean = item.trim();
      if (clean) ids.add(clean);
    }
  }
  return Array.from(ids);
}

function isChatAdmin(chatId, activeSettings, platform) {
  if (!chatId || !activeSettings) return false;
  const strId = String(chatId).trim();
  if (platform === 'telegram') {
    const adminIds = parseAdminChatIds(activeSettings.telegramAdminChatIds, activeSettings.telegramChatId);
    return adminIds.includes(strId);
  }
  if (platform === 'bale') {
    const adminIds = parseAdminChatIds(activeSettings.baleAdminChatIds, activeSettings.baleChatId);
    return adminIds.includes(strId);
  }
  return false;
}

function getJalaliDateString(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch (e) {
    return d.toISOString().split('T')[0];
  }
}

function getJalaliDateTimeString(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(d);
  } catch (e) {
    return d.toISOString();
  }
}

async function sendTelegramMessageDirect(token, chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: String(chatId).trim(),
    text: String(text || ''),
    parse_mode: 'HTML'
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function sendBaleMessageDirect(token, chatId, text, replyMarkup = null) {
  const cleanText = String(text || '').replace(/<\/?[^>]+(>|$)/g, '');
  const payload = {
    chat_id: String(chatId).trim(),
    text: cleanText
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  try {
    const res = await fetch(`https://tapi.bale.ai/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function answerCallbackQuery(token, platform, queryId) {
  if (!token || !queryId) return;
  const url = platform === 'telegram'
    ? `https://api.telegram.org/bot${token}/answerCallbackQuery`
    : `https://tapi.bale.ai/bot${token}/answerCallbackQuery`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: String(queryId) })
    });
  } catch {}
}

async function sendTelegramDocDirect(token, chatId, caption, buffer, filename) {
  try {
    const formData = new FormData();
    formData.append('chat_id', String(chatId).trim());
    const blob = new Blob([buffer], { type: 'application/json' });
    formData.append('document', blob, filename || 'arka_backup.json');
    if (caption) formData.append('caption', String(caption));
    formData.append('parse_mode', 'HTML');
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function sendBaleDocDirect(token, chatId, caption, buffer, filename) {
  try {
    const formData = new FormData();
    formData.append('chat_id', String(chatId).trim());
    const blob = new Blob([buffer], { type: 'application/json' });
    formData.append('document', blob, filename || 'arka_backup.json');
    if (caption) formData.append('caption', String(caption).replace(/<\/?[^>]+(>|$)/g, ''));
    const res = await fetch(`https://tapi.bale.ai/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ------------------------------------------------------------------------------
// 7. 24/7 AUTONOMOUS BACKUP DISPATCHER
// ------------------------------------------------------------------------------
async function dispatchServerAutoBackup(isManual = false, targetChatId = null, targetPlatform = null) {
  const activeSettings = (serverDbState.data.settings || [])[0];
  if (!activeSettings) return { ok: false, error: 'تنظیمات سیستم در سرور یافت نشد.' };

  const orders = serverDbState.data.orders || [];
  const menuItems = serverDbState.data.menuItems || [];
  const warehouses = serverDbState.data.warehouses || [];

  const backupData = {
    version: serverDbState.version || 1,
    exportedAt: new Date().toISOString(),
    data: serverDbState.data
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  const buffer = Buffer.from(jsonStr, 'utf-8');
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
  const filename = `ArkaPos_Backup_${dateStr}.json`;
  const restaurantName = activeSettings.restaurantName || 'آرکا پوز';
  const jalaliStr = getJalaliDateTimeString(d);
  const modeText = isManual ? '⚡️ درخواست دستی / بات' : '⏱ پشتیبان‌گیری دوره‌ای خودکار ۲۴/۷';

  const caption = `💾 <b>فایل پشتیبان پایگاه داده آرکا (Arka POS)</b>\n\n` +
    `🏢 مجموعه: <b>${restaurantName}</b>\n` +
    `📅 زمان تهیه: <code>${jalaliStr}</code>\n` +
    `🔖 نوع: ${modeText}\n` +
    `📊 آمار: <b>${orders.length}</b> فاکتور | <b>${menuItems.length}</b> محصول | <b>${warehouses.length}</b> انبار\n` +
    `💾 حجم فایل: ${(buffer.length / 1024).toFixed(1)} کیلوبایت\n\n` +
    `🔒 <i>این فایل پایگاه داده کامل سیستم است و قابل بازیابی در هر کلاینت یا سرور آرکا می‌باشد.</i>`;

  let telegramSent = 0;
  let baleSent = 0;
  const errors = [];

  // 1. Telegram
  const tgToken = activeSettings.telegramBotToken?.trim();
  if (tgToken && activeSettings.telegramBackupEnabled !== false) {
    let tgAdmins = parseAdminChatIds(activeSettings.telegramAdminChatIds, activeSettings.telegramChatId);
    if (targetChatId && targetPlatform === 'telegram') {
      const cleanTarget = String(targetChatId).trim();
      tgAdmins = tgAdmins.includes(cleanTarget) ? [cleanTarget] : [];
    }
    for (const chatId of tgAdmins) {
      try {
        const res = await sendTelegramDocDirect(tgToken, chatId, caption, buffer, filename);
        if (res?.ok) telegramSent++;
        else errors.push(`Telegram (${chatId}): ${res?.error || 'ارسال ناموفق'}`);
      } catch (err) {
        errors.push(`Telegram (${chatId}): ${String(err)}`);
      }
    }
  }

  // 2. Bale
  const baleToken = activeSettings.baleBotToken?.trim();
  if (baleToken && activeSettings.baleBackupEnabled !== false) {
    let baleAdmins = parseAdminChatIds(activeSettings.baleAdminChatIds, activeSettings.baleChatId);
    if (targetChatId && targetPlatform === 'bale') {
      const cleanTarget = String(targetChatId).trim();
      baleAdmins = baleAdmins.includes(cleanTarget) ? [cleanTarget] : [];
    }
    for (const chatId of baleAdmins) {
      try {
        const res = await sendBaleDocDirect(baleToken, chatId, caption, buffer, filename);
        if (res?.ok) baleSent++;
        else errors.push(`Bale (${chatId}): ${res?.error || 'ارسال ناموفق'}`);
      } catch (err) {
        errors.push(`Bale (${chatId}): ${String(err)}`);
      }
    }
  }

  const success = (telegramSent + baleSent) > 0;
  if (success || isManual) {
    activeSettings.lastAutoBackupTime = new Date().toISOString();
    serverDbState.version = (serverDbState.version || 0) + 1;
    saveServerDb();
  }

  return { ok: success, telegramSent, baleSent, errors, timestamp: jalaliStr };
}

// REST endpoint for manual or client-triggered bot backup
app.post('/api/bot/backup/dispatch', async (req, res) => {
  try {
    const result = await dispatchServerAutoBackup(true);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Autonomous 24/7 background backup timer (runs in server.js independent of browser or app state)
setInterval(async () => {
  const activeSettings = (serverDbState.data.settings || [])[0];
  if (!activeSettings) return;

  const intervalHours = Number(activeSettings.autoBackupIntervalHours || 6); // default 6h if unset
  if (intervalHours <= 0) return; // 0 means explicitly disabled

  const hasTelegram = Boolean(activeSettings.telegramBotToken && (activeSettings.telegramAdminChatIds || activeSettings.telegramChatId) && (activeSettings.telegramBackupEnabled !== false));
  const hasBale = Boolean(activeSettings.baleBotToken && (activeSettings.baleAdminChatIds || activeSettings.baleChatId) && (activeSettings.baleBackupEnabled !== false));
  if (!hasTelegram && !hasBale) return;

  const lastBackupStr = activeSettings.lastAutoBackupTime;
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const now = Date.now();

  let shouldRun = false;
  if (!lastBackupStr) {
    shouldRun = true;
  } else {
    const lastTime = new Date(lastBackupStr).getTime();
    if (isNaN(lastTime) || (now - lastTime) >= intervalMs) {
      shouldRun = true;
    }
  }

  if (shouldRun) {
    console.log(`[24/7 Server Bot Backup] Autonomous backup triggered (interval: ${intervalHours}h)...`);
    try {
      const res = await dispatchServerAutoBackup(false);
      console.log('[24/7 Server Bot Backup] Result:', res);
    } catch (e) {
      console.error('[24/7 Server Bot Backup] Error:', e);
    }
  }
}, 3 * 60 * 1000); // Check every 3 minutes

// Run once 20 seconds after server boots if scheduled time passed
setTimeout(async () => {
  try {
    const activeSettings = (serverDbState.data.settings || [])[0];
    if (!activeSettings) return;
    const intervalHours = Number(activeSettings.autoBackupIntervalHours || 6);
    if (intervalHours <= 0) return;
    const lastBackupStr = activeSettings.lastAutoBackupTime;
    if (!lastBackupStr || (Date.now() - new Date(lastBackupStr).getTime()) >= intervalHours * 3600000) {
      console.log('[24/7 Server Bot Backup] Boot-time backup check triggered...');
      await dispatchServerAutoBackup(false);
    }
  } catch {}
}, 20000);

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

// ------------------------------------------------------------------------------
// 8. UNIFIED BOT INCOMING DISPATCHER (ADMIN PANEL VS CUSTOMER GLASS BUTTONS)
// ------------------------------------------------------------------------------
async function handleBotIncoming({ text: rawText, chatId, platform, isCallback = false, callbackData = '', queryId = null }) {
  const activeSettings = (serverDbState.data.settings || [])[0] || {};
  const isAdmin = isChatAdmin(chatId, activeSettings, platform);
  const baseUrl = getLocalLanBaseUrl();
  const text = String(rawText || '').trim();
  const action = isCallback ? String(callbackData).trim() : text;
  const token = platform === 'telegram' ? activeSettings.telegramBotToken : activeSettings.baleBotToken;

  if (!token) return;

  // Acknowledge callback queries immediately so user doesn't see endless loading spinner
  if (isCallback && queryId) {
    answerCallbackQuery(token, platform, queryId).catch(() => {});
  }

  // ----------------------------------------------------------------------------
  // A. ADMIN PANEL (Management, Real-time Sales, Stock Alerts, Instant Backups)
  // ----------------------------------------------------------------------------
  if (isAdmin) {
    const restaurantName = activeSettings.restaurantName || 'آرکا پوز';
    const nowJalali = getJalaliDateTimeString();
    const todayJalaliDate = getJalaliDateString();

    // 1. Instant Backup
    if (action === 'adm_backup' || text === '/backup' || text === 'بکاپ') {
      const pendingMsg = platform === 'telegram'
        ? `📦 <b>در حال آماده‌سازی و ارسال فایل پشتیبان پایگاه داده...</b>`
        : `📦 در حال آماده‌سازی و ارسال فایل پشتیبان پایگاه داده...`;

      if (platform === 'telegram') {
        await sendTelegramMessageDirect(token, chatId, pendingMsg);
      } else {
        await sendBaleMessageDirect(token, chatId, pendingMsg);
      }

      // Execute on-demand backup specifically to this admin
      dispatchServerAutoBackup(true, chatId, platform).catch(() => {});
      return;
    }

    // 2. Today's Sales Report
    if (action === 'adm_today' || text === '/sales' || text === 'فروش' || text === 'آمار') {
      const orders = serverDbState.data.orders || [];
      const todayOrders = orders.filter(o => {
        try {
          const ordDate = o.createdAt ? getJalaliDateString(new Date(o.createdAt)) : '';
          return ordDate === todayJalaliDate;
        } catch {
          return false;
        }
      });

      let totalSales = 0;
      let cashTotal = 0;
      let posTotal = 0;
      let walletTotal = 0;
      let creditTotal = 0;

      for (const ord of todayOrders) {
        const val = Number(ord.total || 0);
        totalSales += val;
        if (ord.paymentMethod === 'cash') cashTotal += val;
        else if (ord.paymentMethod === 'pos') posTotal += val;
        else if (ord.paymentMethod === 'wallet') walletTotal += val;
        else if (ord.paymentMethod === 'credit') creditTotal += val;
      }

      const salesReport =
        `📊 <b>گزارش فروش امروز (${todayJalaliDate})</b>\n` +
        `🏢 <b>مجموعه:</b> ${restaurantName}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🧾 <b>تعداد کل فاکتورها:</b> ${todayOrders.length.toLocaleString('fa-IR')}\n` +
        `💰 <b>مجموع فروش کل:</b> <b>${totalSales.toLocaleString('fa-IR')} تومان</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💳 <b>کارتخوان (POS):</b> ${posTotal.toLocaleString('fa-IR')} تومان\n` +
        `💵 <b>نقدی (صندوق):</b> ${cashTotal.toLocaleString('fa-IR')} تومان\n` +
        `👛 <b>کیف پول باشگاه:</b> ${walletTotal.toLocaleString('fa-IR')} تومان\n` +
        `📒 <b>نسیه و حساب دفتری:</b> ${creditTotal.toLocaleString('fa-IR')} تومان\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🕒 <b>زمان گزارش:</b> <code>${nowJalali}</code>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 بروزرسانی آمار', callback_data: 'adm_today' },
            { text: '📦 دریافت بکاپ', callback_data: 'adm_backup' }
          ],
          [
            { text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm_menu' }
          ]
        ]
      };

      if (platform === 'telegram') {
        await sendTelegramMessageDirect(token, chatId, salesReport, keyboard);
      } else {
        await sendBaleMessageDirect(token, chatId, salesReport, keyboard);
      }
      return;
    }

    // 3. Low Stock / Critical Inventory Alert
    if (action === 'adm_stock' || text === '/stock' || text === 'انبار' || text === 'کسری') {
      const inventory = serverDbState.data.inventoryItems || serverDbState.data.ingredients || [];
      const lowStockItems = inventory.filter(item => {
        const cur = Number(item.currentStock || item.stock || 0);
        const min = Number(item.minStock || 5);
        return cur <= min;
      });

      let itemsText = '';
      if (lowStockItems.length === 0) {
        itemsText = '✅ کلیه اقلام انبار دارای موجودی کافی و بالاتر از نقطه سفارش هستند.';
      } else {
        itemsText = lowStockItems.slice(0, 15).map((it, idx) => {
          const cur = Number(it.currentStock || it.stock || 0);
          const min = Number(it.minStock || 5);
          const unit = it.unit || 'عدد';
          return `${idx + 1}. <b>${it.name || it.title}</b>: <code>${cur} ${unit}</code> (حداقل: ${min})`;
        }).join('\n');
        if (lowStockItems.length > 15) {
          itemsText += `\n... و ${lowStockItems.length - 15} قلم کالای دیگر.`;
        }
      }

      const stockReport =
        `⚠️ <b>هشدار موجودی بحرانی انبار</b>\n` +
        `🏢 <b>مجموعه:</b> ${restaurantName}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `تعداد اقلام رو به اتمام: <b>${lowStockItems.length}</b>\n\n` +
        `${itemsText}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🕒 <b>استعلام:</b> <code>${nowJalali}</code>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 بررسی مجدد انبار', callback_data: 'adm_stock' },
            { text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm_menu' }
          ]
        ]
      };

      if (platform === 'telegram') {
        await sendTelegramMessageDirect(token, chatId, stockReport, keyboard);
      } else {
        await sendBaleMessageDirect(token, chatId, stockReport, keyboard);
      }
      return;
    }

    // 4. Pending Online & Network Orders
    if (action === 'adm_orders' || text === '/orders' || text === 'سفارشات') {
      const netOrders = serverDbState.data.networkOrders || [];
      const pending = netOrders.filter(o => o.status === 'pending');

      let listText = '';
      if (pending.length === 0) {
        listText = '✅ در حال حاضر هیچ سفارش آنلاینی در صف انتظار نیست.';
      } else {
        listText = pending.slice(0, 10).map((o, idx) => {
          const tTitle = o.tableTitle || (o.tableNumber ? `میز ${o.tableNumber}` : 'بیرون‌بر / آنلاین');
          const amt = Number(o.subtotal || o.total || 0).toLocaleString('fa-IR');
          const cName = o.customerName || 'مشتری';
          return `${idx + 1}. <b>${tTitle}</b> (${cName}): <b>${amt} تومان</b>\n   یادداشت: ${o.notes || 'سفارش آنلاین'}`;
        }).join('\n\n');
      }

      const ordersReport =
        `🔔 <b>سفارشات آنلاین در انتظار تایید</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `تعداد کل در انتظار: <b>${pending.length}</b>\n\n` +
        `${listText}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🕒 <b>زمان:</b> <code>${nowJalali}</code>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 بروزرسانی سفارشات', callback_data: 'adm_orders' },
            { text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm_menu' }
          ]
        ]
      };

      if (platform === 'telegram') {
        await sendTelegramMessageDirect(token, chatId, ordersReport, keyboard);
      } else {
        await sendBaleMessageDirect(token, chatId, ordersReport, keyboard);
      }
      return;
    }

    // 5. Server Health and Specs
    if (action === 'adm_status' || text === '/status' || text === 'سرور') {
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);
      const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
      const clientsCount = activeWsClients.size;
      const licenseActive = isLicenseValid();

      const statusReport =
        `⚡ <b>وضعیت سلامت و مانیتورینگ سرور آرکا پوز</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🏢 <b>مجموعه:</b> ${restaurantName}\n` +
        `🟢 <b>وضعیت سرور:</b> فعال و آنلاین\n` +
        `⏱ <b>مدت فعالیت مستمر (Uptime):</b> ${hours} ساعت و ${mins} دقیقه\n` +
        `💾 <b>مصرف حافظه رم (RAM):</b> ${memMB} مگابایت\n` +
        `📡 <b>کلاینت‌های متصل زنده:</b> ${clientsCount} کلاینت\n` +
        `🔑 <b>وضعیت لایسنس سخت‌افزاری:</b> ${licenseActive ? '✅ معتبر و فعال' : '⚠️ نیازمند فعال‌سازی'}\n` +
        `🔢 <b>ورژن پایگاه داده سرور:</b> v${serverDbState.version || 1}\n` +
        `🌐 <b>آدرس شبکه محلی (LAN):</b> <code>${baseUrl}</code>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🕒 <b>زمان سرور:</b> <code>${nowJalali}</code>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 استعلام مجدد سلامت', callback_data: 'adm_status' },
            { text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm_menu' }
          ]
        ]
      };

      if (platform === 'telegram') {
        await sendTelegramMessageDirect(token, chatId, statusReport, keyboard);
      } else {
        await sendBaleMessageDirect(token, chatId, statusReport, keyboard);
      }
      return;
    }

    // Default: Executive Admin Main Menu with Glass Buttons
    const orders = serverDbState.data.orders || [];
    const todayOrders = orders.filter(o => {
      try {
        return o.createdAt && getJalaliDateString(new Date(o.createdAt)) === todayJalaliDate;
      } catch {
        return false;
      }
    });
    const todaySum = todayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const inventory = serverDbState.data.inventoryItems || serverDbState.data.ingredients || [];
    const lowCount = inventory.filter(i => Number(i.currentStock || i.stock || 0) <= Number(i.minStock || 5)).length;
    const pendingOrders = (serverDbState.data.networkOrders || []).filter(o => o.status === 'pending').length;

    const adminPanelText =
      `👑 <b>پنل اختصاصی مدیریت آرکا پوز (ویژه مدیران)</b>\n` +
      `🏢 <b>مجموعه:</b> <b>${restaurantName}</b>\n` +
      `📅 <b>امروز:</b> <code>${nowJalali}</code>\n` +
      `────────────────────\n` +
      `💰 <b>فروش امروز:</b> <b>${todaySum.toLocaleString('fa-IR')} تومان</b> (${todayOrders.length} فاکتور)\n` +
      `⚠️ <b>اقلام نیازمند سفارش انبار:</b> <b>${lowCount}</b> قلم کالا\n` +
      `🔔 <b>سفارشات آنلاین منتظر بررسی:</b> <b>${pendingOrders}</b> مورد\n` +
      `⚡ <b>وضعیت سرور:</b> آنلاین و پایدار (24/7)\n` +
      `────────────────────\n` +
      `یکی از عملیات‌های زیر را از طریق دکمه‌های شیشه‌ای انتخاب نمایید:`;

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: '📦 دریافت فوری فایل بکاپ', callback_data: 'adm_backup' },
          { text: '📊 گزارش فروش امروز', callback_data: 'adm_today' }
        ],
        [
          { text: '⚠️ موجودی بحرانی انبار', callback_data: 'adm_stock' },
          { text: '🔔 سفارشات در انتظار', callback_data: 'adm_orders' }
        ],
        [
          { text: '⚡ تست و سلامت سرور', callback_data: 'adm_status' }
        ]
      ]
    };

    if (platform === 'telegram') {
      await sendTelegramMessageDirect(token, chatId, adminPanelText, adminKeyboard);
    } else {
      await sendBaleMessageDirect(token, chatId, adminPanelText, adminKeyboard);
    }
    return;
  }

  // ----------------------------------------------------------------------------
  // B. CUSTOMER CLUB PANEL (Glass Buttons, Digital Menu, Wallet, Club Points)
  // ----------------------------------------------------------------------------
  // Strict Security Isolation: If non-admin attempts any admin command or callback
  if (
    action.startsWith('adm_') ||
    text === '/backup' || text === 'بکاپ' ||
    text === '/sales' || text === 'فروش' ||
    text === '/stock' || text === 'انبار' ||
    text === '/status' || text === 'سرور' ||
    text === '/orders'
  ) {
    const accessDeniedMsg =
      `⛔️ <b>دسترسی غیرمجاز</b>\n\n` +
      `این دستور و امکانات پشتیبان‌گیری و آمار فروش، صرفاً مختص مدیران سیستم می‌باشد.\n` +
      `شما به عنوان مشترک گرامی، می‌توانید از امکانات باشگاه مشتریان استفاده فرمایید:`;

    const customerKeyboard = {
      inline_keyboard: [
        [{ text: '🍽 منوی آنلاین و ثبت سفارش', url: `${baseUrl}/?table=0&portal=menu` }],
        [{ text: '💳 کیف پول و صورتحساب', callback_data: 'cust_wallet' }, { text: '🛍 سفارش‌های اخیر', callback_data: 'cust_orders' }],
        [{ text: '➕ شارژ کیف پول', callback_data: 'cust_topup' }, { text: '⭐ امتیازات وفاداری', callback_data: 'cust_points' }],
        [{ text: 'ℹ️ اطلاعات تماس و ساعات کاری', callback_data: 'cust_info' }]
      ]
    };

    if (platform === 'telegram') {
      await sendTelegramMessageDirect(token, chatId, accessDeniedMsg, customerKeyboard);
    } else {
      await sendBaleMessageDirect(token, chatId, accessDeniedMsg, customerKeyboard);
    }
    return;
  }

  const restaurantName = activeSettings.restaurantName || 'مجموعه ما';
  const customers = serverDbState.data.customers || [];
  const orders = serverDbState.data.orders || [];

  // Find if this chat_id was already linked to a customer
  let matchedCustomer = customers.find(c => {
    if (platform === 'telegram' && c.telegramChatId && String(c.telegramChatId).trim() === String(chatId).trim()) return true;
    if (platform === 'bale' && c.baleChatId && String(c.baleChatId).trim() === String(chatId).trim()) return true;
    return false;
  });

  // Check if user submitted a phone or subscription code to link their account
  const cleanNum = text.replace(/[^\d]/g, '');
  if (!matchedCustomer && (cleanNum.length >= 3 && cleanNum.length <= 11)) {
    const found = customers.find(c =>
      String(c.subscriptionCode || '').trim() === cleanNum ||
      String(c.phone || '').trim().replace(/[^\d]/g, '') === cleanNum
    );
    if (found) {
      matchedCustomer = found;
      // Auto-save the user's Chat ID to their profile for future glass-button clicks
      if (platform === 'telegram') matchedCustomer.telegramChatId = String(chatId).trim();
      if (platform === 'bale') matchedCustomer.baleChatId = String(chatId).trim();
      serverDbState.version = (serverDbState.version || 0) + 1;
      saveServerDb();
      broadcastDbChange();
    }
  }

  // 1. Digital Menu Button (or Action)
  if (action === 'cust_menu_view') {
    const menuMsg =
      `📜 <b>منوی دیجیتال و سفارش آنلاین (${restaurantName})</b>\n\n` +
      `برای مشاهده تصاویر، قیمت‌های بروز و ثبت مستقیم سفارش روی دکمه شیشه‌ای زیر بزنید:`;
    const keyboard = {
      inline_keyboard: [
        [{ text: '🍽 ورود به منوی آنلاین', url: `${baseUrl}/?table=0&portal=menu` }],
        [{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]
      ]
    };
    if (platform === 'telegram') {
      await sendTelegramMessageDirect(token, chatId, menuMsg, keyboard);
    } else {
      await sendBaleMessageDirect(token, chatId, menuMsg, keyboard);
    }
    return;
  }

  // 2. Wallet & Statement Glass Button
  if (action === 'cust_wallet' || text === '/wallet' || text === 'کیف پول' || text === 'صورتحساب') {
    if (!matchedCustomer) {
      const askMsg =
        `💳 <b>استعلام کیف پول و صورتحساب باشگاه</b>\n\n` +
        `برای مشاهده موجودی کیف پول و مانده‌حساب خود، لطفاً <b>شماره موبایل</b> یا <b>کد اشتراک</b> خود را به همین چت ارسال نمایید.\n\n` +
        `مثال: <code>09121234567</code> یا <code>1001</code>`;
      const keyboard = {
        inline_keyboard: [
          [{ text: '➕ شارژ مستقیم کیف پول', callback_data: 'cust_topup' }],
          [{ text: '🔙 بازگشت به منو', callback_data: 'cust_main' }]
        ]
      };
      if (platform === 'telegram') {
        await sendTelegramMessageDirect(token, chatId, askMsg, keyboard);
      } else {
        await sendBaleMessageDirect(token, chatId, askMsg, keyboard);
      }
      return;
    }

    const debtStatus = (matchedCustomer.balance || 0) < 0
      ? `${Math.abs(matchedCustomer.balance).toLocaleString('fa-IR')} تومان بدهکار (نسیه)`
      : (matchedCustomer.balance || 0) > 0
      ? `${Number(matchedCustomer.balance).toLocaleString('fa-IR')} تومان بستانکار`
      : 'تسویه کامل (۰ تومان)';

    const walletCard =
      `👑 <b>کیف پول و صورتحساب باشگاه مشتریان</b>\n` +
      `🏢 <b>مجموعه:</b> ${restaurantName}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>نام مشترک:</b> ${matchedCustomer.name}\n` +
      `🔢 <b>کد اشتراک:</b> <code>#${matchedCustomer.subscriptionCode}</code>\n` +
      `📱 <b>شماره همراه:</b> <code>${matchedCustomer.phone}</code>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🟢 <b>موجودی کیف پول:</b> <b>${Number(matchedCustomer.walletBalance || 0).toLocaleString('fa-IR')} تومان</b>\n` +
      `📒 <b>وضعیت حساب نسیه:</b> ${debtStatus}\n` +
      `⭐ <b>امتیاز وفاداری:</b> ${Number(matchedCustomer.loyaltyPoints || 0).toLocaleString('fa-IR')} امتیاز\n` +
      `🛍 <b>مجموع کل خریدها:</b> ${Number(matchedCustomer.totalSpent || 0).toLocaleString('fa-IR')} تومان\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🔗 برای مشاهده آنلاین و پرداخت روی دکمه زیر کلیک کنید:`;

    const portalUrl = `${baseUrl}/?mode=wallet&sub=${encodeURIComponent(matchedCustomer.subscriptionCode || '')}&phone=${encodeURIComponent(matchedCustomer.phone || '')}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🌐 ورود به پرتال آنلاین کیف پول', url: portalUrl }],
        [
          { text: '🛍 فاکتورهای اخیر من', callback_data: 'cust_orders' },
          { text: '➕ شارژ کیف پول', callback_data: 'cust_topup' }
        ],
        [{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]
      ]
    };

    if (platform === 'telegram') {
      await sendTelegramMessageDirect(token, chatId, walletCard, keyboard);
    } else {
      await sendBaleMessageDirect(token, chatId, walletCard, keyboard);
    }
    return;
  }

  // 3. Customer Recent Orders
  if (action === 'cust_orders' || text === '/myorders' || text === 'فاکتورها') {
    if (!matchedCustomer) {
      const askMsg = `🛍 جهت مشاهده آخرین فاکتورها، لطفاً شماره همراه یا کد اشتراک خود را ارسال فرمایید.`;
      const keyboard = {
        inline_keyboard: [[{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]]
      };
      if (platform === 'telegram') {
        await sendTelegramMessageDirect(token, chatId, askMsg, keyboard);
      } else {
        await sendBaleMessageDirect(token, chatId, askMsg, keyboard);
      }
      return;
    }

    const custOrders = orders
      .filter(o =>
        o.customerId === matchedCustomer.id ||
        (matchedCustomer.phone && o.customerPhone === matchedCustomer.phone) ||
        (matchedCustomer.subscriptionCode && o.customerSubscriptionCode === matchedCustomer.subscriptionCode)
      )
      .slice(-5)
      .reverse();

    let ordersStr = '';
    if (custOrders.length === 0) {
      ordersStr = '• هنوز فاکتوری برای حساب شما ثبت نشده است.';
    } else {
      ordersStr = custOrders.map(o => {
        const dStr = o.createdAt ? getJalaliDateString(new Date(o.createdAt)) : '';
        const payType = o.paymentMethod === 'wallet' ? 'کیف پول' : o.paymentMethod === 'credit' ? 'نسیه' : 'نقدی/کارت';
        return `🧾 <b>فاکتور #${o.orderNumber || '-'}</b> (${dStr})\n💰 مبلغ: <b>${Number(o.total || 0).toLocaleString('fa-IR')} تومان</b> [روش: ${payType}]`;
      }).join('\n────────────────────\n');
    }

    const ordersMsg =
      `🛍 <b>سوابق آخرین فاکتورهای شما</b>\n` +
      `👤 <b>مشترک:</b> ${matchedCustomer.name} (#${matchedCustomer.subscriptionCode})\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${ordersStr}\n` +
      `━━━━━━━━━━━━━━━━━━`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '💳 کیف پول من', callback_data: 'cust_wallet' }],
        [{ text: '📜 ثبت سفارش جدید', url: `${baseUrl}/?table=0&portal=menu` }],
        [{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]
      ]
    };

    if (platform === 'telegram') {
      await sendTelegramMessageDirect(token, chatId, ordersMsg, keyboard);
    } else {
      await sendBaleMessageDirect(token, chatId, ordersMsg, keyboard);
    }
    return;
  }

  // 4. Wallet Top-up Instructions & Portal Link
  if (action === 'cust_topup' || text === '/topup' || text === 'شارژ') {
    const subPart = matchedCustomer?.subscriptionCode ? ` #${matchedCustomer.subscriptionCode}` : '';
    const topupMsg =
      `➕ <b>شارژ آنلاین کیف پول و تسویه صورتحساب</b>\n\n` +
      `جهت شارژ موجودی کیف پول خود${subPart} می‌توانید:\n\n` +
      `۱. از طریق <b>درگاه پرداخت آنلاین</b> روی دکمه شیشه‌ای زیر کلیک نمایید.\n\n` +
      `۲. یا دستور شارژ را مستقیماً در همین چت ارسال نمایید:\n` +
      `<code>شارژ [کد اشتراک] [مبلغ به تومان] [کد پیگیری بانکی]</code>\n\n` +
      `مثال:\n` +
      `<code>شارژ ${matchedCustomer?.subscriptionCode || '1001'} 200000 78654321</code>`;

    const portalUrl = matchedCustomer
      ? `${baseUrl}/?mode=wallet&sub=${encodeURIComponent(matchedCustomer.subscriptionCode)}&phone=${encodeURIComponent(matchedCustomer.phone)}`
      : `${baseUrl}/?mode=wallet`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🌐 ورود به درگاه پرداخت آنلاین', url: portalUrl }],
        [{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]
      ]
    };

    if (platform === 'telegram') {
      await sendTelegramMessageDirect(token, chatId, topupMsg, keyboard);
    } else {
      await sendBaleMessageDirect(token, chatId, topupMsg, keyboard);
    }
    return;
  }

  // 5. Club Points Explanation
  if (action === 'cust_points' || text === '/points' || text === 'امتیاز') {
    const pointsVal = matchedCustomer ? Number(matchedCustomer.loyaltyPoints || 0).toLocaleString('fa-IR') : '۰';
    const pointsMsg =
      `⭐ <b>باشگاه مشتریان و امتیازات وفاداری (${restaurantName})</b>\n\n` +
      (matchedCustomer ? `👤 مشترک گرامی <b>${matchedCustomer.name}</b>\n⭐ امتیاز وفاداری شما: <b>${pointsVal} امتیاز</b>\n\n` : '') +
      `🎁 با هر خرید از مجموعه ما، درصدی از مبلغ به صورت امتیاز وفاداری به کیف پول شما اضافه می‌شود.\n` +
      `شما می‌توانید در خریدهای بعدی از این امتیازها برای دریافت تخفیف‌های ویژه استفاده کنید.`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '💳 استعلام کیف پول', callback_data: 'cust_wallet' }],
        [{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]
      ]
    };

    if (platform === 'telegram') {
      await sendTelegramMessageDirect(token, chatId, pointsMsg, keyboard);
    } else {
      await sendBaleMessageDirect(token, chatId, pointsMsg, keyboard);
    }
    return;
  }

  // 6. Store Info & Contact
  if (action === 'cust_info' || text === '/info' || text === 'اطلاعات' || text === 'تماس') {
    const phone = activeSettings.restaurantPhone || activeSettings.phone || 'ثبت نشده';
    const address = activeSettings.restaurantAddress || activeSettings.address || 'ثبت نشده';
    const hours = activeSettings.workingHours || 'ساعت ۱۰ الی ۲۴';

    const infoMsg =
      `ℹ️ <b>اطلاعات تماس و نشانی ${restaurantName}</b>\n\n` +
      `📍 <b>نشانی:</b> ${address}\n` +
      `📞 <b>شماره تماس:</b> <code>${phone}</code>\n` +
      `🕒 <b>ساعات کاری:</b> ${hours}\n\n` +
      `خوشحالیم که میزبان لحظات خوش شما هستیم!`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🍽 مشاهده منوی آنلاین', url: `${baseUrl}/?table=0&portal=menu` }],
        [{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]
      ]
    };

    if (platform === 'telegram') {
      await sendTelegramMessageDirect(token, chatId, infoMsg, keyboard);
    } else {
      await sendBaleMessageDirect(token, chatId, infoMsg, keyboard);
    }
    return;
  }

  // 7. Direct Top-up Command: شارژ <code/phone> <amount> [tracking]
  if (text.startsWith('شارژ ') || text.startsWith('/pay ')) {
    const parts = text.replace(/^(\/pay|شارژ)\s+/, '').trim().split(/\s+/);
    const codeOrPhone = parts[0] || '';
    const amount = Number(parts[1] || 0);
    const tracking = parts.slice(2).join(' ');

    const customer = customers.find(
      c => String(c.subscriptionCode || '') === codeOrPhone || String(c.phone || '') === codeOrPhone
    );
    if (!customer) {
      const errReply = `❌ مشترکی با کد اشتراک یا شماره موبایل «${codeOrPhone}» یافت نشد.`;
      if (platform === 'telegram') await sendTelegramMessageDirect(token, chatId, errReply);
      else await sendBaleMessageDirect(token, chatId, errReply);
      return;
    }
    if (!amount || amount <= 0) {
      const errReply = `⚠️ لطفاً مبلغ شارژ را به درستی وارد کنید.\nمثال: شارژ ${customer.subscriptionCode} 500000`;
      if (platform === 'telegram') await sendTelegramMessageDirect(token, chatId, errReply);
      else await sendBaleMessageDirect(token, chatId, errReply);
      return;
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
      notes: `درخواست شارژ کیف پول از طریق بات ${platform} به مبلغ ${amount.toLocaleString('fa-IR')} تومان`,
      items: [{ menuItemId: 0, name: `شارژ کیف پول #${customer.subscriptionCode}`, price: amount, quantity: 1 }],
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
      message: `${customer.name} مبلغ ${amount.toLocaleString('fa-IR')} تومان درخواست شارژ کیف پول ثبت کرد.`,
      category: `bot-pay-${tempId}`,
      targetTab: 'customers',
      isRead: false,
      createdAt: new Date().toISOString()
    });

    serverDbState.version = (serverDbState.version || 0) + 1;
    serverDbState.lastUpdated = Date.now();
    saveServerDb();
    broadcastDbChange();

    // Alert all admins
    const alertMsg = `💳 <b>درخواست جدید شارژ کیف پول از ربات</b>\n👤 مشترک: ${customer.name}\n📱 شماره: ${customer.phone}\n🔢 کد اشتراک: #${customer.subscriptionCode}\n💰 مبلغ: ${amount.toLocaleString('fa-IR')} تومان\n🧾 کد پیگیری: ${tracking || '-'}\n🔖 شناسه: ${tempId}`;
    if (activeSettings.baleBotToken) {
      const baleAdmins = parseAdminChatIds(activeSettings.baleAdminChatIds, activeSettings.baleChatId);
      for (const aId of baleAdmins) sendBaleMessageDirect(activeSettings.baleBotToken, aId, alertMsg).catch(() => {});
    }
    if (activeSettings.telegramBotToken) {
      const tgAdmins = parseAdminChatIds(activeSettings.telegramAdminChatIds, activeSettings.telegramChatId);
      for (const aId of tgAdmins) sendTelegramMessageDirect(activeSettings.telegramBotToken, aId, alertMsg).catch(() => {});
    }

    const confirmMsg =
      `✅ <b>درخواست شارژ کیف پول شما ثبت و به صندوق ارسال شد.</b>\n\n` +
      `👤 <b>مشترک:</b> ${customer.name} (#${customer.subscriptionCode})\n` +
      `💰 <b>مبلغ اعلامی:</b> ${amount.toLocaleString('fa-IR')} تومان\n` +
      `🔖 <b>کد رهگیری درخواست:</b> <code>${tempId}</code>`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '💳 استعلام مجدد کیف پول', callback_data: 'cust_wallet' }],
        [{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]
      ]
    };

    if (platform === 'telegram') {
      await sendTelegramMessageDirect(token, chatId, confirmMsg, keyboard);
    } else {
      await sendBaleMessageDirect(token, chatId, confirmMsg, keyboard);
    }
    return;
  }

  // 8. Default: Customer Welcome Screen with Glass Buttons (Inline Keyboard)
  const greetingName = matchedCustomer ? ` ${matchedCustomer.name}` : ' گرامی';
  const customerGreeting =
    `👑 <b>به باشگاه مشتریان ${restaurantName} خوش آمدید!</b>\n\n` +
    `همراه${greetingName}، جهت استفاده از خدمات ویژه، یکی از گزینه‌های شیشه‌ای زیر را انتخاب نمایید:`;

  const customerKeyboard = {
    inline_keyboard: [
      [
        { text: '🍽 مشاهده منوی آنلاین و ثبت سفارش', url: `${baseUrl}/?table=0&portal=menu` }
      ],
      [
        { text: '💳 کیف پول و صورتحساب', callback_data: 'cust_wallet' },
        { text: '🛍 سفارش‌های اخیر من', callback_data: 'cust_orders' }
      ],
      [
        { text: '➕ شارژ کیف پول و پرداخت', callback_data: 'cust_topup' },
        { text: '⭐ امتیازات وفاداری', callback_data: 'cust_points' }
      ],
      [
        { text: 'ℹ️ اطلاعات تماس و ساعات کاری', callback_data: 'cust_info' }
      ]
    ]
  };

  if (platform === 'telegram') {
    await sendTelegramMessageDirect(token, chatId, customerGreeting, customerKeyboard);
  } else {
    await sendBaleMessageDirect(token, chatId, customerGreeting, customerKeyboard);
  }
}

// ------------------------------------------------------------------------------
// 9. CONTINUOUS POLLING LOOPS (SUPPORTING MESSAGES & INLINE KEYBOARD CALLBACKS)
// ------------------------------------------------------------------------------
setInterval(async () => {
  const activeSettings = (serverDbState.data.settings || [])[0];
  if (!activeSettings) return;

  // 1. Poll Bale Bot Updates
  if (activeSettings.baleBotToken) {
    try {
      const cleanToken = String(activeSettings.baleBotToken).trim();
      const res = await fetch(
        `https://tapi.bale.ai/bot${cleanToken}/getUpdates?offset=${lastBaleUpdateId + 1}&limit=15`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.result)) {
          for (const upd of data.result) {
            if (upd.update_id > lastBaleUpdateId) {
              lastBaleUpdateId = upd.update_id;
            }

            // A. Callback query (Glass button click)
            if (upd.callback_query) {
              const cb = upd.callback_query;
              const chatId = cb.message?.chat?.id || cb.from?.id;
              if (chatId) {
                handleBotIncoming({
                  text: cb.data || '',
                  chatId,
                  platform: 'bale',
                  isCallback: true,
                  callbackData: cb.data || '',
                  queryId: cb.id
                }).catch(() => {});
              }
            }
            // B. Regular text message
            else if (upd.message && upd.message.chat?.id) {
              const msg = upd.message;
              handleBotIncoming({
                text: msg.text || '',
                chatId: msg.chat.id,
                platform: 'bale',
                isCallback: false
              }).catch(() => {});
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
        `https://api.telegram.org/bot${cleanToken}/getUpdates?offset=${lastTelegramUpdateId + 1}&limit=15`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.result)) {
          for (const upd of data.result) {
            if (upd.update_id > lastTelegramUpdateId) {
              lastTelegramUpdateId = upd.update_id;
            }

            // A. Callback query (Glass button click)
            if (upd.callback_query) {
              const cb = upd.callback_query;
              const chatId = cb.message?.chat?.id || cb.from?.id;
              if (chatId) {
                handleBotIncoming({
                  text: cb.data || '',
                  chatId,
                  platform: 'telegram',
                  isCallback: true,
                  callbackData: cb.data || '',
                  queryId: cb.id
                }).catch(() => {});
              }
            }
            // B. Regular text message
            else if (upd.message && upd.message.chat?.id) {
              const msg = upd.message;
              handleBotIncoming({
                text: msg.text || '',
                chatId: msg.chat.id,
                platform: 'telegram',
                isCallback: false
              }).catch(() => {});
            }
          }
        }
      }
    } catch {}
  }
}, 5000);

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

// Explicit route for offline standalone Keygen tool
app.get(['/keygen', '/keygen.html'], (req, res) => {
  const p1 = path.join(__dirname, 'public', 'keygen.html');
  const p2 = path.join(__dirname, 'keygen.html');
  const p3 = path.join(distPath, 'keygen.html');
  const target = [p1, p2, p3].find(p => fs.existsSync(p));
  if (target) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(target);
  } else {
    res.status(404).send('فایل keygen.html یافت نشد.');
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

// Certificate detection for optional HTTPS support
let sslOptions = null;
const possibleKeyPaths = [
  process.env.SSL_KEY,
  process.env.SSL_KEY_PATH,
  path.join(__dirname, 'certs', 'key.pem'),
  path.join(__dirname, 'certs', 'privkey.pem'),
  path.join(__dirname, 'certs', 'server.key')
].filter(Boolean);

const possibleCertPaths = [
  process.env.SSL_CERT,
  process.env.SSL_CERT_PATH,
  path.join(__dirname, 'certs', 'cert.pem'),
  path.join(__dirname, 'certs', 'fullchain.pem'),
  path.join(__dirname, 'certs', 'server.crt')
].filter(Boolean);

let keyPathFound = possibleKeyPaths.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
let certPathFound = possibleCertPaths.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

if (keyPathFound && certPathFound) {
  try {
    sslOptions = {
      key: fs.readFileSync(keyPathFound),
      cert: fs.readFileSync(certPathFound)
    };
    console.log(`[SSL] SSL Certificates successfully loaded:`);
    console.log(`      Key:  ${keyPathFound}`);
    console.log(`      Cert: ${certPathFound}`);
  } catch (err) {
    console.error(`[SSL ERROR] Failed reading SSL certificates:`, err.message);
  }
}

// Start HTTP Server
const httpServer = http.createServer(app);
httpServer.listen(port, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  console.log(`==============================================================================`);
  console.log(` Arka POS Network Server successfully running on Port ${port}`);
  const licStatus = checkServerLicenseStatus();
  console.log(` Server Machine ID:  ${licStatus.machineId}`);
  if (licStatus.isActivated) {
    console.log(` License Status:     [ACTIVATED & LOCKED TO THIS HARDWARE]`);
  } else {
    console.log(` License Status:     [AWAITING ACTIVATION - SERVER LOCKED]`);
  }
  console.log(` Real-Time Server-Sent Events (SSE) active for all network devices`);
  if (customDomain) {
    console.log(` Custom Domain: http://${customDomain}:${port}`);
  }
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

// Start HTTPS Server if certificates are present
if (sslOptions) {
  const httpsPort = parseInt(process.env.SSL_PORT || (port === 80 ? '443' : String(port + 443)), 10);
  try {
    const httpsServer = https.createServer(sslOptions, app);
    httpsServer.listen(httpsPort, '0.0.0.0', () => {
      const nets = os.networkInterfaces();
      console.log(` [HTTPS] Secure SSL/TLS Server running on Port ${httpsPort}`);
      if (customDomain) {
        console.log(`   -> https://${customDomain}:${httpsPort}`);
      }
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            console.log(`   -> https://${net.address}:${httpsPort}`);
          }
        }
      }
      console.log(`==============================================================================`);
    });
  } catch (e) {
    console.error(`[HTTPS ERROR] Failed to start HTTPS server:`, e.message);
  }
}

