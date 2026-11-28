import 'dotenv/config';
import express from 'express';
import http from 'http';
import https from 'https';
import path from 'path';
import os from 'os';
import fs from 'fs';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { getHardwareFingerprint, checkServerLicenseStatus, activateServerLicense } from './server-license.js';
import {
  initPostgresStore,
  isPostgresActive,
  saveFullStateToPg,
  upsertTablesToPg,
  recordPgBackupSnapshot,
  generatePgSqlDump,
  restoreSqlDumpToPg,
  getPgStatus,
  closePostgresPool
} from './server-pg.js';
import {
  IRANIAN_POS_DRIVERS,
  testPosTerminalConnection,
  scanLanPosTerminals,
  sendAmountToPosTerminal
} from './pos-terminal-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const ARKA_PERSISTENT_DATA_DIR = (process.env.ARKA_DATA_DIR || '').trim() || path.join(__dirname, 'data');
const NETWORK_CONFIG_FILE = path.join(ARKA_PERSISTENT_DATA_DIR, 'arka-network-config.json');
const WIN_INSTALLER_CONFIG_FILE = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'ArkaPOS', 'installer-config.json')
  : null;

function resolveInitialServerPort() {
  const envOrArg = process.env.PORT || process.argv[2];
  if (envOrArg) {
    const parsed = parseInt(envOrArg, 10);
    if (Number.isInteger(parsed) && parsed >= 80 && parsed <= 65535) return parsed;
  }
  const configCandidates = [NETWORK_CONFIG_FILE, WIN_INSTALLER_CONFIG_FILE].filter(Boolean);
  for (const cfgFile of configCandidates) {
    try {
      if (fs.existsSync(cfgFile)) {
        const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8').replace(/^\uFEFF/, ''));
        const saved = parseInt(cfg?.port ?? cfg?.serverPort, 10);
        if (Number.isInteger(saved) && saved >= 80 && saved <= 65535) return saved;
      }
    } catch {}
  }
  return 3000;
}

let activeServerPort = resolveInitialServerPort();
const activeHttpServers = new Map();
const customDomain = process.env.DOMAIN || process.env.SERVER_DOMAIN || '';
let lastPublicBaseUrl = '';

function isPublicTelegramSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let candidate = rawUrl.trim().replace(/\/+$/, '');
  if (!candidate) return '';
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    const host = (parsed.hostname || '').toLowerCase();
    if (!host || !host.includes('.')) return '';
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return '';
    }
    return parsed.origin;
  } catch {
    return '';
  }
}

function setLastPublicBaseUrl(url) {
  const safe = isPublicTelegramSafeUrl(url);
  if (safe) lastPublicBaseUrl = safe;
  return lastPublicBaseUrl;
}

function persistNodeServerPort(newPort) {
  try {
    if (!fs.existsSync(ARKA_PERSISTENT_DATA_DIR)) fs.mkdirSync(ARKA_PERSISTENT_DATA_DIR, { recursive: true });
    let existing = {};
    if (fs.existsSync(NETWORK_CONFIG_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(NETWORK_CONFIG_FILE, 'utf8').replace(/^\uFEFF/, '')) || {};
      } catch {}
    }
    const nextCfg = { ...existing, port: newPort, serverPort: newPort, updatedAt: new Date().toISOString() };
    fs.writeFileSync(NETWORK_CONFIG_FILE, JSON.stringify(nextCfg, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Port Config] Failed writing arka-network-config.json:', err.message);
  }

  // Keep Windows installer-config.json in sync so background service & upgrades retain the updated port
  if (WIN_INSTALLER_CONFIG_FILE) {
    try {
      const parentDir = path.dirname(WIN_INSTALLER_CONFIG_FILE);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
      let existingWin = {};
      if (fs.existsSync(WIN_INSTALLER_CONFIG_FILE)) {
        try {
          existingWin = JSON.parse(fs.readFileSync(WIN_INSTALLER_CONFIG_FILE, 'utf8').replace(/^\uFEFF/, '')) || {};
        } catch {}
      }
      const nextWin = { ...existingWin, edition: existingWin.edition || 'server', serverPort: newPort, updatedAt: new Date().toISOString() };
      fs.writeFileSync(WIN_INSTALLER_CONFIG_FILE, JSON.stringify(nextWin, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Port Config] Failed updating Windows installer-config.json:', err.message);
    }
  }

  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const rawEnv = fs.readFileSync(envPath, 'utf8');
      const nextEnv = /^PORT\s*=/m.test(rawEnv)
        ? rawEnv.replace(/^PORT\s*=.*$/m, `PORT=${newPort}`)
        : `${rawEnv.replace(/\s*$/, '')}\nPORT=${newPort}\n`;
      fs.writeFileSync(envPath, nextEnv, { encoding: 'utf8', mode: 0o600 });
    }
  } catch (err) {
    console.warn('[Port Config] Failed updating .env PORT:', err.message);
  }
}

function bindNodePortLive(targetPort) {
  return new Promise((resolve, reject) => {
    if (activeHttpServers.has(targetPort)) {
      return resolve({ alreadyListening: true });
    }
    const srv = http.createServer(app);
    const onError = (err) => {
      try { srv.close(); } catch {}
      if (err && err.code === 'EADDRINUSE') {
        reject(new Error(`پورت ${targetPort} در حال حاضر توسط سرویس دیگری اشغال است. لطفاً پورت دیگری انتخاب کنید.`));
      } else if (err && err.code === 'EACCES') {
        reject(new Error(`دسترسی سیستم برای باز کردن پورت ${targetPort} مجاز نیست (پورت بالای 1024 انتخاب کنید یا دسترسی root بدهید).`));
      } else {
        reject(new Error(`خطا در باز کردن پورت ${targetPort}: ${err?.message || err}`));
      }
    };
    srv.once('error', onError);
    srv.listen(targetPort, '0.0.0.0', () => {
      srv.removeListener('error', onError);
      activeHttpServers.set(targetPort, srv);
      console.log(`[PORT] Arka POS Server is now also listening live on Port ${targetPort}`);
      resolve({ alreadyListening: false });
    });
  });
}


