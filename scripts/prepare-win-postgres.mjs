#!/usr/bin/env node
/**
 * Prepares portable Windows x64 PostgreSQL server binaries inside
 * `src-tauri/resources/postgres/` before building ArkaPOS-Server.exe.
 *
 * - If `src-tauri/resources/postgres/bin/initdb.exe` already exists (cached or offline),
 *   it skips download immediately.
 * - Otherwise downloads official EnterpriseDB PostgreSQL 16 Windows x64 portable zip,
 *   extracts ONLY `bin/`, `lib/`, and `share/` (removing heavy pgAdmin4/docs/symbols/StackBuilder)
 *   so the final ArkaPOS-Server installer stays fast and compact (~55 MB).
 * - Set ARKA_PG_ZIP_URL env var to override mirror URL if desired.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const targetPgDir = path.join(projectRoot, 'src-tauri', 'resources', 'postgres');
const initdbExe = path.join(targetPgDir, 'bin', 'initdb.exe');

const DEFAULT_PG_URL =
  process.env.ARKA_PG_ZIP_URL ||
  'https://get.enterprisedb.com/postgresql/postgresql-16.6-1-windows-x64-binaries.zip';

async function downloadFile(url, destPath) {
  console.log(`[Arka PG Bundler] Downloading PostgreSQL 16 Windows x64 portable binaries...`);
  console.log(`[Arka PG Bundler] Source: ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const arrayBuf = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuf));
  console.log(`[Arka PG Bundler] Downloaded ${(arrayBuf.byteLength / (1024 * 1024)).toFixed(1)} MB.`);
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  if (fs.existsSync(initdbExe)) {
    console.log(`[Arka PG Bundler] Portable PostgreSQL binaries already ready at: ${targetPgDir}`);
    return;
  }

  if (process.env.SKIP_PG_DOWNLOAD === '1') {
    console.log('[Arka PG Bundler] SKIP_PG_DOWNLOAD=1 set; skipping download.');
    return;
  }

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'arka-pg-'));
  const zipPath = path.join(tmpBase, 'postgres-win-x64.zip');
  const extractDir = path.join(tmpBase, 'extracted');

  try {
    await downloadFile(DEFAULT_PG_URL, zipPath);
    fs.mkdirSync(extractDir, { recursive: true });

    console.log('[Arka PG Bundler] Extracting archive...');
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
        ],
        { stdio: 'inherit' }
      );
    } else {
      execFileSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'inherit' });
    }

    const pgsqlRoot = path.join(extractDir, 'pgsql');
    if (!fs.existsSync(path.join(pgsqlRoot, 'bin', 'initdb.exe'))) {
      throw new Error('Extracted archive did not contain expected pgsql/bin/initdb.exe');
    }

    // Copy ONLY essential runtime folders (bin, lib, share) - omit pgAdmin4, doc, include, symbols, StackBuilder
    fs.mkdirSync(targetPgDir, { recursive: true });
    for (const sub of ['bin', 'lib', 'share']) {
      const srcSub = path.join(pgsqlRoot, sub);
      if (fs.existsSync(srcSub)) {
        console.log(`[Arka PG Bundler] Packing essential folder: ${sub}/`);
        copyDirRecursive(srcSub, path.join(targetPgDir, sub));
      }
    }

    // Remove unnecessary GUI tools from bin if any exist
    for (const unused of ['pgAdmin4.exe', 'stackbuilder.exe']) {
      const p = path.join(targetPgDir, 'bin', unused);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    console.log(`[Arka PG Bundler] SUCCESS! Portable PostgreSQL 16 is bundled in ${targetPgDir}`);
  } catch (err) {
    console.error(`[Arka PG Bundler] Failed preparing PostgreSQL binaries: ${err.message}`);
    console.error('Tip: If offline or behind a restricted network, download postgresql-16-windows-x64-binaries.zip manually and extract bin/, lib/, share/ into src-tauri/resources/postgres/');
    process.exit(1);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

main();
