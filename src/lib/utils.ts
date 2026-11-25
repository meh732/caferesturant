import { db, setImportingServerData, cleanupOrphanedMenuItemsAndRecipes } from './db';
import {
  pushFullRestoreToServer,
  pullServerDbIfNewer,
  updateKnownServerVersion,
  serverFetch,
  safeTimeoutSignal
} from './serverSync';

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

function sqlEscapeLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function extractClientRecordId(tableName: string, row: any, idx: number): string {
  if (!row || typeof row !== 'object') return `row_${idx}`;
  if (tableName === 'settings') return '1';
  if (tableName === 'chartOfAccounts' && row.code !== undefined && row.code !== null && String(row.code).trim() !== '') {
    return String(row.code);
  }
  if (row.id !== undefined && row.id !== null && String(row.id).trim() !== '') {
    return String(row.id);
  }
  if (row.tempId !== undefined && row.tempId !== null && String(row.tempId).trim() !== '') {
    return String(row.tempId);
  }
  return `row_${idx}`;
}

/**
 * Exports a complete, cross-version PostgreSQL transactional backup (.sql).
 * Always prefers live PostgreSQL dump from the central server; generates identical portable SQL from local DB if offline.
 */
export const exportPostgreSqlDump = async (): Promise<string> => {
  if (typeof window !== 'undefined') {
    try {
      const res = await serverFetch('/api/db/backup/sql', {
        signal: safeTimeoutSignal(20000)
      });
      if (res.ok) {
        const sqlText = await res.text();
        if (sqlText && (sqlText.includes('arka_records') || sqlText.includes('BEGIN;'))) {
          return sqlText;
        }
      }
    } catch (e) {
      console.warn('[PostgreSQL Backup] Server SQL dump unavailable, generating portable PostgreSQL SQL from local DB:', e);
    }
  }

  const lines: string[] = [
    '-- Arka POS PostgreSQL Full Transactional Backup',
    '-- Format Version: 2 (Cross-Version Compatible: PostgreSQL 12-18 Linux/Windows)',
    `-- Exported At: ${new Date().toISOString()}`,
    '-- Database: arka_pos',
    'BEGIN;',
    '',
    'CREATE TABLE IF NOT EXISTS arka_meta (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());',
    'CREATE TABLE IF NOT EXISTS arka_records (table_name TEXT NOT NULL, record_id TEXT NOT NULL, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (table_name, record_id));',
    'CREATE INDEX IF NOT EXISTS idx_arka_records_table ON arka_records (table_name);',
    "CREATE TABLE IF NOT EXISTS arka_backups (id BIGSERIAL PRIMARY KEY, backup_type TEXT NOT NULL, db_version BIGINT NOT NULL, stats JSONB NOT NULL DEFAULT '{}'::jsonb, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());",
    '',
    'TRUNCATE TABLE arka_records;',
    `INSERT INTO arka_meta (key, value, updated_at) VALUES ('db_version', '1'::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
    `INSERT INTO arka_meta (key, value, updated_at) VALUES ('last_updated', '${Date.now()}'::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
    `INSERT INTO arka_meta (key, value, updated_at) VALUES ('is_raw_clean', 'false'::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`
  ];

  for (const tableName of ALL_DB_TABLES) {
    try {
      const table = (db as any)[tableName];
      if (!table) continue;
      const rows = await table.toArray();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || typeof row !== 'object') continue;
        const recId = extractClientRecordId(tableName, row, i);
        lines.push(
          `INSERT INTO arka_records (table_name, record_id, payload, updated_at) VALUES (${sqlEscapeLiteral(tableName)}, ${sqlEscapeLiteral(recId)}, ${sqlEscapeLiteral(JSON.stringify(row))}::jsonb, NOW()) ON CONFLICT (table_name, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();`
        );
      }
    } catch (e) {
      console.warn(`[PostgreSQL Backup] Failed reading local table ${tableName}:`, e);
    }
  }

  lines.push('COMMIT;');
  lines.push('');
  return lines.join('\n');
};

function parseClientSqlValuesFromInsertLine(line: string): string[] {
  const upper = line.toUpperCase();
  const valIdx = upper.indexOf('VALUES');
  if (valIdx === -1) return [];
  const openIdx = line.indexOf('(', valIdx + 6);
  if (openIdx === -1) return [];

  const results: string[] = [];
  let i = openIdx + 1;
  const n = line.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(line[i])) i++;
    if (i >= n || line[i] === ')') break;
    if (line[i] === "'") {
      i++;
      let out = '';
      while (i < n) {
        if (line[i] === "'") {
          if (i + 1 < n && line[i + 1] === "'") {
            out += "'";
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          out += line[i];
          i++;
        }
      }
      results.push(out);
      while (i < n && line[i] !== ',' && line[i] !== ')') i++;
      if (i < n && line[i] === ')') break;
    } else {
      let token = '';
      let depth = 0;
      while (i < n) {
        const ch = line[i];
        if (ch === '(') {
          depth++;
          token += ch;
          i++;
        } else if (ch === ')') {
          if (depth === 0) break;
          depth--;
          token += ch;
          i++;
        } else if (ch === ',' && depth === 0) {
          break;
        } else {
          token += ch;
          i++;
        }
      }
      results.push(token.trim());
      if (i < n && line[i] === ')') break;
    }
  }
  return results;
}

