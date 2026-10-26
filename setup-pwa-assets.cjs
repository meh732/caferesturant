const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const publicDir = path.join(__dirname, 'public');
const imgDir = path.join(__dirname, 'src', 'assets', 'images');
fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(imgDir, { recursive: true });

function makePng(width, height, isMaskable) {
  const scale = (width / 512) * (isMaskable ? 0.75 : 0.90);
  const cx = width / 2;
  const cy = height / 2;
  const bgRadius = isMaskable ? 0 : 90 * (width / 512);

  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0; // Filter byte 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);

      let inBg = true;
      if (!isMaskable) {
        const hw = (width * 0.96) / 2;
        const hh = (height * 0.96) / 2;
        const r = bgRadius;
        if (dx > hw - r && dy > hh - r) {
          const d = Math.hypot(dx - (hw - r), dy - (hh - r));
          if (d > r) inBg = false;
        } else if (dx > hw || dy > hh) {
          inBg = false;
        }
      }

      if (!inBg) {
        continue; // RGBA transparent
      }

      // Background gradient: Modern Blue (#1E3A8A to #2563EB)
      const t = y / height;
      const rBg = Math.round(30 * (1 - t) + 37 * t);
      const gBg = Math.round(58 * (1 - t) + 99 * t);
      const bBg = Math.round(138 * (1 - t) + 235 * t);

      // Radial top glow
      const glow = Math.max(0, 1 - Math.hypot(x - cx, y - height * 0.3) / (width * 0.7));
      let r = Math.min(255, Math.round(rBg + 40 * glow));
      let g = Math.min(255, Math.round(gBg + 60 * glow));
      let b = Math.min(255, Math.round(bBg + 20 * glow));

      // Stylized 'A' / Gateway
      const nx = (x - cx) / scale;
      const ny = (y - cy) / scale;
      let inSymbol = false;
      let isAccent = false;

      if (ny >= -120 && ny <= 110) {
        const prog = (ny + 120) / 230;
        const halfW = prog * 95;
        const innerHalfW = prog * 55;
        if (Math.abs(nx) <= halfW) {
          if (Math.abs(nx) >= innerHalfW || ny > 90) {
            inSymbol = true;
          }
          if (ny >= -10 && ny <= 25 && Math.abs(nx) <= halfW) {
            inSymbol = true;
            if (ny >= -5 && ny <= 20) isAccent = true;
          }
        }
      }

      const distCore = Math.hypot(nx, ny - 55);
      if (distCore <= 24) {
        inSymbol = true;
        isAccent = true;
      }

      if (inSymbol) {
        if (isAccent) {
          r = 56; g = 189; b = 248; // Cyan (#38BDF8)
        } else {
          r = 255; g = 255; b = 255; // White
        }
      }

      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = 255;
    }
  }

  // PNG Construction
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = Buffer.concat([Buffer.from('IHDR'), ihdrData]);
  const ihdrCrc = zlib.crc32(ihdrChunk);
  const ihdrLenBuf = Buffer.alloc(4);
  ihdrLenBuf.writeUInt32BE(13, 0);
  const ihdrCrcBuf = Buffer.alloc(4);
  ihdrCrcBuf.writeUInt32BE(ihdrCrc, 0);

  // IDAT
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idatChunk = Buffer.concat([Buffer.from('IDAT'), compressed]);
  const idatCrc = zlib.crc32(idatChunk);
  const idatLenBuf = Buffer.alloc(4);
  idatLenBuf.writeUInt32BE(compressed.length, 0);
  const idatCrcBuf = Buffer.alloc(4);
  idatCrcBuf.writeUInt32BE(idatCrc, 0);

  // IEND
  const iendChunk = Buffer.from('IEND');
  const iendCrc = zlib.crc32(iendChunk);
  const iendLenBuf = Buffer.alloc(4);
  iendLenBuf.writeUInt32BE(0, 0);
  const iendCrcBuf = Buffer.alloc(4);
  iendCrcBuf.writeUInt32BE(iendCrc, 0);

  return Buffer.concat([
    sig,
    ihdrLenBuf, ihdrChunk, ihdrCrcBuf,
    idatLenBuf, idatChunk, idatCrcBuf,
    iendLenBuf, iendChunk, iendCrcBuf
  ]);
}

// Generate valid PNG icons
const icon192 = makePng(192, 192, false);
const icon512 = makePng(512, 512, false);
const iconMaskable = makePng(512, 512, true);
const iconApple = makePng(180, 180, false);

const icon32 = makePng(32, 32, false);
const icon128 = makePng(128, 128, false);
const icon256 = makePng(256, 256, false);

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), icon192);
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), icon512);
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), iconMaskable);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), iconApple);
fs.writeFileSync(path.join(publicDir, 'arka_logo.png'), icon512);

// Also copy valid icon to src/assets/images
fs.writeFileSync(path.join(imgDir, 'arka_logo.png'), icon512);

// Synchronize all Tauri icons with the exact same Web logo
const tauriIconsDir = path.join(__dirname, 'src-tauri', 'icons');
fs.mkdirSync(tauriIconsDir, { recursive: true });
fs.writeFileSync(path.join(tauriIconsDir, '32x32.png'), icon32);
fs.writeFileSync(path.join(tauriIconsDir, '128x128.png'), icon128);
fs.writeFileSync(path.join(tauriIconsDir, '128x128@2x.png'), icon256);
fs.writeFileSync(path.join(tauriIconsDir, 'icon.png'), icon512);

// Manifest file
const manifest = {
  id: '/',
  name: 'سامانه صندوقداری و رستوران آرکا',
  short_name: 'آرکا پوز',
  description: 'سامانه یکپارچه فروش، حسابداری، انبارداری و سفارش‌گیری آنلاین آرکا',
  theme_color: '#2563eb',
  background_color: '#0f172a',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui'],
  orientation: 'any',
  start_url: '/',
  scope: '/',
  lang: 'fa',
  dir: 'rtl',
  categories: ['business', 'productivity', 'food'],
  prefer_related_applications: false,
  icons: [
    {
      src: '/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: '/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: '/pwa-maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable'
    }
  ]
};

fs.writeFileSync(path.join(publicDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(publicDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// Standalone Service Worker with Network-First strategy
const swContent = `// Arka POS Standalone Service Worker
const CACHE_NAME = 'arka-pos-cache-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/arka_logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  // Network-First strategy so clients always get latest code when connected
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});
`;

fs.writeFileSync(path.join(publicDir, 'sw.js'), swContent);
console.log('Successfully created public PWA manifest, service worker and 100% compliant icon assets.');
