const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, execFile } = require('child_process');

/**
 * Arka POS 24/7 Windows Background Server & PostgreSQL Daemon Controller
 *
 * Ensures that BOTH:
 *  1) Bundled PostgreSQL (pg_ctl.exe)
 *  2) Arka POS HTTP/SSE API Server (server.js via ELECTRON_RUN_AS_NODE=1)
 * run as detached, independent background processes on Windows.
 *
 * Closing or exiting the Electron Server GUI window NEVER stops PostgreSQL
 * or server.js — all LAN clients (Windows Clients, tablets, phones, web browsers)
 * remain connected to the exact same single central PostgreSQL database 24/7.
 */

function getArkaRootDir() {
  if (process.platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localApp, 'ArkaPOS');
  }
  return path.join(os.homedir(), '.arka-pos');
}

function getClientConfigDir() {
  if (process.platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localApp, 'ArkaPOS-Client');
  }
  return path.join(os.homedir(), '.arka-pos-client');
}

function getArkaDataDir() {
  const dir = path.join(getArkaRootDir(), 'data');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

function getArkaLogsDir() {
  const dir = path.join(getArkaRootDir(), 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

function readJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function readInstallerConfig(edition = 'server') {
  if (edition === 'client') {
    return (
      readJsonSafe(path.join(getClientConfigDir(), 'client-config.json')) ||
      readJsonSafe(path.join(getArkaRootDir(), 'client-config.json')) ||
      null
    );
  }
  return readJsonSafe(path.join(getArkaRootDir(), 'installer-config.json'));
}

function readPgConfig() {
  return readJsonSafe(path.join(getArkaRootDir(), 'pg_config.json'));
}

function resolveConfiguredServerPort() {
  const envPort = parseInt(process.env.PORT || '', 10);
  if (Number.isInteger(envPort) && envPort >= 80 && envPort <= 65535) return envPort;

  const netCfg = readJsonSafe(path.join(getArkaDataDir(), 'arka-network-config.json'));
  const netPort = parseInt(netCfg?.port ?? netCfg?.serverPort ?? '', 10);
  if (Number.isInteger(netPort) && netPort >= 80 && netPort <= 65535) return netPort;

  const instCfg = readInstallerConfig('server');
  const instPort = parseInt(instCfg?.serverPort ?? instCfg?.port ?? '', 10);
  if (Number.isInteger(instPort) && instPort >= 80 && instPort <= 65535) return instPort;

  return 3000;
}

function getLanIpv4Addresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function checkHealth(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/health',
        timeout: timeoutMs
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode === 200 && parsed && parsed.ok) {
              return resolve({ alive: true, data: parsed });
            }
          } catch {}
          resolve({ alive: res.statusCode === 200, data: null });
        });
      }
    );
    req.on('error', () => resolve({ alive: false, data: null }));
    req.on('timeout', () => {
      try { req.destroy(); } catch {}
      resolve({ alive: false, data: null });
    });
  });
}

function locatePostgresBinDir(appRoot) {
  const pgCfg = readPgConfig();
  const candidates = [
    pgCfg?.bin_dir,
    process.resourcesPath ? path.join(process.resourcesPath, 'postgres', 'bin') : null,
    path.join(appRoot, 'resources', 'postgres', 'bin'),
    path.join(appRoot, 'src-tauri', 'resources', 'postgres', 'bin'),
    'C:\\Program Files\\PostgreSQL\\16\\bin',
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\15\\bin'
  ].filter(Boolean);

  for (const dir of candidates) {
    const pgCtl = path.join(dir, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
    if (fs.existsSync(pgCtl)) return dir;
  }
  return null;
}

function execFilePromise(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 15000, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err });
    });
  });
}

/**
 * Ensures bundled Windows PostgreSQL cluster is running before launching server.js.
 * Does nothing if PostgreSQL is already running or on non-Windows dev environments.
 */
async function ensurePostgresRunning(appRoot) {
  if (process.platform !== 'win32') return { checked: false, running: false };

  const pgCfg = readPgConfig();
  const pgBinDir = locatePostgresBinDir(appRoot);
  const pgDataDir = pgCfg?.data_dir || path.join(getArkaRootDir(), 'pgdata');

  if (!pgBinDir) {
    return { checked: true, running: false, reason: 'pg_bin_not_found' };
  }

  // If PG cluster hasn't been initialized yet (e.g., portable launch without installer), run setup script once
  if (!fs.existsSync(path.join(pgDataDir, 'PG_VERSION'))) {
    const setupScriptCandidates = [
      process.resourcesPath ? path.join(process.resourcesPath, 'setup-win-postgres.ps1') : null,
      path.join(appRoot, 'src-tauri', 'resources', 'setup-win-postgres.ps1')
    ].filter(Boolean);
    const setupScript = setupScriptCandidates.find((p) => fs.existsSync(p));
    if (setupScript) {
      const installDir = path.dirname(process.execPath);
      await execFilePromise('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        setupScript,
        '-InstallDir',
        installDir
      ], { timeout: 60000 });
    }
  }

  if (!fs.existsSync(path.join(pgDataDir, 'PG_VERSION'))) {
    return { checked: true, running: false, reason: 'pgdata_uninitialized' };
  }

  const pgCtl = path.join(pgBinDir, 'pg_ctl.exe');
  const statusRes = await execFilePromise(pgCtl, ['-D', pgDataDir, 'status']);
  if (statusRes.ok) {
    return { checked: true, running: true, alreadyRunning: true };
  }

  const pgLog = path.join(pgDataDir, 'postgres.log');
  const startRes = await execFilePromise(pgCtl, ['-D', pgDataDir, '-l', pgLog, '-w', '-t', '15', 'start'], {
    timeout: 20000
  });
  return { checked: true, running: startRes.ok, startedNow: startRes.ok };
}

