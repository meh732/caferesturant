import { db, ChatMessage, SystemNotification, NotificationType } from './db';
import { playNewOrderChime } from './networkSync';

// BroadcastChannel for instant multi-tab communication in desktop, mobile, and tauri
const chatBroadcastChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('arka_chat_events') 
  : null;

const notifBroadcastChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('arka_notif_events') 
  : null;

// Audio synth sound for incoming chat message (friendly pop chime)
export function playChatChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch (e) {
    // Audio context may require prior user interaction
  }
}

// Audio synth sound for high-priority notification (waiter call / critical alert)
export function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Double beep
    [0, 0.18].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now + offset); // A5
      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.12);
    });
  } catch (e) {}
}

// ----------------------------------------------------------------------
// CHAT SERVICES
// ----------------------------------------------------------------------

export interface SendMessageOptions {
  channelId?: string;
  senderName: string;
  senderId?: number;
  senderRole?: any;
  content: string;
  attachments?: any[];
  voiceNote?: {
    dataUrl: string;
    durationSeconds: number;
  };
}

export async function sendChatMessage(options: SendMessageOptions): Promise<ChatMessage> {
  const channelId = options.channelId || 'general';
  const newMsg: ChatMessage = {
    channelId,
    senderName: options.senderName || 'پرسنل',
    senderId: options.senderId,
    senderRole: options.senderRole,
    content: options.content || '',
    attachments: options.attachments,
    voiceNote: options.voiceNote,
    createdAt: new Date(),
  };

  const id = await db.chatMessages.add(newMsg);
  newMsg.id = id;

  // Broadcast
  if (chatBroadcastChannel) {
    try {
      chatBroadcastChannel.postMessage({ type: 'NEW_CHAT_MESSAGE', message: newMsg });
    } catch (e) {}
  }

  // Create notification for other users/terminals
  const preview = options.content 
    ? (options.content.length > 50 ? options.content.slice(0, 50) + '...' : options.content)
    : options.voiceNote ? 'پیام صوتی (ویس)' : 'یک فایل پیوست ارسال کرد';

  await createSystemNotification({
    type: 'chat_message',
    title: `پیام جدید از ${options.senderName}`,
    message: preview,
    category: channelId,
    targetTab: 'chat',
    metadata: { messageId: id, channelId }
  });

  return newMsg;
}

// ----------------------------------------------------------------------
// NOTIFICATION SERVICES
// ----------------------------------------------------------------------

export interface CreateNotificationOptions {
  type: NotificationType;
  title: string;
  message: string;
  category?: string;
  targetTab?: string;
  metadata?: any;
}

export async function createSystemNotification(options: CreateNotificationOptions): Promise<SystemNotification> {
  const notif: SystemNotification = {
    type: options.type,
    title: options.title,
    message: options.message,
    category: options.category,
    targetTab: options.targetTab || 'notifications',
    metadata: options.metadata,
    isRead: false,
    createdAt: new Date(),
  };

  const id = await db.systemNotifications.add(notif);
  notif.id = id;

  // Play sound depending on type
  if (options.type === 'waiter_call') {
    playAlertChime();
  } else if (options.type === 'chat_message') {
    playChatChime();
  } else {
    playNewOrderChime();
  }

  // Broadcast
  if (notifBroadcastChannel) {
    try {
      notifBroadcastChannel.postMessage({ type: 'NEW_NOTIFICATION', notification: notif });
    } catch (e) {}
  }

  return notif;
}

export async function markNotificationAsRead(id: number): Promise<void> {
  await db.systemNotifications.update(id, { isRead: true });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const unread = await db.systemNotifications.where('isRead').equals(0).toArray();
  for (const n of unread) {
    if (n.id) {
      await db.systemNotifications.update(n.id, { isRead: true });
    }
  }
}

export async function deleteNotification(id: number): Promise<void> {
  await db.systemNotifications.delete(id);
}

export async function clearAllNotifications(): Promise<void> {
  await db.systemNotifications.clear();
}
