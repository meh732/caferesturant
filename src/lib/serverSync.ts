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

let localVersion = 0;
let isSyncing = false;
let isPushing = false;
let syncInterval: any = null;

// Convert Dates in object/array to Date objects
function reviveDates(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Check if string matches ISO date format
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
  if (isPushing) return false;
  isPushing = true;
  try {
    const data = await exportLocalDbToData();
    const res = await fetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const result = await res.json();
      if (result && result.version) {
        localVersion = result.version;
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

// Import server data object into Dexie DB
export async function importServerDataToLocalDb(data: Record<string, any[]>): Promise<void> {
  if (!data || typeof data !== 'object') return;

  const tableNames = Object.keys(data).filter(name => TABLES_TO_SYNC.includes(name as any));
  if (tableNames.length === 0) return;

  try {
    await db.transaction('rw', tableNames.map(name => (db as any)[name]), async () => {
      for (const tableName of tableNames) {
        const records = data[tableName];
        if (Array.isArray(records)) {
          const table = (db as any)[tableName];
          if (table) {
            await table.clear();
            const revivedRecords = reviveDates(records);
            if (revivedRecords.length > 0) {
              await table.bulkAdd(revivedRecords);
            }
          }
        }
      }
    });

    // Notify application UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('arka_db_synced', { detail: { timestamp: Date.now() } }));
    }
  } catch (e) {
    console.error('[Sync] Error replacing local Dexie tables with server data:', e);
  }
}

// Check server DB version and pull if server has new data
export async function pullServerDbIfNewer(): Promise<boolean> {
  if (isSyncing) return false;
  isSyncing = true;

  try {
    const verRes = await fetch('/api/db/version', { signal: AbortSignal.timeout(2000) });
    if (!verRes.ok) {
      isSyncing = false;
      return false;
    }

    const verData = await verRes.json();
    const serverVersion = verData.version || 0;

    // Check if server is newer
    if (serverVersion > localVersion) {
      const syncRes = await fetch('/api/db/sync', { signal: AbortSignal.timeout(5000) });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const serverData = syncData.data || {};
        
        // If server data has records, import into local Dexie
        const hasRecords = Object.values(serverData).some((arr: any) => Array.isArray(arr) && arr.length > 0);
        if (hasRecords) {
          await importServerDataToLocalDb(serverData);
          localVersion = serverVersion;
          isSyncing = false;
          return true;
        } else if (localVersion === 0) {
          // Server DB is empty, push our local DB to server to initialize server DB
          await pushLocalDbToServer();
        }
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
export function startServerDbSync(pollIntervalMs = 2500) {
  if (typeof window === 'undefined') return;

  // Initial pull or push on mount
  pullServerDbIfNewer().then((updated) => {
    if (!updated && localVersion === 0) {
      pushLocalDbToServer();
    }
  });

  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(() => {
    pullServerDbIfNewer();
  }, pollIntervalMs);

  // Sync when window regains focus
  window.addEventListener('focus', () => {
    pullServerDbIfNewer();
  });
}

// Debounced auto-push trigger to send any local changes to server
let pushDebounceTimer: any = null;
export function triggerServerDbSync(delayMs = 300) {
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    pushLocalDbToServer();
  }, delayMs);
}
