import { db, NetworkOrder, Category, MenuItem } from './db';
import { serverFetch, pushLocalDbToServer, safeTimeoutSignal } from './serverSync';
export { serverFetch };
import { formatCurrency } from './utils';

const BROADCAST_CHANNEL_NAME = 'arka_pos_network_channel';
let broadcastChannel: BroadcastChannel | null = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch (e) {
  console.warn('BroadcastChannel not supported in this environment');
}

export interface NetworkInfo {
  status: string;
  localIps: string[];
  port: number;
  host: string;
  timestamp: number;
}

let sharedAudioCtx: AudioContext | null = null;
let audioUnlockAttached = false;
let htmlAudioUnlocked = false;
const wavCache = new Map<string, string>();

export interface ChimeNote {
  freq: number;
  start: number;
  dur: number;
  vol: number;
  type?: OscillatorType;
}

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('arka_notif_sound_muted') !== 'true';
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('arka_notif_sound_muted', enabled ? 'false' : 'true');
  window.dispatchEvent(new CustomEvent('arka_sound_pref_changed', { detail: { enabled } }));
}

// Build a tiny in-memory PCM 16-bit WAV data URI so sound works even if Web Audio Context is suspended
function buildChimeWavDataUri(cacheKey: string, notes: ChimeNote[]): string {
  const existing = wavCache.get(cacheKey);
  if (existing) return existing;

  const sampleRate = 22050;
  const totalSec = Math.max(0.25, ...notes.map(n => n.start + n.dur)) + 0.05;
  const numSamples = Math.ceil(sampleRate * totalSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, 1, true);  // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const note of notes) {
      if (t >= note.start && t <= note.start + note.dur) {
        const localT = t - note.start;
        const env = Math.min(1, localT / 0.012) * Math.exp(-4.5 * (localT / note.dur));
        const fundamental = Math.sin(2 * Math.PI * note.freq * localT);
        const harmonic = 0.25 * Math.sin(2 * Math.PI * note.freq * 2 * localT);
        sample += (fundamental + harmonic) * note.vol * env;
      }
    }
    const clamped = Math.max(-0.98, Math.min(0.98, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const uri = `data:audio/wav;base64,${btoa(binary)}`;
  wavCache.set(cacheKey, uri);
  return uri;
}

function playWavFallback(cacheKey: string, notes: ChimeNote[]): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  try {
    const uri = buildChimeWavDataUri(cacheKey, notes);
    const audio = new Audio(uri);
    audio.volume = 0.9;
    audio.play().catch(() => {});
  } catch {}
}

export function getUnlockedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function unlockNotificationAudio(): void {
  if (typeof window === 'undefined' || audioUnlockAttached) return;
  audioUnlockAttached = true;

  const unlock = () => {
    const ctx = getUnlockedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (!htmlAudioUnlocked && typeof Audio !== 'undefined') {
      htmlAudioUnlocked = true;
      try {
        const silentUri = buildChimeWavDataUri('silent-unlock', [{ freq: 440, start: 0, dur: 0.02, vol: 0.0001 }]);
        const a = new Audio(silentUri);
        a.volume = 0.001;
        a.play().catch(() => { htmlAudioUnlocked = false; });
      } catch {
        htmlAudioUnlocked = false;
      }
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

export function playChimeWithFallback(cacheKey: string, notes: ChimeNote[], vibratePattern?: number[]): void {
  if (!isNotificationSoundEnabled()) return;

  if (vibratePattern && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(vibratePattern); } catch {}
  }

  try {
    const ctx = getUnlockedAudioContext();
    if (!ctx) {
      playWavFallback(cacheKey, notes);
      return;
    }

    const scheduleNotes = () => {
      const now = ctx.currentTime;
      notes.forEach(({ freq, start, dur, vol, type }) => {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();
        const overGain = ctx.createGain();

        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now + start);
        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 2, now + start);

        gain.gain.setValueAtTime(0.001, now + start);
        gain.gain.linearRampToValueAtTime(Math.min(0.65, vol), now + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

        overGain.gain.setValueAtTime(0.001, now + start);
        overGain.gain.linearRampToValueAtTime(Math.min(0.18, vol * 0.28), now + start + 0.015);
        overGain.gain.exponentialRampToValueAtTime(0.001, now + start + dur * 0.7);

        osc.connect(gain);
        overtone.connect(overGain);
        gain.connect(ctx.destination);
        overGain.connect(ctx.destination);

        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
        overtone.start(now + start);
        overtone.stop(now + start + dur + 0.02);
      });
    };

    if (ctx.state === 'running') {
      scheduleNotes();
    } else {
      ctx.resume()
        .then(() => {
          if (ctx.state === 'running') {
            scheduleNotes();
          } else {
            playWavFallback(cacheKey, notes);
          }
        })
        .catch(() => {
          playWavFallback(cacheKey, notes);
        });
    }
  } catch {
    playWavFallback(cacheKey, notes);
  }
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function triggerBrowserNotification(title: string, body: string, tag?: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: tag || `arka-${Date.now()}`,
    silent: !isNotificationSoundEnabled(),
    requireInteraction: false
  };

  try {
    const n = new Notification(title, options);
    setTimeout(() => {
      try { n.close(); } catch {}
    }, 10000);
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {}
    };
  } catch {
    // Android Chrome PWA requires ServiceWorkerRegistration.showNotification() instead of new Notification()
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, options))
        .catch(() => {});
    }
  }
}

