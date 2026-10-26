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

export function getAppExecutionMode(): 'server' | 'client' | 'standalone' {
  if (typeof window === 'undefined') return 'standalone';
  const mode = localStorage.getItem('arka_tauri_mode');
  if (mode === 'server' || mode === 'client') return mode;
  return 'standalone';
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
  } else if (mode === 'server') {
    localStorage.removeItem('arka_server_url');
  }
}

export function getServerBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const custom = localStorage.getItem('arka_server_url');
  if (custom && custom.trim()) {
    let clean = custom.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean;
  }
  return '';
}

export function serverFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const base = getServerBaseUrl();
  const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : (base ? `${base}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}` : endpoint);
  return fetch(url, init);
}

export function updateKnownServerVersion(ver: number) {
  if (typeof ver === 'number' && ver > knownServerVersion) {
    knownServerVersion = ver;
  }
}

export function isLocalDbIndependent(): boolean {
  if (typeof window === 'undefined') return false;
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

// Import server data object into Dexie DB safely inside atomic per-table transactions
export async function importServerDataToLocalDb(data: Record<string, any[]>): Promise<void> {
  if (!data || typeof data !== 'object') return;

  const tableNames = Object.keys(data).filter(name => TABLES_TO_SYNC.includes(name as any));
  if (tableNames.length === 0) return;

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
      // If SSE connection drops (e.g. sleep, WiFi blip), close and let fallback interval handle it
      if (eventSource) {
        try { eventSource.close(); } catch (e) {}
        eventSource = null;
      }
      // Retry SSE after 5 seconds
      setTimeout(() => {
        if (!eventSource) setupLiveSseConnection();
      }, 5000);
    };
  } catch (e) {
    console.warn('[Sync] EventSource setup error:', e);
  }
}

// Initial sync on startup: pulls central authoritative server DB first, or pushes local DB if server is empty
export async function initialTwoWaySync(): Promise<boolean> {
  if (isLocalDbIndependent()) return false;
  try {
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
        const localUsersCount = await db.users.count();
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
  }
  return false;
}

// Start continuous background real-time sync with Linux/Windows server
export async function startServerDbSync(customIntervalMs?: number): Promise<boolean> {
  if (typeof window === 'undefined' || isLocalDbIndependent()) return false;

  // In Server Mode, the host machine is authoritative and SSE pushes instantly, so 15s safety polling is optimal
  // In Client Mode, poll every 5s as safety net for SSE
  const mode = getAppExecutionMode();
  const effectiveIntervalMs = customIntervalMs || (mode === 'server' ? 15000 : 5000);

  // Attach mutation hooks to Dexie tables
  attachSyncHooks();

  // Connect to Live SSE push channel
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

