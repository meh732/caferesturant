import { db, setImportingServerData } from './db';
import { pushFullRestoreToServer } from './serverSync';

export type CurrencyUnit = 'toman' | 'rial';

export const getCurrencyUnit = (): CurrencyUnit => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('arka_currency_unit');
    if (saved === 'rial' || saved === 'toman') return saved;
  }
  return 'toman';
};

export const setCurrencyUnitCache = (unit: CurrencyUnit): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('arka_currency_unit', unit);
  }
};

export const getCurrencyLabel = (unitOverride?: CurrencyUnit): string => {
  const unit = unitOverride || getCurrencyUnit();
  return unit === 'rial' ? 'ریال' : 'تومان';
};

/**
 * Strips accidental duplicate currency units like 'تومان تومان', 'ریال ریال', 'تومان ریال'
 */
export const cleanDuplicateCurrencyLabels = (text: string): string => {
  if (!text) return text;
  return text
    .replace(/(تومان)(\s*تومان)+/g, '$1')
    .replace(/(ریال)(\s*ریال)+/g, '$1')
    .replace(/(تومان)(\s*ریال)+/g, '$1')
    .replace(/(ریال)(\s*تومان)+/g, '$1')
    .trim();
};

export const formatCurrency = (amount: number, unitOverride?: CurrencyUnit): string => {
  const label = getCurrencyLabel(unitOverride);
  const formattedNum = new Intl.NumberFormat('fa-IR').format(Number(amount) || 0);
  return `${formattedNum} ${label}`;
};

/**
 * Formats inventory quantity with sub-unit (e.g. 0.15 kg -> 150 گرم (0.15 کیلوگرم))
 * to ensure sub-kilogram quantities like grams are crystal clear.
 */
export const formatQuantityWithSubUnit = (qty: number, unit: string = ''): string => {
  const numQty = Number(qty) || 0;
  const cleanUnit = (unit || '').trim();
  const lowerUnit = cleanUnit.toLowerCase();

  // If unit is kg / کیلوگرم
  if (lowerUnit.includes('کیلو') || lowerUnit === 'kg') {
    const grams = Math.round(numQty * 1000);
    const formattedKg = numQty.toLocaleString('fa-IR', { maximumFractionDigits: 3 });
    const formattedGrams = grams.toLocaleString('fa-IR');

    if (Math.abs(numQty) < 1 && numQty !== 0) {
      return `${formattedGrams} گرم (${formattedKg} کیلوگرم)`;
    }
    return `${formattedKg} کیلوگرم (${formattedGrams} گرم)`;
  }

  // If unit is liter / لیتر
  if (lowerUnit.includes('لیتر') || lowerUnit === 'l') {
    const ml = Math.round(numQty * 1000);
    const formattedL = numQty.toLocaleString('fa-IR', { maximumFractionDigits: 3 });
    const formattedMl = ml.toLocaleString('fa-IR');

    if (Math.abs(numQty) < 1 && numQty !== 0) {
      return `${formattedMl} سی‌سی (${formattedL} لیتر)`;
    }
    return `${formattedL} لیتر (${formattedMl} سی‌سی)`;
  }

  // Standard units (عدد، بسته، گرم، کارتن...)
  const formattedNum = numQty.toLocaleString('fa-IR', { maximumFractionDigits: 3 });
  return `${formattedNum} ${cleanUnit}`;
};

const ALL_DB_TABLES = [
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

function reviveBackupDates(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      const d = new Date(obj);
      if (!isNaN(d.getTime())) return d;
    }
    return obj;
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(reviveBackupDates);
  const res: Record<string, any> = {};
  for (const k of Object.keys(obj)) {
    res[k] = reviveBackupDates(obj[k]);
  }
  return res;
}

export const exportDB = async (): Promise<string> => {
  const tablesData: Record<string, any[]> = {};
  for (const tableName of ALL_DB_TABLES) {
    try {
      const table = (db as any)[tableName];
      if (table) {
        tablesData[tableName] = await table.toArray();
      }
    } catch (e) {
      console.warn(`[Backup] Failed to read table ${tableName}:`, e);
      tablesData[tableName] = [];
    }
  }
  const fullPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    ...tablesData,
    data: tablesData
  };
  return JSON.stringify(fullPayload, null, 2);
};