app.use(express.json({ limit: '150mb' }));
app.use(express.text({ type: ['application/sql', 'text/plain', 'text/sql'], limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// CORS headers for LAN & cross-device access + capture verified public domain for Bot links
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  try {
    const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const rawProto = String(req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')).split(',')[0].trim().toLowerCase();
    if (rawHost && /^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost) && (rawProto === 'http' || rawProto === 'https')) {
      setLastPublicBaseUrl(`${rawProto}://${rawHost}`);
    }
  } catch {}
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

// ------------------------------------------------------------------------------
// Mandatory Server-Side Hardware License Gate
// Blocks all unactivated access at the server level regardless of cached frontend bundles
// ------------------------------------------------------------------------------
app.use((req, res, next) => {
  const reqPath = req.path || '/';

  // Never serve vendor keygen files over HTTP
  if (reqPath.toLowerCase().includes('keygen') || reqPath.toLowerCase().includes('generate-license')) {
    return res.status(404).send('Not Found');
  }

  // Always allow license check/activation endpoints, health/network info, and static icons/fonts
  if (
    reqPath.startsWith('/api/license') ||
    reqPath === '/api/health' ||
    reqPath === '/api/network/info' ||
    reqPath === '/activate.html' ||
    reqPath === '/public/activate.html' ||
    reqPath === '/sw.js' ||
    reqPath === '/manifest.webmanifest' ||
    reqPath === '/manifest.json' ||
    reqPath.endsWith('.ico') ||
    reqPath.endsWith('.png') ||
    reqPath.endsWith('.svg') ||
    reqPath.endsWith('.woff') ||
    reqPath.endsWith('.woff2') ||
    reqPath.endsWith('.ttf')
  ) {
    return next();
  }

  const licStatus = checkServerLicenseStatus();
  if (licStatus.isActivated) {
    return next();
  }

  // Server is NOT activated!
  // 1. If this is an API call, reject with 403 LICENSE_REQUIRED
  if (reqPath.startsWith('/api/')) {
    return res.status(403).json({
      error: 'LICENSE_REQUIRED',
      isActivated: false,
      machineId: licStatus.machineId,
      message: 'سرور آرکا هنوز فعال‌سازی نشده است. لطفاً ابتدا کلید فعال‌سازی سرور را وارد فرمایید.'
    });
  }

  // 2. If this is a browser navigation request (HTML / root / SPA route), serve the mandatory activation gate directly!
  const acceptHeader = String(req.headers.accept || '');
  if (
    req.method === 'GET' &&
    (reqPath === '/' || reqPath.endsWith('.html') || acceptHeader.includes('text/html') || !reqPath.includes('.'))
  ) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Arka-License-Gate', 'unactivated');
    const activatePagePath = path.join(__dirname, 'public', 'activate.html');
    if (fs.existsSync(activatePagePath)) {
      return res.sendFile(activatePagePath);
    }
  }

  next();
});



// Central Persistent Storage
const dataDir = ARKA_PERSISTENT_DATA_DIR;
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

function ensureDefaultSeedData(targetState = serverDbState) {
  if (!targetState.data || typeof targetState.data !== 'object') {
    targetState.data = {};
  }
  if (!Array.isArray(targetState.data.users) || targetState.data.users.length === 0) {
    targetState.data.isRawClean = true;
    targetState.data.users = [];
    targetState.data.categories = [];
    targetState.data.menuItems = [];
    targetState.data.restaurantTables = [];
    targetState.data.warehouses = [];
    targetState.data.rawMaterials = [];
  }
  // Guarantee Chart of Accounts always has standard default coding with deterministic IDs and no duplicates
  if (!Array.isArray(targetState.data.chartOfAccounts) || targetState.data.chartOfAccounts.length === 0) {
    targetState.data.chartOfAccounts = DEFAULT_CHART_OF_ACCOUNTS.map(acc => ({
      ...acc,
      id: acc.id || Number(acc.code)
    }));
  } else {
    const byCode = new Map();
    for (const item of targetState.data.chartOfAccounts) {
      if (!item || !item.code) continue;
      const codeStr = String(item.code);
      const prev = byCode.get(codeStr);
      byCode.set(codeStr, {
        ...prev,
        ...item,
        id: item.id || prev?.id || Number(codeStr)
      });
    }
    targetState.data.chartOfAccounts = Array.from(byCode.values());
  }

  // Guarantee Raw Material Categories always has default categories without duplicates
  if (!Array.isArray(targetState.data.rawMaterialCategories) || targetState.data.rawMaterialCategories.length === 0) {
    targetState.data.rawMaterialCategories = DEFAULT_RAW_MATERIAL_CATEGORIES;
  }

  // Normalize settings to single record with id: 1
  if (Array.isArray(targetState.data.settings) && targetState.data.settings.length > 0) {
    const merged = targetState.data.settings.reduce((acc, item) => ({ ...acc, ...(item || {}) }), {});
    merged.id = 1;
    targetState.data.settings = [merged];
  }
}

function loadServerDbFromJson() {
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

  ensureDefaultSeedData(serverDbState);
  saveServerDbJsonFallback();
}

function saveServerDbJsonFallback() {
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

function saveServerDb(options = {}) {
  if (isPostgresActive()) {
    const { fullReplace = false, changedTables = null, deletedMap = {}, recordSnapshotType = null } = options || {};
    if (fullReplace || !changedTables) {
      return saveFullStateToPg(serverDbState, { recordSnapshotType }).catch((err) => {
        console.error('[PostgreSQL] Async full save failed:', err.message);
        throw err;
      });
    }
    return upsertTablesToPg(changedTables, deletedMap, {
      version: serverDbState.version,
      lastUpdated: serverDbState.lastUpdated,
      isRawClean: serverDbState.data?.isRawClean === true
    }).catch((err) => {
      console.error('[PostgreSQL] Async incremental save failed:', err.message);
      throw err;
    });
  }
  saveServerDbJsonFallback();
  return Promise.resolve(true);
}

async function initializeDatabase() {
  const pgInit = await initPostgresStore({
    dbFilePath,
    ensureDefaultSeedData
  });

  if (pgInit.active && pgInit.state) {
    serverDbState = pgInit.state;
    ensureDefaultSeedData(serverDbState);
    if (pgInit.migrated) {
      console.log('[Server DB] Existing production data automatically migrated to PostgreSQL with zero data loss.');
    }
  } else {
    loadServerDbFromJson();
  }
}

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

// Central DB Status & PostgreSQL Backup Endpoints
app.get('/api/db/status', async (req, res) => {
  try {
    const status = await getPgStatus(serverDbState);
    res.json({ status: 'ok', ...status });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/db/backup/json', async (req, res) => {
  res.status(410).json({
    error: 'JSON_BACKUP_RETIRED',
    message: 'بکاپ با فرمت JSON به صورت کامل لغو شده است. لطفاً از بکاپ رسمی PostgreSQL (.sql) از مسیر /api/db/backup/sql استفاده نمایید.'
  });
});

app.get('/api/db/backup/sql', async (req, res) => {
  try {
    const { sql, method, recordCount } = await generatePgSqlDump(serverDbState);
    if (isPostgresActive()) {
      await recordPgBackupSnapshot('manual_sql_dump', serverDbState).catch(() => {});
    }
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
    const filename = `ArkaPos_PostgreSQL_Backup_${stamp}.sql`;
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('X-Arka-Dump-Method', method);
    res.setHeader('X-Arka-Record-Count', String(recordCount || 0));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sql);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export PostgreSQL SQL dump', details: err.message });
  }
});

app.post('/api/db/restore/sql', async (req, res) => {
  try {
    const sqlText =
      typeof req.body === 'string'
        ? req.body
        : typeof req.body?.sql === 'string'
        ? req.body.sql
        : '';

    if (!sqlText || !sqlText.trim()) {
      return res.status(400).json({
        status: 'error',
        error: 'محتوای فایل بکاپ SQL ارسال نشده است.'
      });
    }

    const result = await restoreSqlDumpToPg(sqlText, {
      currentVersion: serverDbState.version || 1,
      ensureDefaultSeedData
    });

    serverDbState = result.state;
    if (!isPostgresActive()) {
      await saveServerDb({ fullReplace: true });
    }
    broadcastDbChange();

    res.json({
      status: 'ok',
      version: serverDbState.version,
      lastUpdated: serverDbState.lastUpdated,
      restoredTables: result.restoredTables,
      totalRecords: result.totalRecords,
      stats: result.stats,
      storageEngine: result.storageEngine
    });
  } catch (err) {
    console.error('[PostgreSQL SQL Restore Error]', err.message);
    res.status(400).json({
      status: 'error',
      error: err.message || 'خطا در بازیابی فایل SQL پستگرس'
    });
  }
});

app.post('/api/db/backup/snapshot', async (req, res) => {
  try {
    if (!isPostgresActive()) {
      return res.json({ status: 'ok', engine: 'json-fallback', recorded: false });
    }
    const label = String(req.body?.type || 'manual_snapshot').slice(0, 48);
    const snap = await recordPgBackupSnapshot(label, serverDbState);
    res.json({ status: 'ok', engine: 'postgresql', recorded: true, snapshot: snap });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create PostgreSQL snapshot', details: err.message });
  }
});

// Central DB Sync Endpoints
app.get('/api/db/version', (req, res) => {
  res.json({
    status: 'ok',
    version: serverDbState.version,
    lastUpdated: serverDbState.lastUpdated,
    storageEngine: isPostgresActive() ? 'postgresql' : 'json-fallback'
  });
});

app.get('/api/db/sync', (req, res) => {
  const isRawClean = !!(serverDbState.data && serverDbState.data.isRawClean === true);
  res.json({
    status: 'ok',
    version: serverDbState.version,
    lastUpdated: serverDbState.lastUpdated,
    storageEngine: isPostgresActive() ? 'postgresql' : 'json-fallback',
    isRawClean,
    data: serverDbState.data || {}
  });
});

app.post('/api/db/sync', async (req, res) => {
  try {
    const payload = req.body || {};
    const clientData = payload.data || {};
    const deleted = payload.deleted || {};
    const replaceAll = payload.replaceAll === true;

    if (clientData && typeof clientData === 'object') {
      if (replaceAll) {
        // Save a safety snapshot before full replace/restore
        if (isPostgresActive()) {
          await recordPgBackupSnapshot('pre_restore_auto', serverDbState).catch(() => {});
        }
        const replacedData = {};
        for (const [tableName, rows] of Object.entries(clientData)) {
          if (tableName === 'isRawClean' || tableName === 'version' || tableName === 'exportedAt' || tableName === 'data' || tableName === 'storageEngine' || tableName === 'database') continue;
          if (Array.isArray(rows)) {
            replacedData[tableName] = rows;
          }
        }
        serverDbState.data = replacedData;
        ensureDefaultSeedData(serverDbState);
        serverDbState.version = (serverDbState.version || 0) + 100;
        serverDbState.lastUpdated = Date.now();
        await saveServerDb({ fullReplace: true, recordSnapshotType: 'ui_restore_commit' });
        broadcastDbChange();
      } else {
        const allTableNames = new Set([
          ...Object.keys(serverDbState.data || {}),
          ...Object.keys(clientData),
          ...Object.keys(deleted)
        ]);
        const changedTables = {};

        for (const tableName of allTableNames) {
          if (tableName === 'isRawClean') continue;
          const incomingTable = clientData[tableName];
          const existingTable = serverDbState.data[tableName] || [];
          const deletedIds = deleted[tableName] || [];

          // If client sent table or deletions, merge them
          if (Array.isArray(incomingTable) || deletedIds.length > 0) {
            const merged = mergeTableData(existingTable, incomingTable, deletedIds, tableName);
            serverDbState.data[tableName] = merged;
            changedTables[tableName] = merged;
          }
        }

        if (Array.isArray(serverDbState.data.users) && serverDbState.data.users.length > 0) {
          delete serverDbState.data.isRawClean;
        }

        serverDbState.version = (serverDbState.version || 0) + 1;
        serverDbState.lastUpdated = Date.now();
        await saveServerDb({ changedTables, deletedMap: deleted });
        broadcastDbChange();
      }
    }

    res.json({
      status: 'ok',
      version: serverDbState.version,
      lastUpdated: serverDbState.lastUpdated,
      storageEngine: isPostgresActive() ? 'postgresql' : 'json-fallback',
      isRawClean: !!(serverDbState.data && serverDbState.data.isRawClean === true)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync database', details: String(err) });
  }
});

app.post('/api/db/reset', async (req, res) => {
  try {
    if (isPostgresActive()) {
      await recordPgBackupSnapshot('pre_reset_safety', serverDbState).catch(() => {});
    }
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
    await saveServerDb({ fullReplace: true, recordSnapshotType: 'post_reset' });
    broadcastDbChange(true);
    res.json({ status: 'ok', message: 'Central server database reset successful to 100% raw clean state' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset database', details: String(err) });
  }
});

// -----------------------------------------------------------------------------
// Network APIs (Unified with central database)
// -----------------------------------------------------------------------------

// 1. GET /api/network/info
app.get('/api/network/info', (req, res) => {
  const nets = os.networkInterfaces();
  const physicalIps = [];
  const virtualIps = [];

  for (const name of Object.keys(nets)) {
    const lowerName = name.toLowerCase();
    const isVirtual = lowerName.includes('virtualbox') ||
                      lowerName.includes('vmware') ||
                      lowerName.includes('vethernet') ||
                      lowerName.includes('wsl') ||
                      lowerName.includes('pseudo') ||
                      lowerName.includes('loopback');

    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        const addr = net.address;
        if (addr.startsWith('169.254.') || addr.startsWith('127.') || addr === '0.0.0.0') {
          continue;
        }
        if (isVirtual || addr.startsWith('192.168.56.')) {
          if (!virtualIps.includes(addr)) virtualIps.push(addr);
        } else {
          // Wi-Fi or physical ethernet prioritized
          if (lowerName.includes('wi-fi') || lowerName.includes('wireless') || lowerName.includes('wlan')) {
            physicalIps.unshift(addr);
          } else {
            physicalIps.push(addr);
          }
        }
      }
    }
  }

  // Combined list: Physical Wi-Fi/Ethernet first, then others
  const localIps = [...new Set([...physicalIps, ...virtualIps])];
  if (localIps.length === 0) {
    localIps.push('127.0.0.1');
  }

  res.json({
    status: 'ok',
    localIps,
    port: activeServerPort,
    host: req.headers.host,
    timestamp: Date.now()
  });
});

// 1a. GET /api/health - Lightweight health & engine probe for Electron background daemon & monitoring
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'arka-pos',
    port: activeServerPort,
    dbEngine: isPostgresActive() ? 'postgresql' : 'json-fallback',
    version: serverDbState.version || 1,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// 1b. GET & POST /api/server/port - Read or dynamically change active server listening port
app.get('/api/server/port', (req, res) => {
  res.json({
    ok: true,
    port: activeServerPort,
    listeningPorts: Array.from(activeHttpServers.keys())
  });
});

app.post('/api/server/port', async (req, res) => {
  try {
    const rawPort = req.body?.port;
    const newPort = Number(rawPort);
    if (!Number.isInteger(newPort) || newPort < 80 || newPort > 65535) {
      return res.status(400).json({
        ok: false,
        error: 'شماره پورت نامعتبر است. عدد باید بین 80 تا 65535 باشد.'
      });
    }

    await bindNodePortLive(newPort);
    activeServerPort = newPort;
    persistNodeServerPort(newPort);

    // Sync localServerPort inside central settings record too
    const existingList = Array.isArray(serverDbState.data.settings) ? serverDbState.data.settings : [];
    const existingMerged = existingList.reduce((acc, item) => ({ ...acc, ...(item || {}) }), {});
    serverDbState.data.settings = [{
      ...existingMerged,
      id: 1,
      localServerPort: newPort,
      updatedAt: new Date().toISOString()
    }];
    serverDbState.version = (serverDbState.version || 0) + 1;
    serverDbState.lastUpdated = Date.now();
    await saveServerDb();
    broadcastDbChange();

    res.json({
      ok: true,
      port: newPort,
      liveBound: true,
      listeningPorts: Array.from(activeHttpServers.keys()),
      message: `پورت سرور با موفقیت به ${newPort} تغییر یافت و بلافاصله روی شبکه فعال شد.`
    });
  } catch (err) {
    res.status(409).json({
      ok: false,
      error: err?.message || 'خطا در تغییر پورت سرور'
    });
  }
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

    const safeName = String(fileName || 'ArkaPos_PostgreSQL_Backup.sql');
    const mimeType = safeName.toLowerCase().endsWith('.sql')
      ? 'application/sql; charset=utf-8'
      : 'application/octet-stream';
    const blob = new Blob([fileContent], { type: mimeType });
    const formData = new FormData();
    formData.append('chat_id', cleanChatId);
    formData.append('document', blob, safeName);
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

    const safeName = String(fileName || 'ArkaPos_PostgreSQL_Backup.sql');
    const mimeType = safeName.toLowerCase().endsWith('.sql')
      ? 'application/sql; charset=utf-8'
      : 'application/octet-stream';
    const blob = new Blob([fileContent], { type: mimeType });
    const formData = new FormData();
    formData.append('chat_id', cleanChatId);
    formData.append('document', blob, safeName);
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

app.post('/api/network/orders', async (req, res) => {
  const orderData = req.body;
  if (!orderData) return res.status(400).json({ error: 'Missing order data' });

  orderData.id = orderData.id || Date.now();
  orderData.createdAt = orderData.createdAt || new Date().toISOString();
  orderData.status = orderData.status || 'pending';

  if (!Array.isArray(serverDbState.data.networkOrders)) {
    serverDbState.data.networkOrders = [];
  }
  const existingIdx = serverDbState.data.networkOrders.findIndex(
    (o) => (orderData.tempId && o.tempId === orderData.tempId) || (orderData.id && o.id === orderData.id)
  );
  if (existingIdx >= 0) {
    serverDbState.data.networkOrders[existingIdx] = { ...serverDbState.data.networkOrders[existingIdx], ...orderData };
  } else {
    serverDbState.data.networkOrders.unshift(orderData);
  }
  if (serverDbState.data.networkOrders.length > 200) {
    serverDbState.data.networkOrders.pop();
  }

  // Ensure a staff system notification exists for this network order
  if (!Array.isArray(serverDbState.data.systemNotifications)) {
    serverDbState.data.systemNotifications = [];
  }
  const hasNotif = serverDbState.data.systemNotifications.some(
    (n) => n && n.type === 'new_order' && (
      (orderData.tempId && n.metadata?.tempId === orderData.tempId) ||
      (orderData.id && n.metadata?.orderId === orderData.id)
    )
  );
  if (!hasNotif) {
    const itemsLen = Array.isArray(orderData.items) ? orderData.items.length : 0;
    const subtotalNum = Number(orderData.subtotal || 0);
    serverDbState.data.systemNotifications.unshift({
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: 'new_order',
      title: `سفارش جدید از ${orderData.tableTitle || `میز ${orderData.tableNumber || 1}`}`,
      message: `${itemsLen} قلم کالا به ارزش ${subtotalNum.toLocaleString('en-US')} ثبت شد.`,
      category: `order-${orderData.tempId || orderData.id}`,
      targetTab: 'pos',
      metadata: { orderId: orderData.id, tempId: orderData.tempId },
      isRead: false,
      createdAt: orderData.createdAt
    });
  }

  serverDbState.version = (serverDbState.version || 0) + 1;
  serverDbState.lastUpdated = Date.now();
  await saveServerDb({
    changedTables: {
      networkOrders: serverDbState.data.networkOrders,
      systemNotifications: serverDbState.data.systemNotifications
    }
  }).catch(() => {});
  broadcastDbChange();

  res.status(201).json({ status: 'ok', order: orderData });
});

app.post('/api/network/orders/status', async (req, res) => {
  const {
    id,
    tempId,
    status,
    completedOrderId,
    completedInvoiceNumber,
    customerName,
    customerPhone,
    customerSubscriptionCode
  } = req.body || {};
  if (Array.isArray(serverDbState.data.networkOrders)) {
    const found = serverDbState.data.networkOrders.find(
      (o) =>
        (id !== undefined && id !== null && (o.id === id || o.tempId === id)) ||
        (tempId && o.tempId === tempId)
    );
    if (found) {
      // Never allow downgrading an already invoiced/completed order
      if (found.status === 'completed' && status !== 'completed') {
        return res.json({
          status: 'already_completed',
          completedOrderId: found.completedOrderId,
          completedInvoiceNumber: found.completedInvoiceNumber
        });
      }

      found.status = status;
      if (status === 'accepted' && !found.acceptedAt) found.acceptedAt = new Date().toISOString();
      if (status === 'completed' && !found.completedAt) found.completedAt = new Date().toISOString();
      if (completedOrderId !== undefined) found.completedOrderId = completedOrderId;
      if (completedInvoiceNumber !== undefined) found.completedInvoiceNumber = completedInvoiceNumber;
      if (customerName) found.customerName = customerName;
      if (customerPhone) found.customerPhone = customerPhone;
      if (customerSubscriptionCode) found.customerSubscriptionCode = customerSubscriptionCode;

      if (Array.isArray(serverDbState.data.systemNotifications) && (status === 'accepted' || status === 'completed' || status === 'rejected')) {
        for (const n of serverDbState.data.systemNotifications) {
          if (n && n.type === 'new_order' && ((found.tempId && n.metadata?.tempId === found.tempId) || (found.id && n.metadata?.orderId === found.id))) {
            n.isRead = true;
          }
        }
      }

      serverDbState.version = (serverDbState.version || 0) + 1;
      serverDbState.lastUpdated = Date.now();
      await saveServerDb({
        changedTables: {
          networkOrders: serverDbState.data.networkOrders,
          systemNotifications: serverDbState.data.systemNotifications || []
        }
      }).catch(() => {});
      broadcastDbChange();
    }
  }
  res.json({ status: 'ok' });
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
function normalizeBotDigits(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

function normalizeIranPhone(input) {
  let digits = normalizeBotDigits(input).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0098') && digits.length >= 14) {
    digits = '0' + digits.slice(4);
  } else if (digits.startsWith('98') && digits.length === 12) {
    digits = '0' + digits.slice(2);
  } else if (digits.startsWith('9') && digits.length === 10) {
    digits = '0' + digits;
  }
  return digits;
}

function escapeTelegramHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseAdminChatIds(rawIds, fallbackId) {
  const ids = new Set();
  const tryAdd = (val) => {
    const clean = normalizeBotDigits(val).trim();
    if (/^-?\d{4,20}$/.test(clean)) {
      ids.add(clean);
    }
  };
  if (fallbackId !== null && fallbackId !== undefined) {
    tryAdd(fallbackId);
  }
  if (rawIds && typeof rawIds === 'string') {
    const split = rawIds.split(/[\s,;\n]+/);
    for (const item of split) {
      tryAdd(item);
    }
  }
  return Array.from(ids);
}

function isChatAdmin(chatId, activeSettings, platform) {
  if (chatId === null || chatId === undefined || !activeSettings) return false;
  const strId = normalizeBotDigits(chatId).trim();
  if (!/^-?\d{4,20}$/.test(strId)) return false;
  if (platform === 'telegram') {
    const adminIds = parseAdminChatIds(activeSettings.telegramAdminChatIds, activeSettings.telegramChatId);
    return adminIds.length > 0 && adminIds.includes(strId);
  }
  if (platform === 'bale') {
    const adminIds = parseAdminChatIds(activeSettings.baleAdminChatIds, activeSettings.baleChatId);
    return adminIds.length > 0 && adminIds.includes(strId);
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
    const safeName = filename || 'ArkaPos_PostgreSQL_Backup.sql';
    const mimeType = safeName.toLowerCase().endsWith('.sql')
      ? 'application/sql; charset=utf-8'
      : 'application/octet-stream';
    const formData = new FormData();
    formData.append('chat_id', String(chatId).trim());
    const blob = new Blob([buffer], { type: mimeType });
    formData.append('document', blob, safeName);
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
    const safeName = filename || 'ArkaPos_PostgreSQL_Backup.sql';
    const mimeType = safeName.toLowerCase().endsWith('.sql')
      ? 'application/sql; charset=utf-8'
      : 'application/octet-stream';
    const formData = new FormData();
    formData.append('chat_id', String(chatId).trim());
    const blob = new Blob([buffer], { type: mimeType });
    formData.append('document', blob, safeName);
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
// 7. 24/7 AUTONOMOUS POSTGRESQL (.SQL) BACKUP DISPATCHER
// ------------------------------------------------------------------------------
async function dispatchServerAutoBackup(isManual = false, targetChatId = null, targetPlatform = null) {
  const activeSettings = (serverDbState.data.settings || [])[0];
  if (!activeSettings) return { ok: false, error: 'تنظیمات سیستم در سرور یافت نشد.' };

  const pgActive = isPostgresActive();
  const { sql, method, recordCount } = await generatePgSqlDump(serverDbState);
  if (pgActive) {
    await recordPgBackupSnapshot(isManual ? 'bot_manual_sql' : 'bot_scheduled_sql', serverDbState).catch(() => {});
  }

  const liveData = serverDbState.data || {};
  const orders = liveData.orders || [];
  const menuItems = liveData.menuItems || [];
  const warehouses = liveData.warehouses || [];
  const recipes = liveData.recipes || [];

  const buffer = Buffer.from(sql, 'utf-8');
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
  const filename = `ArkaPos_PostgreSQL_Backup_${dateStr}.sql`;
  const restaurantName = activeSettings.restaurantName || 'آرکا پوز';
  const jalaliStr = getJalaliDateTimeString(d);
  const modeText = isManual ? '⚡️ درخواست دستی / بات' : '⏱ پشتیبان‌گیری دوره‌ای خودکار ۲۴/۷';
  const engineLabel = pgActive ? '🐘 PostgreSQL (تراکنشی ACID)' : '🐘 PostgreSQL SQL Dump';

  const caption = `💾 <b>فایل پشتیبان رسمی PostgreSQL آرکا (.sql)</b>\n\n` +
    `🏢 مجموعه: <b>${restaurantName}</b>\n` +
    `🗄 موتور دیتابیس: <b>${engineLabel}</b>\n` +
    `📄 فرمت فایل: <code>PostgreSQL SQL (.sql)</code>\n` +
    `📅 زمان تهیه: <code>${jalaliStr}</code>\n` +
    `🔖 نوع: ${modeText}\n` +
    `📊 آمار: <b>${orders.length}</b> فاکتور | <b>${menuItems.length}</b> محصول | <b>${recipes.length}</b> فرمول | <b>${warehouses.length}</b> انبار | کل رکوردها: <b>${recordCount}</b>\n` +
    `💾 حجم فایل: ${(buffer.length / 1024).toFixed(1)} کیلوبایت\n\n` +
    `🔒 <i>این فایل دامپ کامل و تراکنشی PostgreSQL است و مستقیماً در تنظیمات آرکا (بخش بازیابی) و دستور psql قابل بازگردانی می‌باشد.</i>`;

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
    await saveServerDb({ changedTables: { settings: serverDbState.data.settings } }).catch(() => {});
  }

  return {
    ok: success,
    telegramSent,
    baleSent,
    errors,
    storageEngine: pgActive ? 'postgresql' : 'json-fallback',
    timestamp: jalaliStr
  };
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

// ------------------------------------------------------------------------------
// 7b. IRANIAN LAN BANK POS TERMINALS (PC-POS TCP & HTTP BRIDGE)
// ------------------------------------------------------------------------------
app.get('/api/pos-terminal/drivers', (req, res) => {
  res.json({ ok: true, drivers: IRANIAN_POS_DRIVERS });
});

app.post('/api/pos-terminal/test', async (req, res) => {
  try {
    const result = await testPosTerminalConnection(req.body || {});
    res.status(result.ok ? 200 : 200).json(result);
  } catch (err) {
    res.status(400).json({ ok: false, reachable: false, message: err?.message || 'خطا در بررسی اتصال کارتخوان' });
  }
});

app.post('/api/pos-terminal/scan', async (req, res) => {
  try {
    const result = await scanLanPosTerminals({ customSubnetBase: req.body?.customSubnetBase });
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || 'خطا در جستجوی کارتخوان در شبکه' });
  }
});

app.post('/api/pos-terminal/pay', async (req, res) => {
  try {
    const result = await sendAmountToPosTerminal(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({
      ok: false,
      status: 'error',
      message: err?.message || 'خطا در ارسال مبلغ به دستگاه کارتخوان'
    });
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
}, 3 * 60 * 1000).unref(); // Check every 3 minutes

// Run once 20 seconds after server boots if scheduled time passed
if (process.env.ARKA_SKIP_LISTEN !== '1') {
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
  }, 20000).unref();
}

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
        return `http://${net.address}:${activeServerPort}`;
      }
    }
  }
  return `http://localhost:${activeServerPort}`;
}

function getPublicCustomerBaseUrl(activeSettings) {
  const candidates = [
    activeSettings?.localServerUrl,
    activeSettings?.website,
    customDomain ? `https://${customDomain}` : '',
    lastPublicBaseUrl
  ];
  for (const c of candidates) {
    const safe = isPublicTelegramSafeUrl(c);
    if (safe) return safe;
  }
  return '';
}

const CUSTOMER_TIER_LABELS_BOT = {
  bronze: 'برنزی 🥉',
  silver: 'نقره‌ای 🥈',
  gold: 'طلایی 🥇',
  vip: 'VIP ویژه 👑'
};

const CUSTOMER_ADMIN_BLOCKED_EXACT = new Set([
  '/backup', 'بکاپ', 'پشتیبان', 'بکاپ فوری', 'دریافت بکاپ',
  '/sales', 'فروش', 'آمار', 'آمار فروش', 'فروش امروز',
  '/report', '/reports', 'گزارش', 'گزارشات',
  '/stock', '/inventory', 'انبار', 'کسری', 'موجودی انبار', 'کسری انبار',
  '/orders', 'سفارشات', 'سفارشات آنلاین', 'سفارشات شبکه',
  '/status', 'سرور', 'سلامت سرور', 'وضعیت سرور',
  '/admin', '/panel', 'ادمین', 'مدیریت', 'پنل مدیریت', 'پنل ادمین',
  '/accounting', '/finance', 'حسابداری', 'مالی', 'صندوق', 'دفتر کل',
  '/users', 'کاربران', 'پرسنل',
  '/settings', 'تنظیمات',
  '/license', 'لایسنس',
  '/restore', 'بازیابی'
]);

function isCustomerBlockedAdminAttempt(action, text) {
  const actLower = String(action || '').trim().toLowerCase();
  const txtLower = normalizeBotDigits(text || '').trim().toLowerCase();
  if (actLower.startsWith('adm_')) return true;
  if (CUSTOMER_ADMIN_BLOCKED_EXACT.has(actLower) || CUSTOMER_ADMIN_BLOCKED_EXACT.has(txtLower)) return true;
  const firstWord = txtLower.split(/\s+/)[0] || '';
  if (firstWord && CUSTOMER_ADMIN_BLOCKED_EXACT.has(firstWord)) return true;
  return false;
}

function getCustomerMatchedOrders(orders, customer) {
  if (!Array.isArray(orders) || !customer) return [];
  const custPhoneNorm = normalizeIranPhone(customer.phone || '');
  const custSubNorm = normalizeBotDigits(customer.subscriptionCode || '').trim();
  return orders
    .filter((o) => {
      if (!o || o.status === 'cancelled') return false;
      if (customer.id !== undefined && o.customerId !== undefined && Number(o.customerId) === Number(customer.id)) {
        return true;
      }
      if (custPhoneNorm && normalizeIranPhone(o.customerPhone || '') === custPhoneNorm) {
        return true;
      }
      if (custSubNorm && normalizeBotDigits(o.customerSubscriptionCode || '').trim() === custSubNorm) {
        return true;
      }
      return false;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function buildCustomerMainKeyboard(publicBaseUrl, matchedCustomer) {
  const rows = [];
  if (publicBaseUrl) {
    rows.push([{ text: '🍽 مشاهده منوی آنلاین و ثبت سفارش', url: `${publicBaseUrl}/?mode=menu` }]);
  } else {
    rows.push([{ text: '🍽 مشاهده منوی آنلاین و ثبت سفارش', callback_data: 'cust_menu_view' }]);
  }
  rows.push([
    { text: '💳 کیف پول و صورتحساب', callback_data: 'cust_wallet' },
    { text: '🛍 سفارش‌های اخیر من', callback_data: 'cust_orders' }
  ]);
  rows.push([
    { text: '➕ شارژ کیف پول و پرداخت', callback_data: 'cust_topup' },
    { text: '⭐ امتیازات وفاداری', callback_data: 'cust_points' }
  ]);
  rows.push([
    { text: 'ℹ️ اطلاعات تماس و ساعات کاری', callback_data: 'cust_info' }
  ]);
  if (matchedCustomer) {
    rows.push([
      { text: '🔄 خروج / تغییر شماره اشتراک', callback_data: 'cust_unlink' }
    ]);
  }
  return { inline_keyboard: rows };
}

// ------------------------------------------------------------------------------
// 8. UNIFIED BOT INCOMING DISPATCHER (ADMIN PANEL VS CUSTOMER GLASS BUTTONS)
// ------------------------------------------------------------------------------
async function handleBotIncoming({
  text: rawText,
  chatId,
  platform,
  isCallback = false,
  callbackData = '',
  queryId = null,
  contactPhone = '',
  sendFn = null
}) {
  const activeSettings = (serverDbState.data.settings || [])[0] || {};
  const isAdmin = isChatAdmin(chatId, activeSettings, platform);
  const baseUrl = getLocalLanBaseUrl();
  const publicBaseUrl = getPublicCustomerBaseUrl(activeSettings);
  const text = String(rawText || '').trim();
  const normalizedText = normalizeBotDigits(text).trim();
  const action = isCallback ? String(callbackData).trim() : text;
  const token = platform === 'telegram' ? activeSettings.telegramBotToken : activeSettings.baleBotToken;

  if (!token && !sendFn) return;

  const sendMessage = async (msgText, replyMarkup = null) => {
    if (typeof sendFn === 'function') {
      return sendFn({ platform, chatId: String(chatId).trim(), text: msgText, replyMarkup });
    }
    if (platform === 'telegram') {
      return sendTelegramMessageDirect(token, chatId, msgText, replyMarkup);
    }
    return sendBaleMessageDirect(token, chatId, msgText, replyMarkup);
  };

  // Acknowledge callback queries immediately so user doesn't see endless loading spinner
  if (isCallback && queryId && token && !sendFn) {
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
      const clientsCount = sseClients.length;
      const licenseActive = checkServerLicenseStatus().isActivated;
      const dbEngineText = isPostgresActive() ? '🐘 PostgreSQL (متصل و فعال)' : '📄 فایل JSON محلی';

      const statusReport =
        `⚡ <b>وضعیت سلامت و مانیتورینگ سرور آرکا پوز</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🏢 <b>مجموعه:</b> ${restaurantName}\n` +
        `🟢 <b>وضعیت سرور:</b> فعال و آنلاین\n` +
        `🗄 <b>موتور دیتابیس:</b> ${dbEngineText}\n` +
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
  // B. CUSTOMER CLUB PANEL (STRICT CUSTOMER-ONLY ACCESS — NO ADMIN DATA/COMMANDS)
  // ----------------------------------------------------------------------------
  const restaurantName = escapeTelegramHtml(activeSettings.restaurantName || 'مجموعه ما');
  const customers = Array.isArray(serverDbState.data.customers) ? serverDbState.data.customers : [];
  const orders = Array.isArray(serverDbState.data.orders) ? serverDbState.data.orders : [];
  const chatIdStr = normalizeBotDigits(chatId).trim();

  // Find if this chat_id was already linked to a customer
  let matchedCustomer = customers.find((c) => {
    if (platform === 'telegram' && c.telegramChatId && normalizeBotDigits(c.telegramChatId).trim() === chatIdStr) return true;
    if (platform === 'bale' && c.baleChatId && normalizeBotDigits(c.baleChatId).trim() === chatIdStr) return true;
    return false;
  });

  // Strict Security Isolation: non-admins can NEVER access ANY admin/management/sales/inventory/accounting/backup command or callback
  if (isCustomerBlockedAdminAttempt(action, normalizedText)) {
    const accessDeniedMsg =
      `⛔️ <b>دسترسی محدود به بخش باشگاه مشتریان</b>\n\n` +
      `امکانات مدیریتی، گزارش‌های فروش، انبار، حسابداری و پشتیبان‌گیری فقط برای مدیران سامانه مجاز است.\n` +
      `شما از طریق این ربات به خدمات اختصاصی <b>باشگاه مشتریان ${restaurantName}</b> دسترسی دارید:`;

    await sendMessage(accessDeniedMsg, buildCustomerMainKeyboard(publicBaseUrl, matchedCustomer));
    return;
  }

  // 0. Unlink / Switch Customer Account
  if (action === 'cust_unlink' || normalizedText === '/unlink' || normalizedText === 'خروج') {
    if (matchedCustomer) {
      if (platform === 'telegram') delete matchedCustomer.telegramChatId;
      if (platform === 'bale') delete matchedCustomer.baleChatId;
      matchedCustomer = undefined;
      serverDbState.version = (serverDbState.version || 0) + 1;
      await saveServerDb({ changedTables: { customers: serverDbState.data.customers } }).catch(() => {});
      broadcastDbChange();
    }
    const unlinkMsg =
      `🔄 <b>اتصال حساب شما قطع شد.</b>\n\n` +
      `برای اتصال مجدد یا ورود با شماره دیگر، کافی است <b>شماره موبایل</b> یا <b>کد اشتراک</b> خود را ارسال فرمایید.`;
    await sendMessage(unlinkMsg, buildCustomerMainKeyboard(publicBaseUrl, null));
    return;
  }

  // Helper to render the Customer Wallet & Club Summary Card
  const sendWalletSummary = async (cust, headerPrefix = '') => {
    const custOrders = getCustomerMatchedOrders(orders, cust);
    const computedTotalSpent = custOrders.length > 0
      ? custOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
      : Number(cust.totalSpent || 0);
    const tierLabel = CUSTOMER_TIER_LABELS_BOT[cust.tier || 'bronze'] || 'برنزی 🥉';
    const balanceVal = Number(cust.balance || 0);
    const debtStatus = balanceVal < 0
      ? `${Math.abs(balanceVal).toLocaleString('fa-IR')} تومان بدهکار (نسیه)`
      : balanceVal > 0
      ? `${balanceVal.toLocaleString('fa-IR')} تومان بستانکار`
      : 'تسویه کامل (۰ تومان)';

    const walletCard =
      (headerPrefix ? `${headerPrefix}\n\n` : '') +
      `👑 <b>کیف پول و صورتحساب باشگاه مشتریان</b>\n` +
      `🏢 <b>مجموعه:</b> ${restaurantName}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>نام مشترک:</b> ${escapeTelegramHtml(cust.name || 'مشتری گرامی')}\n` +
      `🏅 <b>سطح عضویت:</b> ${tierLabel}\n` +
      `🔢 <b>کد اشتراک:</b> <code>#${escapeTelegramHtml(cust.subscriptionCode || '-')}</code>\n` +
      `📱 <b>شماره همراه:</b> <code>${escapeTelegramHtml(cust.phone || '-')}</code>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🟢 <b>موجودی کیف پول:</b> <b>${Number(cust.walletBalance || 0).toLocaleString('fa-IR')} تومان</b>\n` +
      `📒 <b>وضعیت حساب نسیه:</b> ${debtStatus}\n` +
      `⭐ <b>امتیاز وفاداری:</b> ${Number(cust.loyaltyPoints || 0).toLocaleString('fa-IR')} امتیاز\n` +
      `🧾 <b>تعداد خریدهای ثبت‌شده:</b> ${custOrders.length.toLocaleString('fa-IR')} فاکتور\n` +
      `🛍 <b>مجموع کل خریدها:</b> ${computedTotalSpent.toLocaleString('fa-IR')} تومان\n` +
      `━━━━━━━━━━━━━━━━━━`;

    const rows = [];
    if (publicBaseUrl) {
      const portalUrl = `${publicBaseUrl}/?mode=wallet&sub=${encodeURIComponent(cust.subscriptionCode || '')}&phone=${encodeURIComponent(cust.phone || '')}`;
      rows.push([{ text: '🌐 ورود به پرتال آنلاین کیف پول', url: portalUrl }]);
    }
    rows.push([
      { text: '🛍 فاکتورهای اخیر من', callback_data: 'cust_orders' },
      { text: '➕ شارژ کیف پول', callback_data: 'cust_topup' }
    ]);
    rows.push([{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]);

    await sendMessage(walletCard, { inline_keyboard: rows });
  };

  // Check if user submitted a phone number (text or shared contact) or subscription code to link their account
  const linkCandidateRaw = contactPhone ? String(contactPhone) : (!isCallback ? normalizedText : '');
  const isCommandOrTopup = /^(\/|شارژ\s)/i.test(linkCandidateRaw);
  const cleanDigits = normalizeBotDigits(linkCandidateRaw).replace(/[^\d]/g, '');
  const cleanPhone = normalizeIranPhone(linkCandidateRaw);
  const looksLikeIdentifier = !isCallback && !isCommandOrTopup && cleanDigits.length >= 3 && cleanDigits.length <= 14 && /^[\s+#\-()0-9]+$/.test(linkCandidateRaw);

  if (!matchedCustomer && (Boolean(contactPhone) || looksLikeIdentifier)) {
    const found = customers.find((c) => {
      const subNorm = normalizeBotDigits(c.subscriptionCode || '').trim();
      const phoneNorm = normalizeIranPhone(c.phone || '');
      if (subNorm && subNorm === cleanDigits) return true;
      if (phoneNorm && (phoneNorm === cleanPhone || phoneNorm === cleanDigits)) return true;
      return false;
    });

    if (found) {
      matchedCustomer = found;
      if (platform === 'telegram') matchedCustomer.telegramChatId = chatIdStr;
      if (platform === 'bale') matchedCustomer.baleChatId = chatIdStr;
      serverDbState.version = (serverDbState.version || 0) + 1;
      await saveServerDb({ changedTables: { customers: serverDbState.data.customers } }).catch(() => {});
      broadcastDbChange();

      await sendWalletSummary(
        matchedCustomer,
        `✅ <b>حساب باشگاه مشتریان شما با موفقیت متصل شد!</b>`
      );
      return;
    } else {
      const notFoundMsg =
        `❌ <b>مشترکی با شماره یا کد اشتراک «${escapeTelegramHtml(linkCandidateRaw)}» در باشگاه مشتریان یافت نشد.</b>\n\n` +
        `لطفاً شماره موبایل ثبت‌شده هنگام خرید (مثلاً <code>09121234567</code>) یا کد اشتراک خود را دقیق وارد نمایید، یا از صندوق مجموعه بخواهید شماره شما را در باشگاه مشتریان ثبت کند.`;
      await sendMessage(notFoundMsg, buildCustomerMainKeyboard(publicBaseUrl, null));
      return;
    }
  }

  // 1. Digital Menu Button (or Action)
  if (action === 'cust_menu_view' || normalizedText === '/menu' || normalizedText === 'منو') {
    const menuUrlText = publicBaseUrl
      ? `برای مشاهده تصاویر، قیمت‌های بروز و ثبت مستقیم سفارش روی دکمه شیشه‌ای زیر بزنید:`
      : `آدرس منوی دیجیتال در شبکه داخلی:\n<code>${escapeTelegramHtml(baseUrl)}/?mode=menu</code>`;
    const menuMsg =
      `📜 <b>منوی دیجیتال و سفارش آنلاین (${restaurantName})</b>\n\n` +
      menuUrlText;

    const rows = [];
    if (publicBaseUrl) {
      rows.push([{ text: '🍽 ورود به منوی آنلاین', url: `${publicBaseUrl}/?mode=menu` }]);
    }
    rows.push([{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]);

    await sendMessage(menuMsg, { inline_keyboard: rows });
    return;
  }

  // 2. Wallet & Statement Glass Button
  if (action === 'cust_wallet' || normalizedText === '/wallet' || normalizedText === 'کیف پول' || normalizedText === 'صورتحساب') {
    if (!matchedCustomer) {
      const askMsg =
        `💳 <b>استعلام کیف پول و صورتحساب باشگاه</b>\n\n` +
        `برای مشاهده موجودی کیف پول و مانده‌حساب خود، لطفاً <b>شماره موبایل</b> یا <b>کد اشتراک</b> خود را به همین چت ارسال نمایید.\n\n` +
        `مثال: <code>09121234567</code> یا <code>1001</code>`;
      const keyboard = {
        inline_keyboard: [
          [{ text: '➕ راهنمای شارژ کیف پول', callback_data: 'cust_topup' }],
          [{ text: '🔙 بازگشت به منو', callback_data: 'cust_main' }]
        ]
      };
      await sendMessage(askMsg, keyboard);
      return;
    }

    await sendWalletSummary(matchedCustomer);
    return;
  }

  // 3. Customer Recent Orders (Strictly own orders, using invoiceNumber, excluding cancelled)
  if (action === 'cust_orders' || normalizedText === '/myorders' || normalizedText === 'فاکتورها' || normalizedText === 'سفارش‌های من') {
    if (!matchedCustomer) {
      const askMsg =
        `🛍 <b>مشاهده آخرین فاکتورها</b>\n\n` +
        `جهت مشاهده فاکتورهای شخصی خود، لطفاً ابتدا <b>شماره موبایل</b> یا <b>کد اشتراک</b> خود را ارسال فرمایید.`;
      await sendMessage(askMsg, {
        inline_keyboard: [[{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]]
      });
      return;
    }

    const custOrders = getCustomerMatchedOrders(orders, matchedCustomer).slice(0, 5);
    const paymentLabels = {
      wallet: 'کیف پول باشگاه',
      credit: 'نسیه',
      pos: 'کارتخوان (POS)',
      card: 'کارتخوان (POS)',
      cash: 'نقدی',
      cheque: 'چک',
      mixed: 'ترکیبی'
    };

    let ordersStr = '';
    if (custOrders.length === 0) {
      ordersStr = '• هنوز فاکتوری برای حساب شما ثبت نشده است.';
    } else {
      ordersStr = custOrders.map((o) => {
        const dStr = o.createdAt ? getJalaliDateString(new Date(o.createdAt)) : '';
        const invNum = o.invoiceNumber || o.orderNumber || o.id || '-';
        const payType = paymentLabels[o.paymentMethod] || 'پرداخت شده';
        const itemsCount = Array.isArray(o.items) ? o.items.reduce((s, it) => s + (Number(it.quantity) || 1), 0) : 0;
        const itemsNote = itemsCount > 0 ? ` • ${itemsCount.toLocaleString('fa-IR')} قلم` : '';
        return `🧾 <b>فاکتور #${escapeTelegramHtml(invNum)}</b> (${dStr}${itemsNote})\n💰 مبلغ: <b>${Number(o.total || 0).toLocaleString('fa-IR')} تومان</b> [${payType}]`;
      }).join('\n────────────────────\n');
    }

    const ordersMsg =
      `🛍 <b>سوابق آخرین فاکتورهای شما</b>\n` +
      `👤 <b>مشترک:</b> ${escapeTelegramHtml(matchedCustomer.name || 'مشتری')} (#${escapeTelegramHtml(matchedCustomer.subscriptionCode || '-')})\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${ordersStr}\n` +
      `━━━━━━━━━━━━━━━━━━`;

    const rows = [[{ text: '💳 کیف پول من', callback_data: 'cust_wallet' }]];
    if (publicBaseUrl) {
      rows.push([{ text: '📜 ثبت سفارش جدید', url: `${publicBaseUrl}/?mode=menu` }]);
    }
    rows.push([{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]);

    await sendMessage(ordersMsg, { inline_keyboard: rows });
    return;
  }

  // 4. Wallet Top-up Instructions & Portal Link
  if (action === 'cust_topup' || normalizedText === '/topup' || normalizedText === 'شارژ') {
    const subPart = matchedCustomer?.subscriptionCode ? ` #${escapeTelegramHtml(matchedCustomer.subscriptionCode)}` : '';
    const exampleCmd = matchedCustomer
      ? `<code>شارژ 200000 78654321</code>`
      : `ابتدا شماره موبایل خود را ارسال کنید و سپس بنویسید:\n<code>شارژ 200000 78654321</code>`;

    const topupMsg =
      `➕ <b>شارژ آنلاین کیف پول و تسویه صورتحساب</b>\n\n` +
      `جهت شارژ موجودی کیف پول خود${subPart} می‌توانید:\n\n` +
      (publicBaseUrl ? `۱. از طریق <b>درگاه پرتال کیف پول</b> روی دکمه شیشه‌ای زیر کلیک نمایید.\n\n` : '') +
      `۲. یا درخواست شارژ خود را مستقیماً در همین چت ارسال نمایید:\n` +
      `<code>شارژ [مبلغ به تومان] [کد پیگیری بانکی]</code>\n\n` +
      `مثال:\n${exampleCmd}`;

    const rows = [];
    if (publicBaseUrl) {
      const portalUrl = matchedCustomer
        ? `${publicBaseUrl}/?mode=wallet&sub=${encodeURIComponent(matchedCustomer.subscriptionCode || '')}&phone=${encodeURIComponent(matchedCustomer.phone || '')}`
        : `${publicBaseUrl}/?mode=wallet`;
      rows.push([{ text: '🌐 ورود به پرتال آنلاین کیف پول', url: portalUrl }]);
    }
    rows.push([{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]);

    await sendMessage(topupMsg, { inline_keyboard: rows });
    return;
  }

  // 5. Club Points Explanation
  if (action === 'cust_points' || normalizedText === '/points' || normalizedText === 'امتیاز') {
    const pointsVal = matchedCustomer ? Number(matchedCustomer.loyaltyPoints || 0).toLocaleString('fa-IR') : '۰';
    const tierLabel = matchedCustomer ? (CUSTOMER_TIER_LABELS_BOT[matchedCustomer.tier || 'bronze'] || 'برنزی 🥉') : '';
    const pointsMsg =
      `⭐ <b>باشگاه مشتریان و امتیازات وفاداری (${restaurantName})</b>\n\n` +
      (matchedCustomer
        ? `👤 مشترک گرامی <b>${escapeTelegramHtml(matchedCustomer.name || 'مشتری')}</b>\n🏅 سطح عضویت: <b>${tierLabel}</b>\n⭐ امتیاز وفاداری شما: <b>${pointsVal} امتیاز</b>\n\n`
        : `برای مشاهده امتیاز شخصی خود، شماره موبایل یا کد اشتراک‌تان را ارسال کنید.\n\n`) +
      `🎁 با هر خرید از مجموعه ما، امتیاز وفاداری و کش‌بک به حساب باشگاه مشتریان شما اضافه می‌شود.\n` +
      `شما می‌توانید در خریدهای بعدی از این امتیازها و موجودی کیف پول برای تخفیف و پرداخت استفاده کنید.`;

    await sendMessage(pointsMsg, {
      inline_keyboard: [
        [{ text: '💳 استعلام کیف پول', callback_data: 'cust_wallet' }],
        [{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]
      ]
    });
    return;
  }

  // 6. Store Info & Contact
  if (action === 'cust_info' || normalizedText === '/info' || normalizedText === 'اطلاعات' || normalizedText === 'تماس') {
    const phone = escapeTelegramHtml(activeSettings.restaurantPhone || activeSettings.phone || 'ثبت نشده');
    const address = escapeTelegramHtml(activeSettings.restaurantAddress || activeSettings.address || 'ثبت نشده');
    const hours = escapeTelegramHtml(activeSettings.workingHours || 'ساعت ۱۰ الی ۲۴');

    const infoMsg =
      `ℹ️ <b>اطلاعات تماس و نشانی ${restaurantName}</b>\n\n` +
      `📍 <b>نشانی:</b> ${address}\n` +
      `📞 <b>شماره تماس:</b> <code>${phone}</code>\n` +
      `🕒 <b>ساعات کاری:</b> ${hours}\n\n` +
      `خوشحالیم که میزبان لحظات خوش شما هستیم!`;

    const rows = [];
    if (publicBaseUrl) {
      rows.push([{ text: '🍽 مشاهده منوی آنلاین', url: `${publicBaseUrl}/?mode=menu` }]);
    }
    rows.push([{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]);

    await sendMessage(infoMsg, { inline_keyboard: rows });
    return;
  }

  // 7. Direct Top-up Command (STRICT SELF-ONLY ISOLATION)
  // Supports: "شارژ <amount> [tracking]" OR "شارژ <own_code_or_phone> <amount> [tracking]"
  if (/^(شارژ|\/pay)\s+/i.test(normalizedText)) {
    if (!matchedCustomer) {
      const linkFirstMsg =
        `🔒 <b>برای ثبت درخواست شارژ کیف پول، ابتدا حساب خود را متصل کنید.</b>\n\n` +
        `لطفاً شماره موبایل یا کد اشتراک خودتان را ارسال نمایید تا پس از شناسایی حساب، درخواست شارژ فقط برای حساب خود شما ثبت شود.`;
      await sendMessage(linkFirstMsg, buildCustomerMainKeyboard(publicBaseUrl, null));
      return;
    }

    const parts = normalizedText.replace(/^(\/pay|شارژ)\s+/i, '').trim().split(/\s+/);
    let amount = 0;
    let tracking = '';

    const ownSubNorm = normalizeBotDigits(matchedCustomer.subscriptionCode || '').trim();
    const ownPhoneNorm = normalizeIranPhone(matchedCustomer.phone || '');
    const firstPartClean = (parts[0] || '').replace(/[^\d]/g, '');
    const firstPartPhone = normalizeIranPhone(parts[0] || '');

    const matchesOwnIdentifier =
      (ownSubNorm && firstPartClean === ownSubNorm) ||
      (ownPhoneNorm && (firstPartPhone === ownPhoneNorm || firstPartClean === ownPhoneNorm));

    // Check if the first argument looks like ANOTHER customer's phone or subscription code -> BLOCK!
    const matchesOtherCustomer =
      !matchesOwnIdentifier &&
      parts.length >= 2 &&
      customers.some((c) => {
        if (c.id === matchedCustomer.id) return false;
        const cSub = normalizeBotDigits(c.subscriptionCode || '').trim();
        const cPhone = normalizeIranPhone(c.phone || '');
        return (cSub && firstPartClean === cSub) || (cPhone && (firstPartPhone === cPhone || firstPartClean === cPhone));
      });

    if (matchesOtherCustomer) {
      const blockedSelfOnlyMsg =
        `⛔️ <b>عدم مجوز دسترسی به حساب دیگران</b>\n\n` +
        `شما فقط مجاز به ثبت درخواست شارژ برای حساب باشگاه مشتریان خودتان (<code>#${escapeTelegramHtml(matchedCustomer.subscriptionCode || matchedCustomer.phone)}</code>) هستید.`;
      await sendMessage(blockedSelfOnlyMsg, buildCustomerMainKeyboard(publicBaseUrl, matchedCustomer));
      return;
    }

    if (matchesOwnIdentifier) {
      amount = Number((parts[1] || '').replace(/[^\d]/g, ''));
      tracking = parts.slice(2).join(' ');
    } else {
      amount = Number((parts[0] || '').replace(/[^\d]/g, ''));
      tracking = parts.slice(1).join(' ');
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount > 500000000) {
      const errReply =
        `⚠️ لطفاً مبلغ شارژ را به صورت عدد معتبر (به تومان) وارد کنید.\n` +
        `مثال: <code>شارژ 500000 78654321</code>`;
      await sendMessage(errReply);
      return;
    }

    const customer = matchedCustomer;
    const tempId = 'BOT-PAY-' + Math.floor(1000 + Math.random() * 9000);
    if (!Array.isArray(serverDbState.data.networkOrders)) serverDbState.data.networkOrders = [];
    serverDbState.data.networkOrders.unshift({
      id: Date.now(),
      tempId,
      tableNumber: 0,
      tableTitle: `شارژ کیف پول ربات (${customer.name || customer.phone})`,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerSubscriptionCode: customer.subscriptionCode,
      requestType: 'wallet_topup',
      topupAmount: amount,
      trackingCode: tracking || undefined,
      notes: `درخواست شارژ کیف پول از طریق بات ${platform} به مبلغ ${amount.toLocaleString('fa-IR')} تومان`,
      items: [{ menuItemId: 0, name: `شارژ کیف پول #${customer.subscriptionCode || customer.phone}`, price: amount, quantity: 1 }],
      subtotal: amount,
      source: 'bot',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    if (!Array.isArray(serverDbState.data.systemNotifications)) serverDbState.data.systemNotifications = [];
    serverDbState.data.systemNotifications.unshift({
      id: Date.now() + 1,
      type: 'new_order',
      title: `شارژ کیف پول از ربات (#${customer.subscriptionCode || customer.phone})`,
      message: `${customer.name || customer.phone} مبلغ ${amount.toLocaleString('fa-IR')} تومان درخواست شارژ کیف پول ثبت کرد.`,
      category: `bot-pay-${tempId}`,
      targetTab: 'customers',
      isRead: false,
      createdAt: new Date().toISOString()
    });

    serverDbState.version = (serverDbState.version || 0) + 1;
    serverDbState.lastUpdated = Date.now();
    await saveServerDb({
      changedTables: {
        networkOrders: serverDbState.data.networkOrders,
        systemNotifications: serverDbState.data.systemNotifications
      }
    }).catch(() => {});
    broadcastDbChange();

    // Alert all admins (skipped when running automated test mock sendFn)
    if (!sendFn) {
      const alertMsg = `💳 <b>درخواست جدید شارژ کیف پول از ربات</b>\n👤 مشترک: ${escapeTelegramHtml(customer.name || '-')}\n📱 شماره: ${escapeTelegramHtml(customer.phone || '-')}\n🔢 کد اشتراک: #${escapeTelegramHtml(customer.subscriptionCode || '-')}\n💰 مبلغ: ${amount.toLocaleString('fa-IR')} تومان\n🧾 کد پیگیری: ${escapeTelegramHtml(tracking || '-')}\n🔖 شناسه: ${tempId}`;
      if (activeSettings.baleBotToken) {
        const baleAdmins = parseAdminChatIds(activeSettings.baleAdminChatIds, activeSettings.baleChatId);
        for (const aId of baleAdmins) sendBaleMessageDirect(activeSettings.baleBotToken, aId, alertMsg).catch(() => {});
      }
      if (activeSettings.telegramBotToken) {
        const tgAdmins = parseAdminChatIds(activeSettings.telegramAdminChatIds, activeSettings.telegramChatId);
        for (const aId of tgAdmins) sendTelegramMessageDirect(activeSettings.telegramBotToken, aId, alertMsg).catch(() => {});
      }
    }

    const confirmMsg =
      `✅ <b>درخواست شارژ کیف پول شما ثبت و به صندوق ارسال شد.</b>\n\n` +
      `👤 <b>مشترک:</b> ${escapeTelegramHtml(customer.name || 'مشتری')} (#${escapeTelegramHtml(customer.subscriptionCode || '-')})\n` +
      `💰 <b>مبلغ اعلامی:</b> ${amount.toLocaleString('fa-IR')} تومان\n` +
      (tracking ? `🧾 <b>کد پیگیری:</b> <code>${escapeTelegramHtml(tracking)}</code>\n` : '') +
      `🔖 <b>کد رهگیری درخواست:</b> <code>${tempId}</code>`;

    await sendMessage(confirmMsg, {
      inline_keyboard: [
        [{ text: '💳 استعلام مجدد کیف پول', callback_data: 'cust_wallet' }],
        [{ text: '🔙 منوی اصلی', callback_data: 'cust_main' }]
      ]
    });
    return;
  }

  // 8. Default: Customer Welcome Screen with Glass Buttons (Inline Keyboard)
  const greetingName = matchedCustomer ? ` ${escapeTelegramHtml(matchedCustomer.name || 'گرامی')}` : ' گرامی';
  const linkHint = matchedCustomer
    ? `✅ حساب شما متصل است (کد اشتراک: <code>#${escapeTelegramHtml(matchedCustomer.subscriptionCode || '-')}</code>)`
    : `📱 برای اتصال حساب خود و مشاهده کیف پول و فاکتورها، شماره موبایل یا کد اشتراک‌تان را ارسال کنید.`;

  const customerGreeting =
    `👑 <b>به باشگاه مشتریان ${restaurantName} خوش آمدید!</b>\n\n` +
    `همراه${greetingName}، ${linkHint}\n\n` +
    `یکی از خدمات زیر را از طریق دکمه‌های شیشه‌ای انتخاب نمایید:`;

  await sendMessage(customerGreeting, buildCustomerMainKeyboard(publicBaseUrl, matchedCustomer));
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
            // B. Regular text message or shared contact
            else if (upd.message && upd.message.chat?.id) {
              const msg = upd.message;
              handleBotIncoming({
                text: msg.text || '',
                chatId: msg.chat.id,
                platform: 'bale',
                isCallback: false,
                contactPhone: msg.contact?.phone_number || ''
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
            // B. Regular text message or shared contact
            else if (upd.message && upd.message.chat?.id) {
              const msg = upd.message;
              handleBotIncoming({
                text: msg.text || '',
                chatId: msg.chat.id,
                platform: 'telegram',
                isCallback: false,
                contactPhone: msg.contact?.phone_number || ''
              }).catch(() => {});
            }
          }
        }
      }
    } catch {}
  }
}, 5000).unref();

// Static assets paths (declared before PWA routes)
const distPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');
const staticGzipCache = new Map();

const FALLBACK_PWA_MANIFEST = JSON.stringify({
  id: '/',
  name: 'سامانه صندوقداری و رستوران آرکا',
  short_name: 'آرکا پوز',
  description: 'سامانه یکپارچه فروش، حسابداری، انبارداری و سفارش‌گیری آنلاین آرکا',
  theme_color: '#2563eb',
  background_color: '#0f172a',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui'],
  orientation: 'any',
  start_url: '/',
  scope: '/',
  lang: 'fa',
  dir: 'rtl',
  categories: ['business', 'productivity', 'food'],
  prefer_related_applications: false,
  icons: [
    { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2);

const FALLBACK_SW_JS = `// Arka POS Standalone Service Worker (Embedded Fallback)
const CACHE_NAME = 'arka-pos-cache-v4';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(['/', '/manifest.webmanifest', '/pwa-192x192.png', '/pwa-512x512.png']).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) return;
  event.respondWith(
    fetch(event.request).then((res) => {
      if (res && res.status === 200 && event.request.url.startsWith(self.location.origin)) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('/').then((r) => r || new Response('Offline', { status: 503 })) : new Response('', { status: 503 }))))
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow ? self.clients.openWindow('/') : undefined;
  }));
});
`;

// Explicit routes for PWA files to guarantee HTTP 200, correct MIME types, and never fallback to index.html or 404
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  const distSw = path.join(distPath, 'sw.js');
  const pubSw = path.join(publicPath, 'sw.js');
  if (fs.existsSync(distSw)) {
    res.sendFile(distSw);
  } else if (fs.existsSync(pubSw)) {
    res.sendFile(pubSw);
  } else {
    res.status(200).send(FALLBACK_SW_JS);
  }
});

app.get(['/manifest.json', '/manifest.webmanifest'], (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const fileName = req.path === '/manifest.json' ? 'manifest.json' : 'manifest.webmanifest';
  const distManifest = path.join(distPath, fileName);
  const pubManifest = path.join(publicPath, fileName);
  if (fs.existsSync(distManifest)) {
    res.sendFile(distManifest);
  } else if (fs.existsSync(pubManifest)) {
    res.sendFile(pubManifest);
  } else {
    res.status(200).send(FALLBACK_PWA_MANIFEST);
  }
});

// Explicit PWA icon fallback so Chrome always loads manifest icons cleanly even before a fresh build
const pwaIconFiles = new Set([
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/arka_logo.png',
  '/favicon.ico'
]);
app.use((req, res, next) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && pwaIconFiles.has(req.path)) {
    const fileName = req.path.slice(1);
    const distIcon = path.join(distPath, fileName);
    const pubIcon = path.join(publicPath, fileName);
    if (fs.existsSync(distIcon)) return res.sendFile(distIcon);
    if (fs.existsSync(pubIcon)) return res.sendFile(pubIcon);
  }
  return next();
});

if (fs.existsSync(distPath)) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const reqPath = req.path || '/';
    if (!reqPath.endsWith('.js') && !reqPath.endsWith('.css') && !reqPath.endsWith('.svg')) {
      return next();
    }
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    if (!acceptEncoding.includes('gzip')) return next();

    const safeRel = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(distPath, safeRel);
    if (!fullPath.startsWith(distPath) || !fs.existsSync(fullPath)) {
      return next();
    }

    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return next();
      const cacheKey = `${fullPath}:${stat.mtimeMs}`;
      let gzBuf = staticGzipCache.get(cacheKey);
      if (!gzBuf) {
        const rawBuf = fs.readFileSync(fullPath);
        gzBuf = zlib.gzipSync(rawBuf, { level: 6 });
        if (staticGzipCache.size > 60) staticGzipCache.clear();
        staticGzipCache.set(cacheKey, gzBuf);
      }

      if (reqPath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (reqPath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (reqPath.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      }

      if (reqPath === '/sw.js') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (reqPath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }

      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(gzBuf.length));
      return res.status(200).end(gzBuf);
    } catch (e) {
      return next();
    }
  });

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

// Start Server only after PostgreSQL (or JSON fallback) is initialized and migrated
async function startServer() {
  await initializeDatabase();

  const httpServer = http.createServer(app);
  httpServer.listen(activeServerPort, '0.0.0.0', () => {
    activeHttpServers.set(activeServerPort, httpServer);
    const nets = os.networkInterfaces();
    console.log(`==============================================================================`);
    console.log(` Arka POS Network Server successfully running on Port ${activeServerPort}`);
    console.log(` Database Engine:    ${isPostgresActive() ? '[PostgreSQL ACID Engine - ACTIVE]' : '[JSON File Fallback - Dev/Local]'}`);
    const licStatus = checkServerLicenseStatus();
    console.log(` Server Machine ID:  ${licStatus.machineId}`);
    if (licStatus.isActivated) {
      console.log(` License Status:     [ACTIVATED & LOCKED TO THIS HARDWARE]`);
    } else {
      console.log(` License Status:     [AWAITING ACTIVATION - SERVER LOCKED]`);
    }
    console.log(` Real-Time Server-Sent Events (SSE) active for all network devices`);
    if (customDomain) {
      console.log(` Custom Domain: http://${customDomain}:${activeServerPort}`);
    }
    console.log(` Accessible in Local Network (Wi-Fi / LAN) and Server IP at:`);
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`   -> http://${net.address}:${activeServerPort}`);
        }
      }
    }
    console.log(`==============================================================================`);
  });

  // Start HTTPS Server if certificates are present
  if (sslOptions) {
    const httpsPort = parseInt(process.env.SSL_PORT || (activeServerPort === 80 ? '443' : String(activeServerPort + 443)), 10);
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

  const gracefulShutdown = async () => {
    await closePostgresPool();
    process.exit(0);
  };
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

if (process.env.ARKA_SKIP_LISTEN !== '1') {
  startServer().catch((err) => {
    console.error('[FATAL] Failed to start Arka POS Server:', err);
    process.exit(1);
  });
}

export {
  handleBotIncoming,
  isChatAdmin,
  parseAdminChatIds,
  normalizeBotDigits,
  normalizeIranPhone,
  getPublicCustomerBaseUrl,
  isPublicTelegramSafeUrl,
  setLastPublicBaseUrl,
  serverDbState
};