// Bright, unmistakable POS bell chime for incoming menu / tablet orders
export function playNewOrderChime() {
  playChimeWithFallback(
    'new-order-chime-v2',
    [
      { freq: 659.25, start: 0, dur: 0.28, vol: 0.45 },     // E5
      { freq: 880.0, start: 0.14, dur: 0.30, vol: 0.50 },   // A5
      { freq: 1108.73, start: 0.28, dur: 0.48, vol: 0.48 }, // C#6
      { freq: 1318.51, start: 0.44, dur: 0.55, vol: 0.42 }  // E6
    ],
    [180, 80, 180]
  );
}

// Clean two-tone chime for general / stock / report / system notifications
export function playGeneralNotificationChime() {
  playChimeWithFallback(
    'general-notif-chime-v1',
    [
      { freq: 587.33, start: 0, dur: 0.22, vol: 0.38 },     // D5
      { freq: 880.0, start: 0.15, dur: 0.36, vol: 0.42 }    // A5
    ],
    [120]
  );
}

export async function initLanServer(port: number = 3000): Promise<boolean> {
  if (typeof window !== 'undefined') {
    localStorage.setItem('arka_active_lan_port', String(port));
  }
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke('start_lan_server', { port });
      console.log('[LAN SERVER]', res);
      // Immediately push local Tauri Dexie database to the newly started LAN server
      setTimeout(() => {
        pushLocalDbToServer().catch(() => {});
      }, 300);
      return true;
    } catch (e) {
      console.warn('[LAN SERVER] Failed to start native LAN server:', e);
      return false;
    }
  }
  return false;
}

export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    window.location.protocol.startsWith('tauri') ||
    window.location.hostname === 'tauri.localhost'
  );
}

export function isLocalhostOrTauri(hostname?: string): boolean {
  if (!hostname && typeof window !== 'undefined') hostname = window.location.hostname;
  if (!hostname) return true;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === 'tauri.localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0' ||
    isTauriEnvironment()
  );
}

// Discover local private IPv4 address (192.168.x.x, 10.x.x.x) via browser WebRTC
export async function detectLocalIpsWebRTC(): Promise<string[]> {
  if (typeof window === 'undefined') return [];
  return new Promise((resolve) => {
    const ips: Set<string> = new Set();
    const RTCPeer = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection || (window as any).mozRTCPeerConnection;
    if (!RTCPeer) {
      resolve([]);
      return;
    }

    try {
      const pc = new RTCPeer({ iceServers: [] });
      pc.createDataChannel('arka-local-ip-check');
      pc.createOffer()
        .then((offer: any) => pc.setLocalDescription(offer))
        .catch(() => {});

      const timer = setTimeout(() => {
        try { pc.close(); } catch (e) {}
        resolve(Array.from(ips));
      }, 800);

      pc.onicecandidate = (event: any) => {
        if (!event || !event.candidate) {
          clearTimeout(timer);
          try { pc.close(); } catch (e) {}
          resolve(Array.from(ips));
          return;
        }

        const candidate = event.candidate.candidate;
        const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
        const match = ipRegex.exec(candidate);
        if (match && match[1]) {
          const ip = match[1];
          if (
            ip.startsWith('192.168.') ||
            ip.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
          ) {
            ips.add(ip);
          }
        }
      };
    } catch (e) {
      resolve([]);
    }
  });
}

let cachedNetworkInfo: { info: NetworkInfo; port: number; expiresAt: number } | null = null;

