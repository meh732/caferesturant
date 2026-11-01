import { db, resetDatabaseToRawCleanStateLocally, isImportingServerData, setImportingServerData } from './db';
export { isImportingServerData, setImportingServerData };

const TABLES_TO_SYNC = [
  'categories',
  'menuItems',
  'orders',
  'settings',
  'customers',
  'users',
  'expenses',
  'employees',
  'salaryPayments',
  'restaurantTables',
  'networkOrders',
  'warehouses',
  'rawMaterials',
  'warehouseStocks',
  'warehouseTransfers',
  'stockTransactions',
  'recipes',
  'chatMessages',
  'systemNotifications',
  'bankAccounts',
  'cashBoxes',
  'chequeBooks',
  'cheques',
  'financialTransactions',
  'chartOfAccounts',
  'journalEntries',
  'rawMaterialCategories',
  'customerWalletTransactions'
] as const;

let knownServerVersion = -1;
let isSyncing = false;
let isPushing = false;
let pendingPushQueued = false;
let localMutationSeq = 0;
let lastLocalMutationAt = 0;
let syncInterval: any = null;
let hooksAttached = false;
let eventSource: EventSource | null = null;
let pushDebounceTimer: any = null;

// Track pending deleted item IDs to sync deletions to the server
const pendingDeletedIds: Record<string, number[]> = {};
// Track locally created/updated IDs not yet confirmed pushed to server
const unsyncedUpsertIds: Record<string, Set<any>> = {};

const MASTER_SALT = 'ARKA_ENTERPRISE_OFFLINE_SECRET_2026_HARDWARE_LOCK_#POS_SALT!';

/**
 * Safe AbortSignal timeout helper with 100% compatibility for older iOS Safari (iOS 12-15)
 * and legacy mobile browsers where AbortSignal.timeout is not natively present.
 */
export function safeTimeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof window === 'undefined') return undefined;
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
    try {
      return (AbortSignal as any).timeout(ms);
    } catch {}
  }
  if (typeof AbortController !== 'undefined') {
    try {
      const controller = new AbortController();
      setTimeout(() => {
        try { controller.abort(); } catch {}
      }, ms);
      return controller.signal;
    } catch {}
  }
  return undefined;
}

export function isTauriNative(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    window.location.protocol.startsWith('tauri') ||
    window.location.hostname === 'tauri.localhost'
  );
}

/**
 * Returns true when the app is opened in a mobile phone, tablet, or secondary PC browser
 * over the LAN (e.g., http://192.168.1.100:3000) rather than localhost or Tauri shell.
 */
export function isRemoteLanClientBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  if (isTauriNative()) return false;
  const h = window.location.hostname;
  if (!h) return false;
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === 'tauri.localhost' ||
    h === '[::1]' ||
    h === '0.0.0.0' ||
    h.endsWith('.localhost')
  ) {
    return false;
  }
  return true;
}

export function getAppExecutionMode(): 'server' | 'client' | 'standalone' {
  if (typeof window === 'undefined') return 'standalone';
  // Any mobile/tablet/browser connecting over LAN IP is a client of the central server
  if (isRemoteLanClientBrowser()) return 'client';
  const mode = localStorage.getItem('arka_tauri_mode');
  if (mode === 'server' || mode === 'client') return mode;
  // On Tauri or Linux host, default role is server unless configured as client
  return 'server';
}

export function setAppExecutionMode(mode: 'server' | 'client' | 'standalone', serverUrl?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('arka_tauri_mode', mode);
  if (mode === 'client' && serverUrl) {
    let clean = serverUrl.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    localStorage.setItem('arka_server_url', clean);
    localStorage.setItem('arka_local_db_independent', 'false');
  } else if (mode === 'server') {
    localStorage.removeItem('arka_server_url');
    localStorage.setItem('arka_local_db_independent', 'false');
  }
}

