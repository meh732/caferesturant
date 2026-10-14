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
  if (isTauri) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name);
        }
      });
    }
  } else if (window.location.protocol.startsWith('http')) {
    const registerSW = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
        reg.update();
      }).catch((err) => {
        console.warn('PWA service worker registration notice:', err);
      });
    };

    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
