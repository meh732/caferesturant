import { db, setImportingServerData, cleanupOrphanedMenuItemsAndRecipes } from './db';
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

/**
 * Converts Persian/Arabic digits and formatted strings into a clean finite JS number.
 * Prevents string concatenation ("6 zeros added") and NaN/Infinity bugs.
 */
export const parseSafeNumber = (val: unknown): number => {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'string') {
    const normalized = val
      .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
      .replace(/[,٬_\s]/g, '')
      .replace(/تومان|ریال/g, '')
      .trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/**
 * Ensures monetary values (Toman / Rial) are ALWAYS exact integers with zero decimals
 * and never strings (preventing string concatenation like 100000 + "200000" -> "100000200000").
 */
export const toSafeMoney = (val: unknown): number => {
  const rounded = Math.round(parseSafeNumber(val));
  return Object.is(rounded, -0) ? 0 : rounded;
};

/**
 * Ensures inventory quantities (kg, liter, gram, unit) are rounded to at most 4 decimal places,
 * eliminating IEEE-754 floating-point drift like 0.1 + 0.2 = 0.30000000000000004.
 */
export const toSafeQty = (val: unknown): number => {
  const num = parseSafeNumber(val);
  const rounded = Math.round((num + Number.EPSILON) * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/**
 * Ensures percentage values are clean numbers with at most 2 decimal places.
 */
export const toSafePercent = (val: unknown): number => {
  const num = parseSafeNumber(val);
  const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const MONEY_FIELDS_BY_TABLE: Record<string, string[]> = {
  menuItems: ['price'],
  orders: [
    'subtotal',
    'taxAmount',
    'total',
    'cogsAmount',
    'walletAmount',
    'cardAmount',
    'cashAmount',
    'deliveryFee',
    'serviceFee',
    'snappfoodDeliveryFee'
  ],
  customers: ['walletBalance', 'creditLimit', 'balance', 'totalSpent', 'loyaltyPoints'],
  customerWalletTransactions: ['amount', 'walletBalanceAfter', 'balanceAfter'],
  networkOrders: ['subtotal', 'topupAmount'],
  expenses: ['amount', 'unitPrice'],
  rawMaterials: ['unitPrice', 'weightedAveragePrice'],
  warehouseTransfers: ['totalValue'],
  stockTransactions: ['unitCost', 'totalCost'],
  recipes: ['overheadCost', 'totalCost'],
  employees: ['baseSalary'],
  salaryPayments: ['baseAmount', 'bonusAmount', 'deductionsAmount', 'totalPaid'],
  bankAccounts: ['initialBalance', 'balance'],
  cashBoxes: ['initialBalance', 'balance'],
  cheques: ['amount'],
  financialTransactions: ['amount', 'balanceAfter'],
  journalEntries: ['totalDebit', 'totalCredit']
};

const QTY_FIELDS_BY_TABLE: Record<string, string[]> = {
  expenses: ['quantity'],
  rawMaterials: ['minStockAlert'],
  warehouseStocks: ['quantity'],
  warehouseTransfers: ['totalQuantity'],
  stockTransactions: ['quantityChange', 'quantityBefore', 'quantityAfter'],
  recipes: ['yieldQuantity']
};

/**
 * Sanitizes all monetary and quantity fields on a database record in-place and returns it,
 * guaranteeing that no string numbers or floating-point artifacts ever enter or leave the database.
 */
export function sanitizeDbRecord<T = any>(tableName: string, record: T): T {
  if (!record || typeof record !== 'object') return record;
  const obj = record as Record<string, any>;

  const moneyFields = MONEY_FIELDS_BY_TABLE[tableName];
  if (moneyFields) {
    for (const field of moneyFields) {
      if (obj[field] !== undefined && obj[field] !== null) {
        obj[field] = toSafeMoney(obj[field]);
      }
    }
  }

  const qtyFields = QTY_FIELDS_BY_TABLE[tableName];
  if (qtyFields) {
    for (const field of qtyFields) {
      if (obj[field] !== undefined && obj[field] !== null) {
        obj[field] = toSafeQty(obj[field]);
      }
    }
  }

  if (tableName === 'orders') {
    if (obj.discountValue !== undefined && obj.discountValue !== null) {
      obj.discountValue = obj.discountType === 'percent' ? toSafePercent(obj.discountValue) : toSafeMoney(obj.discountValue);
    }
    if (obj.taxPercentage !== undefined && obj.taxPercentage !== null) {
      obj.taxPercentage = toSafePercent(obj.taxPercentage);
    }
    if (Array.isArray(obj.items)) {
      obj.items = obj.items.map((it: any) => ({
        ...it,
        price: toSafeMoney(it?.price),
        quantity: toSafeQty(it?.quantity)
      }));
    }
  } else if (tableName === 'networkOrders') {
    if (Array.isArray(obj.items)) {
      obj.items = obj.items.map((it: any) => ({
        ...it,
        price: toSafeMoney(it?.price),
        quantity: toSafeQty(it?.quantity)
      }));
    }
  } else if (tableName === 'warehouseTransfers') {
    if (Array.isArray(obj.items)) {
      obj.items = obj.items.map((it: any) => ({
        ...it,
        quantity: toSafeQty(it?.quantity),
        unitPrice: toSafeMoney(it?.unitPrice),
        totalAmount: toSafeMoney(it?.totalAmount)
      }));
    }
  } else if (tableName === 'recipes') {
    if (Array.isArray(obj.ingredients)) {
      obj.ingredients = obj.ingredients.map((ing: any) => ({
        ...ing,
        quantity: toSafeQty(ing?.quantity),
        unitCost: toSafeMoney(ing?.unitCost),
        itemTotalCost: toSafeMoney(ing?.itemTotalCost)
      }));
    }
  } else if (tableName === 'journalEntries') {
    if (Array.isArray(obj.lines)) {
      obj.lines = obj.lines.map((ln: any) => ({
        ...ln,
        debit: toSafeMoney(ln?.debit),
        credit: toSafeMoney(ln?.credit)
      }));
    }
  } else if (tableName === 'customers') {
    if (obj.cashbackPercent !== undefined && obj.cashbackPercent !== null) {
      obj.cashbackPercent = toSafePercent(obj.cashbackPercent);
    }
  }

  return record;
}

export const formatCurrency = (amount: unknown, unitOverride?: CurrencyUnit): string => {
  const label = getCurrencyLabel(unitOverride);
  const cleanInt = toSafeMoney(amount);
  const formattedNum = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(cleanInt);
  return `${formattedNum} ${label}`;
};

/**
 * Formats inventory quantity with sub-unit (e.g. 0.15 kg -> 150 گرم (0.15 کیلوگرم))
 * to ensure sub-kilogram quantities like grams are crystal clear.
 */
export const formatQuantityWithSubUnit = (qty: unknown, unit: string = ''): string => {
  const numQty = toSafeQty(qty);
  const cleanUnit = (unit || '').trim();
  const lowerUnit = cleanUnit.toLowerCase();

  // If unit is kg / کیلوگرم
  if (lowerUnit.includes('کیلو') || lowerUnit === 'kg') {
    const grams = Math.round(numQty * 1000);
    const formattedKg = numQty.toLocaleString('fa-IR', { maximumFractionDigits: 3 });
    const formattedGrams = grams.toLocaleString('fa-IR', { maximumFractionDigits: 0 });

    if (Math.abs(numQty) < 1 && numQty !== 0) {
      return `${formattedGrams} گرم (${formattedKg} کیلوگرم)`;
    }
    return `${formattedKg} کیلوگرم (${formattedGrams} گرم)`;
  }

  // If unit is liter / لیتر
  if (lowerUnit.includes('لیتر') || lowerUnit === 'l') {
    const ml = Math.round(numQty * 1000);
    const formattedL = numQty.toLocaleString('fa-IR', { maximumFractionDigits: 3 });
    const formattedMl = ml.toLocaleString('fa-IR', { maximumFractionDigits: 0 });

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
      let revivedRecords: any[] = reviveBackupDates(rawRecords).map((r: any) => sanitizeDbRecord(tableName, r));

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

  // Clean up any orphaned menu items from deleted categories or orphaned recipes
  try {
    await cleanupOrphanedMenuItemsAndRecipes();
  } catch (cleanErr) {
    console.warn('[Backup] Warning cleaning orphaned items on import:', cleanErr);
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

