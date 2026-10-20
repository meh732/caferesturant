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

export interface BotOperationResult {
  success: boolean;
  error?: string;
  botName?: string;
  username?: string;
}

// ------------------------------------------------------------------------------
// 1. TELEGRAM BOT SENDER & TESTER
// ------------------------------------------------------------------------------
export async function testTelegramBot(token: string): Promise<BotOperationResult> {
  const cleanToken = token.trim();
  if (!cleanToken) return { success: false, error: 'توکن ربات تلگرام خالی است.' };

  // 1. Try server proxy first (avoids browser CORS & uses server IP)
  try {
    const res = await fetch('/api/bot/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cleanToken })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        return {
          success: true,
          botName: data.bot?.first_name || data.bot?.username || 'Telegram Bot',
          username: data.bot?.username
        };
      } else {
        return { success: false, error: data.error || 'توکن نامعتبر است.' };
      }
    }
  } catch (err) {}

  // 2. Direct fallback (e.g. desktop Tauri with VPN)
  try {
    const url = `https://api.telegram.org/bot${cleanToken}/getMe`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.ok) {
      return {
        success: true,
        botName: data.result?.first_name || data.result?.username || 'Telegram Bot',
        username: data.result?.username
      };
    }
    return { success: false, error: data.description || 'احراز هویت تلگرام ناموفق بود.' };
  } catch (err: any) {
    return { success: false, error: 'عدم ارتباط با تلگرام. فیلترینگ یا قطعی اینترنت سرور.' };
  }
}

export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<BotOperationResult> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) return { success: false, error: 'توکن یا چت‌آیدی خالی است.' };

  // 1. Try server-side proxy first (bypasses browser CORS & works on VPS)
  try {
    const proxyRes = await fetch('/api/bot/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cleanToken, chatId: cleanChatId, text })
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.ok) return { success: true };
      return { success: false, error: data.error || 'خطا در ارسال پیام تلگرام' };
    }
  } catch (proxyErr) {}

  // 2. Direct fallback
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
    if (data.ok === true) return { success: true };
    return { success: false, error: data.description || 'پاسخ ناموفق از تلگرام' };
  } catch (err: any) {
    return { success: false, error: err.message || 'خطای شبکه در ارتباط با تلگرام' };
  }
}

export async function sendTelegramDocument(
  token: string,
  chatId: string,
  fileContent: string,
  fileName: string,
  caption: string
): Promise<BotOperationResult> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) return { success: false, error: 'توکن یا چت‌آیدی خالی است.' };

  // 1. Try server proxy first
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
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.ok) return { success: true };
      return { success: false, error: data.error || 'خطای سرور در آپلود فایل به تلگرام' };
    }
  } catch (proxyErr) {}

  // 2. Direct fallback
  try {
    const blob = new Blob([fileContent], { type: 'application/json' });
    const formData = new FormData();
    formData.append('chat_id', cleanChatId);
    formData.append('document', blob, fileName);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');

    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.ok === true) return { success: true };
    return { success: false, error: data.description || 'عدم تایید آپلود توسط تلگرام' };
  } catch (err: any) {
    return { success: false, error: err.message || 'خطای شبکه ارسال فایل به تلگرام' };
  }
}

// ------------------------------------------------------------------------------
// 2. BALE MESSENGER BOT SENDER & TESTER (پیام‌رسان بله)
// ------------------------------------------------------------------------------
export async function testBaleBot(token: string): Promise<BotOperationResult> {
  const cleanToken = token.trim();
  if (!cleanToken) return { success: false, error: 'توکن ربات بله خالی است.' };

  // 1. Server proxy first (Bale does NOT allow browser CORS)
  try {
    const res = await fetch('/api/bot/bale/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cleanToken })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        return {
          success: true,
          botName: data.bot?.first_name || data.bot?.username || 'ربات بله',
          username: data.bot?.username
        };
      } else {
        return { success: false, error: data.error || 'توکن نامعتبر است یا در بله یافت نشد.' };
      }
    }
  } catch (err) {}

  // 2. Direct fallback (for non-browser environments like Tauri native)
  try {
    const url = `https://tapi.bale.ai/bot${cleanToken}/getMe`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.ok) {
      return {
        success: true,
        botName: data.result?.first_name || data.result?.username || 'ربات بله',
        username: data.result?.username
      };
    }
    return { success: false, error: data.description || 'احراز هویت بله ناموفق بود.' };
  } catch (err: any) {
    return { success: false, error: 'خطای ارتباط با سرورهای پیام‌رسان بله.' };
  }
}

export async function sendBaleMessage(token: string, chatId: string, text: string): Promise<BotOperationResult> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) return { success: false, error: 'توکن یا چت‌آیدی خالی است.' };

  // 1. Try server proxy first (Mandatory for browsers due to Bale CORS restrictions)
  try {
    const proxyRes = await fetch('/api/bot/bale/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cleanToken, chatId: cleanChatId, text })
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.ok) return { success: true };
      return { success: false, error: data.error || 'ارسال به بله ناموفق بود' };
    }
  } catch (proxyErr) {}

  // 2. Direct fallback (Tauri native)
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
    if (data.ok === true) return { success: true };
    return { success: false, error: data.description || 'پاسخ ناموفق از پیام‌رسان بله' };
  } catch (err: any) {
    return { success: false, error: err.message || 'خطای ارتباط مستقیم با بله' };
  }
}

export async function sendBaleDocument(
  token: string,
  chatId: string,
  fileContent: string,
  fileName: string,
  caption: string
): Promise<BotOperationResult> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) return { success: false, error: 'توکن یا چت‌آیدی خالی است.' };

  // 1. Try server proxy first
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
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.ok) return { success: true };
      return { success: false, error: data.error || 'خطای سرور در آپلود فایل به بله' };
    }
  } catch (proxyErr) {}

  // 2. Direct fallback
  try {
    const blob = new Blob([fileContent], { type: 'application/json' });
    const formData = new FormData();
    formData.append('chat_id', cleanChatId);
    formData.append('document', blob, fileName);
    formData.append('caption', caption);

    const res = await fetch(`https://tapi.bale.ai/bot${cleanToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.ok === true) return { success: true };
    return { success: false, error: data.description || 'عدم پذیرش فایل توسط بله' };
  } catch (err: any) {
    return { success: false, error: err.message || 'خطای شبکه ارسال فایل به بله' };
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
        const res = await sendTelegramDocument(tgToken, chatId, backupJson, fileName, caption);
        if (res.success) {
          telegramSent++;
        } else {
          errors.push(`تلگرام (${chatId}): ${res.error || 'ارسال ناموفق'}`);
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
        const res = await sendBaleDocument(baleToken, chatId, backupJson, fileName, plainCaption);
        if (res.success) {
          baleSent++;
        } else {
          errors.push(`بله (${chatId}): ${res.error || 'ارسال ناموفق'}`);
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