export const importDB = async (jsonString: string): Promise<{ restoredTables: number; totalRecords: number }> => {
  const cleanJson = (jsonString || '').trim().replace(/^\uFEFF/, '');
  if (!cleanJson) {
    throw new Error('فایل بکاپ خالی است.');
  }

  let rawParsed: any;
  try {
    rawParsed = JSON.parse(cleanJson);
  } catch (parseErr) {
    console.error('Failed to parse backup JSON:', parseErr);
    throw new Error('فرمت فایل بکاپ معتبر نیست (JSON نامعتبر).');
  }

  // Unwrap Bale/Telegram bot wrapper ({ version, exportedAt, data: { ... } }) or nested .data structures
  let sourceData: any = rawParsed;
  if (
    sourceData &&
    typeof sourceData === 'object' &&
    !Array.isArray(sourceData) &&
    sourceData.data &&
    typeof sourceData.data === 'object' &&
    !Array.isArray(sourceData.data)
  ) {
    // Check if actual tables live inside .data
    const hasTablesInData = ALL_DB_TABLES.some(t => Array.isArray(sourceData.data[t]));
    const hasTablesAtRoot = ALL_DB_TABLES.some(t => Array.isArray(sourceData[t]));
    if (hasTablesInData || !hasTablesAtRoot) {
      sourceData = sourceData.data;
    }
  }

  // Validate that at least one known table exists in the backup
  const matchedTables = ALL_DB_TABLES.filter(t => Array.isArray(sourceData?.[t]));
  if (matchedTables.length === 0) {
    throw new Error('هیچ جدول معتبری در فایل بکاپ یافت نشد.');
  }

  let restoredTablesCount = 0;
  let totalRecordsCount = 0;

  setImportingServerData(true);
  try {
    // Clear and restore every single table atomically per table so all 28 tables (including users/passwords) are 100% restored
    for (const tableName of ALL_DB_TABLES) {
      const table = (db as any)[tableName];
      if (!table) continue;

      const rawRecords = Array.isArray(sourceData[tableName]) ? sourceData[tableName] : [];
      let revivedRecords: any[] = reviveBackupDates(rawRecords);

      if (tableName === 'settings') {
        await db.transaction('rw', table, async () => {
          await table.clear();
          if (revivedRecords.length > 0) {
            const mergedSettings = revivedRecords.reduce((acc: any, item: any) => ({ ...acc, ...item }), {});
            mergedSettings.id = 1;
            await table.put(mergedSettings);
            if (mergedSettings.currencyUnit) {
              setCurrencyUnitCache(mergedSettings.currencyUnit);
            }
            restoredTablesCount++;
            totalRecordsCount++;
          }
        });
        continue;
      }

      if (tableName === 'chartOfAccounts' && revivedRecords.length > 0) {
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

      await db.transaction('rw', table, async () => {
        await table.clear();
        if (revivedRecords.length > 0) {
          await table.bulkPut(revivedRecords);
          restoredTablesCount++;
          totalRecordsCount += revivedRecords.length;
        }
      });
    }

    // Ensure restored users & passwords immediately take effect in localStorage session
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_wants_raw_clean');
      const restoredUsers = await db.users.toArray();
      if (restoredUsers.length > 0) {
        const currentSavedId = Number(localStorage.getItem('arka_pos_current_user_id'));
        const matchingCurrent = restoredUsers.find(u => u.id === currentSavedId && u.isActive);
        if (!matchingCurrent) {
          const adminUser = restoredUsers.find(u => u.role === 'admin' && u.isActive) || restoredUsers[0];
          if (adminUser?.id) {
            localStorage.setItem('arka_pos_current_user_id', String(adminUser.id));
          } else {
            localStorage.removeItem('arka_pos_current_user_id');
          }
        }
      }
    }
  } finally {
    setImportingServerData(false);
  }

  // Push the complete restored database with replaceAll: true to the central server (Linux / Windows Tauri)
  try {
    await pushFullRestoreToServer();
  } catch (syncErr) {
    console.warn('[Backup] Warning pushing full restore to server:', syncErr);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('arka_db_synced', { detail: { timestamp: Date.now(), restored: true } }));
  }

  return { restoredTables: restoredTablesCount, totalRecords: totalRecordsCount };
};


const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

export const numberToPersianWords = (num: number, unitOverride?: CurrencyUnit): string => {
  const label = getCurrencyLabel(unitOverride);
  if (isNaN(num) || num === 0) return `صفر ${label}`;
  const isNegative = num < 0;
  let absNum = Math.floor(Math.abs(num));

  const chunks: number[] = [];
  while (absNum > 0) {
    chunks.push(absNum % 1000);
    absNum = Math.floor(absNum / 1000);
  }

  const chunkToWords = (n: number): string => {
    const parts: string[] = [];
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (h > 0) parts.push(HUNDREDS[h]);
    if (r > 0) {
      if (r < 10) {
        parts.push(ONES[r]);
      } else if (r >= 10 && r < 20) {
        parts.push(TEENS[r - 10]);
      } else {
        const t = Math.floor(r / 10);
        const u = r % 10;
        parts.push(TENS[t]);
        if (u > 0) parts.push(ONES[u]);
      }
    }
    return parts.join(' و ');
  };

  const words: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (chunk === 0) continue;
    const chunkWord = chunkToWords(chunk);
    const scale = SCALES[i];
    if (scale) {
      words.push(`${chunkWord} ${scale}`);
    } else {
      words.push(chunkWord);
    }
  }

  return (isNegative ? 'منفی ' : '') + words.join(' و ') + ` ${label}`;
};

