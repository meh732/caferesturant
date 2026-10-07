import { db, NetworkOrder, Category, MenuItem } from './db';

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

// Play pleasant web audio chime on new orders / waiter call
export function playNewOrderChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const now = ctx.currentTime;
    
    // First tone (E5 ~ 659Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second tone (A5 ~ 880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.15);
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  } catch (err) {
    // Ignore audio permission or autoplay issues
  }
}

export async function initLanServer(port: number = 3000): Promise<boolean> {
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke('start_lan_server', { port });
      console.log('[LAN SERVER]', res);
      return true;
    } catch (e) {
      console.warn('[LAN SERVER] Failed to start native LAN server:', e);
      return false;
    }
  }
  return false;
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
    (typeof window !== 'undefined' && window.location.protocol.startsWith('tauri'))
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

// 1. Get Network Info (Local IPs, Port) with Setup Config + Tauri + WebRTC + Backend fallback
export async function getNetworkInfo(overridePort?: number): Promise<NetworkInfo> {
  const targetPort = overridePort || 3000;

  // 1. First check if static network config was generated during setup (arka-network-config.json)
  try {
    const cfgRes = await fetch('/arka-network-config.json', { signal: AbortSignal.timeout(1000) });
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (cfg && cfg.serverIp && !cfg.serverIp.startsWith('127.')) {
        return {
          status: 'setup_file',
          localIps: [cfg.serverIp],
          port: overridePort || cfg.serverPort || targetPort,
          host: `${cfg.serverIp}:${overridePort || cfg.serverPort || targetPort}`,
          timestamp: Date.now()
        };
      }
    }
  } catch (e) {}

  // 2. Check if running inside Tauri Desktop App
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const tauriIps: string[] = await invoke('get_system_network_info');
      const validTauri = (tauriIps || []).filter(ip => !ip.startsWith('127.') && ip !== '0.0.0.0');
      if (validTauri.length > 0) {
        return {
          status: 'tauri_native',
          localIps: validTauri,
          port: targetPort,
          host: window.location.host,
          timestamp: Date.now()
        };
      }
    } catch (e) {
      // Ignore and proceed to web methods
    }
  }

  // 2. Try fetching from direct relative API
  try {
    const res = await fetch('/api/network/info', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.localIps && data.localIps.length > 0 && !data.localIps[0].startsWith('127.')) {
        return {
          ...data,
          port: overridePort || data.port || 3000
        };
      }
    }
  } catch (e) {}

  // 3. If in Tauri or localhost, try fetching from localhost server
  if (typeof window !== 'undefined' && isLocalhostOrTauri()) {
    try {
      const res = await fetch(`http://localhost:${targetPort}/api/network/info`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.localIps && data.localIps.length > 0) {
          return {
            ...data,
            port: targetPort
          };
        }
      }
    } catch (e) {}
  }

  // 4. Discover local private IP via WebRTC
  try {
    const webrtcIps = await detectLocalIpsWebRTC();
    if (webrtcIps && webrtcIps.length > 0) {
      return {
        status: 'webrtc_discovered',
        localIps: webrtcIps,
        port: targetPort,
        host: window.location.host,
        timestamp: Date.now()
      };
    }
  } catch (e) {}

  // 5. Fallback using current window location
  const hostname = window.location.hostname;
  const isLocal = isLocalhostOrTauri(hostname);
  const detectedPort = window.location.port ? parseInt(window.location.port) : targetPort;

  return {
    status: 'fallback',
    localIps: isLocal ? ['192.168.1.100'] : [hostname],
    port: overridePort || detectedPort || 3000,
    host: window.location.host,
    timestamp: Date.now()
  };
}

// 2. Publish current menu to the network server
export async function syncMenuToNetwork(categories: Category[], menuItems: MenuItem[]): Promise<boolean> {
  try {
    const res = await fetch('/api/network/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories, menuItems }),
      signal: AbortSignal.timeout(4000)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// 3. Fetch menu from network server (for tablet/customer clients without local Dexie)
export async function fetchMenuFromNetwork(): Promise<{ categories: Category[]; menuItems: MenuItem[] } | null> {
  // First try local Dexie DB
  try {
    const localCategories = await db.categories.toArray();
    const localMenuItems = await db.menuItems.toArray();
    if (localCategories.length > 0 && localMenuItems.length > 0) {
      return { categories: localCategories, menuItems: localMenuItems };
    }
  } catch (e) {
    // Dexie might be empty on tablet device
  }

  // Then try network API
  try {
    const res = await fetch('/api/network/menu', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.categories?.length) {
        return data;
      }
    }
  } catch (e) {
    // network API failed
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

  // Save to local Dexie database if available
  try {
    const localId = await db.networkOrders.add(newOrder);
    newOrder.id = localId;
  } catch (e) {
    // Dexie write failed or in client mode
    newOrder.id = Date.now();
  }

  // Push to server API
  try {
    fetch('/api/network/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
      signal: AbortSignal.timeout(4000)
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

  return newOrder;
}

// 5. Update Network Order Status (accept / reject / complete)
export async function updateNetworkOrderStatus(
  orderId: number, 
  tempId: string, 
  status: 'pending' | 'accepted' | 'rejected' | 'completed'
): Promise<void> {
  try {
    if (orderId) {
      await db.networkOrders.update(orderId, { status });
    } else {
      const found = await db.networkOrders.where('tempId').equals(tempId).first();
      if (found?.id) {
        await db.networkOrders.update(found.id, { status });
      }
    }
  } catch (e) {}

  // Notify server
  try {
    fetch('/api/network/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId || tempId, status }),
      signal: AbortSignal.timeout(3000)
    }).catch(() => {});
  } catch (e) {}

  // Broadcast
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'ORDER_STATUS_CHANGED', orderId, tempId, status });
    } catch (e) {}
  }
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

  // Post to server
  try {
    fetch('/api/network/waiter-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callPayload),
      signal: AbortSignal.timeout(3000)
    }).catch(() => {});
  } catch (e) {}

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