export function getServerBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  // 1. If a remote LAN browser opened http://192.168.x.x:PORT directly, its origin IS the central server
  if (isRemoteLanClientBrowser()) {
    const custom = localStorage.getItem('arka_server_url');
    if (custom && custom.trim()) {
      let clean = custom.trim().replace(/\/+$/, '');
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `http://${clean}`;
      }
      return clean;
    }
    return window.location.origin;
  }

  // 2. If explicitly configured as Client with a target Server URL
  const mode = localStorage.getItem('arka_tauri_mode');
  const custom = localStorage.getItem('arka_server_url');
  if (mode === 'client' && custom && custom.trim()) {
    let clean = custom.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean;
  }

  // 3. If running inside Windows/Desktop Tauri as Server/Standalone, WebView origin is tauri.localhost,
  // so API requests MUST target the local embedded LAN server on http://127.0.0.1:PORT
  if (isTauriNative()) {
    const activePort = localStorage.getItem('arka_active_lan_port') || '3000';
    return `http://127.0.0.1:${activePort}`;
  }

  return '';
}

export function serverFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const base = getServerBaseUrl();
  const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : (base ? `${base}${path}` : path);
  return fetch(url, init);
}

export interface UnifiedLicenseStatus {
  isActivated: boolean;
  machineId: string;
  licenseKey?: string | null;
  activatedAt: string | null;
}

function sha256BytesPureJS(msgBytes: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const l = msgBytes.length;
  const bitLenHi = Math.floor((l * 8) / 0x100000000);
  const bitLenLo = (l * 8) >>> 0;
  const padLen = ((l + 9 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(msgBytes);
  padded[l] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, bitLenHi, false);
  view.setUint32(padLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let i = 0; i < padLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false); outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false); outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false); outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false); outView.setUint32(28, h7, false);
  return out;
}

function hmacSha256BytesPureJS(keyBytes: Uint8Array, messageBytes: Uint8Array): Uint8Array {
  const blockSize = 64;
  let k = keyBytes;
  if (k.length > blockSize) {
    k = sha256BytesPureJS(k);
  }
  const keyBlock = new Uint8Array(blockSize);
  keyBlock.set(k);

  const oKeyPad = new Uint8Array(blockSize + 32);
  const iKeyPad = new Uint8Array(blockSize + messageBytes.length);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = keyBlock[i] ^ 0x5c;
    iKeyPad[i] = keyBlock[i] ^ 0x36;
  }
  iKeyPad.set(messageBytes, blockSize);
  const innerHash = sha256BytesPureJS(iKeyPad);
  oKeyPad.set(innerHash, blockSize);
  return sha256BytesPureJS(oKeyPad);
}

export async function computeActivationKeyWeb(machineId: string): Promise<string> {
  const cleanId = (machineId || '').trim().toUpperCase();
  const enc = new TextEncoder();
  const keyData = enc.encode(MASTER_SALT);
  const msgData = enc.encode(`SERVER_LICENSE:${cleanId}`);

  let hashBytes: Uint8Array;
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signatureBuf = await window.crypto.subtle.sign('HMAC', cryptoKey, msgData);
      hashBytes = new Uint8Array(signatureBuf);
    } catch {
      hashBytes = hmacSha256BytesPureJS(keyData, msgData);
    }
  } else {
    hashBytes = hmacSha256BytesPureJS(keyData, msgData);
  }

  const hex = Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  const k1 = hex.slice(0, 4);
  const k2 = hex.slice(6, 10);
  const k3 = hex.slice(12, 16);
  const k4 = hex.slice(18, 22);

  return `ARKA-KEY-${k1}-${k2}-${k3}-${k4}`;
}