// Helpers for preferred LAN IP persistence
export function getPreferredLanIp(): string | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem('arka_lan_ip');
  if (saved && saved.trim() && !saved.startsWith('127.') && saved !== '0.0.0.0') {
    return saved.trim();
  }
  return null;
}

export function setPreferredLanIp(ip: string): void {
  if (typeof window === 'undefined') return;
  const clean = ip.trim();
  if (clean) {
    localStorage.setItem('arka_lan_ip', clean);
  } else {
    localStorage.removeItem('arka_lan_ip');
  }
}

// Windows Background Service & Autostart Helpers
export async function getWindowsAutostartStatus(): Promise<boolean> {
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('get_windows_autostart_status');
    } catch (e) {}
  }
  return false;
}

export async function setWindowsAutostart(enable: boolean): Promise<boolean> {
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('set_windows_autostart', { enable });
    } catch (e) {}
  }
  return false;
}

export async function exitAppCompletely(): Promise<void> {
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('exit_app_completely');
    } catch (e) {}
  }
}

export async function showMainWindow(): Promise<void> {
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('show_main_window');
    } catch (e) {}
  }
}

// 1. Get Network Info (Local IPs, Port) with Setup Config + Tauri + WebRTC + Backend fallback
export async function getNetworkInfo(overridePort?: number): Promise<NetworkInfo> {
  const targetPort = overridePort || 3000;
  const preferredIp = getPreferredLanIp();

  // Use cached network info if recent (within 15s) and for same port
  if (cachedNetworkInfo && cachedNetworkInfo.port === targetPort && Date.now() < cachedNetworkInfo.expiresAt) {
    if (preferredIp && cachedNetworkInfo.info.localIps[0] !== preferredIp) {
      // Re-order preferred IP to top
      const reordered = [preferredIp, ...cachedNetworkInfo.info.localIps.filter(ip => ip !== preferredIp)];
      return {
        ...cachedNetworkInfo.info,
        localIps: reordered,
        host: `${preferredIp}:${targetPort}`
      };
    }
    return cachedNetworkInfo.info;
  }

  // 1. Check if running inside Tauri Desktop App (Ground Truth from OS)
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const tauriRes: any = await invoke('get_system_network_info');
      const rawList: string[] = Array.isArray(tauriRes)
        ? tauriRes
        : Array.isArray(tauriRes?.all_ips)
          ? tauriRes.all_ips
          : tauriRes?.ip
            ? [tauriRes.ip]
            : [];
      let validTauri = rawList.filter(
        (ip: string) => ip && !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.startsWith('169.254.') && !ip.startsWith('192.168.56.')
      );

      // Prioritize preferred IP if previously configured
      if (preferredIp) {
        validTauri = [preferredIp, ...validTauri.filter(ip => ip !== preferredIp)];
      }

      if (validTauri.length > 0) {
        const result: NetworkInfo = {
          status: 'tauri_native',
          localIps: validTauri,
          port: targetPort,
          host: `${validTauri[0]}:${targetPort}`,
          timestamp: Date.now()
        };
        cachedNetworkInfo = { info: result, port: targetPort, expiresAt: Date.now() + 15000 };
        return result;
      }
    } catch (e) {
      // Ignore and proceed to web methods
    }
  }

  // 2. Try fetching from direct relative API
  try {
    const res = await fetch('/api/network/info', { signal: safeTimeoutSignal(1500) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.localIps && data.localIps.length > 0 && !data.localIps[0].startsWith('127.')) {
        let sortedIps = data.localIps;
        if (preferredIp) {
          sortedIps = [preferredIp, ...data.localIps.filter((ip: string) => ip !== preferredIp)];
        }
        const result: NetworkInfo = {
          ...data,
          localIps: sortedIps,
          port: overridePort || data.port || 3000,
          host: `${sortedIps[0]}:${overridePort || data.port || 3000}`
        };
        return result;
      }
    }
  } catch (e) {}

  // 3. If in Tauri or localhost, try fetching from localhost server
  if (typeof window !== 'undefined' && isLocalhostOrTauri()) {
    try {
      const res = await fetch(`http://localhost:${targetPort}/api/network/info`, { signal: safeTimeoutSignal(1200) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.localIps && data.localIps.length > 0) {
          let sortedIps = data.localIps;
          if (preferredIp) {
            sortedIps = [preferredIp, ...data.localIps.filter((ip: string) => ip !== preferredIp)];
          }
          return {
            ...data,
            localIps: sortedIps,
            port: targetPort,
            host: `${sortedIps[0]}:${targetPort}`
          };
        }
      }
    } catch (e) {}
  }

  // 4. Discover local private IP via WebRTC
  try {
    const webrtcIps = await detectLocalIpsWebRTC();
    if (webrtcIps && webrtcIps.length > 0) {
      let sortedIps = webrtcIps;
      if (preferredIp) {
        sortedIps = [preferredIp, ...webrtcIps.filter((ip: string) => ip !== preferredIp)];
      }
      return {
        status: 'webrtc_discovered',
        localIps: sortedIps,
        port: targetPort,
        host: `${sortedIps[0]}:${targetPort}`,
        timestamp: Date.now()
      };
    }
  } catch (e) {}

  // 5. Check if static network config was generated during setup (arka-network-config.json)
  try {
    const cfgRes = await fetch('/arka-network-config.json', { signal: safeTimeoutSignal(800) });
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (cfg && cfg.serverIp && !cfg.serverIp.startsWith('127.') && cfg.serverIp.trim() !== '') {
        const primaryIp = preferredIp || cfg.serverIp;
        return {
          status: 'setup_file',
          localIps: [primaryIp],
          port: overridePort || cfg.serverPort || targetPort,
          host: `${primaryIp}:${overridePort || cfg.serverPort || targetPort}`,
          timestamp: Date.now()
        };
      }
    }
  } catch (e) {}

  // 6. Fallback using current window location or preferred IP
  const hostname = window.location.hostname;
  const isLocal = isLocalhostOrTauri(hostname);
  const detectedPort = window.location.port ? parseInt(window.location.port) : targetPort;
  const fallbackIp = preferredIp || (isLocal ? '192.168.84.41' : hostname);

  return {
    status: 'fallback',
    localIps: [fallbackIp],
    port: overridePort || detectedPort || 3000,
    host: `${fallbackIp}:${overridePort || detectedPort || 3000}`,
    timestamp: Date.now()
  };
}

