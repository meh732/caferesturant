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
    // 1. Motherboard / System Product UUID
    const mbUuid = safeExec('powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID"');
    if (mbUuid && mbUuid.length > 5 && !mbUuid.includes('00000000')) {
      rawTokens.push(`UUID:${mbUuid}`);
    }

    // 2. CPU Processor ID
    const cpuId = safeExec('powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1).ProcessorId"');
    if (cpuId && cpuId.length > 3) {
      rawTokens.push(`CPU:${cpuId}`);
    }

    // 3. Motherboard Serial Number
    const mbSerial = safeExec('powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue).SerialNumber"');
    if (mbSerial && mbSerial.length > 2 && mbSerial.toLowerCase() !== 'none') {
      rawTokens.push(`BASEBOARD:${mbSerial}`);
    }

    // 4. Primary Physical Disk Serial
    const diskSerial = safeExec('powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | Select-Object -First 1).SerialNumber"');
    if (diskSerial && diskSerial.length > 3) {
      rawTokens.push(`DISK:${diskSerial.replace(/\s+/g, '')}`);
    }

    // 5. Windows Machine GUID
    const machineGuid = safeExec('powershell -NoProfile -NonInteractive -Command "(Get-ItemProperty -Path Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography -ErrorAction SilentlyContinue).MachineGuid"');
    if (machineGuid && machineGuid.length > 5) {
      rawTokens.push(`MGUID:${machineGuid}`);
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
 * Checks current server license status on disk
 */
export function checkServerLicenseStatus() {
  const machineId = getHardwareFingerprint();

  if (!fs.existsSync(LICENSE_FILE_PATH)) {
    return {
      isActivated: false,
      machineId,
      activatedAt: null,
      licenseKey: null
    };
  }

  try {
    const content = fs.readFileSync(LICENSE_FILE_PATH, 'utf8');
    const licenseData = JSON.parse(content);

    if (
      licenseData &&
      licenseData.machineId === machineId &&
      verifyActivationKey(machineId, licenseData.licenseKey)
    ) {
      return {
        isActivated: true,
        machineId,
        activatedAt: licenseData.activatedAt || null,
        licenseKey: licenseData.licenseKey
      };
    }
  } catch (e) {
    console.warn('[LICENSE] Error reading license file:', e.message);
  }

  return {
    isActivated: false,
    machineId,
    activatedAt: null,
    licenseKey: null
  };
}

/**
 * Activates the server with the given activation key
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

  const licensePayload = {
    machineId,
    licenseKey: activationKey.trim().toUpperCase(),
    activatedAt: new Date().toISOString(),
    status: 'active',
    serverPlatform: os.platform(),
    hardwareSignature: crypto.createHash('md5').update(machineId).digest('hex')
  };

  try {
    const dataDir = path.dirname(LICENSE_FILE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(LICENSE_FILE_PATH, JSON.stringify(licensePayload, null, 2), 'utf8');
    return {
      success: true,
      message: 'سرور آرکا با موفقیت فعال‌سازی گردید و به سخت‌افزار این سیستم متصل شد.',
      data: licensePayload
    };
  } catch (err) {
    return {
      success: false,
      error: 'WRITE_ERROR',
      message: `خطا در ذخیره فایل لایسنس سرور: ${err.message}`
    };
  }
}
