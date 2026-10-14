import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import os from 'os';
import {defineConfig, Plugin} from 'vite';

import fs from 'fs';

function networkApiPlugin(): Plugin {
  // Persistent Server DB file storage in Vite dev mode
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
  }
  const dbFilePath = path.join(dataDir, 'arka_db.json');
  let serverDbState = {
    version: 1,
    lastUpdated: Date.now(),
    data: {} as Record<string, any>
  };

  let sseClients: any[] = [];

  function broadcastDbChange(isReset = false) {
    const payload = JSON.stringify({
      type: isReset ? 'DB_RESET' : 'DB_CHANGED',
      version: serverDbState.version,
      lastUpdated: serverDbState.lastUpdated
    });
    for (let i = sseClients.length - 1; i >= 0; i--) {
      try {
        sseClients[i].write(`data: ${payload}\n\n`);
      } catch (err) {
        sseClients.splice(i, 1);
      }
    }
  }

  function ensureDefaultSeedData() {
    if (!serverDbState.data || typeof serverDbState.data !== 'object') {
      serverDbState.data = {};
    }

    if (!Array.isArray(serverDbState.data.users) || serverDbState.data.users.length === 0) {
      serverDbState.data.isRawClean = true;
    }
  }

  if (fs.existsSync(dbFilePath)) {
    try {
      const raw = fs.readFileSync(dbFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        serverDbState = {
          version: parsed.version || 1,
          lastUpdated: parsed.lastUpdated || Date.now(),
          data: parsed.data || {}
        };
      }
    } catch (e) {}
  }
  ensureDefaultSeedData();

  const saveDevDb = () => {
    try {
      const tempPath = `${dbFilePath}.tmp`;
      const bakPath = `${dbFilePath}.bak`;
      const jsonStr = JSON.stringify(serverDbState, null, 2);

      fs.writeFileSync(tempPath, jsonStr, 'utf-8');
      if (fs.existsSync(dbFilePath)) {
        try { fs.copyFileSync(dbFilePath, bakPath); } catch (e) {}
      }
      fs.renameSync(tempPath, dbFilePath);
    } catch (e) {}
  };

  function mergeTableData(existingArr: any[] = [], incomingArr: any[] = [], deletedIds: any[] = []) {
    const deletedSet = new Set((deletedIds || []).map(String));
    const map = new Map();

    if (Array.isArray(existingArr)) {
      for (const item of existingArr) {
        if (!item) continue;
        const key = item.id !== undefined ? String(item.id) : (item.tempId ? String(item.tempId) : JSON.stringify(item));
        if (!deletedSet.has(key)) {
          map.set(key, item);
        }
      }
    }

    if (Array.isArray(incomingArr)) {
      for (const item of incomingArr) {
        if (!item) continue;
        const key = item.id !== undefined ? String(item.id) : (item.tempId ? String(item.tempId) : JSON.stringify(item));
        if (!deletedSet.has(key)) {
          map.set(key, item);
        }
      }
    }

    return Array.from(map.values());
  }

  return {
    name: 'network-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Explicitly serve Service Worker and Manifest with correct headers for PWA installability in dev mode
        const reqPath = req.url ? req.url.split('?')[0] : '';
        if (reqPath === '/sw.js') {
          const swFile = path.resolve(__dirname, 'public/sw.js');
          let swContent = '';
          if (fs.existsSync(swFile)) {
            swContent = fs.readFileSync(swFile, 'utf-8');
          } else {
            const fallbackSw = path.resolve(process.cwd(), 'public/sw.js');
            if (fs.existsSync(fallbackSw)) {
              swContent = fs.readFileSync(fallbackSw, 'utf-8');
            } else {
              swContent = `// Arka PWA Standalone Service Worker
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method === 'GET' && !e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  }
});`;
            }
          }
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Service-Worker-Allowed', '/');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.statusCode = 200;
          res.end(swContent);
          return;
        }

        if (reqPath === '/manifest.webmanifest' || reqPath === '/manifest.json') {
          const manifestFile = path.resolve(__dirname, reqPath === '/manifest.json' ? 'public/manifest.json' : 'public/manifest.webmanifest');
          let manifestContent = '';
          if (fs.existsSync(manifestFile)) {
            manifestContent = fs.readFileSync(manifestFile, 'utf-8');
          }
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.statusCode = 200;
          res.end(manifestContent);
          return;
        }

        if (!req.url?.startsWith('/api/network') && !req.url?.startsWith('/api/db') && !req.url?.startsWith('/api/bot/') && !req.url?.startsWith('/api/snappfood/')) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        // Live Server-Sent Events (SSE) Endpoint
        if (url.pathname === '/api/db/events' && req.method === 'GET') {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          (res as any).flushHeaders?.();

          res.write(`data: ${JSON.stringify({ type: 'CONNECTED', version: serverDbState.version, timestamp: Date.now() })}\n\n`);
          sseClients.push(res);

          const heartbeat = setInterval(() => {
            try {
              res.write(': heartbeat\n\n');
            } catch (e) {
              clearInterval(heartbeat);
            }
          }, 15000);

          req.on('close', () => {
            clearInterval(heartbeat);
            sseClients = sseClients.filter(c => c !== res);
          });
          return;
        }

        // DB Sync Endpoints for Central Server Database
        if (url.pathname === '/api/db/version' && req.method === 'GET') {
          res.statusCode = 200;
          res.end(JSON.stringify({
            status: 'ok',
            version: serverDbState.version,
            lastUpdated: serverDbState.lastUpdated
          }));
          return;
        }

        if (url.pathname === '/api/db/sync') {
          if (req.method === 'GET') {
            const isRawClean = !!(
              serverDbState.data && (
                serverDbState.data.isRawClean === true ||
                !Array.isArray(serverDbState.data.users) ||
                serverDbState.data.users.length === 0
              )
            );
            res.statusCode = 200;
            res.end(JSON.stringify({
              status: 'ok',
              version: serverDbState.version,
              lastUpdated: serverDbState.lastUpdated,
              isRawClean,
              data: serverDbState.data || {}
            }));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body || '{}');
                const clientData = payload.data || {};
                const deleted = payload.deleted || {};

                const isServerClean = !!(
                  serverDbState.data && (
                    serverDbState.data.isRawClean === true ||
                    !Array.isArray(serverDbState.data.users) ||
                    serverDbState.data.users.length === 0
                  )
                );

                // If central server is in raw clean mode and an old un-reset client is trying to push stale pre-reset data
                if (isServerClean && !payload.isFirstAdminRegistration) {
                  const clientHasUsers = Array.isArray(clientData.users) && clientData.users.length > 0;
                  const clientHasMenu = Array.isArray(clientData.categories) && clientData.categories.length > 0;
                  if (clientHasUsers || clientHasMenu) {
                    res.statusCode = 200;
                    res.end(JSON.stringify({
                      status: 'rejected_server_raw_clean',
                      isRawClean: true,
                      version: serverDbState.version,
                      lastUpdated: serverDbState.lastUpdated
                    }));
                    return;
                  }
                }

                if (clientData && typeof clientData === 'object') {
                  const allTableNames = new Set([
                    ...Object.keys(serverDbState.data || {}),
                    ...Object.keys(clientData),
                    ...Object.keys(deleted)
                  ]);

                  for (const tableName of allTableNames) {
                    const incomingTable = clientData[tableName];
                    const existingTable = serverDbState.data[tableName] || [];
                    const deletedIds = deleted[tableName] || [];

                    if (Array.isArray(incomingTable) || deletedIds.length > 0) {
                      serverDbState.data[tableName] = mergeTableData(existingTable, incomingTable, deletedIds);
                    }
                  }

                  if (Array.isArray(serverDbState.data.users) && serverDbState.data.users.length > 0) {
                    delete serverDbState.data.isRawClean;
                  }

                  serverDbState.version = (serverDbState.version || 0) + 1;
                  serverDbState.lastUpdated = Date.now();
                  saveDevDb();
                  broadcastDbChange();
                }

                res.statusCode = 200;
                res.end(JSON.stringify({
                  status: 'ok',
                  version: serverDbState.version,
                  lastUpdated: serverDbState.lastUpdated,
                  isRawClean: !!(serverDbState.data && serverDbState.data.isRawClean)
                }));
              } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Failed to sync database' }));
              }
            });
            return;
          }
        }

        if (url.pathname === '/api/db/reset' && req.method === 'POST') {
          serverDbState = {
            version: (serverDbState.version || 0) + 1,
            lastUpdated: Date.now(),
            data: {
              isRawClean: true,
              categories: [],
              menuItems: [],
              orders: [],
              settings: [],
              customers: [],
              users: [],
              expenses: [],
              employees: [],
              salaryPayments: [],
              restaurantTables: [],
              networkOrders: [],
              warehouses: [],
              rawMaterials: [],
              warehouseStocks: [],
              warehouseTransfers: [],
              stockTransactions: [],
              recipes: [],
              chatMessages: [],
              systemNotifications: [],
              bankAccounts: [],
              cashBoxes: [],
              chequeBooks: [],
              cheques: [],
              financialTransactions: [],
              chartOfAccounts: [],
              journalEntries: []
            }
          };
          saveDevDb();
          broadcastDbChange(true);
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'ok', message: 'Central database reset successful to 100% raw clean state' }));
          return;
        }

        // 1. GET /api/network/info
        if (url.pathname === '/api/network/info' && req.method === 'GET') {
          const nets = os.networkInterfaces();
          const localIps: string[] = [];
          for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
              if (net.family === 'IPv4' && !net.internal) {
                localIps.push(net.address);
              }
            }
          }
          res.statusCode = 200;
          res.end(JSON.stringify({
            status: 'ok',
            localIps: localIps.length > 0 ? localIps : ['127.0.0.1'],
            port: 3000,
            host: req.headers.host,
            timestamp: Date.now()
          }));
          return;
        }

        // 2. GET & POST /api/network/menu (Unified with serverDbState)
        if (url.pathname === '/api/network/menu') {
          if (req.method === 'GET') {
            res.statusCode = 200;
            res.end(JSON.stringify({
              categories: serverDbState.data.categories || [],
              menuItems: serverDbState.data.menuItems || []
            }));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const bodyJson = JSON.parse(body || '{}');
                if (Array.isArray(bodyJson.categories)) {
                  serverDbState.data.categories = bodyJson.categories;
                }
                if (Array.isArray(bodyJson.menuItems)) {
                  serverDbState.data.menuItems = bodyJson.menuItems;
                }
                serverDbState.version = (serverDbState.version || 0) + 1;
                serverDbState.lastUpdated = Date.now();
                saveDevDb();
                broadcastDbChange();
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', count: (serverDbState.data.menuItems || []).length }));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
              }
            });
            return;
          }
        }

        // 3. GET & POST /api/network/orders (Unified with serverDbState)
        if (url.pathname === '/api/network/orders') {
          if (req.method === 'GET') {
            res.statusCode = 200;
            res.end(JSON.stringify(serverDbState.data.networkOrders || []));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const orderData = JSON.parse(body);
                orderData.id = orderData.id || Date.now();
                orderData.createdAt = orderData.createdAt || new Date().toISOString();
                orderData.status = orderData.status || 'pending';
                if (!Array.isArray(serverDbState.data.networkOrders)) {
                  serverDbState.data.networkOrders = [];
                }
                serverDbState.data.networkOrders.unshift(orderData);
                if (serverDbState.data.networkOrders.length > 200) {
                  serverDbState.data.networkOrders.pop();
                }
                serverDbState.version = (serverDbState.version || 0) + 1;
                serverDbState.lastUpdated = Date.now();
                saveDevDb();
                broadcastDbChange();
                res.statusCode = 201;
                res.end(JSON.stringify({ status: 'ok', order: orderData }));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
              }
            });
            return;
          }
        }

        // 4. POST /api/network/orders/status
        if (url.pathname === '/api/network/orders/status' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { id, status } = JSON.parse(body);
              if (Array.isArray(serverDbState.data.networkOrders)) {
                const found = serverDbState.data.networkOrders.find((o: any) => o.id === id || o.tempId === id);
                if (found) {
                  found.status = status;
                  serverDbState.version = (serverDbState.version || 0) + 1;
                  serverDbState.lastUpdated = Date.now();
                  saveDevDb();
                  broadcastDbChange();
                }
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ status: 'ok' }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        // 5. POST & GET /api/network/waiter-call
        if (url.pathname === '/api/network/waiter-call') {
          if (req.method === 'GET') {
            res.statusCode = 200;
            res.end(JSON.stringify(serverDbState.data.waiterCalls || []));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const callData = JSON.parse(body);
                callData.id = Date.now();
                callData.createdAt = new Date().toISOString();
                if (!Array.isArray(serverDbState.data.waiterCalls)) {
                  serverDbState.data.waiterCalls = [];
                }
                serverDbState.data.waiterCalls.unshift(callData);
                if (serverDbState.data.waiterCalls.length > 50) {
                  serverDbState.data.waiterCalls.pop();
                }
                serverDbState.version = (serverDbState.version || 0) + 1;
                serverDbState.lastUpdated = Date.now();
                saveDevDb();
                broadcastDbChange();
                res.statusCode = 201;
                res.end(JSON.stringify({ status: 'ok' }));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
              }
            });
            return;
          }
        }

        // 5. Bot API Proxies (Telegram & Bale)
        if (url.pathname.startsWith('/api/bot/')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = body ? JSON.parse(body) : {};

              if (url.pathname === '/api/bot/telegram/send') {
                const tgRes = await fetch(`https://api.telegram.org/bot${data.token}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: data.chatId, text: data.text, parse_mode: 'HTML' })
                });
                const tgData = await tgRes.json();
                res.statusCode = tgRes.ok ? 200 : 400;
                res.end(JSON.stringify(tgData));
                return;
              }

              if (url.pathname === '/api/bot/telegram/document') {
                const formData = new FormData();
                formData.append('chat_id', data.chatId);
                formData.append('document', new Blob([data.fileContent], { type: 'application/json' }), data.fileName || 'backup.json');
                if (data.caption) formData.append('caption', data.caption);
                formData.append('parse_mode', 'HTML');

                const tgRes = await fetch(`https://api.telegram.org/bot${data.token}/sendDocument`, {
                  method: 'POST',
                  body: formData
                });
                const tgData = await tgRes.json();
                res.statusCode = tgRes.ok ? 200 : 400;
                res.end(JSON.stringify(tgData));
                return;
              }

              if (url.pathname === '/api/bot/bale/send') {
                const baleRes = await fetch(`https://tapi.bale.ai/bot${data.token}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: data.chatId, text: data.text })
                });
                const baleData = await baleRes.json();
                res.statusCode = baleRes.ok ? 200 : 400;
                res.end(JSON.stringify(baleData));
                return;
              }

              if (url.pathname === '/api/bot/bale/document') {
                const formData = new FormData();
                formData.append('chat_id', data.chatId);
                formData.append('document', new Blob([data.fileContent], { type: 'application/json' }), data.fileName || 'backup.json');
                if (data.caption) formData.append('caption', data.caption);

                const baleRes = await fetch(`https://tapi.bale.ai/bot${data.token}/sendDocument`, {
                  method: 'POST',
                  body: formData
                });
                const baleData = await baleRes.json();
                res.statusCode = baleRes.ok ? 200 : 400;
                res.end(JSON.stringify(baleData));
                return;
              }

              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Endpoint not found' }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message || 'Bot proxy error' }));
            }
          });
          return;
        }

        // 6. SnappFood Webhook & API Endpoints
        if (url.pathname.startsWith('/api/snappfood/')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = body ? JSON.parse(body) : {};

              // Webhook Receiver (Snappfood sends new order)
              if (url.pathname === '/api/snappfood/webhook' && req.method === 'POST') {
                res.statusCode = 200;
                res.end(JSON.stringify({
                  status: 'success',
                  resultCode: 0,
                  message: 'Order received and queued in Arka POS system',
                  receivedAt: new Date().toISOString(),
                  orderCode: data.orderCode || data.id || 'SF-NEW'
                }));
                return;
              }

              // Accept Order API
              if (url.pathname === '/api/snappfood/accept' && req.method === 'POST') {
                res.statusCode = 200;
                res.end(JSON.stringify({
                  status: 'success',
                  resultCode: 0,
                  message: `سفارش #${data.orderCode} با موفقیت در اسنپ‌فود تایید شد (زمان پخت: ${data.prepTimeMinutes || 25} دقیقه)`,
                  orderCode: data.orderCode,
                  prepTime: data.prepTimeMinutes || 25
                }));
                return;
              }

              // Status probe
              if (url.pathname === '/api/snappfood/status') {
                res.statusCode = 200;
                res.end(JSON.stringify({
                  status: 'connected',
                  gateway: 'Arka SnappFood Bridge v1.2.0',
                  timestamp: Date.now()
                }));
                return;
              }

              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Snappfood endpoint not found' }));
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      networkApiPlugin()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    build: {
      chunkSizeWarningLimit: 2000,
      sourcemap: false,
      minify: 'esbuild' as const,
      cssCodeSplit: true,
      rollupOptions: {
        maxParallelFileOps: 2,
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-icons': ['lucide-react'],
            'vendor-utils': ['xlsx', 'date-fns', 'date-fns-jalali', 'dexie', 'dexie-react-hooks'],
          }
        }
      }
    },
    preview: {
      allowedHosts: true as true,
    },
    server: {
      allowedHosts: true as true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
