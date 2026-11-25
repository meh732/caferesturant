const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  shell,
  dialog,
  clipboard,
  nativeImage,
  protocol,
  net
} = require('electron');

const daemon = require('./server-daemon.cjs');

// Determine edition: 'server' (default) or 'client'
function resolveEdition() {
  const envEd = String(process.env.ARKA_ELECTRON_EDITION || '').trim().toLowerCase();
  if (envEd === 'server' || envEd === 'client') return envEd;
  try {
    const edFile = path.join(__dirname, 'edition.json');
    if (fs.existsSync(edFile)) {
      const parsed = JSON.parse(fs.readFileSync(edFile, 'utf8'));
      const ed = String(parsed?.edition || '').trim().toLowerCase();
      if (ed === 'server' || ed === 'client') return ed;
    }
  } catch {}
  return 'server';
}

const EDITION = resolveEdition();
const APP_ROOT = path.resolve(__dirname, '..');

// Register stable privileged custom protocol for Client Edition (zero port needed, persistent localStorage & IndexedDB)
if (EDITION === 'client') {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'arka',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ]);
}

// Single-instance lock so double-clicking shortcut restores the existing window instead of opening duplicates
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let activeServerPort = daemon.resolveConfiguredServerPort();
let forceExitGui = false;

function resolveAppIconPath() {
  const candidates = [
    path.join(APP_ROOT, 'src-tauri', 'icons', 'icon.ico'),
    path.join(APP_ROOT, 'src-tauri', 'icons', 'icon.png'),
    path.join(APP_ROOT, 'dist', 'arka_logo.png'),
    path.join(APP_ROOT, 'src', 'assets', 'images', 'arka_logo.png')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function resolveDistDir() {
  const candidates = [
    path.join(APP_ROOT, 'dist'),
    process.resourcesPath ? path.join(process.resourcesPath, 'app', 'dist') : null
  ].filter(Boolean);
  for (const d of candidates) {
    if (fs.existsSync(path.join(d, 'index.html'))) return d;
  }
  return path.join(APP_ROOT, 'dist');
}

function buildSplashHtml(title, subtitle) {
  const safeTitle = String(title || '').replace(/[<>&"]/g, '');
  const safeSub = String(subtitle || '').replace(/[<>&"]/g, '');
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  body { margin:0; font-family: Tahoma, Segoe UI, sans-serif; background: #0f172a; color: #f8fafc; display:flex; align-items:center; justify-content:center; height:100vh; }
  .card { background: rgba(30,41,59,.9); border: 1px solid rgba(148,163,184,.22); border-radius: 20px; padding: 34px 40px; text-align:center; max-width: 440px; box-shadow: 0 25px 50px -12px rgba(0,0,0,.5); }
  .spinner { width: 42px; height: 42px; border: 4px solid rgba(99,102,241,.25); border-top-color: #6366f1; border-radius: 50%; margin: 0 auto 18px; animation: spin .9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  h2 { margin: 0 0 8px; font-size: 18px; }
  p { margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.8; }
</style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>${safeTitle}</h2>
    <p>${safeSub}</p>
  </div>
</body>
</html>`)}`;
}

function registerClientProtocol() {
  const distDir = resolveDistDir();
  protocol.handle('arka', (request) => {
    try {
      const reqUrl = new URL(request.url);
      let relPath = decodeURIComponent(reqUrl.pathname || '/');
      if (relPath === '/' || relPath === '') relPath = '/index.html';

      const normalized = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
      let targetFile = path.join(distDir, normalized);

      // Enforce containment strictly inside distDir
      const resolvedTarget = path.resolve(targetFile);
      const resolvedDist = path.resolve(distDir);
      if (!resolvedTarget.startsWith(resolvedDist)) {
        targetFile = path.join(distDir, 'index.html');
      }

      if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
        targetFile = path.join(distDir, 'index.html');
      }

      return net.fetch(pathToFileURL(targetFile).toString());
    } catch {
      return net.fetch(pathToFileURL(path.join(distDir, 'index.html')).toString());
    }
  });
}

function updateTrayMenu() {
  if (!tray || EDITION !== 'server') return;
  const ips = daemon.getLanIpv4Addresses();
  const primaryIp = ips[0] || '127.0.0.1';
  const lanUrl = `http://${primaryIp}:${activeServerPort}`;

  tray.setToolTip(`سرور مرکزی آرکا پوز + PostgreSQL | فعال روی پورت ${activeServerPort}`);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `سرور مرکزی آرکا پوز (پورت ${activeServerPort}) — فعال`,
      enabled: false
    },
    {
      label: `آدرس اتصال کلاینت‌ها: ${lanUrl}`,
      click: () => {
        clipboard.writeText(lanUrl);
      }
    },
    { type: 'separator' },
    {
      label: 'باز کردن پنجره نرم‌افزار آرکا',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: 'کپی آدرس سرور برای کلاینت‌ها',
      click: () => {
        clipboard.writeText(lanUrl);
      }
    },
    {
      label: 'راه‌اندازی مجدد سرویس پس‌زمینه سرور',
      click: async () => {
        await daemon.stopBackgroundServerOnly();
        activeServerPort = daemon.resolveConfiguredServerPort();
        const res = await daemon.ensureBackgroundServerRunning(APP_ROOT, activeServerPort);
        if (res.ok && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`http://127.0.0.1:${activeServerPort}`);
        }
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'بستن پنجره کاربری (سرور و دیتابیس فعال می‌مانند)',
      click: () => {
        forceExitGui = true;
        // Intentionally does NOT stop detached server.js or PostgreSQL!
        app.quit();
      }
    },
    {
      label: 'توقف کامل سرویس سرور و خروج',
      click: async () => {
        const choice = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['انصراف', 'توقف کامل سرور'],
          defaultId: 0,
          cancelId: 0,
          title: 'توقف کامل سرور مرکزی آرکا',
          message: 'در صورت توقف کامل سرویس سرور، کلاینت‌های شبکه تا زمان اجرای مجدد به سرور دسترسی نخواهند داشت. آیا مطمئن هستید؟'
        });
        if (choice.response === 1) {
          await daemon.stopBackgroundServerOnly();
          forceExitGui = true;
          app.quit();
        }
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function setupTray() {
  if (EDITION !== 'server' || tray) return;
  const iconPath = resolveAppIconPath();
  let trayImg = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (process.platform === 'win32' && !trayImg.isEmpty()) {
    trayImg = trayImg.resize({ width: 16, height: 16 });
  }
  tray = new Tray(trayImg);
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
  updateTrayMenu();
}

async function createMainWindow() {
  const iconPath = resolveAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: iconPath,
    title:
      EDITION === 'client'
        ? 'کلاینت صندوقداری آرکا پوز (Arka POS Client)'
        : 'سرور مرکزی آرکا پوز (Arka POS Server + PostgreSQL)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Open external links safely in OS default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.maximize();
    mainWindow.show();
  });

  // In Server Edition: closing the window hides to System Tray (or even if user quits GUI,
  // the detached background server.js + PostgreSQL stay running 24/7!)
  mainWindow.on('close', (event) => {
    if (EDITION === 'server' && !forceExitGui && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (EDITION === 'client') {
    await mainWindow.loadURL('arka://app/index.html');
    return;
  }

  // Server Edition:
  // 1) Show fast loading splash while ensuring PostgreSQL + 24/7 background server.js are ready
  activeServerPort = daemon.resolveConfiguredServerPort();
  await mainWindow.loadURL(
    buildSplashHtml(
      'در حال راه‌اندازی سرور مرکزی آرکا پوز و دیتابیس PostgreSQL...',
      `پورت فعال: ${activeServerPort} — سرویس پس‌زمینه حتی پس از بستن پنجره برای تمام کلاینت‌ها فعال می‌ماند.`
    )
  );

  const boot = await daemon.ensureBackgroundServerRunning(APP_ROOT, activeServerPort);
  if (boot.ok) {
    activeServerPort = boot.port;
    updateTrayMenu();
    await mainWindow.loadURL(`http://127.0.0.1:${activeServerPort}`);
  } else {
    await mainWindow.loadURL(
      buildSplashHtml(
        'خطا در راه‌اندازی سرویس سرور مرکزی آرکا',
        boot.error || `عدم امکان اتصال به پورت ${activeServerPort}`
      )
    );
  }
}

function registerIpcHandlers() {
  ipcMain.handle('arka:get-edition', () => EDITION);

  ipcMain.handle('arka:get-installer-config', () => {
    return daemon.readInstallerConfig(EDITION);
  });

  ipcMain.handle('arka:get-server-port', () => {
    activeServerPort = daemon.resolveConfiguredServerPort();
    return activeServerPort;
  });

  ipcMain.handle('arka:get-bg-status', async () => {
    activeServerPort = daemon.resolveConfiguredServerPort();
    const health = await daemon.checkHealth(activeServerPort, 1200);
    return {
      edition: EDITION,
      port: activeServerPort,
      alive: health.alive,
      health: health.data,
      lanIps: daemon.getLanIpv4Addresses()
    };
  });

  ipcMain.handle('arka:restart-bg-server', async (_event, requestedPort) => {
    if (EDITION !== 'server') return { ok: false, error: 'CLIENT_MODE' };
    const nextPort = Number(requestedPort);
    const portToUse =
      Number.isInteger(nextPort) && nextPort >= 80 && nextPort <= 65535
        ? nextPort
        : daemon.resolveConfiguredServerPort();

    await daemon.stopBackgroundServerOnly();
    const res = await daemon.ensureBackgroundServerRunning(APP_ROOT, portToUse);
    if (res.ok) {
      activeServerPort = res.port;
      updateTrayMenu();
    }
    return res;
  });

  ipcMain.handle('arka:save-local-backup', async (_event, payload) => {
    const rawName = String(payload?.fileName || 'ArkaPos_PostgreSQL_Backup.sql');
    // Strict filename sanitization to prevent path traversal
    const safeName = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalName = safeName.toLowerCase().endsWith('.sql') ? safeName : `${safeName}.sql`;
    const content = typeof payload?.content === 'string' ? payload.content : '';
    if (!content.trim()) {
      throw new Error('محتوای فایل بکاپ خالی است.');
    }

    const desktopDir = app.getPath('desktop');
    const docsDir = app.getPath('documents');
    const backupDir = path.join(docsDir, 'ArkaPOS-Backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const primaryPath = path.join(backupDir, finalName);
    fs.writeFileSync(primaryPath, content, 'utf8');

    try {
      fs.writeFileSync(path.join(desktopDir, finalName), content, 'utf8');
    } catch {}

    return primaryPath;
  });

  ipcMain.handle('arka:open-external', async (_event, url) => {
    const str = String(url || '').trim();
    if (!/^https?:\/\//i.test(str)) return false;
    await shell.openExternal(str);
    return true;
  });

  ipcMain.handle('arka:get-autostart', () => {
    try {
      const settings = app.getLoginItemSettings();
      return Boolean(settings?.openAtLogin);
    } catch {
      return false;
    }
  });

  ipcMain.handle('arka:set-autostart', (_event, enabled) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        path: process.execPath
      });
      return true;
    } catch {
      return false;
    }
  });
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
});

app.whenReady().then(async () => {
  if (EDITION === 'client') {
    registerClientProtocol();
  } else {
    setupTray();
  }
  registerIpcHandlers();
  await createMainWindow();
});

app.on('window-all-closed', () => {
  // In Server Edition, keep tray alive unless user explicitly chose "Exit GUI"
  // Even when GUI quits, detached server.js + PostgreSQL continue serving all LAN clients 24/7!
  if (EDITION === 'client' || forceExitGui) {
    app.quit();
  }
});