// 2. Publish current menu to the network server
export async function syncMenuToNetwork(categories: Category[], menuItems: MenuItem[]): Promise<boolean> {
  try {
    const res = await serverFetch('/api/network/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories, menuItems }),
      signal: safeTimeoutSignal(4000)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export interface PublicStoreSettings {
  restaurantName?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  wifiSsid?: string;
  wifiPassword?: string;
  currencyUnit?: 'toman' | 'rial';
  taxEnabled?: boolean;
  taxPercentage?: number;
}

// 3. Fetch menu & safe public store settings from network server (for tablet/customer clients without local Dexie)
export async function fetchMenuFromNetwork(): Promise<{
  categories: Category[];
  menuItems: MenuItem[];
  recipes?: any[];
  publicSettings?: PublicStoreSettings;
} | null> {
  // Try network menu API first for fresh public settings (tax, currency, restaurant name) + menu
  try {
    const res = await serverFetch('/api/network/menu', { signal: safeTimeoutSignal(3500) });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.categories) && data.categories.length > 0 && Array.isArray(data.menuItems)) {
        return {
          categories: data.categories,
          menuItems: data.menuItems,
          recipes: Array.isArray(data.recipes) ? data.recipes : [],
          publicSettings: data.publicSettings || undefined
        };
      }
    }
  } catch (e) {}

  // Try central DB sync endpoint (works on both Linux Node server and Windows Tauri Rust LAN server)
  try {
    const syncRes = await serverFetch('/api/db/sync', { signal: safeTimeoutSignal(4000) });
    if (syncRes.ok) {
      const syncJson = await syncRes.json();
      const d = syncJson?.data || {};
      const s = Array.isArray(d.settings) && d.settings.length > 0 ? d.settings[0] : undefined;
      if (Array.isArray(d.categories) && d.categories.length > 0 && Array.isArray(d.menuItems)) {
        return {
          categories: d.categories,
          menuItems: d.menuItems,
          recipes: Array.isArray(d.recipes) ? d.recipes : [],
          publicSettings: s
            ? {
                restaurantName: s.restaurantName,
                phone: s.phone,
                address: s.address,
                logoUrl: s.logoUrl,
                wifiSsid: s.wifiSsid,
                wifiPassword: s.wifiPassword,
                currencyUnit: s.currencyUnit,
                taxEnabled: Boolean(s.taxEnabled),
                taxPercentage: Number(s.taxPercentage || 0)
              }
            : undefined
        };
      }
    }
  } catch (e) {}

  // Fallback to local Dexie DB
  try {
    const localCategories = await db.categories.toArray();
    const localMenuItems = await db.menuItems.toArray();
    const localRecipes = await db.recipes.toArray();
    const localSettings = await db.settings.toCollection().first();
    if (localCategories.length > 0 && localMenuItems.length > 0) {
      return {
        categories: localCategories,
        menuItems: localMenuItems,
        recipes: localRecipes,
        publicSettings: localSettings
          ? {
              restaurantName: localSettings.restaurantName,
              phone: localSettings.phone,
              address: localSettings.address,
              logoUrl: localSettings.logoUrl,
              wifiSsid: localSettings.wifiSsid,
              wifiPassword: localSettings.wifiPassword,
              currencyUnit: localSettings.currencyUnit,
              taxEnabled: Boolean(localSettings.taxEnabled),
              taxPercentage: Number(localSettings.taxPercentage || 0)
            }
          : undefined
      };
    }
  } catch (e) {
    // Dexie might be empty on tablet device
  }

  return null;
}