function resolveServerScriptPath(appRoot) {
  const candidates = [
    path.join(appRoot, 'server.js'),
    process.resourcesPath ? path.join(process.resourcesPath, 'app', 'server.js') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'backend', 'server.js') : null
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(appRoot, 'server.js');
}

function getPidFilePath() {
  return path.join(getArkaRootDir(), 'arka-bg-server.pid');
}

/**
 * Starts Arka POS server.js as a fully detached 24/7 background process using
 * Electron's own bundled Node.js runtime (ELECTRON_RUN_AS_NODE=1).
 * The user NEVER needs Node.js installed separately on Windows.
 */
async function ensureBackgroundServerRunning(appRoot, overridePort = null) {
  const targetPort =
    Number.isInteger(overridePort) && overridePort >= 80 && overridePort <= 65535
      ? overridePort
      : resolveConfiguredServerPort();

  // 1. Ensure PostgreSQL is running first
  await ensurePostgresRunning(appRoot).catch(() => {});

  // 2. If background server is ALREADY healthy on targetPort, reuse it!
  const existing = await checkHealth(targetPort, 1200);
  if (existing.alive) {
    return {
      ok: true,
      port: targetPort,
      alreadyRunning: true,
      health: existing.data
    };
  }

  // 3. Spawn detached background server.js via ELECTRON_RUN_AS_NODE=1
  const serverScript = resolveServerScriptPath(appRoot);
  if (!fs.existsSync(serverScript)) {
    return { ok: false, port: targetPort, error: `server.js not found at ${serverScript}` };
  }

  const logsDir = getArkaLogsDir();
  const logPath = path.join(logsDir, 'server.log');
  let outFd = 'ignore';
  try {
    outFd = fs.openSync(logPath, 'a');
  } catch {
    outFd = 'ignore';
  }

  const pgCfg = readPgConfig();
  const childEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(targetPort),
    ARKA_DATA_DIR: getArkaDataDir(),
    ARKA_PG_CONFIG_PATH: path.join(getArkaRootDir(), 'pg_config.json')
  };

  if (pgCfg && pgCfg.host && pgCfg.user && pgCfg.database) {
    childEnv.PGHOST = String(pgCfg.host);
    childEnv.PGPORT = String(pgCfg.port || 5432);
    childEnv.PGUSER = String(pgCfg.user);
    childEnv.PGDATABASE = String(pgCfg.database);
    if (pgCfg.password) childEnv.PGPASSWORD = String(pgCfg.password);
  }

  const child = spawn(process.execPath, [serverScript, String(targetPort)], {
    cwd: path.dirname(serverScript),
    env: childEnv,
    detached: true,
    windowsHide: true,
    stdio: outFd === 'ignore' ? 'ignore' : ['ignore', outFd, outFd]
  });

  if (child.pid) {
    try {
      fs.writeFileSync(getPidFilePath(), String(child.pid), 'utf8');
    } catch {}
  }

  // Detach completely so closing/quitting the Electron GUI window leaves server.js alive 24/7!
  child.unref();
  if (typeof outFd === 'number') {
    try { fs.closeSync(outFd); } catch {}
  }

  // Wait up to 15 seconds for server.js + PostgreSQL initialization to answer /api/health
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const h = await checkHealth(targetPort, 1000);
    if (h.alive) {
      return { ok: true, port: targetPort, startedNow: true, pid: child.pid, health: h.data };
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  return {
    ok: false,
    port: targetPort,
    error: `سرور پس‌زمینه روی پورت ${targetPort} پاسخ نداد. لطفاً فایل لاگ (${logPath}) را بررسی کنید.`
  };
}

/**
 * Stops ONLY the background Node server process (used when user explicitly clicks
 * "Restart Background Server" or "Stop Everything" in the tray menu).
 */
async function stopBackgroundServerOnly() {
  const pidPath = getPidFilePath();
  try {
    if (fs.existsSync(pidPath)) {
      const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {}
      }
      try { fs.unlinkSync(pidPath); } catch {}
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 700));
}

module.exports = {
  getArkaRootDir,
  getClientConfigDir,
  getArkaDataDir,
  getArkaLogsDir,
  readInstallerConfig,
  readPgConfig,
  resolveConfiguredServerPort,
  getLanIpv4Addresses,
  checkHealth,
  ensurePostgresRunning,
  ensureBackgroundServerRunning,
  stopBackgroundServerOnly
};
