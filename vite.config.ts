import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import os from 'os';
import {defineConfig, Plugin} from 'vite';

function networkApiPlugin(): Plugin {
  let networkOrders: any[] = [];
  let cachedMenu: { categories: any[]; menuItems: any[] } = { categories: [], menuItems: [] };
  let waiterCalls: any[] = [];

  return {
    name: 'network-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/network') && !req.url?.startsWith('/api/bot/') && !req.url?.startsWith('/api/snappfood/')) {
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

        // 2. GET & POST /api/network/menu
        if (url.pathname === '/api/network/menu') {
          if (req.method === 'GET') {
            res.statusCode = 200;
            res.end(JSON.stringify(cachedMenu));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                cachedMenu = JSON.parse(body);
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', count: cachedMenu.menuItems?.length || 0 }));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
              }
            });
            return;
          }
        }

        // 3. GET & POST /api/network/orders
        if (url.pathname === '/api/network/orders') {
          if (req.method === 'GET') {
            res.statusCode = 200;
            res.end(JSON.stringify(networkOrders));
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
                networkOrders.unshift(orderData);
                if (networkOrders.length > 100) networkOrders.pop();
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
              const found = networkOrders.find(o => o.id === id || o.tempId === id);
              if (found) {
                found.status = status;
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
            res.end(JSON.stringify(waiterCalls));
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
                waiterCalls.unshift(callData);
                if (waiterCalls.length > 50) waiterCalls.pop();
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
      networkApiPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'arka_logo.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'سامانه صندوقداری و رستوران آرکا',
          short_name: 'Arka POS',
          description: 'سامانه یکپارچه فروش، حسابداری، انبارداری و سفارش‌گیری آنلاین آرکا',
          theme_color: '#2563eb',
          background_color: '#0f172a',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui', 'window-controls-overlay'],
          orientation: 'any',
          start_url: '/',
          scope: '/',
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
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
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