// 4. Send an order from Waiter Tablet or Customer QR Code
export async function sendNetworkOrder(orderData: Omit<NetworkOrder, 'id'>): Promise<NetworkOrder> {
  const newOrder: NetworkOrder = {
    ...orderData,
    createdAt: new Date(),
    status: 'pending'
  };

  // Save to local Dexie database if available (which also triggers automatic server sync push)
  try {
    const localId = await db.networkOrders.add(newOrder);
    newOrder.id = localId;
  } catch (e) {
    // Dexie write failed or in client mode
    newOrder.id = Date.now();
  }

  // Push to server API
  try {
    serverFetch('/api/network/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
      signal: safeTimeoutSignal(4000)
    }).catch(() => {});
  } catch (e) {}

  // Broadcast to other tabs/windows
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'NEW_ORDER', order: newOrder });
    } catch (e) {}
  }

  // Also trigger localStorage event
  try {
    localStorage.setItem('arka_last_network_order', JSON.stringify({
      order: newOrder,
      time: Date.now()
    }));
  } catch (e) {}

  // Record single deduplicated system notification for staff (using final payable total)
  try {
    const orderCategory = `order-${newOrder.tempId}`;
    const existingNotif = await db.systemNotifications
      .filter(
        (n) =>
          n.type === 'new_order' &&
          (n.category === orderCategory || (!!newOrder.tempId && n.metadata?.tempId === newOrder.tempId))
      )
      .first();
    if (!existingNotif) {
      const payableTotal = newOrder.total !== undefined ? newOrder.total : (newOrder.subtotal || 0);
      await db.systemNotifications.add({
        type: 'new_order',
        title: `سفارش جدید از ${newOrder.tableTitle || `میز ${newOrder.tableNumber}`}`,
        message: `${newOrder.items.length} قلم کالا به ارزش ${formatCurrency(payableTotal)} ثبت شد.`,
        category: orderCategory,
        targetTab: 'pos',
        metadata: { orderId: newOrder.id, tempId: newOrder.tempId },
        isRead: false,
        createdAt: new Date()
      });
    }
  } catch (e) {}

  // Ensure central DB sync pushes immediately
  pushLocalDbToServer().catch(() => {});

  return newOrder;
}

