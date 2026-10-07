import { db, AppSettings } from './db';
import { exportDB } from './utils';
import { format as formatJalali } from 'date-fns-jalali';

export interface BotDispatchResult {
  success: boolean;
  telegramSent: number;
  baleSent: number;
  errors: string[];
  timestamp: string;
}

// Helper to parse comma/space/newline separated chat IDs
export function parseChatIds(rawIds?: string): string[] {
  if (!rawIds) return [];
  return rawIds
    .split(/[\s,;\n]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

// ------------------------------------------------------------------------------
// 1. TELEGRAM BOT SENDER
// ------------------------------------------------------------------------------
export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<boolean> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) return false;

  const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text,
        parse_mode: 'HTML'
      })
    });
    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    // If direct fails (CORS or network), attempt backend proxy if available
    try {
      const proxyRes = await fetch('/api/bot/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken, chatId: cleanChatId, text })
      });
      return proxyRes.ok;
    } catch (proxyErr) {
      console.error('Telegram sendMessage error', err);
      return false;
    }
  }
}

export async function sendTelegramDocument(
  token: string,
  chatId: string,
  fileContent: string,
  fileName: string,
  caption: string
): Promise<boolean> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) return false;

  const blob = new Blob([fileContent], { type: 'application/json' });
  const formData = new FormData();
  formData.append('chat_id', cleanChatId);
  formData.append('document', blob, fileName);
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  try {
    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    // Attempt backend proxy fallback
    try {
      const proxyRes = await fetch('/api/bot/telegram/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: cleanToken,
          chatId: cleanChatId,
          fileContent,
          fileName,
          caption
        })
      });
      return proxyRes.ok;
    } catch (proxyErr) {
      console.error('Telegram sendDocument error', err);
      return false;
    }
  }
}

// ------------------------------------------------------------------------------
// 2. BALE MESSENGER BOT SENDER (پیام‌رسان بله)
// ------------------------------------------------------------------------------
export async function sendBaleMessage(token: string, chatId: string, text: string): Promise<boolean> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) return false;

  const url = `https://tapi.bale.ai/bot${cleanToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text
      })
    });
    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    try {
      const proxyRes = await fetch('/api/bot/bale/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken, chatId: cleanChatId, text })
      });
      return proxyRes.ok;
    } catch (proxyErr) {
      console.error('Bale sendMessage error', err);
      return false;
    }
  }
}

export async function sendBaleDocument(
  token: string,
  chatId: string,
  fileContent: string,
  fileName: string,
  caption: string
): Promise<boolean> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) return false;

  const blob = new Blob([fileContent], { type: 'application/json' });
  const formData = new FormData();
  formData.append('chat_id', cleanChatId);
  formData.append('document', blob, fileName);
  formData.append('caption', caption);

  try {
    const res = await fetch(`https://tapi.bale.ai/bot${cleanToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    try {
      const proxyRes = await fetch('/api/bot/bale/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: cleanToken,
          chatId: cleanChatId,
          fileContent,
          fileName,
          caption
        })
      });
      return proxyRes.ok;
    } catch (proxyErr) {
      console.error('Bale sendDocument error', err);
      return false;
    }
  }
}

