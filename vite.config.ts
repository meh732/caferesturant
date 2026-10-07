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
        if (!req.url?.startsWith('/api/network')) {
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

        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      networkApiPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'arka_logo.png', 'arka_logo.ico'],
        manifest: {
          id: '/',
          name: 'سامانه صندوقداری و رستوران آرکا',
          short_name: 'Arka POS',
          description: 'سامانه یکپارچه فروش، حسابداری، انبارداری و سفارش‌گیری آنلاین آرکا',
          theme_color: '#2563eb',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'any',
          start_url: './',
          scope: './',
          icons: [
            {
              src: 'arka_logo.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'arka_logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
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
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