async function getFallbackBrowserHardwareId(): Promise<string> {
  const cached = localStorage.getItem('arka_server_machine_id');
  if (cached && cached.startsWith('ARKA-SRV-')) {
    return cached;
  }
  const traits = [
    navigator.userAgent,
    navigator.platform,
    navigator.language,
    navigator.hardwareConcurrency || 4,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ].join('|');
  const enc = new TextEncoder();
  const msgBytes = enc.encode(traits);
  let hashBytes: Uint8Array;
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const hashBuf = await window.crypto.subtle.digest('SHA-256', msgBytes);
      hashBytes = new Uint8Array(hashBuf);
    } catch {
      hashBytes = sha256BytesPureJS(msgBytes);
    }
  } else {
    hashBytes = sha256BytesPureJS(msgBytes);
  }
  const hex = Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const id = `ARKA-SRV-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
  localStorage.setItem('arka_server_machine_id', id);
  return id;
}

function normalizeActivatedAt(raw: any): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    const d = new Date(num < 10000000000 ? num * 1000 : num);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

export async function fetchUnifiedLicenseStatus(): Promise<UnifiedLicenseStatus> {
  const mode = getAppExecutionMode();

  // 1. If inside Tauri Desktop (Windows/Linux) AND acting as Server/Standalone (NOT Client),
  // query native Rust hardware fingerprint & license command first
  if (isTauriNative() && mode !== 'client') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const nativeInfo: any = await invoke('get_server_license_info');
      if (nativeInfo && nativeInfo.machineId) {
        localStorage.setItem('arka_server_machine_id', nativeInfo.machineId);
        if (nativeInfo.isActivated && nativeInfo.licenseKey) {
          localStorage.setItem('arka_server_license_key', nativeInfo.licenseKey);
        }
        return {
          isActivated: !!nativeInfo.isActivated,
          machineId: nativeInfo.machineId,
          licenseKey: nativeInfo.licenseKey || null,
          activatedAt: normalizeActivatedAt(nativeInfo.activatedAt)
        };
      }
    } catch (e) {
      console.warn('[License] Tauri invoke get_server_license_info fallback:', e);
    }
  }

  // 2. Query server HTTP endpoint (/api/license/status)
  // On Linux Web Server, this checks the Linux Server's hardware license.
  // On Client mode (Windows Tauri Client or Mobile/Web LAN Client), this checks the Central Server's license!
  try {
    const signal = safeTimeoutSignal(4000);
    const res = await serverFetch('/api/license/status', signal ? { signal } : undefined);
    if (res.ok) {
      const data = await res.json();
      if (data && data.machineId) {
        localStorage.setItem('arka_server_machine_id', data.machineId);
        return {
          isActivated: !!data.isActivated,
          machineId: data.machineId,
          licenseKey: data.licenseKey || null,
          activatedAt: normalizeActivatedAt(data.activatedAt)
        };
      }
    }
  } catch (e) {
    // Retry without signal in case of legacy webview AbortController constraints
    try {
      const retryRes = await serverFetch('/api/license/status');
      if (retryRes.ok) {
        const data = await retryRes.json();
        if (data && data.machineId) {
          localStorage.setItem('arka_server_machine_id', data.machineId);
          return {
            isActivated: !!data.isActivated,
            machineId: data.machineId,
            licenseKey: data.licenseKey || null,
            activatedAt: normalizeActivatedAt(data.activatedAt)
          };
        }
      }
    } catch {}
  }

  // 3. Client Mode & Remote LAN Client Browser Safeguard:
  // If connection to server fails or server is unactivated, stay locked (isActivated: false)
  if (isRemoteLanClientBrowser() || mode === 'client') {
    const cachedServerId = localStorage.getItem('arka_server_machine_id');
    return {
      isActivated: false,
      machineId: cachedServerId || 'ARKA-SRV-UNACTIVATED',
      licenseKey: null,
      activatedAt: null
    };
  }

  // 4. Standalone / Offline Localhost fallback (only for local standalone desktop testing)
  const fallbackId = await getFallbackBrowserHardwareId();
  const savedKey = localStorage.getItem('arka_server_license_key');
  let isActivated = false;
  if (savedKey) {
    try {
      const expected = await computeActivationKeyWeb(fallbackId);
      if (savedKey.trim().toUpperCase() === expected) {
        isActivated = true;
      }
    } catch (e) {}
  }

  return {
    isActivated,
    machineId: fallbackId,
    licenseKey: isActivated ? savedKey : null,
    activatedAt: isActivated ? localStorage.getItem('arka_server_license_at') : null
  };
}

export async function activateUnifiedServerLicense(rawKey: string): Promise<{
  success: boolean;
  message: string;
  status?: UnifiedLicenseStatus;
}> {
  const cleanKey = (rawKey || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!cleanKey) {
    return { success: false, message: 'لطفاً کد فعال‌سازی را وارد فرمایید.' };
  }

  const currentStatus = await fetchUnifiedLicenseStatus();
  const expectedKey = await computeActivationKeyWeb(currentStatus.machineId);

  if (cleanKey !== expectedKey) {
    return {
      success: false,
      message: 'کد فعال‌سازی وارد شده با شناسه سخت‌افزاری این رایانه مطابقت ندارد. لطفاً شناسه سخت‌افزار همین سیستم را در keygen.html وارد نمایید.'
    };
  }

  // 1. If in Tauri, persist via native Rust command so arka_server_license.json is written on disk
  if (isTauriNative()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('activate_server_license', { licenseKey: cleanKey });
    } catch (e) {
      console.warn('[License] Tauri invoke activate_server_license warning:', e);
    }
  }

  // 2. Also send to HTTP backend (/api/license/activate) if reachable
  let serverMessage = 'سرور آرکا با موفقیت فعال‌سازی شد و روی این آدرس/سرور قفل گردید.';
  let resolvedMachineId = currentStatus.machineId;
  let resolvedActivatedAt = new Date().toISOString();

  try {
    const srvRes = await serverFetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: cleanKey }),
      signal: safeTimeoutSignal(6000)
    });
    if (srvRes.ok) {
      const srvJson = await srvRes.json().catch(() => null);
      if (srvJson && srvJson.success === false) {
        return {
          success: false,
          message: srvJson.message || 'کد فعال‌سازی توسط سرور پذیرفته نشد.'
        };
      }
      if (srvJson && srvJson.message) {
        serverMessage = srvJson.message;
      }
      if (srvJson?.data?.machineId || srvJson?.machineId) {
        resolvedMachineId = srvJson.data?.machineId || srvJson.machineId;
      }
      if (srvJson?.data?.activatedAt || srvJson?.activatedAt) {
        resolvedActivatedAt = srvJson.data?.activatedAt || srvJson.activatedAt;
      }
    }
  } catch (e) {
    console.warn('[License] /api/license/activate warning:', e);
  }

  localStorage.setItem('arka_server_license_key', cleanKey);
  localStorage.setItem('arka_server_license_at', resolvedActivatedAt);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('arka_license_updated'));
  }

  return {
    success: true,
    message: serverMessage,
    status: {
      isActivated: true,
      machineId: resolvedMachineId,
      licenseKey: cleanKey,
      activatedAt: resolvedActivatedAt
    }
  };
}

export function updateKnownServerVersion(ver: number) {
  if (typeof ver === 'number' && ver > knownServerVersion) {
    knownServerVersion = ver;
  }
}

export function isLocalDbIndependent(): boolean {
  if (typeof window === 'undefined') return false;
  // Remote LAN clients (phones, tablets, client PCs) and central servers must ALWAYS sync with the central DB
  if (isRemoteLanClientBrowser()) return false;
  if (getAppExecutionMode() === 'client' || getAppExecutionMode() === 'server') return false;
  return localStorage.getItem('arka_local_db_independent') === 'true';
}

// BroadcastChannel for instant same-browser multi-tab/window synchronization
const syncBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('arka_db_sync_bus')
  : null;

if (syncBroadcast) {
  syncBroadcast.onmessage = (event) => {
    if (event.data?.type === 'db_reset') {
      resetDatabaseToRawCleanStateLocally().then(() => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('arka_user');
          window.dispatchEvent(new CustomEvent('arka_db_synced', { detail: { timestamp: Date.now() } }));
          window.location.reload();
        }
      });
    } else if (event.data?.type === 'db_updated') {
      pullServerDbIfNewer();
    }
  };
}

// Convert Dates in object/array to Date objects
function reviveDates(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      const d = new Date(obj);
      if (!isNaN(d.getTime())) return d;
    }
    return obj;
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates);
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[key] = reviveDates(obj[key]);
  }
  return result;
}

// Read entire local Dexie DB into a plain JSON object
export async function exportLocalDbToData(): Promise<Record<string, any[]>> {
  const data: Record<string, any[]> = {};
  for (const tableName of TABLES_TO_SYNC) {
    try {
      const table = (db as any)[tableName];
      if (table) {
        data[tableName] = await table.toArray();
      }
    } catch (e) {
      console.warn(`[Sync] Failed to read local table ${tableName}:`, e);
    }
  }
  return data;
}

// Push a complete restored backup to the central server with replaceAll: true
export async function pushFullRestoreToServer(restoredData?: Record<string, any[]>): Promise<boolean> {
  for (const key of Object.keys(pendingDeletedIds)) {
    pendingDeletedIds[key] = [];
  }
  for (const key of Object.keys(unsyncedUpsertIds)) {
    unsyncedUpsertIds[key]?.clear();
  }
  pendingPushQueued = false;

  const data = restoredData || await exportLocalDbToData();
  let tauriReplaced = false;

  // 1. If running on Windows Tauri Server, directly update the Rust CENTRAL_DB & arka_central_db.json via native IPC
  if (isTauriNative() && getAppExecutionMode() !== 'client') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const newVer: any = await invoke('replace_central_db_direct', {
        jsonPayload: JSON.stringify({ data })
      });
      if (typeof newVer === 'number') {
        knownServerVersion = newVer;
        tauriReplaced = true;
      }
    } catch (e) {
      console.warn('[Sync] Tauri replace_central_db_direct warning:', e);
    }
  }

  // 2. Also send to HTTP /api/db/sync endpoint (for Linux server, remote LAN server, or local port)
  try {
    const res = await serverFetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, replaceAll: true }),
      signal: safeTimeoutSignal(12000)
    });
    if (res.ok) {
      const result = await res.json().catch(() => null);
      if (result && typeof result.version === 'number') {
        knownServerVersion = result.version;
      }
      if (syncBroadcast) {
        try {
          syncBroadcast.postMessage({ type: 'db_updated', version: knownServerVersion, timestamp: Date.now() });
        } catch (e) {}
      }
      return true;
    }
  } catch (e) {
    console.warn('[Sync] pushFullRestoreToServer error:', e);
  }
  return tauriReplaced;
}

// Push local Dexie DB snapshot and deletions to central server
export async function pushLocalDbToServer(): Promise<boolean> {
  if (isLocalDbIndependent() || isImportingServerData) return false;
  if (isPushing) {
    // Queue another push right after the current one finishes so no local save is ever lost
    pendingPushQueued = true;
    return false;
  }

  isPushing = true;
  const seqAtStart = localMutationSeq;

  // Snapshot unsynced upserts at the start of this push
  const upsertsSnapshot: Record<string, any[]> = {};
  for (const tName of Object.keys(unsyncedUpsertIds)) {
    if (unsyncedUpsertIds[tName]?.size > 0) {
      upsertsSnapshot[tName] = Array.from(unsyncedUpsertIds[tName]);
    }
  }

  try {
    const data = await exportLocalDbToData();

    // Snapshot current deletions
    const deletedSnapshot: Record<string, number[]> = {};
    for (const key of Object.keys(pendingDeletedIds)) {
      if (pendingDeletedIds[key]?.length > 0) {
        deletedSnapshot[key] = [...pendingDeletedIds[key]];
      }
    }

    const res = await serverFetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, deleted: deletedSnapshot }),
      signal: safeTimeoutSignal(8000)
    });

    if (res.ok) {
      const result = await res.json();

      if (result && typeof result.version === 'number') {
        knownServerVersion = result.version;
      }

      // Clear recorded deletions that were successfully sent
      for (const key of Object.keys(deletedSnapshot)) {
        pendingDeletedIds[key] = (pendingDeletedIds[key] || []).filter(
          id => !deletedSnapshot[key].includes(id)
        );
      }

      // Clear recorded upserts that were part of this snapshot
      for (const tName of Object.keys(upsertsSnapshot)) {
        const set = unsyncedUpsertIds[tName];
        if (set) {
          for (const id of upsertsSnapshot[tName]) {
            set.delete(id);
          }
        }
      }

      // Only mark queue clean if no new local mutations happened while the POST was in flight
      if (localMutationSeq === seqAtStart) {
        pendingPushQueued = false;
      }

      if (syncBroadcast) {
        try {
          syncBroadcast.postMessage({ type: 'db_updated', version: knownServerVersion, timestamp: Date.now() });
        } catch (e) {}
      }
      isPushing = false;
      if (pendingPushQueued) {
        triggerServerDbSync(150);
      }
      return true;
    }
  } catch (e) {
    // Server push failed or offline; keep pendingPushQueued = true so we don't overwrite local DB with stale server data
    pendingPushQueued = true;
  } finally {
    isPushing = false;
    if (pendingPushQueued && localMutationSeq !== seqAtStart) {
      triggerServerDbSync(200);
    }
  }
  return false;
}

let activeImportPromise: Promise<void> = Promise.resolve();

// Import server data object into Dexie DB safely inside atomic per-table transactions
export async function importServerDataToLocalDb(data: Record<string, any[]>): Promise<void> {
  if (!data || typeof data !== 'object') return;

  const tableNames = Object.keys(data).filter(name => TABLES_TO_SYNC.includes(name as any));
  if (tableNames.length === 0) return;

  activeImportPromise = activeImportPromise.then(async () => {
    setImportingServerData(true);

    try {
      for (const tableName of tableNames) {
        const records = data[tableName];
        if (Array.isArray(records)) {
          // Never overwrite local users table with an empty array during normal sync
          if (tableName === 'users' && records.length === 0) {
            continue;
          }
          const table = (db as any)[tableName];
          if (table) {
            try {
              let revivedRecords = reviveDates(records);

              // Filter out any IDs that are currently pending deletion locally
              const localDeletedSet = new Set((pendingDeletedIds[tableName] || []).map(String));
              if (localDeletedSet.size > 0) {
                revivedRecords = revivedRecords.filter((r: any) => r?.id === undefined || !localDeletedSet.has(String(r.id)));
              }

              // Singleton normalization for settings table (always id = 1)
              if (tableName === 'settings') {
                if (revivedRecords.length > 0) {
                  const mergedSettings = revivedRecords.reduce((acc: any, item: any) => ({ ...acc, ...item }), {});
                  mergedSettings.id = 1;
                  await db.transaction('rw', table, async () => {
                    const existingKeys = await table.toCollection().primaryKeys();
                    const extraKeys = existingKeys.filter((k: any) => k !== 1);
                    if (extraKeys.length > 0) {
                      await table.bulkDelete(extraKeys);
                    }
                    await table.put(mergedSettings);
                  });
                }
                continue;
              }

              // Deduplicate chartOfAccounts by code and ensure valid id
              if (tableName === 'chartOfAccounts') {
                const byCode = new Map<string, any>();
                let fallbackIdx = 1;
                for (const item of revivedRecords) {
                  if (!item || !item.code) continue;
                  const codeStr = String(item.code);
                  const existing = byCode.get(codeStr);
                  const resolvedId = item.id ?? existing?.id ?? (Number(codeStr) || fallbackIdx++);
                  byCode.set(codeStr, { ...existing, ...item, id: resolvedId });
                }
                revivedRecords = Array.from(byCode.values());
              }

              const protectedLocalIds = unsyncedUpsertIds[tableName] || new Set();

              await db.transaction('rw', table, async () => {
                const existingKeys = await table.toCollection().primaryKeys();
                const incomingKeySet = new Set(revivedRecords.map((r: any) => r.id).filter((id: any) => id !== undefined));
                // Never delete local records that haven't finished pushing yet
                const keysToDelete = existingKeys.filter((k: any) => !incomingKeySet.has(k) && !protectedLocalIds.has(k));
                if (keysToDelete.length > 0) {
                  await table.bulkDelete(keysToDelete);
                }
                // Never overwrite local records that have unsynced local edits
                const recordsToPut = protectedLocalIds.size > 0
                  ? revivedRecords.filter((r: any) => !protectedLocalIds.has(r.id))
                  : revivedRecords;
                if (recordsToPut.length > 0) {
                  await table.bulkPut(recordsToPut);
                }
              });
            } catch (tableErr) {
              console.warn(`[Sync] Warning replacing local table ${tableName}:`, tableErr);
            }
          }
        }
      }

      // Sync currencyUnit cache if settings table was included
      if (Array.isArray(data.settings) && data.settings.length > 0) {
        const latestSetting = data.settings[data.settings.length - 1];
        if (latestSetting?.currencyUnit && typeof window !== 'undefined') {
          localStorage.setItem('arka_currency_unit', latestSetting.currencyUnit);
        }
      }

      // Notify application UI
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arka_db_synced', { detail: { timestamp: Date.now() } }));
      }
    } catch (e) {
      console.error('[Sync] Error replacing local Dexie tables with server data:', e);
    } finally {
      setImportingServerData(false);
    }
  });

  return activeImportPromise;
}

// Attach mutation hooks to Dexie tables so any local create/update/delete triggers auto-push
export function attachSyncHooks() {
  if (hooksAttached) return;
  hooksAttached = true;

  try {
    TABLES_TO_SYNC.forEach((tableName) => {
      const table = (db as any)[tableName];
      if (table && table.hook) {
        table.hook('creating', (_primKey: any, obj: any) => {
          if (tableName === 'settings') {
            if (obj) obj.id = 1;
          } else if (obj && !obj.id) {
            // Prevent primary key collisions across multiple distributed client devices
            const uniqueId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
            obj.id = uniqueId;
          }
          if (!isImportingServerData) {
            if (obj?.id !== undefined) {
              if (!unsyncedUpsertIds[tableName]) unsyncedUpsertIds[tableName] = new Set();
              unsyncedUpsertIds[tableName].add(obj.id);
            }
            localMutationSeq++;
            lastLocalMutationAt = Date.now();
            pendingPushQueued = true;
            triggerServerDbSync(200);
          }
        });

        table.hook('updating', (_mods: any, primKey: any, obj: any) => {
          if (!isImportingServerData) {
            const targetId = primKey ?? obj?.id;
            if (targetId !== undefined) {
              if (!unsyncedUpsertIds[tableName]) unsyncedUpsertIds[tableName] = new Set();
              unsyncedUpsertIds[tableName].add(targetId);
            }
            localMutationSeq++;
            lastLocalMutationAt = Date.now();
            pendingPushQueued = true;
            triggerServerDbSync(200);
          }
        });

        table.hook('deleting', (primKey: any) => {
          if (!isImportingServerData) {
            if (primKey !== undefined) {
              if (!pendingDeletedIds[tableName]) pendingDeletedIds[tableName] = [];
              pendingDeletedIds[tableName].push(Number(primKey) || primKey);
              unsyncedUpsertIds[tableName]?.delete(primKey);
            }
            localMutationSeq++;
            lastLocalMutationAt = Date.now();
            pendingPushQueued = true;
            triggerServerDbSync(200);
          }
        });
      }
    });
  } catch (err) {
    console.warn('[Sync] Failed to attach Dexie table sync hooks:', err);
  }
}

// Check server DB version and pull if server has new data or local version is out of sync
export async function pullServerDbIfNewer(): Promise<boolean> {
  if (isLocalDbIndependent() || isSyncing || isPushing || isImportingServerData) return false;

  // Never pull & overwrite if there are unpushed local changes or a recent local write
  if (pendingPushQueued || pushDebounceTimer !== null || (Date.now() - lastLocalMutationAt < 2500)) {
    if (pendingPushQueued && !isPushing && pushDebounceTimer === null) {
      triggerServerDbSync(100);
    }
    return false;
  }

  isSyncing = true;
  const seqAtPullStart = localMutationSeq;

  try {
    const verRes = await serverFetch('/api/db/version', { signal: safeTimeoutSignal(3000) });
    if (!verRes.ok) {
      isSyncing = false;
      return false;
    }

    // Abort pull if user made any local changes while version check was in flight
    if (localMutationSeq !== seqAtPullStart || pendingPushQueued || isPushing || pushDebounceTimer !== null) {
      isSyncing = false;
      return false;
    }

    const verData = await verRes.json();
    const serverVersion = verData.version || 0;

    if (serverVersion !== knownServerVersion) {
      const syncRes = await serverFetch('/api/db/sync', { signal: safeTimeoutSignal(8000) });
      if (syncRes.ok) {
        // Abort pull if user made any local changes while sync payload was downloading
        if (localMutationSeq !== seqAtPullStart || pendingPushQueued || isPushing || pushDebounceTimer !== null || (Date.now() - lastLocalMutationAt < 2500)) {
          isSyncing = false;
          return false;
        }

        const syncData = await syncRes.json();
        const serverData = syncData.data || {};
        const isClient = isRemoteLanClientBrowser() || getAppExecutionMode() === 'client';
        const serverHasData = Object.keys(serverData).some(
          k => Array.isArray(serverData[k]) && serverData[k].length > 0
        );

        if (serverHasData || isClient) {
          await importServerDataToLocalDb(serverData);
          knownServerVersion = syncData.version || serverVersion;
        } else {
          // Server has no data yet; if local host has data, push to central server
          const localUsersCount = await db.users.count();
          knownServerVersion = syncData.version || serverVersion;
          if (localUsersCount > 0) {
            setTimeout(() => { pushLocalDbToServer(); }, 50);
          }
        }
        isSyncing = false;
        return true;
      }
    }
  } catch (e) {
    // Network error or offline
  } finally {
    isSyncing = false;
  }
  return false;
}

// Setup real-time Server-Sent Events (SSE) connection to listen for instant changes from other computers
function setupLiveSseConnection() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  // In Tauri native shell, lightweight /api/db/version polling handles sync without holding open threads
  if (isTauriNative()) return;

  if (eventSource) {
    try { eventSource.close(); } catch (e) {}
    eventSource = null;
  }

  try {
    const base = getServerBaseUrl();
    const sseUrl = base ? `${base}/api/db/events` : '/api/db/events';
    eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'DB_RESET') {
          resetDatabaseToRawCleanStateLocally().then(() => {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('arka_pos_current_user_id');
              localStorage.removeItem('arka_user');
              window.dispatchEvent(new CustomEvent('arka_db_synced', { detail: { timestamp: Date.now() } }));
              window.location.reload();
            }
          });
        } else if (payload?.type === 'DB_CHANGED') {
          if (payload.version !== knownServerVersion) {
            pullServerDbIfNewer();
          }
        }
      } catch (err) {}
    };

    eventSource.onerror = () => {
      if (eventSource) {
        try { eventSource.close(); } catch (e) {}
        eventSource = null;
      }
    };
  } catch (e) {
    console.warn('[Sync] EventSource setup error:', e);
  }
}

let activeInitialSyncPromise: Promise<boolean> | null = null;

// Initial sync on startup: pulls central authoritative server DB first, or merges/pushes local DB on Server host
export async function initialTwoWaySync(): Promise<boolean> {
  if (isLocalDbIndependent()) return false;
  if (activeInitialSyncPromise) return activeInitialSyncPromise;

  activeInitialSyncPromise = (async () => {
    try {
      const isHostServer = getAppExecutionMode() === 'server' && !isRemoteLanClientBrowser();
      const localUsersCount = await db.users.count();

      // If this machine is the Tauri Desktop Server and already has local data in IndexedDB,
      // push/merge it to the local LAN server first so mobile clients immediately see all server data
      if (isHostServer && isTauriNative() && localUsersCount > 0) {
        const pushed = await pushLocalDbToServer();
        if (pushed) {
          return true;
        }
      }

      const syncRes = await serverFetch('/api/db/sync', { signal: safeTimeoutSignal(8000) });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const serverData = syncData.data || {};
        const isClient = isRemoteLanClientBrowser() || getAppExecutionMode() === 'client';
        const serverHasData = Object.keys(serverData).some(
          k => Array.isArray(serverData[k]) && serverData[k].length > 0
        );

        if (serverHasData || isClient) {
          await importServerDataToLocalDb(serverData);
          if (syncData.version) {
            knownServerVersion = syncData.version;
          }
          return true;
        } else {
          if (syncData.version) {
            knownServerVersion = syncData.version;
          }
          if (localUsersCount > 0) {
            await pushLocalDbToServer();
          }
          return true;
        }
      }
    } catch (err) {
      console.warn('[Sync] Initial sync error (offline mode):', err);
    } finally {
      activeInitialSyncPromise = null;
    }
    return false;
  })();

  return activeInitialSyncPromise;
}

// Start continuous background real-time sync with Linux/Windows server
export async function startServerDbSync(customIntervalMs?: number): Promise<boolean> {
  if (typeof window === 'undefined' || isLocalDbIndependent()) return false;

  // Poll /api/db/version every 3.5s so Windows Tauri Server and Mobile LAN clients stay linked in real-time
  const effectiveIntervalMs = customIntervalMs || 3500;

  // Attach mutation hooks to Dexie tables
  attachSyncHooks();

  // Initial two-way sync on mount FIRST before opening persistent SSE stream
  const synced = await initialTwoWaySync();

  // Connect to Live SSE push channel after initial load so it doesn't block HTTP/1.1 connection slots
  setTimeout(() => {
    setupLiveSseConnection();
  }, 800);

  if (syncInterval) clearInterval(syncInterval);

  // Periodic safety fallback interval
  syncInterval = setInterval(() => {
    pullServerDbIfNewer();
  }, effectiveIntervalMs);

  // Sync when window regains focus or device goes online
  window.addEventListener('focus', () => {
    pullServerDbIfNewer();
  });

  window.addEventListener('online', () => {
    pullServerDbIfNewer();
    if (!eventSource) setupLiveSseConnection();
  });

  return synced;
}

// Debounced auto-push trigger to send any local changes to server
export function triggerServerDbSync(delayMs = 200) {
  pendingPushQueued = true;
  lastLocalMutationAt = Date.now();
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    pushDebounceTimer = null;
    pushLocalDbToServer();
  }, delayMs);
}