// ------------------------------------------------------------------------------
// 3. FULL BACKUP DISPATCHER (To Telegram & Bale)
// ------------------------------------------------------------------------------
export async function dispatchBackupToBots(
  settings: AppSettings,
  isManual: boolean = false
): Promise<BotDispatchResult> {
  const errors: string[] = [];
  let telegramSent = 0;
  let baleSent = 0;

  const now = new Date();
  const jalaliDateStr = formatJalali(now, 'yyyy/MM/dd - HH:mm');
  const fileDateStr = formatJalali(now, 'yyyyMMdd_HHmm');
  const fileName = `Arka_Backup_${fileDateStr}.json`;

  // 1. Gather database backup JSON & stats
  let backupJson = '';
  let ordersCount = 0;
  let menuCount = 0;
  let warehouseCount = 0;

  try {
    backupJson = await exportDB();
    ordersCount = await db.orders.count();
    menuCount = await db.menuItems.count();
    warehouseCount = await db.warehouses.count();
  } catch (e: any) {
    errors.push(`خطا در ایجاد فایل پشتیبان: ${e.message || e}`);
    return {
      success: false,
      telegramSent: 0,
      baleSent: 0,
      errors,
      timestamp: jalaliDateStr
    };
  }

  const restaurantName = settings.restaurantName || 'سامانه آرکا';
  const modeText = isManual ? '⚡️ پشتیبان‌گیری دستی و آنی' : '⏱ پشتیبان‌گیری خودکار و دوره‌ای';

  const caption = `💾 <b>فایل پشتیبان پایگاه داده آرکا (Arka POS)</b>\n\n` +
    `🏢 مجموعه: <b>${restaurantName}</b>\n` +
    `📅 زمان تهیه: <code>${jalaliDateStr}</code>\n` +
    `🔖 نوع: ${modeText}\n` +
    `📊 آمار: <b>${ordersCount}</b> فاکتور | <b>${menuCount}</b> محصول | <b>${warehouseCount}</b> انبار\n\n` +
    `🔒 <i>این فایل حاوی کلیه اطلاعات مالی، انبارداری و منو می‌باشد و قابل بازیابی در سیستم است.</i>`;

  const plainCaption = `💾 فایل پشتیبان پایگاه داده آرکا\n` +
    `مجموعه: ${restaurantName}\n` +
    `زمان: ${jalaliDateStr}\n` +
    `نوع: ${modeText}\n` +
    `آمار: ${ordersCount} فاکتور | ${menuCount} محصول\n` +
    `جهت بازیابی در بخش تنظیمات > بازیابی از فایل استفاده کنید.`;

  // 2. Send to Telegram
  const tgToken = settings.telegramBotToken?.trim();
  const tgChatIds = parseChatIds(settings.telegramAdminChatIds);
  const tgEnabled = settings.telegramBackupEnabled ?? (tgToken && tgChatIds.length > 0);

  if (tgEnabled && tgToken && tgChatIds.length > 0) {
    for (const chatId of tgChatIds) {
      try {
        const ok = await sendTelegramDocument(tgToken, chatId, backupJson, fileName, caption);
        if (ok) {
          telegramSent++;
        } else {
          errors.push(`ارسال تلگرام به چت‌آیدی ${chatId} ناموفق بود.`);
        }
      } catch (err: any) {
        errors.push(`خطا در ارسال به تلگرام (${chatId}): ${err.message || err}`);
      }
    }
  }

  // 3. Send to Bale
  const baleToken = settings.baleBotToken?.trim();
  const baleChatIds = parseChatIds(settings.baleAdminChatIds);
  const baleEnabled = settings.baleBackupEnabled ?? (baleToken && baleChatIds.length > 0);

  if (baleEnabled && baleToken && baleChatIds.length > 0) {
    for (const chatId of baleChatIds) {
      try {
        const ok = await sendBaleDocument(baleToken, chatId, backupJson, fileName, plainCaption);
        if (ok) {
          baleSent++;
        } else {
          errors.push(`ارسال بله به چت‌آیدی ${chatId} ناموفق بود.`);
        }
      } catch (err: any) {
        errors.push(`خطا در ارسال به بله (${chatId}): ${err.message || err}`);
      }
    }
  }

  const success = (telegramSent > 0 || baleSent > 0) || (tgChatIds.length === 0 && baleChatIds.length === 0);

  // 4. Update lastAutoBackupTime in settings
  if (success && settings.id) {
    try {
      await db.settings.update(settings.id, {
        lastAutoBackupTime: new Date().toISOString()
      });
    } catch (e) {}
  }

  return {
    success,
    telegramSent,
    baleSent,
    errors,
    timestamp: jalaliDateStr
  };
}