// 5. Update Network Order Status (accept / reject / complete)
export async function updateNetworkOrderStatus(
  orderId: number, 
  tempId: string, 
  status: 'pending' | 'accepted' | 'rejected' | 'completed',
  extra?: {
    completedOrderId?: number;
    completedInvoiceNumber?: number;
    customerName?: string;
    customerPhone?: string;
    customerSubscriptionCode?: string;
  }
): Promise<void> {
  const patch: any = {
    status,
    ...(status === 'accepted' ? { acceptedAt: new Date() } : {}),
    ...(status === 'completed' ? { completedAt: new Date() } : {}),
    ...(extra?.completedOrderId !== undefined ? { completedOrderId: extra.completedOrderId } : {}),
    ...(extra?.completedInvoiceNumber !== undefined ? { completedInvoiceNumber: extra.completedInvoiceNumber } : {}),
    ...(extra?.customerName ? { customerName: extra.customerName } : {}),
    ...(extra?.customerPhone ? { customerPhone: extra.customerPhone } : {}),
    ...(extra?.customerSubscriptionCode ? { customerSubscriptionCode: extra.customerSubscriptionCode } : {}),
  };

  try {
    let existing: NetworkOrder | undefined;
    if (orderId) {
      existing = await db.networkOrders.get(orderId);
    }
    if (!existing && tempId) {
      existing = await db.networkOrders.where('tempId').equals(tempId).first();
    }
    // Never downgrade an already completed/invoiced order back to pending/accepted/rejected
    if (existing && existing.status === 'completed' && status !== 'completed') {
      return;
    }

    let updatedCount = 0;
    if (existing?.id) {
      updatedCount = await db.networkOrders.update(existing.id, patch);
    } else if (orderId) {
      updatedCount = await db.networkOrders.update(orderId, patch);
    }
    if (!updatedCount && tempId) {
      const found = await db.networkOrders.where('tempId').equals(tempId).first();
      if (found?.id) {
        await db.networkOrders.update(found.id, patch);
      }
    }

    // Automatically mark matching unread new_order notification as read once handled
    if (status === 'accepted' || status === 'completed' || status === 'rejected') {
      const unreadNotifs = await db.systemNotifications
        .filter(n => n.type === 'new_order' && !n.isRead)
        .toArray();
      for (const n of unreadNotifs) {
        if (
          (tempId && (n.metadata?.tempId === tempId || n.category === `order-${tempId}`)) ||
          (orderId && n.metadata?.orderId === orderId)
        ) {
          if (n.id) {
            await db.systemNotifications.update(n.id, { isRead: true });
          }
        }
      }
    }
  } catch (e) {}

  // Notify server
  try {
    serverFetch('/api/network/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId || tempId, tempId, status, ...extra }),
      signal: safeTimeoutSignal(3000)
    }).catch(() => {});
  } catch (e) {}

  // Broadcast
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'ORDER_STATUS_CHANGED', orderId, tempId, status, ...extra });
    } catch (e) {}
  }

  pushLocalDbToServer().catch(() => {});
}

// 6. Call Waiter from Table
export async function callWaiter(tableNumber: number, tableTitle: string, note?: string): Promise<boolean> {
  const callPayload = {
    tableNumber,
    tableTitle,
    note: note || 'درخواست حضور گارسون سر میز',
    createdAt: new Date().toISOString()
  };

  // Update table status in Dexie
  try {
    const table = await db.restaurantTables.where('number').equals(tableNumber).first();
    if (table?.id) {
      await db.restaurantTables.update(table.id, { status: 'needs_waiter' });
    }
  } catch (e) {}

  // Record system notification in Dexie for desktop/waiter/cashier
  try {
    await db.systemNotifications.add({
      type: 'waiter_call',
      title: `درخواست گارسون سر ${tableTitle}`,
      message: note || 'مشتری از سر میز دکمه فراخوانی گارسون را فشار داد.',
      category: `table-${tableNumber}`,
      targetTab: 'tables',
      metadata: { tableNumber, tableTitle, note },
      isRead: false,
      createdAt: new Date()
    });
  } catch (e) {}

  // Post to server
  try {
    serverFetch('/api/network/waiter-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callPayload),
      signal: safeTimeoutSignal(3000)
    }).catch(() => {});
  } catch (e) {}
  pushLocalDbToServer().catch(() => {});

  // Broadcast
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'WAITER_CALL', ...callPayload });
    } catch (e) {}
  }

  // Local storage event
  try {
    localStorage.setItem('arka_last_waiter_call', JSON.stringify({
      ...callPayload,
      time: Date.now()
    }));
  } catch (e) {}

  return true;
}

// 7. Subscribe to real-time network messages
export function subscribeToNetworkEvents(
  onNewOrder: (order: NetworkOrder) => void,
  onStatusChange?: (orderId: number, status: string) => void,
  onWaiterCall?: (tableNumber: number, title: string) => void
) {
  const handleMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || !data.type) return;

    if (data.type === 'NEW_ORDER' && data.order) {
      onNewOrder(data.order);
      playNewOrderChime();
    } else if (data.type === 'ORDER_STATUS_CHANGED' && onStatusChange) {
      onStatusChange(data.orderId, data.status);
    } else if (data.type === 'WAITER_CALL' && onWaiterCall) {
      onWaiterCall(data.tableNumber, data.tableTitle);
      playNewOrderChime();
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleMessage);
  }

  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'arka_last_network_order' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed.order) {
          onNewOrder(parsed.order);
          playNewOrderChime();
        }
      } catch (err) {}
    } else if (e.key === 'arka_last_waiter_call' && e.newValue && onWaiterCall) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed.tableNumber) {
          onWaiterCall(parsed.tableNumber, parsed.tableTitle);
          playNewOrderChime();
        }
      } catch (err) {}
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleMessage);
    }
    window.removeEventListener('storage', handleStorage);
  };
}
