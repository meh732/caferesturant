#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initPostgresStore,
  loadStateFromPg,
  saveFullStateToPg,
  generatePgSqlDump,
  restoreSqlDumpToPg,
  getPgStatus,
  closePostgresPool,
  isPostgresActive
} from '../server-pg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const defaultDbFile = path.join(projectRoot, 'data', 'arka_db.json');

function printUsage() {
  console.log('Arka POS PostgreSQL Migration & Backup Utility');
  console.log('Usage:');
  console.log('  node scripts/migrate-to-postgres.mjs                          # Auto-migrate & retire legacy data/arka_db.json into PostgreSQL');
  console.log('  node scripts/migrate-to-postgres.mjs --status                 # Print PostgreSQL status & record counts');
  console.log('  node scripts/migrate-to-postgres.mjs --export-sql <outPath>   # Export portable transactional PostgreSQL (.sql) dump');
  console.log('  node scripts/migrate-to-postgres.mjs --restore-sql <inPath>   # Restore PostgreSQL (.sql) dump atomically');
  console.log('  node scripts/migrate-to-postgres.mjs --restore-json <inPath>  # Convert & restore legacy JSON backup into PostgreSQL');
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--migrate';

  if (mode === '--help' || mode === '-h') {
    printUsage();
    process.exit(0);
  }

  const initRes = await initPostgresStore({
    dbFilePath: defaultDbFile
  });

  if (!initRes.active || !isPostgresActive()) {
    console.error('[ERROR] Could not connect to PostgreSQL. Verify DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE in .env');
    process.exit(1);
  }

  try {
    if (mode === '--status') {
      const status = await getPgStatus();
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    if (mode === '--export-sql') {
      const outPath = args[1];
      if (!outPath) {
        console.error('[ERROR] Missing output path for --export-sql');
        process.exit(1);
      }
      const { sql, recordCount } = await generatePgSqlDump();
      fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
      fs.writeFileSync(outPath, sql, 'utf-8');
      console.log(`[SUCCESS] Exported portable PostgreSQL SQL backup (${recordCount} records) to ${outPath}`);
      return;
    }

    if (mode === '--restore-sql') {
      const inPath = args[1];
      if (!inPath || !fs.existsSync(inPath)) {
        console.error(`[ERROR] SQL backup file not found: ${inPath || '(empty)'}`);
        process.exit(1);
      }
      const sqlText = fs.readFileSync(inPath, 'utf-8');
      const currentState = await loadStateFromPg();
      const res = await restoreSqlDumpToPg(sqlText, {
        currentVersion: Number(currentState?.version || 1)
      });
      console.log(`[SUCCESS] Restored PostgreSQL SQL backup atomically! Total records: ${res.totalRecords}, Version: v${res.state.version}`);
      return;
    }

    if (mode === '--restore-json') {
      const inPath = args[1];
      if (!inPath || !fs.existsSync(inPath)) {
        console.error(`[ERROR] Legacy JSON backup file not found: ${inPath || '(empty)'}`);
        process.exit(1);
      }
      const raw = fs.readFileSync(inPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const dataObj = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
      const currentState = await loadStateFromPg();
      const nextVersion = Math.max(Number(currentState?.version || 1), Number(parsed.version || 1)) + 100;

      const restoredData = {};
      for (const [k, v] of Object.entries(dataObj)) {
        if (Array.isArray(v)) restoredData[k] = v;
      }

      await saveFullStateToPg(
        { version: nextVersion, lastUpdated: Date.now(), data: restoredData },
        { recordSnapshotType: 'cli_convert_legacy_json' }
      );
      const status = await getPgStatus();
      console.log(`[SUCCESS] Converted & restored legacy JSON backup into PostgreSQL atomically! Total records: ${status.totalRecords}, Version: v${nextVersion}`);
      return;
    }

    // Default: --migrate (verification summary)
    const status = await getPgStatus();
    console.log('==============================================================');
    console.log('  Arka POS PostgreSQL Migration & Integrity Report');
    console.log('==============================================================');
    console.log(`  Database:      ${status.database}`);
    console.log(`  Engine:        ${status.pgVersion || 'PostgreSQL'}`);
    console.log(`  DB Version:    v${status.version}`);
    console.log(`  Migrated Now:  ${initRes.migrated ? 'YES (legacy JSON converted atomically)' : 'ALREADY ACTIVE IN POSTGRESQL'}`);
    console.log(`  Total Records: ${status.totalRecords}`);
    console.log('  Tables:');
    for (const [t, c] of Object.entries(status.tables || {})) {
      console.log(`    - ${t}: ${c}`);
    }
    console.log('==============================================================');
  } finally {
    await closePostgresPool();
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  closePostgresPool().finally(() => process.exit(1));
});
