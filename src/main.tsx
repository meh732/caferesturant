import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Service Worker Handling:
// In Native Tauri Desktop application, unregister any service worker to ensure fresh local assets.
// In Browser / Mobile PWA, register service worker and auto-update for offline support.
const isTauri = 
  typeof window !== 'undefined' && (
    (window as any).__TAURI__ !== undefined || 
    (window as any).__TAURI_INTERNALS__ !== undefined ||
    window.location.hostname === 'tauri.localhost' ||
    window.location.protocol === 'tauri:'
  );

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    (window as any).__arka_deferred_pwa_prompt = e;
    window.dispatchEvent(new CustomEvent('arka_pwa_prompt_ready'));
  });
}

if ('serviceWorker' in navigator) {
  // Always unregister existing service workers in dev/preview environments to prevent stale asset caching
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {});
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    }).catch(() => {});
  }
}

// Auto-check for server version updates and reload automatically if app is updated
if (typeof window !== 'undefined') {
  let initialVersion: string | null = null;
  const checkVersion = async () => {
    try {
      const res = await fetch('/api/version?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        const currentVer = data.version || data.lastUpdated?.toString();
        if (!initialVersion) {
          initialVersion = currentVer;
        } else if (currentVer && currentVer !== initialVersion) {
          console.log('New app version detected, reloading...');
          window.location.reload();
        }
      }
    } catch (e) {}
  };
  setInterval(checkVersion, 20000); // Check every 20 seconds
  window.addEventListener('focus', checkVersion);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
