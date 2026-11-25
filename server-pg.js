import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import pg from 'pg';

const execFileAsync = promisify(execFile);
const { Pool } = pg;

export const ALLOWED_TABLES = new Set([
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
  'rawMaterialCategories',
  'journalEntries',
  'customerWalletTransactions',
  'waiterCalls'
]);

function isValidTableName(name) {
  if (!name || typeof name !== 'string') return false;
  if (ALLOWED_TABLES.has(name)) return true;
  return /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(name);
}

export function extractRecordId(tableName, item, fallbackIdx = 0) {
  if (!item || typeof item !== 'object') return `row_${fallbackIdx}`;
  if (tableName === 'settings') return '1';
  if (tableName === 'chartOfAccounts' && item.code !== undefined && item.code !== null && String(item.code).trim() !== '') {
    return String(item.code);
  }
  if (item.id !== undefined && item.id !== null && String(item.id).trim() !== '') {
    return String(item.id);
  }
  if (item.tempId !== undefined && item.tempId !== null && String(item.tempId).trim() !== '') {
    return String(item.tempId);
  }
  if (item.code !== undefined && item.code !== null && String(item.code).trim() !== '') {
    return String(item.code);
  }
  return `row_${fallbackIdx}`;
}

function getPgPoolConfig() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (connectionString) {
    return {
      connectionString,
      max: parseInt(process.env.PG_POOL_MAX || '12', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    };
  }

  const host = (process.env.PGHOST || '').trim();
  const user = (process.env.PGUSER || '').trim();
  const database = (process.env.PGDATABASE || '').trim();
  const password = process.env.PGPASSWORD;
  const port = parseInt(process.env.PGPORT || '5432', 10);

  if (host && user && database) {
    return {
      host,
      port: Number.isFinite(port) ? port : 5432,
      user,
      password: password !== undefined ? String(password) : undefined,
      database,
      max: parseInt(process.env.PG_POOL_MAX || '12', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    };
  }

  return null;
}

let pool = null;
let pgActive = false;
let pgDatabaseName = '';
let pgServerVersion = '';
let lastPgError = null;
let writeQueue = Promise.resolve();

export function isPostgresActive() {
  return pgActive && pool !== null;
}

export function getPostgresPool() {
  return pool;
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS arka_meta (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS arka_records (
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (table_name, record_id)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_arka_records_table ON arka_records (table_name);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS arka_backups (
      id BIGSERIAL PRIMARY KEY,
      backup_type TEXT NOT NULL,
      db_version BIGINT NOT NULL,
      stats JSONB NOT NULL DEFAULT '{}'::jsonb,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function readJsonCandidate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.data && typeof parsed.data === 'object') {
        return {
          version: Number(parsed.version || 1),
          lastUpdated: Number(parsed.lastUpdated || Date.now()),
          data: parsed.data
        };
      }
      // Support flat backup format where tables are at root
      const data = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v) && isValidTableName(k)) {
          data[k] = v;
        }
      }
      if (Object.keys(data).length > 0) {
        return {
          version: Number(parsed.version || 1),
          lastUpdated: Date.now(),
          data
        };
      }
    }
  } catch (err) {
    console.error(`[PostgreSQL] Failed reading JSON candidate ${filePath}:`, err.message);
  }
  return null;
}

function countBusinessRecords(dataObj = {}) {
  let count = 0;
  for (const [tableName, rows] of Object.entries(dataObj || {})) {
    if (!Array.isArray(rows)) continue;
    if (tableName === 'chartOfAccounts' || tableName === 'rawMaterialCategories') continue;
    count += rows.length;
  }
  return count;
}

function computeStats(dataObj = {}) {
  const tableCounts = {};
  let totalRecords = 0;
  for (const [tableName, rows] of Object.entries(dataObj || {})) {
    if (!Array.isArray(rows)) continue;
    tableCounts[tableName] = rows.length;
    totalRecords += rows.length;
  }
  return {
    totalRecords,
    orders: (dataObj.orders || []).length,
    menuItems: (dataObj.menuItems || []).length,
    customers: (dataObj.customers || []).length,
    warehouses: (dataObj.warehouses || []).length,
    rawMaterials: (dataObj.rawMaterials || []).length,
    recipes: (dataObj.recipes || []).length,
    journalEntries: (dataObj.journalEntries || []).length,
    tableCounts
  };
}

