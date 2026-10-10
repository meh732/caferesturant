import { db } from './db';

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
  'systemNotifications'
] as const;

let knownServerVersion = -1;
let isSyncing = false;
let isPushing = false;
let syncInterval: any = null;
let hooksAttached = false;

export let isImportingServerData = false;

export function setImportingServerData(val: boolean) {
  isImportingServerData = val;
}

// BroadcastChannel for instant same-browser multi-tab/window synchronization
const syncBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('arka_db_sync_bus')
  : null;

if (syncBroadcast) {
  syncBroadcast.onmessage = (event) => {
    if (event.data?.type === 'db_updated') {
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

// Push local Dexie DB snapshot to central server
export async function pushLocalDbToServer(): Promise<boolean> {
  if (isPushing || isImportingServerData) return false;
  isPushing = true;
  try {
    const data = await exportLocalDbToData();
    const res = await fetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const result = await res.json();
      if (result && typeof result.version === 'number') {
        knownServerVersion = result.version;
      }
      if (syncBroadcast) {
        try {
          syncBroadcast.postMessage({ type: 'db_updated', version: knownServerVersion, timestamp: Date.now() });
        } catch (e) {}
      }
      isPushing = false;
      return true;
    }
  } catch (e) {
    // Server push failed or offline
  } finally {
    isPushing = false;
  }
  return false;
}

// Import server data object into Dexie DB (Full replacement to guarantee exact sync across all network clients)
export async function importServerDataToLocalDb(data: Record<string, any[]>): Promise<void> {
  if (!data || typeof data !== 'object') return;

  const tableNames = Object.keys(data).filter(name => TABLES_TO_SYNC.includes(name as any));
  if (tableNames.length === 0) return;

  setImportingServerData(true);

  try {
    for (const tableName of tableNames) {
      const records = data[tableName];
      if (Array.isArray(records)) {
        const table = (db as any)[tableName];
        if (table) {
          try {
            await table.clear();
            const revivedRecords = reviveDates(records);
            if (revivedRecords.length > 0) {
              await table.bulkPut(revivedRecords);
            }
          } catch (tableErr) {
            console.warn(`[Sync] Warning replacing local table ${tableName}:`, tableErr);
          }
        }
      }
    }

    // Notify application UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('arka_db_synced', { detail: { timestamp: Date.now() } }));
    }
  } catch (e) {
    console.error('[Sync] Error replacing local Dexie tables with server data:', e);
  } finally {
    setTimeout(() => {
      setImportingServerData(false);
    }, 250);
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
        table.hook('creating', () => {
          if (!isImportingServerData) {
            triggerServerDbSync(300);
          }
        });
        table.hook('updating', () => {
          if (!isImportingServerData) {
            triggerServerDbSync(300);
          }
        });
        table.hook('deleting', () => {
          if (!isImportingServerData) {
            triggerServerDbSync(300);
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
  if (isSyncing || isPushing) return false;
  isSyncing = true;

  try {
    const verRes = await fetch('/api/db/version', { signal: AbortSignal.timeout(3000) });
    if (!verRes.ok) {
      isSyncing = false;
      return false;
    }

    const verData = await verRes.json();
    const serverVersion = verData.version || 0;

    // ALWAYS pull if our knownServerVersion is different from serverVersion
    if (serverVersion !== knownServerVersion) {
      const syncRes = await fetch('/api/db/sync', { signal: AbortSignal.timeout(8000) });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const serverData = syncData.data || {};
        const hasRecords = Object.values(serverData).some((arr: any) => Array.isArray(arr) && arr.length > 0);

        if (hasRecords) {
          // If server has data, import it locally
          await importServerDataToLocalDb(serverData);
          knownServerVersion = syncData.version || serverVersion;
        } else if (knownServerVersion === -1) {
          // Server is completely empty, push our local DB to initialize the server central database
          await pushLocalDbToServer();
        } else {
          knownServerVersion = serverVersion;
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

// Start continuous background real-time sync with Linux server
export async function startServerDbSync(pollIntervalMs = 1000): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // Attach mutation hooks to Dexie tables
  attachSyncHooks();

  // Initial pull on mount
  const pulled = await pullServerDbIfNewer();

  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(() => {
    pullServerDbIfNewer();
  }, pollIntervalMs);

  // Sync when window regains focus
  window.addEventListener('focus', () => {
    pullServerDbIfNewer();
  });

  return pulled;
}

// Debounced auto-push trigger to send any local changes to server
let pushDebounceTimer: any = null;
export function triggerServerDbSync(delayMs = 300) {
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    pushLocalDbToServer();
  }, delayMs);
}
