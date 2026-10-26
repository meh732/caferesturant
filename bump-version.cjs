// Auto-version bumper for Arka POS
// Automatically increments version across package.json, tauri.conf.json, and Cargo.toml
const fs = require('fs');
const path = require('path');

let rootDir = __dirname;
if (!fs.existsSync(path.join(rootDir, 'package.json'))) {
  if (fs.existsSync(path.join(rootDir, '..', 'package.json'))) {
    rootDir = path.join(rootDir, '..');
  } else if (fs.existsSync(path.join(process.cwd(), 'package.json'))) {
    rootDir = process.cwd();
  }
}

const pkgPath = path.join(rootDir, 'package.json');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');

let currentVersion = '1.2.4';

// 1. Read from tauri.conf.json or package.json
if (fs.existsSync(tauriConfPath)) {
  try {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    if (tauriConf.version) {
      currentVersion = tauriConf.version;
    }
  } catch (e) {}
} else if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.version) {
      currentVersion = pkg.version;
    }
  } catch (e) {}
}

// 2. Determine new version
let newVersion = '';
const manualArg = process.argv[2];
if (manualArg && /^\d+\.\d+\.\d+$/.test(manualArg.trim())) {
  newVersion = manualArg.trim();
} else {
  const parts = currentVersion.split('.').map(x => parseInt(x, 10));
  if (parts.length >= 3) {
    parts[2] = parts[2] + 1;
    newVersion = parts.slice(0, 3).join('.');
  } else {
    newVersion = '1.2.4';
  }
}

// 3. Update package.json
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn('[AUTO-VERSION WARNING] Failed updating package.json:', e.message);
  }
}

// 4. Update src-tauri/tauri.conf.json
if (fs.existsSync(tauriConfPath)) {
  try {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = newVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn('[AUTO-VERSION WARNING] Failed updating tauri.conf.json:', e.message);
  }
}

// 5. Update src-tauri/Cargo.toml
if (fs.existsSync(cargoTomlPath)) {
  try {
    let cargoContent = fs.readFileSync(cargoTomlPath, 'utf8');
    cargoContent = cargoContent.replace(
      /(\[package\][\s\S]*?version\s*=\s*")[^"]*(")/,
      `$1${newVersion}$2`
    );
    fs.writeFileSync(cargoTomlPath, cargoContent, 'utf8');
  } catch (e) {
    console.warn('[AUTO-VERSION WARNING] Failed updating Cargo.toml:', e.message);
  }
}

console.log('==============================================================================');
console.log(` [AUTO-VERSION] Version automatically bumped: ${currentVersion} -> ${newVersion}`);
console.log(' Synchronized across: package.json, tauri.conf.json, and Cargo.toml');
console.log('==============================================================================');
