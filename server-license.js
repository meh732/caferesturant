import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MASTER_SALT = 'ARKA_ENTERPRISE_OFFLINE_SECRET_2026_HARDWARE_LOCK_#POS_SALT!';
const LICENSE_FILE_PATH = path.join(__dirname, 'data', 'arka_server_license.json');

// Cache hardware ID in memory after first detection
let cachedMachineId = null;

/**
 * Safely runs a system command and returns trimmed stdout (hidden console window on Windows)
 */
function safeExec(cmd) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (e) {
    return '';
  }
}

/**
 * Gathers immutable hardware traits from the server machine
 */
export function getHardwareFingerprint() {
  if (cachedMachineId) {
    return cachedMachineId;
  }

  const rawTokens = [];
  const platform = os.platform();

  if (platform === 'win32') {
    // 1. Fast native Windows Machine GUID via reg.exe (runs in 2ms, zero CPU spike)
    const mguidOut = safeExec('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid');
    if (mguidOut) {
      const match = mguidOut.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9-]+)/i);
      if (match && match[1]) {
        rawTokens.push(`MGUID:${match[1].trim()}`);
      }
    }
    if (process.env.COMPUTERNAME) {
      rawTokens.push(`HOST:${process.env.COMPUTERNAME.trim()}`);
    }
    if (process.env.PROCESSOR_IDENTIFIER) {
      rawTokens.push(`CPU:${process.env.PROCESSOR_IDENTIFIER.trim()}`);
    }
  } else {
    // Linux / Unix hardware markers
    const machineIdLinux = safeExec('cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null');
    if (machineIdLinux) rawTokens.push(`LNX_ID:${machineIdLinux}`);
    const cpuInfo = safeExec('grep "model name" /proc/cpuinfo | head -n 1');
    if (cpuInfo) rawTokens.push(`LNX_CPU:${cpuInfo}`);
  }

  // Cross-platform fallbacks: Hostname, CPU model, Architecture, Permanent MAC address
  rawTokens.push(`ARCH:${os.arch()}`);
  rawTokens.push(`CPUS:${os.cpus().length}-${os.cpus()[0]?.model || ''}`);

  const networkInterfaces = os.networkInterfaces();
  const macAddresses = [];
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name] || []) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        macAddresses.push(net.mac.toLowerCase());
      }
    }
  }
  macAddresses.sort();
  if (macAddresses.length > 0) {
    rawTokens.push(`MACS:${macAddresses.join(',')}`);
  }

  const rawCombined = rawTokens.join('|');
  const hash = crypto.createHash('sha256').update(rawCombined).digest('hex').toUpperCase();

  // Format into clean 16-character grouped string: ARKA-SRV-XXXX-XXXX-XXXX-XXXX
  const p1 = hash.slice(0, 4);
  const p2 = hash.slice(4, 8);
  const p3 = hash.slice(8, 12);
  const p4 = hash.slice(12, 16);

  cachedMachineId = `ARKA-SRV-${p1}-${p2}-${p3}-${p4}`;
  return cachedMachineId;
}

/**
 * Calculates the exact valid license activation key for a given machine ID
 */
export function computeActivationKey(machineId) {
  const cleanId = (machineId || '').trim().toUpperCase();
  const hmac = crypto.createHmac('sha256', MASTER_SALT);
  hmac.update(`SERVER_LICENSE:${cleanId}`);
  const signature = hmac.digest('hex').toUpperCase();

  const k1 = signature.slice(0, 4);
  const k2 = signature.slice(6, 10);
  const k3 = signature.slice(12, 16);
  const k4 = signature.slice(18, 22);

  return `ARKA-KEY-${k1}-${k2}-${k3}-${k4}`;
}

/**
 * Verifies if a given activation key is valid for this specific hardware
 */
export function verifyActivationKey(machineId, activationKey) {
  if (!machineId || !activationKey) return false;
  const expectedKey = computeActivationKey(machineId);
  const cleanInput = activationKey.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return cleanInput === expectedKey;
}

/**
 * Returns all potential persistent license file paths across OS and user profile
 */
function getPersistentLicensePaths() {
  const paths = [LICENSE_FILE_PATH];
  if (os.platform() === 'win32') {
    if (process.env.PROGRAMDATA) {
      paths.push(path.join(process.env.PROGRAMDATA, 'ArkaPOS', 'arka_server_license.json'));
    }
    if (process.env.APPDATA) {
      paths.push(path.join(process.env.APPDATA, 'ArkaPOS', 'arka_server_license.json'));
    }
    if (process.env.LOCALAPPDATA) {
      paths.push(path.join(process.env.LOCALAPPDATA, 'com.arka.restaurantpos', 'arka_server_license.json'));
      paths.push(path.join(process.env.LOCALAPPDATA, 'ArkaPOS', 'arka_server_license.json'));
    }
  } else {
    // Linux / Unix persistent OS-level paths outside /opt/arka-pos so reinstallation on same VPS never asks again
    paths.push('/etc/arka-pos/arka_server_license.json');
    paths.push('/var/lib/arka-pos/arka_server_license.json');
    if (process.env.HOME) {
      paths.push(path.join(process.env.HOME, '.config', 'arka-pos', 'arka_server_license.json'));
    }
  }
  return paths;
}