function unescapeClientCopyField(field: string): string | null {
  if (field === '\\N') return null;
  let out = '';
  for (let i = 0; i < field.length; i++) {
    if (field[i] === '\\' && i + 1 < field.length) {
      const next = field[i + 1];
      if (next === 'n') out += '\n';
      else if (next === 'r') out += '\r';
      else if (next === 't') out += '\t';
      else if (next === 'b') out += '\b';
      else if (next === 'f') out += '\f';
      else if (next === '\\') out += '\\';
      else out += next;
      i++;
    } else {
      out += field[i];
    }
  }
  return out;
}

/**
 * Restores a PostgreSQL .sql backup file directly into the central PostgreSQL server
 * and refreshes local IndexedDB cache immediately. Falls back to safe offline SQL parsing if no server is reachable.
 */
export const importSqlBackup = async (
  sqlText: string
): Promise<{ restoredTables: number; totalRecords: number; storageEngine: string }> => {
  const cleanSql = (sqlText || '').replace(/^\uFEFF/, '');
  if (!cleanSql.trim()) {
    throw new Error('فایل بکاپ SQL خالی است.');
  }

  // 1. Primary path: Restore atomically on the PostgreSQL server via POST /api/db/restore/sql
  if (typeof window !== 'undefined') {
    try {
      const res = await serverFetch('/api/db/restore/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: cleanSql }),
        signal: safeTimeoutSignal(45000)
      });

      const payload = await res.json().catch(() => null);
      if (res.ok && payload?.status === 'ok') {
        // Force immediate local cache refresh from the authoritative restored PostgreSQL database
        localStorage.removeItem('user_wants_raw_clean');
        updateKnownServerVersion(0);
        await pullServerDbIfNewer().catch(() => {});

        // Ensure active user session points to a valid restored user
        const restoredUsers = await db.users.toArray();
        if (restoredUsers.length > 0) {
          const currentSavedId = Number(localStorage.getItem('arka_pos_current_user_id'));
          const matchingCurrent = restoredUsers.find(u => u.id === currentSavedId && u.isActive);
          if (!matchingCurrent) {
            const adminUser = restoredUsers.find(u => u.role === 'admin' && u.isActive) || restoredUsers[0];
            if (adminUser?.id) {
              localStorage.setItem('arka_pos_current_user_id', String(adminUser.id));
            }
          }
        }

        window.dispatchEvent(new CustomEvent('arka_db_synced', { detail: { timestamp: Date.now(), restored: true } }));
        return {
          restoredTables: Number(payload.restoredTables || 0),
          totalRecords: Number(payload.totalRecords || 0),
          storageEngine: String(payload.storageEngine || 'postgresql')
        };
      }

      // If server returned a validation/security error (400), surface it directly to the user!
      if (res.status >= 400 && res.status < 500 && payload?.error) {
        throw new Error(payload.error);
      }
    } catch (err: any) {
      // Re-throw explicit validation/security errors; only fall through on network failure
      if (err?.message && !String(err.message).includes('Failed to fetch') && !String(err.message).includes('NetworkError') && !String(err.name).includes('Abort')) {
        throw err;
      }
    }
  }

  // 2. Offline fallback: safely parse Arka PostgreSQL SQL dump into structured tables and restore locally
  const lines = cleanSql.split(/\r?\n/);
  const tablesData: Record<string, any[]> = {};
  let copyMode = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (copyMode) {
      if (trimmed === '\\.') {
        copyMode = false;
        continue;
      }
      const cols = rawLine.split('\t');
      if (cols.length >= 3) {
        const tableName = unescapeClientCopyField(cols[0]);
        const payloadRaw = unescapeClientCopyField(cols[2]);
        if (tableName && payloadRaw && (ALL_DB_TABLES as readonly string[]).includes(tableName)) {
          try {
            const obj = JSON.parse(payloadRaw);
            if (obj && typeof obj === 'object') {
              if (!tablesData[tableName]) tablesData[tableName] = [];
              tablesData[tableName].push(obj);
            }
          } catch {}
        }
      }
      continue;
    }

    if (!trimmed || trimmed.startsWith('--')) continue;
    if (/^COPY\s+(?:public\.)?"?arka_records"?\s*\(/i.test(trimmed) && /\bFROM\s+stdin\s*;$/i.test(trimmed)) {
      copyMode = true;
      continue;
    }

    if (/^INSERT\s+INTO\s+(?:public\.)?"?arka_records"?\s*\([^)]*\)\s*VALUES\s*\(/i.test(trimmed)) {
      const vals = parseClientSqlValuesFromInsertLine(trimmed);
      if (vals.length >= 3 && (ALL_DB_TABLES as readonly string[]).includes(vals[0])) {
        try {
          const obj = JSON.parse(vals[2]);
          if (obj && typeof obj === 'object') {
            if (!tablesData[vals[0]]) tablesData[vals[0]] = [];
            tablesData[vals[0]].push(obj);
          }
        } catch {}
      }
    }
  }

  if (Object.keys(tablesData).length === 0) {
    throw new Error('هیچ رکورد معتبر PostgreSQL آرکا در فایل SQL یافت نشد.');
  }

  const localRes = await importDB(JSON.stringify({ data: tablesData }));
  return {
    ...localRes,
    storageEngine: 'postgresql'
  };
};

// Backward-compatible legacy JSON restore helper (automatically converts old JSON backups directly into PostgreSQL)
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

