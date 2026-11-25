import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const EDITION_FILE = path.join(ROOT, 'electron', 'edition.json');

const target = String(process.argv[2] || 'all').trim().toLowerCase();
if (!['server', 'client', 'all'].includes(target)) {
  console.error('Usage: node scripts/build-electron.mjs <server|client|all>');
  process.exit(1);
}

function run(cmd, envExtra = {}) {
  console.log(`\n[Electron Build] > ${cmd}`);
  execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...envExtra }
  });
}

function writeEdition(edition) {
  fs.writeFileSync(EDITION_FILE, JSON.stringify({ edition }, null, 2) + '\n', 'utf8');
}

function buildServer() {
  console.log('\n====================================================================');
  console.log(' Building Arka POS Electron Windows SERVER Edition (+ PostgreSQL 16)');
  console.log('====================================================================');

  // 1. Download & bundle portable Windows PostgreSQL 16 into src-tauri/resources/postgres/
  run('node scripts/prepare-win-postgres.mjs');

  // 2. Write server edition marker & build frontend in server mode
  writeEdition('server');
  run('npm run build:server');

  // 3. Package Windows NSIS installer via electron-builder
  run('npx electron-builder --win nsis --x64 --config electron/builder.server.json');

  console.log('\n[OK] Server installer ready in: release-electron/server/');
}

function buildClient() {
  console.log('\n====================================================================');
  console.log(' Building Arka POS Electron Windows CLIENT Edition (Lightweight)');
  console.log('====================================================================');

  // 1. Write client edition marker & build frontend in client mode
  writeEdition('client');
  run('npm run build:client');

  // 2. Package lightweight Windows NSIS installer via electron-builder
  run('npx electron-builder --win nsis --x64 --config electron/builder.client.json');

  console.log('\n[OK] Client installer ready in: release-electron/client/');
}

try {
  if (target === 'server' || target === 'all') {
    buildServer();
  }
  if (target === 'client' || target === 'all') {
    buildClient();
  }
} finally {
  // Always restore default edition marker to 'server' for local dev
  writeEdition('server');
}