/**
 * Reads permanent activation key from Windows Registry (HKCU/HKLM)
 */
function readWindowsRegistryLicense() {
  if (os.platform() !== 'win32') return null;
  const regPaths = [
    'HKCU\\Software\\ArkaRestaurantPOS',
    'HKLM\\SOFTWARE\\ArkaRestaurantPOS'
  ];
  for (const regPath of regPaths) {
    const out = safeExec(`reg query "${regPath}" /v LicenseKey`);
    if (out) {
      const match = out.match(/LicenseKey\s+REG_SZ\s+([A-Za-z0-9-]+)/i);
      if (match && match[1]) {
        return match[1].trim().toUpperCase();
      }
    }
  }
  return null;
}

/**
 * Checks current server license status on disk and permanent system registry
 */
export function checkServerLicenseStatus() {
  const machineId = getHardwareFingerprint();
  const allPaths = getPersistentLicensePaths();

  // 1. Check existing disk files
  for (const filePath of allPaths) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const licenseData = JSON.parse(content);
        if (
          licenseData &&
          licenseData.machineId === machineId &&
          verifyActivationKey(machineId, licenseData.licenseKey)
        ) {
          // If found in a secondary path but missing in primary, restore primary immediately
          if (filePath !== LICENSE_FILE_PATH) {
            try {
              const dataDir = path.dirname(LICENSE_FILE_PATH);
              if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
              fs.writeFileSync(LICENSE_FILE_PATH, content, 'utf8');
            } catch (e) {}
          }
          return {
            isActivated: true,
            machineId,
            activatedAt: licenseData.activatedAt || null,
            licenseKey: licenseData.licenseKey
          };
        }
      } catch (e) {}
    }
  }

  // 2. Hardware Reinstallation Recovery: Check Windows Registry
  const regKey = readWindowsRegistryLicense();
  if (regKey && verifyActivationKey(machineId, regKey)) {
    // Machine was previously activated! Automatically restore license without user needing to re-enter anything
    const licensePayload = {
      machineId,
      licenseKey: regKey,
      activatedAt: new Date().toISOString(),
      status: 'active',
      serverPlatform: os.platform(),
      restoredFromHardwareRegistry: true,
      hardwareSignature: crypto.createHash('md5').update(machineId).digest('hex')
    };
    try {
      const dataDir = path.dirname(LICENSE_FILE_PATH);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(LICENSE_FILE_PATH, JSON.stringify(licensePayload, null, 2), 'utf8');
    } catch (e) {}

    return {
      isActivated: true,
      machineId,
      activatedAt: licensePayload.activatedAt,
      licenseKey: regKey
    };
  }

  return {
    isActivated: false,
    machineId,
    activatedAt: null,
    licenseKey: null
  };
}

/**
 * Activates the server with the given activation key and writes to all persistent storage
 */
export function activateServerLicense(activationKey) {
  const machineId = getHardwareFingerprint();
  const isValid = verifyActivationKey(machineId, activationKey);

  if (!isValid) {
    return {
      success: false,
      error: 'INVALID_KEY',
      message: 'کد فعال‌سازی وارد شده با شناسه سخت‌افزاری این سرور مطابقت ندارد.'
    };
  }

  const cleanKey = activationKey.trim().toUpperCase();
  const licensePayload = {
    machineId,
    licenseKey: cleanKey,
    activatedAt: new Date().toISOString(),
    status: 'active',
    serverPlatform: os.platform(),
    hardwareSignature: crypto.createHash('md5').update(machineId).digest('hex')
  };

  const payloadStr = JSON.stringify(licensePayload, null, 2);

  // 1. Write to all persistent file paths
  const allPaths = getPersistentLicensePaths();
  let savedAny = false;
  for (const p of allPaths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, payloadStr, 'utf8');
      savedAny = true;
    } catch (e) {}
  }

  // 2. Permanently record in Windows Registry (persists even if app is completely uninstalled/reinstalled)
  if (os.platform() === 'win32') {
    safeExec(`reg add "HKCU\\Software\\ArkaRestaurantPOS" /v LicenseKey /t REG_SZ /d "${cleanKey}" /f`);
    safeExec(`reg add "HKCU\\Software\\ArkaRestaurantPOS" /v MachineId /t REG_SZ /d "${machineId}" /f`);
    safeExec(`reg add "HKCU\\Software\\ArkaRestaurantPOS" /v ActivatedAt /t REG_SZ /d "${licensePayload.activatedAt}" /f`);
  }

  if (!savedAny) {
    return {
      success: false,
      error: 'WRITE_ERROR',
      message: 'خطا در ذخیره فایل لایسنس سرور روی دیسک.'
    };
  }

  return {
    success: true,
    message: 'سرور آرکا با موفقیت فعال‌سازی گردید و به سخت‌افزار این سیستم متصل شد.',
    data: licensePayload
  };
}