async function writeFullStateTx(client, state, { recordSnapshotType = null } = {}) {
  const version = Number(state.version || 1);
  const lastUpdated = Number(state.lastUpdated || Date.now());
  const data = state.data && typeof state.data === 'object' ? state.data : {};
  const isRawClean = data.isRawClean === true;

  await client.query('DELETE FROM arka_records');

  for (const [tableName, rows] of Object.entries(data)) {
    if (tableName === 'isRawClean' || !isValidTableName(tableName) || !Array.isArray(rows)) continue;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object') continue;
      const recordId = extractRecordId(tableName, row, i);
      await client.query(
        `INSERT INTO arka_records (table_name, record_id, payload, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (table_name, record_id)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [tableName, recordId, JSON.stringify(row)]
      );
    }
  }

  await client.query(
    `INSERT INTO arka_meta (key, value, updated_at)
     VALUES ('db_version', $1::jsonb, NOW()),
            ('last_updated', $2::jsonb, NOW()),
            ('is_raw_clean', $3::jsonb, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(version), JSON.stringify(lastUpdated), JSON.stringify(isRawClean)]
  );

  if (recordSnapshotType) {
    const stats = computeStats(data);
    await client.query(
      `INSERT INTO arka_backups (backup_type, db_version, stats, payload)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [
        String(recordSnapshotType),
        version,
        JSON.stringify(stats),
        JSON.stringify({ version, lastUpdated, exportedAt: new Date().toISOString(), storageEngine: 'postgresql', data })
      ]
    );
    // Retain latest 30 snapshots inside PG table to prevent unbounded disk bloat
    await client.query(
      `DELETE FROM arka_backups
       WHERE id NOT IN (SELECT id FROM arka_backups ORDER BY id DESC LIMIT 30)`
    );
  }
}

export async function loadStateFromPg() {
  if (!isPostgresActive()) return null;

  const metaRes = await pool.query('SELECT key, value FROM arka_meta');
  const metaMap = new Map();
  for (const row of metaRes.rows) {
    metaMap.set(row.key, row.value);
  }

  const recRes = await pool.query(
    'SELECT table_name, record_id, payload FROM arka_records ORDER BY table_name ASC, record_id ASC'
  );

  const data = {};
  for (const row of recRes.rows) {
    if (!data[row.table_name]) data[row.table_name] = [];
    data[row.table_name].push(row.payload);
  }

  if (metaMap.get('is_raw_clean') === true) {
    data.isRawClean = true;
  }

  return {
    version: Number(metaMap.get('db_version') || 1),
    lastUpdated: Number(metaMap.get('last_updated') || Date.now()),
    data
  };
}

export async function saveFullStateToPg(state, { recordSnapshotType = null } = {}) {
  if (!isPostgresActive()) return false;

  const job = async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await writeFullStateTx(client, state, { recordSnapshotType });
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[PostgreSQL] Transaction failed during saveFullStateToPg:', err.message);
      throw err;
    } finally {
      client.release();
    }
  };

  writeQueue = writeQueue.then(job, job);
  return writeQueue;
}

export async function upsertTablesToPg(tablesObj, deletedMap = {}, meta = {}) {
  if (!isPostgresActive()) return false;

  const job = async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const [tableName, rows] of Object.entries(tablesObj || {})) {
        if (tableName === 'isRawClean' || !isValidTableName(tableName) || !Array.isArray(rows)) continue;

        // For settings and chartOfAccounts or full merged table arrays, replace that table cleanly within transaction
        await client.query('DELETE FROM arka_records WHERE table_name = $1', [tableName]);
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row || typeof row !== 'object') continue;
          const recordId = extractRecordId(tableName, row, i);
          await client.query(
            `INSERT INTO arka_records (table_name, record_id, payload, updated_at)
             VALUES ($1, $2, $3::jsonb, NOW())
             ON CONFLICT (table_name, record_id)
             DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
            [tableName, recordId, JSON.stringify(row)]
          );
        }
      }

      for (const [tableName, deletedIds] of Object.entries(deletedMap || {})) {
        if (!isValidTableName(tableName) || !Array.isArray(deletedIds) || deletedIds.length === 0) continue;
        const stringIds = deletedIds.map(String);
        await client.query(
          'DELETE FROM arka_records WHERE table_name = $1 AND record_id = ANY($2::text[])',
          [tableName, stringIds]
        );
      }

      if (meta.version !== undefined) {
        await client.query(
          `INSERT INTO arka_meta (key, value, updated_at)
           VALUES ('db_version', $1::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [JSON.stringify(Number(meta.version))]
        );
      }
      if (meta.lastUpdated !== undefined) {
        await client.query(
          `INSERT INTO arka_meta (key, value, updated_at)
           VALUES ('last_updated', $1::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [JSON.stringify(Number(meta.lastUpdated))]
        );
      }
      if (meta.isRawClean !== undefined) {
        await client.query(
          `INSERT INTO arka_meta (key, value, updated_at)
           VALUES ('is_raw_clean', $1::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [JSON.stringify(Boolean(meta.isRawClean))]
        );
      }

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[PostgreSQL] Transaction failed during upsertTablesToPg:', err.message);
      throw err;
    } finally {
      client.release();
    }
  };

  writeQueue = writeQueue.then(job, job);
  return writeQueue;
}

export async function recordPgBackupSnapshot(backupType, state) {
  if (!isPostgresActive()) return null;
  const data = state?.data || {};
  const version = Number(state?.version || 1);
  const stats = computeStats(data);
  const res = await pool.query(
    `INSERT INTO arka_backups (backup_type, db_version, stats, payload)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id, created_at`,
    [
      String(backupType || 'manual'),
      version,
      JSON.stringify(stats),
      JSON.stringify({
        version,
        lastUpdated: Number(state?.lastUpdated || Date.now()),
        exportedAt: new Date().toISOString(),
        storageEngine: 'postgresql',
        data
      })
    ]
  );
  await pool.query(
    `DELETE FROM arka_backups
     WHERE id NOT IN (SELECT id FROM arka_backups ORDER BY id DESC LIMIT 30)`
  );
  return res.rows[0] || null;
}

export async function exportFullSnapshotFromPg() {
  if (!isPostgresActive()) return null;
  const state = await loadStateFromPg();
  if (!state) return null;
  return {
    version: state.version || 1,
    lastUpdated: state.lastUpdated || Date.now(),
    exportedAt: new Date().toISOString(),
    storageEngine: 'postgresql',
    database: pgDatabaseName,
    ...state.data,
    data: state.data
  };
}

function sqlLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function buildPortableSqlDumpFromRows(metaRows, recordRows, dbLabel = 'arka_pos') {
  const lines = [
    '-- Arka POS PostgreSQL Full Transactional Backup',
    '-- Format Version: 2 (Cross-Version Compatible: PostgreSQL 12-18 Linux/Windows)',
    `-- Exported At: ${new Date().toISOString()}`,
    `-- Database: ${dbLabel}`,
    'BEGIN;',
    '',
    'CREATE TABLE IF NOT EXISTS arka_meta (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());',
    'CREATE TABLE IF NOT EXISTS arka_records (table_name TEXT NOT NULL, record_id TEXT NOT NULL, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (table_name, record_id));',
    'CREATE INDEX IF NOT EXISTS idx_arka_records_table ON arka_records (table_name);',
    "CREATE TABLE IF NOT EXISTS arka_backups (id BIGSERIAL PRIMARY KEY, backup_type TEXT NOT NULL, db_version BIGINT NOT NULL, stats JSONB NOT NULL DEFAULT '{}'::jsonb, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());",
    '',
    'TRUNCATE TABLE arka_records;'
  ];

  for (const row of metaRows) {
    lines.push(
      `INSERT INTO arka_meta (key, value, updated_at) VALUES (${sqlLiteral(row.key)}, ${sqlLiteral(JSON.stringify(row.value))}::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`
    );
  }

  for (const row of recordRows) {
    lines.push(
      `INSERT INTO arka_records (table_name, record_id, payload, updated_at) VALUES (${sqlLiteral(row.table_name)}, ${sqlLiteral(row.record_id)}, ${sqlLiteral(JSON.stringify(row.payload))}::jsonb, NOW()) ON CONFLICT (table_name, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();`
    );
  }

  lines.push('COMMIT;');
  lines.push('');
  return lines.join('\n');
}

export async function generatePgSqlDump(fallbackState = null) {
  // Always produce our pure, cross-version-compatible transactional PostgreSQL SQL dump
  // so backups from Linux PG 18 restore cleanly on Windows PG 16 and vice versa, AND in Arka UI / psql.
  if (isPostgresActive()) {
    const metaRes = await pool.query('SELECT key, value FROM arka_meta ORDER BY key ASC');
    const recRes = await pool.query(
      'SELECT table_name, record_id, payload FROM arka_records ORDER BY table_name ASC, record_id ASC'
    );
    const sql = buildPortableSqlDumpFromRows(metaRes.rows, recRes.rows, pgDatabaseName || 'arka_pos');
    return {
      sql,
      method: 'postgresql-transactional-sql',
      recordCount: recRes.rows.length
    };
  }

  if (fallbackState && fallbackState.data && typeof fallbackState.data === 'object') {
    const metaRows = [
      { key: 'db_version', value: Number(fallbackState.version || 1) },
      { key: 'last_updated', value: Number(fallbackState.lastUpdated || Date.now()) },
      { key: 'is_raw_clean', value: fallbackState.data.isRawClean === true }
    ];
    const recordRows = [];
    for (const [tableName, rows] of Object.entries(fallbackState.data)) {
      if (tableName === 'isRawClean' || !isValidTableName(tableName) || !Array.isArray(rows)) continue;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || typeof row !== 'object') continue;
        recordRows.push({
          table_name: tableName,
          record_id: extractRecordId(tableName, row, i),
          payload: row
        });
      }
    }
    const sql = buildPortableSqlDumpFromRows(metaRows, recordRows, 'arka_pos');
    return {
      sql,
      method: 'portable-sql-snapshot',
      recordCount: recordRows.length
    };
  }

  throw new Error('PostgreSQL is not active and no state snapshot is available.');
}

/**
 * Safely parses SQL single-quoted string literals inside a VALUES (...) clause.
 * Walks strictly from the opening '(' of VALUES until its matching closing ')' at depth 0,
 * handling '' escaped single quotes and ::jsonb casts without ever executing raw SQL.
 */
function parseSqlValuesFromInsertLine(line) {
  const upper = line.toUpperCase();
  const valIdx = upper.indexOf('VALUES');
  if (valIdx === -1) return [];
  const openIdx = line.indexOf('(', valIdx + 6);
  if (openIdx === -1) return [];

  const results = [];
  let i = openIdx + 1;
  const n = line.length;

  while (i < n) {
    while (i < n && /[\s,]/.test(line[i])) i++;
    if (i >= n || line[i] === ')') break;

    if (line[i] === "'") {
      i++; // skip opening quote
      let out = '';
      while (i < n) {
        if (line[i] === "'") {
          if (i + 1 < n && line[i + 1] === "'") {
            out += "'";
            i += 2;
          } else {
            i++; // closing quote
            break;
          }
        } else {
          out += line[i];
          i++;
        }
      }
      results.push(out);
      // Skip optional PostgreSQL type cast like ::jsonb or ::text
      while (i < n && line[i] !== ',' && line[i] !== ')') i++;
      if (i < n && line[i] === ')') break;
    } else {
      // Non-string token (e.g., NOW(), NULL, numeric)
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

function unescapePgCopyField(field) {
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
 * Strictly allowlisted parser for Arka POS PostgreSQL .sql backups.
 * Supports both Arka transactional INSERT dumps and pg_dump COPY dumps for arka_meta & arka_records.
 * Never executes raw uploaded SQL — prevents SQL injection & command execution completely.
 */
export function parseArkaSqlDump(sqlText) {
  const cleanSql = String(sqlText || '').replace(/^\uFEFF/, '');
  if (!cleanSql.trim()) {
    throw new Error('فایل بکاپ SQL خالی است.');
  }

  // Reject dangerous PostgreSQL execution primitives outside data literals
  const lines = cleanSql.split(/\r?\n/);
  const data = {};
  const meta = {};
  let parsedRecordCount = 0;
  let copyMode = null; // null | 'arka_meta' | 'arka_records'

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const trimmed = rawLine.trim();

    if (copyMode) {
      if (trimmed === '\\.') {
        copyMode = null;
        continue;
      }
      const cols = rawLine.split('\t');
      if (copyMode === 'arka_meta' && cols.length >= 2) {
        const key = unescapePgCopyField(cols[0]);
        const valRaw = unescapePgCopyField(cols[1]);
        if (key && valRaw !== null) {
          try {
            meta[key] = JSON.parse(valRaw);
          } catch {}
        }
      } else if (copyMode === 'arka_records' && cols.length >= 3) {
        const tableName = unescapePgCopyField(cols[0]);
        const payloadRaw = unescapePgCopyField(cols[2]);
        if (tableName && isValidTableName(tableName) && payloadRaw !== null) {
          try {
            const parsedObj = JSON.parse(payloadRaw);
            if (parsedObj && typeof parsedObj === 'object') {
              if (!data[tableName]) data[tableName] = [];
              data[tableName].push(parsedObj);
              parsedRecordCount++;
            }
          } catch {}
        }
      }
      continue;
    }

    if (!trimmed || trimmed.startsWith('--')) continue;

    // Detect forbidden execution directives at statement level
    if (
      /^\s*\\!/i.test(trimmed) ||
      /\bCOPY\b[\s\S]*\bFROM\s+PROGRAM\b/i.test(trimmed) ||
      /\b(CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|ALTER\s+ROLE|DROP\s+DATABASE|DO\s+\$)/i.test(trimmed)
    ) {
      throw new Error('فایل SQL شامل دستورات غیرمجاز امنیتی است و رد شد.');
    }

    // 1. Handle pg_dump COPY blocks for arka_meta / arka_records
    if (/^COPY\s+(?:public\.)?"?arka_meta"?\s*\(/i.test(trimmed) && /\bFROM\s+stdin\s*;$/i.test(trimmed)) {
      copyMode = 'arka_meta';
      continue;
    }
    if (/^COPY\s+(?:public\.)?"?arka_records"?\s*\(/i.test(trimmed) && /\bFROM\s+stdin\s*;$/i.test(trimmed)) {
      copyMode = 'arka_records';
      continue;
    }

    // 2. Handle Arka transactional INSERT INTO arka_meta
    if (/^INSERT\s+INTO\s+(?:public\.)?"?arka_meta"?\s*\([^)]*\)\s*VALUES\s*\(/i.test(trimmed)) {
      const vals = parseSqlValuesFromInsertLine(trimmed);
      if (vals.length >= 2) {
        const key = vals[0];
        try {
          meta[key] = JSON.parse(vals[1]);
        } catch {
          meta[key] = vals[1];
        }
      }
      continue;
    }

    // 3. Handle Arka transactional INSERT INTO arka_records
    if (/^INSERT\s+INTO\s+(?:public\.)?"?arka_records"?\s*\([^)]*\)\s*VALUES\s*\(/i.test(trimmed)) {
      const vals = parseSqlValuesFromInsertLine(trimmed);
      if (vals.length >= 3) {
        const tableName = vals[0];
        const payloadStr = vals[2];
        if (isValidTableName(tableName)) {
          try {
            const payloadObj = JSON.parse(payloadStr);
            if (payloadObj && typeof payloadObj === 'object') {
              if (!data[tableName]) data[tableName] = [];
              data[tableName].push(payloadObj);
              parsedRecordCount++;
            }
          } catch (err) {
            throw new Error(`خطا در خواندن رکورد جدول ${tableName} در خط ${lineIdx + 1}: ${err.message}`);
          }
        }
      }
      continue;
    }
  }

  const restoredTableNames = Object.keys(data);
  if (parsedRecordCount === 0 && Object.keys(meta).length === 0) {
    throw new Error('هیچ رکورد معتبر آرکا (arka_records) در فایل بکاپ SQL یافت نشد. لطفاً از فایل بکاپ رسمی PostgreSQL آرکا استفاده کنید.');
  }

  if (meta.is_raw_clean === true) {
    data.isRawClean = true;
  }

  return {
    version: Number(meta.db_version || 1),
    lastUpdated: Number(meta.last_updated || Date.now()),
    data,
    restoredTables: restoredTableNames.length,
    totalRecords: parsedRecordCount
  };
}

export async function restoreSqlDumpToPg(sqlText, { currentVersion = 1, ensureDefaultSeedData = null } = {}) {
  const parsed = parseArkaSqlDump(sqlText);
  const nextVersion = Math.max(Number(currentVersion || 1), Number(parsed.version || 1)) + 100;
  const restoredState = {
    version: nextVersion,
    lastUpdated: Date.now(),
    data: parsed.data
  };

  if (typeof ensureDefaultSeedData === 'function') {
    ensureDefaultSeedData(restoredState);
  }

  if (isPostgresActive()) {
    // Take mandatory safety snapshot of current live PostgreSQL state BEFORE replacing it
    const currentLiveState = await loadStateFromPg().catch(() => null);
    if (currentLiveState) {
      await recordPgBackupSnapshot('pre_sql_restore_safety', currentLiveState).catch(() => {});
    }
    await saveFullStateToPg(restoredState, { recordSnapshotType: 'sql_restore_commit' });
  }

  const stats = computeStats(restoredState.data);
  return {
    state: restoredState,
    stats,
    restoredTables: Object.keys(stats.tableCounts || {}).length,
    totalRecords: stats.totalRecords,
    storageEngine: isPostgresActive() ? 'postgresql' : 'memory-fallback'
  };
}

export async function getPgStatus(fallbackState = null) {
  if (!isPostgresActive()) {
    const fallbackData = fallbackState?.data || {};
    const stats = computeStats(fallbackData);
    return {
      engine: 'json-fallback',
      connected: false,
      database: null,
      pgVersion: null,
      version: Number(fallbackState?.version || 1),
      totalRecords: stats.totalRecords,
      tables: stats.tableCounts,
      lastBackupAt: null,
      backupCount: 0,
      error: lastPgError
    };
  }

  try {
    const countRes = await pool.query(
      'SELECT table_name, COUNT(*)::int AS cnt FROM arka_records GROUP BY table_name ORDER BY table_name ASC'
    );
    const tables = {};
    let totalRecords = 0;
    for (const r of countRes.rows) {
      tables[r.table_name] = r.cnt;
      totalRecords += r.cnt;
    }

    const metaRes = await pool.query("SELECT key, value FROM arka_meta WHERE key IN ('db_version', 'migrated_from_json')");
    let dbVersion = 1;
    let migrationInfo = null;
    for (const r of metaRes.rows) {
      if (r.key === 'db_version') dbVersion = Number(r.value || 1);
      if (r.key === 'migrated_from_json') migrationInfo = r.value;
    }

    const bkRes = await pool.query(
      'SELECT COUNT(*)::int AS cnt, MAX(created_at) AS last_at FROM arka_backups'
    );

    return {
      engine: 'postgresql',
      connected: true,
      database: pgDatabaseName,
      pgVersion: pgServerVersion,
      version: dbVersion,
      totalRecords,
      tables,
      lastBackupAt: bkRes.rows[0]?.last_at || null,
      backupCount: bkRes.rows[0]?.cnt || 0,
      migrationInfo
    };
  } catch (err) {
    return {
      engine: 'postgresql',
      connected: false,
      database: pgDatabaseName,
      error: err.message
    };
  }
}

function retireLegacyJsonFile(dbFilePath) {
  if (!dbFilePath) return;
  if (fs.existsSync(dbFilePath)) {
    const archivePath = `${dbFilePath}.migrated_to_pg.bak`;
    try {
      fs.renameSync(dbFilePath, archivePath);
      console.log(`[PostgreSQL] Active legacy JSON retired and archived to ${archivePath}`);
    } catch (e) {
      try {
        fs.copyFileSync(dbFilePath, archivePath);
        fs.unlinkSync(dbFilePath);
        console.log(`[PostgreSQL] Active legacy JSON retired (copy+unlink) to ${archivePath}`);
      } catch (e2) {
        console.warn('[PostgreSQL] Could not retire legacy JSON file:', e2.message);
      }
    }
  }
  const bakPath = `${dbFilePath}.bak`;
  if (fs.existsSync(bakPath)) {
    const bakArchive = `${bakPath}.migrated_to_pg.bak`;
    try {
      fs.renameSync(bakPath, bakArchive);
    } catch {}
  }
}

export async function initPostgresStore({ dbFilePath, ensureDefaultSeedData }) {
  const cfg = getPgPoolConfig();
  if (!cfg) {
    pgActive = false;
    lastPgError = 'DATABASE_URL / PGHOST not configured';
    return { active: false, migrated: false, state: null };
  }

  try {
    const testPool = new Pool(cfg);
    testPool.on('error', (err) => {
      console.error('[PostgreSQL] Unexpected idle client error:', err.message);
    });

    const client = await testPool.connect();
    try {
      const verRes = await client.query('SELECT current_database() AS db, version() AS ver');
      pgDatabaseName = verRes.rows[0]?.db || process.env.PGDATABASE || 'arka_pos';
      pgServerVersion = String(verRes.rows[0]?.ver || '').split(',')[0];
      await ensureSchema(client);

      pool = testPool;
      pgActive = true;
      lastPgError = null;

      // Check existing PG contents
      const existingState = await loadStateFromPg();
      const existingBusinessCount = countBusinessRecords(existingState?.data || {});
      const migratedMetaRes = await client.query("SELECT value FROM arka_meta WHERE key = 'migrated_from_json'");
      const alreadyMigrated = migratedMetaRes.rows.length > 0;

      let migrated = false;
      let finalState = existingState || { version: 1, lastUpdated: Date.now(), data: {} };

      // Zero-data-loss auto-migration from legacy JSON file if PG has no business records yet
      if (existingBusinessCount === 0 && !alreadyMigrated) {
        const candidates = [
          dbFilePath,
          dbFilePath ? `${dbFilePath}.bak` : null,
          '/tmp/arka_db_latest_backup.json'
        ].filter(Boolean);

        let chosenCandidatePath = null;
        let parsedJson = null;
        for (const cand of candidates) {
          const read = readJsonCandidate(cand);
          if (read && countBusinessRecords(read.data) > 0) {
            chosenCandidatePath = cand;
            parsedJson = read;
            break;
          }
        }

        if (parsedJson) {
          console.log(`[PostgreSQL] Auto-migrating existing JSON database (${chosenCandidatePath}) into PostgreSQL...`);
          finalState = {
            version: Math.max(Number(parsedJson.version || 1), 1),
            lastUpdated: Date.now(),
            data: parsedJson.data
          };
          if (typeof ensureDefaultSeedData === 'function') {
            ensureDefaultSeedData(finalState);
          }

          await client.query('BEGIN');
          await writeFullStateTx(client, finalState, { recordSnapshotType: 'auto_migration_from_json' });
          const stats = computeStats(finalState.data);
          await client.query(
            `INSERT INTO arka_meta (key, value, updated_at)
             VALUES ('migrated_from_json', $1::jsonb, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [
              JSON.stringify({
                migratedAt: new Date().toISOString(),
                sourceFile: path.basename(chosenCandidatePath),
                totalRecords: stats.totalRecords,
                tableCounts: stats.tableCounts
              })
            ]
          );
          await client.query('COMMIT');
          migrated = true;

          // Retire active legacy JSON file so PostgreSQL is the sole authoritative database
          retireLegacyJsonFile(dbFilePath);
          console.log(`[PostgreSQL] Migration complete! Total records migrated: ${stats.totalRecords}`);
        }
      } else if (alreadyMigrated || existingBusinessCount > 0) {
        // Retire any lingering active arka_db.json from older versions once PostgreSQL holds the live data
        retireLegacyJsonFile(dbFilePath);
      }

      if (typeof ensureDefaultSeedData === 'function') {
        const beforeStr = JSON.stringify({
          coa: (finalState.data?.chartOfAccounts || []).length,
          rmc: (finalState.data?.rawMaterialCategories || []).length,
          st: (finalState.data?.settings || []).length
        });
        ensureDefaultSeedData(finalState);
        const afterStr = JSON.stringify({
          coa: (finalState.data?.chartOfAccounts || []).length,
          rmc: (finalState.data?.rawMaterialCategories || []).length,
          st: (finalState.data?.settings || []).length
        });
        if (beforeStr !== afterStr || (existingBusinessCount === 0 && !migrated)) {
          await client.query('BEGIN');
          await writeFullStateTx(client, finalState);
          await client.query('COMMIT');
        }
      }

      console.log(`[PostgreSQL] Connected and authoritative on database "${pgDatabaseName}" (${pgServerVersion})`);
      return { active: true, migrated, state: finalState };
    } finally {
      client.release();
    }
  } catch (err) {
    pgActive = false;
    lastPgError = err.message;
    console.warn(`[PostgreSQL] Connection unavailable (${err.message}). Falling back to local JSON storage.`);
    return { active: false, migrated: false, state: null };
  }
}

export async function closePostgresPool() {
  if (pool) {
    try {
      await pool.end();
    } catch {}
    pool = null;
    pgActive = false;
  }
}
