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
let hooksAttached = false;

export let isImportingServerData = false;

export function setImportingServerData(val: boolean) {
  isImportingServerData = val;
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
      signal: AbortSignal.timeout(6000)
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

// Smart merge between server records and local records to prevent data loss
export async function smartMergeServerAndLocalData(serverData: Record<string, any[]>): Promise<void> {
  if (!serverData || typeof serverData !== 'object') return;

  setImportingServerData(true);

  try {
    for (const tableName of TABLES_TO_SYNC) {
      const serverRecords = serverData[tableName] || [];
      const table = (db as any)[tableName];
      if (!table) continue;

      const localRecords = await table.toArray();

      if (localRecords.length === 0) {
        // Local is empty, insert server records
        if (serverRecords.length > 0) {
          await table.clear();
          await table.bulkAdd(reviveDates(serverRecords));
        }
      } else if (serverRecords.length === 0) {
        // Server is empty, keep local records as is
      } else {
        // Both local and server have records -> MERGE intelligently
        const mergedItems: any[] = [];
        const seenKeys = new Set<string>();

        const getItemKey = (item: any) => {
          if (!item) return '';
          if (item.name && typeof item.name === 'string') return `${tableName}_name_${item.name.trim().toLowerCase()}`;
          if (item.title && typeof item.title === 'string') return `${tableName}_title_${item.title.trim().toLowerCase()}`;
          if (item.code && typeof item.code === 'string') return `${tableName}_code_${item.code.trim()}`;
          if (item.invoiceNumber) return `${tableName}_invoice_${item.invoiceNumber}`;
          if (item.id !== undefined && item.id !== null) return `${tableName}_id_${item.id}`;
          return `${tableName}_json_${JSON.stringify(item)}`;
        };

        // 1. Add all server items
        for (const sItem of serverRecords) {
          const key = getItemKey(sItem);
          seenKeys.add(key);
          mergedItems.push(sItem);
        }

        // 2. Add local items that do not exist on server (e.g. "نان و مرغ تستی")
        let maxId = mergedItems.reduce((max, item) => Math.max(max, typeof item.id === 'number' ? item.id : 0), 0);

        for (const lItem of localRecords) {
          const key = getItemKey(lItem);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            // If local item has an ID that conflicts with an existing item on server, give it a new unique ID
            const conflictIdIndex = mergedItems.findIndex(m => m.id === lItem.id);
            if (conflictIdIndex !== -1 && typeof lItem.id === 'number') {
              maxId++;
              mergedItems.push({ ...lItem, id: maxId });
            } else {
              mergedItems.push(lItem);
              if (typeof lItem.id === 'number') maxId = Math.max(maxId, lItem.id);
            }
          }
        }

        // Replace local Dexie table with merged dataset
        await table.clear();
        const revivedMerged = reviveDates(mergedItems);
        if (revivedMerged.length > 0) {
          await table.bulkAdd(revivedMerged);
        }
      }
    }

    // Notify UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('arka_db_synced', { detail: { timestamp: Date.now() } }));
    }
  } catch (err) {
    console.error('[Sync] Error during smart merge:', err);
  } finally {
    setTimeout(() => {
      setImportingServerData(false);
    }, 150);
  }
}

// Import server data object into Dexie DB
export async function importServerDataToLocalDb(data: Record<string, any[]>): Promise<void> {
  if (!data || typeof data !== 'object') return;

  const tableNames = Object.keys(data).filter(name => TABLES_TO_SYNC.includes(name as any));
  if (tableNames.length === 0) return;

  setImportingServerData(true);

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
  } finally {
    setTimeout(() => {
      setImportingServerData(false);
    }, 150);
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

    if (localVersion === 0) {
      // First check after page load/reload: fetch server DB and perform SMART MERGE
      const syncRes = await fetch('/api/db/sync', { signal: AbortSignal.timeout(6000) });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const serverData = syncData.data || {};
        
        await smartMergeServerAndLocalData(serverData);
        localVersion = serverVersion > 0 ? serverVersion : 1;
        
        // Push merged state back to server so server DB gets any local items like "نان و مرغ تستی"
        await pushLocalDbToServer();
      }
      isSyncing = false;
      return true;
    } else if (serverVersion > localVersion) {
      // Server version incremented while app is running: import server data
      const syncRes = await fetch('/api/db/sync', { signal: AbortSignal.timeout(6000) });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const serverData = syncData.data || {};
        const hasRecords = Object.values(serverData).some((arr: any) => Array.isArray(arr) && arr.length > 0);

        if (hasRecords) {
          await importServerDataToLocalDb(serverData);
          localVersion = serverVersion;
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
export function startServerDbSync(pollIntervalMs = 1500) {
  if (typeof window === 'undefined') return;

  // Attach mutation hooks to Dexie tables
  attachSyncHooks();

  // Initial pull or merge on mount
  pullServerDbIfNewer();

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
