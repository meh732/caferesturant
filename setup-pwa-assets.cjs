const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
fs.mkdirSync(publicDir, { recursive: true });

const srcLogo = path.join(__dirname, 'src', 'assets', 'images', 'arka_logo.png');
const srcIco = path.join(__dirname, 'src', 'assets', 'images', 'arka_logo.ico');

if (fs.existsSync(srcLogo)) {
  fs.copyFileSync(srcLogo, path.join(publicDir, 'arka_logo.png'));
  fs.copyFileSync(srcLogo, path.join(publicDir, 'pwa-192x192.png'));
  fs.copyFileSync(srcLogo, path.join(publicDir, 'pwa-512x512.png'));
  fs.copyFileSync(srcLogo, path.join(publicDir, 'pwa-maskable-512x512.png'));
}

if (fs.existsSync(srcIco)) {
  fs.copyFileSync(srcIco, path.join(publicDir, 'favicon.ico'));
}

// Manifest file
const manifest = {
  id: '/?source=pwa',
  name: 'سامانه صندوقداری و رستوران آرکا',
  short_name: 'Arka POS',
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

// Standalone Service Worker
const swContent = `// Arka POS Standalone Service Worker
const CACHE_NAME = 'arka-pos-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest.webmanifest',
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
  // Pass through non-GET and API network requests
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cache but update in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback to offline root page
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
`;

fs.writeFileSync(path.join(publicDir, 'sw.js'), swContent);
console.log('Successfully created public PWA manifest, service worker and icon assets.');
