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

// 1. Get Network Info (Local IPs, Port)
export async function getNetworkInfo(): Promise<NetworkInfo> {
  try {
    const res = await fetch('/api/network/info', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Server endpoint not reached (offline or static build)
  }

  // Fallback using current window location
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const port = window.location.port ? parseInt(window.location.port) : 3000;

  return {
    status: 'fallback',
    localIps: isLocalhost ? ['127.0.0.1'] : [hostname],
    port,
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
