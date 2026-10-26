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

export async function computeActivationKeyWeb(machineId: string): Promise<string> {
  const cleanId = (machineId || '').trim().toUpperCase();
  const enc = new TextEncoder();
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(MASTER_SALT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuf = await window.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    enc.encode(`SERVER_LICENSE:${cleanId}`)
  );
  const hashArray = Array.from(new Uint8Array(signatureBuf));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

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
  const hashBuf = await window.crypto.subtle.digest('SHA-256', enc.encode(traits));
  const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
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
  // 1. If inside Tauri Desktop (Windows/Linux), query native Rust hardware fingerprint & license command first
  if (isTauriNative()) {
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
  try {
    const res = await serverFetch('/api/license/status', { signal: AbortSignal.timeout(3000) });
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
  } catch (e) {}

  // 3. Deterministic fallback so Machine ID is NEVER empty or stuck loading
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
  try {
    await serverFetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: cleanKey }),
      signal: AbortSignal.timeout(3000)
    });
  } catch (e) {}

  const nowIso = new Date().toISOString();
  localStorage.setItem('arka_server_license_key', cleanKey);
  localStorage.setItem('arka_server_license_at', nowIso);

  return {
    success: true,
    message: 'سرور آرکا با موفقیت فعال‌سازی شد و به سخت‌افزار این رایانه قفل گردید.',
    status: {
      isActivated: true,
      machineId: currentStatus.machineId,
      licenseKey: cleanKey,
      activatedAt: nowIso
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
      signal: AbortSignal.timeout(8000)
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
    const verRes = await serverFetch('/api/db/version', { signal: AbortSignal.timeout(3000) });
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
      const syncRes = await serverFetch('/api/db/sync', { signal: AbortSignal.timeout(8000) });
      if (syncRes.ok) {
        // Abort pull if user made any local changes while sync payload was downloading
        if (localMutationSeq !== seqAtPullStart || pendingPushQueued || isPushing || pushDebounceTimer !== null || (Date.now() - lastLocalMutationAt < 2500)) {
          isSyncing = false;
          return false;
        }

        const syncData = await syncRes.json();
        const serverData = syncData.data || {};
        const serverHasUsers = Array.isArray(serverData.users) && serverData.users.length > 0;

        if (serverHasUsers) {
          await importServerDataToLocalDb(serverData);
          knownServerVersion = syncData.version || serverVersion;
        } else {
          // Server has no users yet; if local client has users, push them to server instead of wiping local DB
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

      const syncRes = await serverFetch('/api/db/sync', { signal: AbortSignal.timeout(8000) });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const serverData = syncData.data || {};
        const serverHasUsers = Array.isArray(serverData.users) && serverData.users.length > 0;

        if (serverHasUsers) {
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

  // Connect to Live SSE push channel (on Node/Express servers)
  setupLiveSseConnection();

  // Initial two-way sync on mount
  const synced = await initialTwoWaySync();

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

