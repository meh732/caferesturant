import React, { useState, useEffect, useRef } from 'react';
import { db, AppSettings, resetDatabaseToRawCleanState, ensureDefaultInventoryData, ensureDefaultBankingData, ensureDefaultChartOfAccounts, convertSystemCurrencyUnit } from '../../lib/db';
import { exportDB, importDB, getCurrencyUnit } from '../../lib/utils';
import { 
  Save, Download, Upload, Network, Wifi, Globe, HardDrive, Database, 
  Copy, Check, Server, Send, Bot, MessageSquare, Clock, RefreshCw, 
  CheckCircle2, AlertCircle, ShieldAlert, Sparkles, Smartphone, Printer, Building2, Sliders, Coins,
  Key, ShieldCheck, Lock, Unlock, Cpu, Laptop, ExternalLink
} from 'lucide-react';
import ReceiptDesignerTab from './ReceiptDesignerTab';
import { AppleSwitch } from '../Common/AppleSwitch';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  sendTelegramMessage, 
  sendBaleMessage, 
  testTelegramBot,
  testBaleBot,
  dispatchBackupToBots, 
  parseChatIds 
} from '../../lib/botBackupService';
import { getNetworkInfo, initLanServer, isLocalhostOrTauri, isTauriEnvironment } from '../../lib/networkSync';
import { initialTwoWaySync, pushLocalDbToServer, updateKnownServerVersion, getAppExecutionMode, getServerBaseUrl } from '../../lib/serverSync';
import { TauriModeModal } from '../Common/TauriModeModal';
import { simulateTestSnappfoodOrder } from '../../lib/snappfoodService';
import { format as formatJalali } from 'date-fns-jalali';
import { APP_VERSION, APP_BUILD_DATE, APP_DEVELOPER } from '../../version';

export default function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  
  const [activeTab, setActiveTab] = useState<'general' | 'receipt' | 'network' | 'bots' | 'snappfood' | 'backup' | 'license' | 'all'>('general');
  const [formData, setFormData] = useState<Partial<AppSettings>>({});
  const [serverLicense, setServerLicense] = useState<{ isActivated: boolean; machineId: string; activatedAt: string | null } | null>(null);
  const [licenseInput, setLicenseInput] = useState('');
  const [copiedServerMachineId, setCopiedServerMachineId] = useState(false);
  const [isActivatingLicense, setIsActivatingLicense] = useState(false);
  const [isTauriModeModalOpen, setIsTauriModeModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConvertingCurrency, setIsConvertingCurrency] = useState(false);
  const [isSyncingServer, setIsSyncingServer] = useState(false);
  const [serverSyncSuccess, setServerSyncSuccess] = useState<string | null>(null);
  const [copiedDbPath, setCopiedDbPath] = useState(false);
  const [copiedLanUrl, setCopiedLanUrl] = useState(false);
  const [copiedSnappfoodWebhook, setCopiedSnappfoodWebhook] = useState(false);
  const [detectedLanIp, setDetectedLanIp] = useState<string>('');
  const [isTestingTg, setIsTestingTg] = useState(false);
  const [isTestingBale, setIsTestingBale] = useState(false);
  const [isTestingSnappfood, setIsTestingSnappfood] = useState(false);
  const [snappfoodTestResult, setSnappfoodTestResult] = useState<string | null>(null);
  const [isDispatchingBackup, setIsDispatchingBackup] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [isResettingDb, setIsResettingDb] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLoadedInitialSettings = useRef<boolean>(false);

  const [localDbIndependent, setLocalDbIndependent] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('arka_local_db_independent') === 'true';
  });

  const tauriDbPath = '%LOCALAPPDATA%\\com.arka.restaurantpos\\EBWebView\\Default\\IndexedDB';

  const handleCopyDbPath = () => {
    navigator.clipboard.writeText(tauriDbPath);
    setCopiedDbPath(true);
    setTimeout(() => setCopiedDbPath(false), 2500);
  };

  useEffect(() => {
    if (settings) {
      if (!hasLoadedInitialSettings.current) {
        hasLoadedInitialSettings.current = true;
        setFormData(settings);
      } else if (!isSaving && !isConvertingCurrency) {
        // Merge external updates without wiping active user typing
        setFormData(prev => ({
          ...settings,
          ...prev,
          currencyUnit: settings.currencyUnit || prev.currencyUnit
        }));
      }
    }
  }, [settings, isSaving, isConvertingCurrency]);

  const fetchLicenseStatus = () => {
    fetch('/api/license/status')
      .then(res => res.json())
      .then(data => {
        if (data && data.machineId) setServerLicense(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    getNetworkInfo().then(info => {
      const valid = (info.localIps || []).filter(ip => !ip.startsWith('127.') && ip !== '0.0.0.0');
      if (valid.length > 0) {
        setDetectedLanIp(valid[0]);
      }
    }).catch(() => {});

    fetchLicenseStatus();
  }, []);

  const handleCopyServerMachineId = () => {
    if (serverLicense?.machineId) {
      navigator.clipboard.writeText(serverLicense.machineId);
      setCopiedServerMachineId(true);
      setTimeout(() => setCopiedServerMachineId(false), 2500);
    }
  };

  const handleActivateServerLicense = async () => {
    const cleanKey = licenseInput.trim().toUpperCase();
    if (!cleanKey) {
      showBanner('error', 'لطفاً کد فعال‌سازی را وارد فرمایید.');
      return;
    }
    setIsActivatingLicense(true);
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: cleanKey })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setServerLicense(prev => prev ? { ...prev, isActivated: true, activatedAt: new Date().toISOString() } : null);
        showBanner('success', '✅ لایسنس سرور با موفقیت فعال و به این سخت‌افزار قفل شد.');
        setLicenseInput('');
      } else {
        showBanner('error', data.message || 'کد فعال‌سازی نامعتبر است.');
      }
    } catch (e: any) {
      showBanner('error', `خطا در ارتباط با سرور: ${e.message || e}`);
    } finally {
      setIsActivatingLicense(false);
    }
  };


  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setStatusBanner({ type, message });
    setTimeout(() => {
      setStatusBanner(prev => (prev?.message === message ? null : prev));
    }, 5000);
  };

  const handleSwitchCurrencyUnit = async (targetUnit: 'toman' | 'rial') => {
    const activeUnit = formData.currencyUnit || settings?.currencyUnit || getCurrencyUnit();
    if (activeUnit === targetUnit || isConvertingCurrency) return;

    // Immediately update UI state so the selected button highlights right away
    setFormData(prev => ({ ...prev, currencyUnit: targetUnit }));
    setIsConvertingCurrency(true);

    try {
      const result = await convertSystemCurrencyUnit(targetUnit);

      // Push converted database and settings to central server
      await pushLocalDbToServer().catch(() => {});
      const updatedSettings = await db.settings.toCollection().first();
      if (updatedSettings) {
        const srvRes = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedSettings)
        }).catch(() => null);
        if (srvRes && srvRes.ok) {
          const srvJson = await srvRes.json().catch(() => null);
          if (srvJson?.version) updateKnownServerVersion(srvJson.version);
        }
      }

      if (result.changed) {
        showBanner(
          'success',
          targetUnit === 'rial'
            ? 'واحد پول کل سیستم به «ریال» تغییر یافت و به کلیه مبالغ منو، حساب‌ها، کیف پول مشتریان و فاکتورهای ثبت‌شده یک صفر (×۱۰) اضافه شد.'
            : 'واحد پول کل سیستم به «تومان» تغییر یافت و از کلیه مبالغ منو، حساب‌ها، کیف پول مشتریان و فاکتورهای ثبت‌شده یک صفر (÷۱۰) کسر شد.'
        );
      } else {
        showBanner(
          'success',
          targetUnit === 'rial' ? 'واحد پول سیستم روی «ریال» قرار گرفت.' : 'واحد پول سیستم روی «تومان» قرار گرفت.'
        );
      }
    } catch (err: any) {
      console.error('Currency conversion error:', err);
      showBanner('error', `خطا در تغییر واحد پول: ${err.message || err}`);
    } finally {
      setIsConvertingCurrency(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const currentStoredUnit = settings?.currencyUnit || getCurrencyUnit();
      const desiredUnit = formData.currencyUnit || currentStoredUnit;
      if (desiredUnit !== currentStoredUnit) {
        await convertSystemCurrencyUnit(desiredUnit);
      }

      const targetPort = Number(formData.localServerPort) || 3000;
      const cleanData: AppSettings = {
        ...(settings || {}),
        ...formData,
        id: 1,
        currencyUnit: desiredUnit,
        localServerPort: targetPort
      } as AppSettings;

      // 1. Save to local Dexie as singleton id = 1
      await db.settings.put(cleanData);
      setFormData(cleanData);

      // 2. Push local DB snapshot to central server first so server has all converted tables
      try {
        await pushLocalDbToServer();
      } catch (syncErr) {
        console.warn('pushLocalDbToServer error:', syncErr);
      }

      // 3. Persist settings directly to central server backend
      try {
        const srvRes = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanData)
        });
        if (srvRes.ok) {
          const srvJson = await srvRes.json().catch(() => null);
          if (srvJson?.version) updateKnownServerVersion(srvJson.version);
        }
      } catch (srvErr) {
        console.warn('Backend /api/settings sync error:', srvErr);
      }

      // 4. Update embedded LAN server if running on Tauri desktop
      try {
        await initLanServer(targetPort);
        const netInfo = await getNetworkInfo(targetPort);
        const valid = (netInfo.localIps || []).filter(
          ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.startsWith('169.254.') && !ip.startsWith('192.168.56.')
        );
        if (valid.length > 0) {
          setDetectedLanIp(valid[0]);
          localStorage.setItem('arka_lan_ip', valid[0]);
        }
      } catch (netErr) {}

      showBanner('success', 'تنظیمات با موفقیت ذخیره شد و در سرور مرکزی ثبت گردید.');
    } catch (err: any) {
      console.error('Error saving settings:', err);
      showBanner('error', `خطا در ذخیره تنظیمات: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNetworkSettings = async () => {
    setIsSaving(true);
    try {
      const targetPort = Number(formData.localServerPort) || 3000;
      const cleanData: AppSettings = {
        ...(settings || {}),
        ...formData,
        id: 1,
        localServerPort: targetPort
      } as AppSettings;

      // 1. Save to local Dexie database
      await db.settings.put(cleanData);
      setFormData(cleanData);

      // 2. Send to central backend server
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanData)
      }).catch(() => null);

      showBanner('success', `تنظیمات شبکه و پورت سرور (${targetPort}) با موفقیت ذخیره شد.`);
    } catch (err: any) {
      console.error('Error saving network settings:', err);
      showBanner('error', `خطا در ذخیره تنظیمات شبکه: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncingServer(true);
    setServerSyncSuccess(null);
    try {
      const ok = await initialTwoWaySync();
      if (ok) {
        setServerSyncSuccess('دیتابیس با موفقیت به صورت دوطرفه با سرور مرکزی همگام‌سازی شد.');
      } else {
        setServerSyncSuccess('ارتباط با سرور مرکزی بررسی شد.');
      }
    } catch (e) {
      setServerSyncSuccess('خطا در همگام‌سازی با سرور.');
    } finally {
      setIsSyncingServer(false);
      setTimeout(() => setServerSyncSuccess(null), 4000);
    }
  };

  const handleTestTelegram = async () => {
    const token = formData.telegramBotToken?.trim();
    const chatIds = parseChatIds(formData.telegramAdminChatIds);
    if (!token) {
      alert('لطفاً ابتدا توکن ربات تلگرام را وارد کنید.');
      return;
    }

    setIsTestingTg(true);
    try {
      // 1. Check bot token validity first
      const testRes = await testTelegramBot(token);
      if (!testRes.success) {
        alert(`❌ خطای احراز هویت تلگرام:\n${testRes.error || 'توکن نامعتبر است'}\n\nنکته: در صورتی که سرور در ایران قرار دارد، دسترسی به تلگرام ممکن است مسدود باشد.`);
        setIsTestingTg(false);
        return;
      }

      if (chatIds.length === 0) {
        alert(`✅ ربات تلگرام تایید شد: "${testRes.botName}" (@${testRes.username || ''})\n\n⚠️ برای تست ارسال پیام، حداقل یک چت‌آیدی (Chat ID) ادمین در کادر مربوطه وارد نمایید.`);
        setIsTestingTg(false);
        return;
      }

      let successCount = 0;
      const errors: string[] = [];
      const testMsg = `🔔 <b>پیام تست سامانه صندوقداری آرکا</b>\n\n` +
        `🏢 مجموعه: <b>${formData.restaurantName || 'سامانه آرکا'}</b>\n` +
        `✅ ارتباط با ربات تلگرام با موفقیت برقرار شد.\n` +
        `🤖 نام ربات: <b>${testRes.botName}</b>\n` +
        `📅 زمان: <code>${formatJalali(new Date(), 'yyyy/MM/dd - HH:mm:ss')}</code>`;

      for (const id of chatIds) {
        const res = await sendTelegramMessage(token, id, testMsg);
        if (res.success) {
          successCount++;
        } else {
          errors.push(`چت‌آیدی ${id}: ${res.error || 'ارسال ناموفق'}`);
        }
      }

      if (successCount > 0) {
        alert(`✅ پیام تست با موفقیت از طرف ربات "${testRes.botName}" به ${successCount} چت‌آیدی تلگرام ارسال شد.`);
      } else {
        alert(`❌ ارسال پیام تست به چت‌آیدی‌ها ناموفق بود:\n${errors.join('\n')}\n\nنکته: کاربر یا ادمین باید حتماً یک‌بار دکمه /start را در ربات زده باشد.`);
      }
    } catch (e: any) {
      alert(`❌ خطا در ارتباط: ${e.message || e}`);
    } finally {
      setIsTestingTg(false);
    }
  };

  const handleTestBale = async () => {
    const token = formData.baleBotToken?.trim();
    const chatIds = parseChatIds(formData.baleAdminChatIds);
    if (!token) {
      alert('لطفاً ابتدا توکن ربات پیام‌رسان بله را وارد کنید.');
      return;
    }

    setIsTestingBale(true);
    try {
      // 1. Check bot token validity first
      const testRes = await testBaleBot(token);
      if (!testRes.success) {
        alert(`❌ خطای احراز هویت ربات بله:\n${testRes.error || 'توکن در سامانه بله یافت نشد.'}\n\nلطفاً توکن را مجدداً از BotFather@ در پیام‌رسان بله کپی و جای‌گذاری کنید (دقت کنید فاصله‌ای قبل یا بعد از توکن نباشد).`);
        setIsTestingBale(false);
        return;
      }

      if (chatIds.length === 0) {
        alert(`✅ ربات بله تایید شد: "${testRes.botName}" (@${testRes.username || ''})\n\n⚠️ برای تست ارسال پیام، حداقل یک چت‌آیدی عددی در کادر چت‌آیدی‌های بله وارد کنید.`);
        setIsTestingBale(false);
        return;
      }

      let successCount = 0;
      const errors: string[] = [];
      const testMsg = `🔔 پیام تست سامانه صندوقداری آرکا\n\n` +
        `مجموعه: ${formData.restaurantName || 'سامانه آرکا'}\n` +
        `✅ ارتباط با ربات پیام‌رسان بله با موفقیت برقرار شد.\n` +
        `نام ربات: ${testRes.botName}\n` +
        `زمان: ${formatJalali(new Date(), 'yyyy/MM/dd - HH:mm:ss')}`;

      for (const id of chatIds) {
        const res = await sendBaleMessage(token, id, testMsg);
        if (res.success) {
          successCount++;
        } else {
          errors.push(`چت‌آیدی ${id}: ${res.error || 'ارسال ناموفق'}`);
        }
      }

      if (successCount > 0) {
        alert(`✅ پیام تست با موفقیت از طرف ربات "${testRes.botName}" به ${successCount} چت‌آیدی در بله ارسال شد.`);
      } else {
        alert(`❌ ارسال پیام تست به چت‌آیدی‌ها ناموفق بود:\n${errors.join('\n')}\n\nنکته: کاربر یا ادمین حتماً باید یک‌بار در ربات بله دکمه «شروع» یا Start را زده باشد تا ربات اجازه ارسال به او را داشته باشد.`);
      }
    } catch (e: any) {
      alert(`❌ خطا در ارتباط: ${e.message || e}`);
    } finally {
      setIsTestingBale(false);
    }
  };

  const handleSendBackupNow = async () => {
    setIsDispatchingBackup(true);
    setDispatchStatus('در حال تهیه فایل پشتیبان و ارسال به ربات‌ها...');

    // 1. Save latest settings first
    try {
      const existing = await db.settings.toCollection().first();
      const updated = { ...(existing || {}), ...formData } as AppSettings;
      if (existing?.id) {
        await db.settings.update(existing.id, updated);
      } else {
        await db.settings.add(updated);
      }
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      }).catch(() => {});
    } catch (e) {}

    const currentSettings = (await db.settings.toCollection().first()) || formData as AppSettings;
    const res = await dispatchBackupToBots(currentSettings, true);

    setIsDispatchingBackup(false);
    if (res.success) {
      const msg = `✅ فایل پشتیبان با موفقیت ارسال شد!\n` +
        `• تلگرام: ${res.telegramSent} مقصد\n` +
        `• بله: ${res.baleSent} مقصد\n` +
        `• زمان: ${res.timestamp}`;
      setDispatchStatus(`آخرین ارسال: ${res.timestamp} (موفق)`);
      alert(msg);
    } else {
      setDispatchStatus('خطا در ارسال به ربات‌ها');
      alert(`❌ خطا در ارسال بکاپ:\n${res.errors.join('\n') || 'توکن‌ها یا چت‌آیدی‌ها تنظیم نشده‌اند.'}`);
    }
  };

  const handleExport = async () => {
    const json = await exportDB();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_pos_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (window.confirm('آیا مطمئن هستید؟ اطلاعات فعلی پاک شده و با فایل بکاپ جایگزین خواهند شد.')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const jsonString = event.target?.result as string;
          await importDB(jsonString);
          alert('بازیابی اطلاعات با موفقیت انجام شد.');
        } catch (err) {
          alert('خطا در بازیابی اطلاعات.');
        }
      };
      reader.readAsText(file);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const activeCurrency = formData.currencyUnit || settings?.currencyUnit || getCurrencyUnit();

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-5">
        
        {/* Top Enterprise Header Bar with Quick Currency Switcher & Primary Save CTA */}
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-black/[0.06] p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center shadow-sm shrink-0">
              <Sliders size={22} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-neutral-900 tracking-tight">
                تنظیمات سیستم و پیکربندی یکپارچه
              </h1>
              <p className="text-neutral-500 text-xs mt-0.5">
                مدیریت مشخصات کسب‌وکار، واحد پول (تومان/ریال)، طراحی فیش پرینتر، شبکه محلی و بات‌ها
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 justify-end">
            {/* Instant Currency Unit Switcher Pill in Header */}
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl border border-black/[0.05]">
              <span className="text-[11px] font-bold text-neutral-600 px-2 flex items-center gap-1">
                <Coins size={13} className="text-amber-500" />
                <span>واحد پول:</span>
              </span>
              <button
                type="button"
                disabled={isConvertingCurrency}
                onClick={() => handleSwitchCurrencyUnit('toman')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeCurrency === 'toman'
                    ? 'bg-white text-[#007AFF] shadow-2xs'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                تومان
              </button>
              <button
                type="button"
                disabled={isConvertingCurrency}
                onClick={() => handleSwitchCurrencyUnit('rial')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeCurrency === 'rial'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                ریال (×۱۰)
              </button>
            </div>

            {activeTab !== 'receipt' && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] active:scale-[0.98] text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Save size={15} />
                <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Notification Banner (Replaces blocked window.alert/confirm) */}
        {statusBanner && (
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={18} className="text-rose-600 shrink-0" />
              )}
              <span>{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-[11px] px-2 py-0.5 rounded-lg bg-black/5 hover:bg-black/10 cursor-pointer shrink-0"
            >
              بستن
            </button>
          </div>
        )}

        {/* Full-Width Segmented Navigation Tabs Bar */}
        <div className="flex items-center gap-1.5 p-1.5 bg-black/[0.05] rounded-2xl border border-black/[0.04] overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
              activeTab === 'general'
                ? 'bg-white text-neutral-950 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-white/50 font-medium'
            }`}
          >
            <Building2 size={15} className={activeTab === 'general' ? 'text-[#007AFF]' : ''} />
            <span>مشخصات، واحد پول و مالیات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('receipt')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
              activeTab === 'receipt'
                ? 'bg-white text-neutral-950 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-white/50 font-medium'
            }`}
          >
            <Printer size={15} className={activeTab === 'receipt' ? 'text-[#007AFF]' : ''} />
            <span>طراحی فیش پرینتر</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('network')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
              activeTab === 'network'
                ? 'bg-white text-neutral-950 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-white/50 font-medium'
            }`}
          >
            <Network size={15} className={activeTab === 'network' ? 'text-[#007AFF]' : ''} />
            <span>شبکه محلی و پورت</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bots')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
              activeTab === 'bots'
                ? 'bg-white text-neutral-950 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-white/50 font-medium'
            }`}
          >
            <Bot size={15} className={activeTab === 'bots' ? 'text-[#007AFF]' : ''} />
            <span>ربات‌های تلگرام و بله</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('snappfood')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
              activeTab === 'snappfood'
                ? 'bg-white text-neutral-950 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-white/50 font-medium'
            }`}
          >
            <Sparkles size={15} className={activeTab === 'snappfood' ? 'text-pink-600' : 'text-neutral-400'} />
            <span>اسنپ‌فود</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
              activeTab === 'backup'
                ? 'bg-white text-neutral-950 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-white/50 font-medium'
            }`}
          >
            <Database size={15} className={activeTab === 'backup' ? 'text-[#007AFF]' : ''} />
            <span>پشتیبان‌گیری و دیتابیس</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('license')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
              activeTab === 'license'
                ? 'bg-white text-neutral-950 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-white/50 font-medium'
            }`}
          >
            <Key size={15} className={activeTab === 'license' ? 'text-amber-500' : ''} />
            <span>لایسنس و قفل سخت‌افزاری</span>
            {serverLicense && !serverLicense.isActivated && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
              activeTab === 'all'
                ? 'bg-white text-neutral-950 font-bold shadow-2xs'
                : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/50 font-medium'
            }`}
          >
            <Sliders size={14} />
            <span>همه بخش‌ها</span>
          </button>
        </div>

        {/* 1. Dedicated Receipt Designer Tab */}
        {activeTab === 'receipt' && (
          <ReceiptDesignerTab settings={settings} />
        )}

        {/* 2. General Business Info, Currency Unit & Tax Settings (Balanced 12-Col Grid) */}
        {(activeTab === 'general' || activeTab === 'all') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* Right Column (7 Cols): Store Identity & Contact Channels */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-black/[0.06] shadow-2xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-neutral-900">مشخصات عمومی فروشگاه و راه‌های ارتباطی</h2>
                    <p className="text-[11px] text-neutral-400">اطلاعات پایه جهت درج در سربرگ فاکتورها، پورتال مشتریان و گزارشات</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">نام فروشگاه / رستوران</label>
                  <input 
                    name="restaurantName"
                    value={formData.restaurantName || ''}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50/80 border border-neutral-200/90 focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 text-xs font-semibold text-neutral-900 outline-none transition-all"
                    placeholder="مثال: رستوران و کافه آرکا"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">شماره تماس</label>
                  <input 
                    name="phone"
                    value={formData.phone || ''}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50/80 border border-neutral-200/90 focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 text-xs font-mono font-semibold text-neutral-900 text-left outline-none transition-all"
                    placeholder="021-12345678"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">آدرس وب‌سایت</label>
                  <input 
                    name="website"
                    value={formData.website || ''}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50/80 border border-neutral-200/90 focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 text-xs font-mono text-neutral-800 text-left outline-none transition-all"
                    placeholder="www.example.com"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">آیدی اینستاگرام</label>
                  <input 
                    name="instagram"
                    value={formData.instagram || ''}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50/80 border border-neutral-200/90 focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 text-xs font-mono text-neutral-800 text-left outline-none transition-all"
                    placeholder="@username"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">آیدی تلگرام</label>
                  <input 
                    name="telegram"
                    value={formData.telegram || ''}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50/80 border border-neutral-200/90 focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 text-xs font-mono text-neutral-800 text-left outline-none transition-all"
                    placeholder="@channel_or_username"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">لینک تصویر لوگو (URL)</label>
                  <input 
                    name="logoUrl"
                    value={formData.logoUrl || ''}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50/80 border border-neutral-200/90 focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 text-xs font-mono text-neutral-800 text-left outline-none transition-all"
                    placeholder="https://.../logo.png"
                    dir="ltr"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">آدرس کامل مجموعه</label>
                  <textarea 
                    name="address"
                    value={formData.address || ''}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50/80 border border-neutral-200/90 focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 text-xs text-neutral-900 outline-none transition-all resize-none"
                    placeholder="آدرس دقیق فروشگاه یا رستوران جهت چاپ در فاکتور..."
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('receipt')}
                  className="text-xs font-bold text-[#007AFF] hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>طراحی ظاهری فیش پرینتر و قالب فاکتور ←</span>
                </button>

                <button 
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0062cc] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Save size={15} />
                  <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره مشخصات'}</span>
                </button>
              </div>
            </div>

            {/* Left Column (5 Cols): System Currency Unit + Tax & Checkout Rules */}
            <div className="lg:col-span-5 space-y-5">
              
              {/* Card A: System Currency Unit (Toman / Rial) */}
              <div className="bg-white rounded-2xl border border-black/[0.06] shadow-2xs p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                      <Coins size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-neutral-900">واحد پول سیستم (تومان / ریال)</h2>
                      <p className="text-[11px] text-neutral-400">تغییر آنی واحد پول همراه با اصلاح خودکار صفر در کل ثبت‌ها</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                    activeCurrency === 'rial'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-blue-50 text-[#007AFF] border border-blue-200'
                  }`}>
                    فعال: {activeCurrency === 'rial' ? 'ریال' : 'تومان'}
                  </span>
                </div>

                <p className="text-xs text-neutral-600 leading-relaxed">
                  با انتخاب <strong>ریال</strong>، به تمام مبالغ منو، حساب‌ها، کیف پول مشتریان و فاکتورهای ثبت‌شده <strong>یک صفر اضافه می‌شود (×۱۰)</strong> و با انتخاب <strong>تومان</strong>، <strong>یک صفر کسر می‌گردد (÷۱۰)</strong>.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                  <button
                    type="button"
                    disabled={isConvertingCurrency}
                    onClick={() => handleSwitchCurrencyUnit('toman')}
                    className={`p-3.5 rounded-xl border-2 text-right transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      activeCurrency === 'toman'
                        ? 'border-[#007AFF] bg-blue-50/50'
                        : 'border-neutral-200 hover:border-blue-300 bg-neutral-50/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-neutral-900">تومان (Toman)</span>
                        {activeCurrency === 'toman' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#007AFF] text-white font-bold">واحد فعال</span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-1">
                        کسر یک صفر نسبت به ریال • نمونه نمایش: <strong className="font-mono text-neutral-800">۲۵۰,۰۰۰ تومان</strong>
                      </p>
                    </div>
                    <CheckCircle2
                      size={19}
                      className={activeCurrency === 'toman' ? 'text-[#007AFF] shrink-0' : 'text-neutral-300 shrink-0'}
                    />
                  </button>

                  <button
                    type="button"
                    disabled={isConvertingCurrency}
                    onClick={() => handleSwitchCurrencyUnit('rial')}
                    className={`p-3.5 rounded-xl border-2 text-right transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      activeCurrency === 'rial'
                        ? 'border-emerald-600 bg-emerald-50/50'
                        : 'border-neutral-200 hover:border-emerald-300 bg-neutral-50/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-neutral-900">ریال (Rial)</span>
                        {activeCurrency === 'rial' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold">واحد فعال</span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-1">
                        افزودن یک صفر به کل مبالغ و ثبت‌ها • نمونه نمایش: <strong className="font-mono text-neutral-800">۲,۵۰۰,۰۰۰ ریال</strong>
                      </p>
                    </div>
                    <CheckCircle2
                      size={19}
                      className={activeCurrency === 'rial' ? 'text-emerald-600 shrink-0' : 'text-neutral-300 shrink-0'}
                    />
                  </button>
                </div>
              </div>

              {/* Card B: Tax & Invoice Checkout Rules */}
              <div className="bg-white rounded-2xl border border-black/[0.06] shadow-2xs p-5 space-y-4">
                <h3 className="text-sm font-bold text-neutral-900 pb-2.5 border-b border-neutral-100">
                  قوانین مالیات و صدور فاکتور در صندوق
                </h3>

                {/* Tax Toggle Row */}
                <div className="p-3.5 rounded-xl bg-neutral-50/80 border border-neutral-200/70 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-neutral-900 block">اعمال مالیات بر ارزش افزوده</span>
                      <span className="text-[11px] text-neutral-500">محاسبه خودکار مالیات روی فاکتورهای فروش</span>
                    </div>
                    <AppleSwitch
                      checked={formData.taxEnabled || false}
                      onChange={(checked) => setFormData({ ...formData, taxEnabled: checked })}
                    />
                  </div>

                  {formData.taxEnabled && (
                    <div className="pt-2.5 border-t border-neutral-200/70 flex items-center justify-between gap-3">
                      <label className="text-xs font-bold text-neutral-700">نرخ درصد مالیات (%):</label>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="number"
                          name="taxPercentage"
                          value={formData.taxPercentage ?? 9}
                          onChange={handleChange}
                          className="w-20 px-3 py-1.5 rounded-xl bg-white border border-neutral-300 focus:border-[#007AFF] outline-none text-center font-mono text-xs font-bold"
                          dir="ltr"
                          min="0"
                          max="100"
                        />
                        <span className="text-xs font-bold text-neutral-500">%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mandatory Customer Phone Toggle Row */}
                <div className="p-3.5 rounded-xl bg-neutral-50/80 border border-neutral-200/70 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-neutral-900 block">اجباری بودن شماره موبایل مشتری</span>
                    <span className="text-[11px] text-neutral-500">الزام ثبت موبایل مشتری هنگام صدور فاکتور جهت باشگاه مشتریان</span>
                  </div>
                  <AppleSwitch
                    checked={formData.requireCustomerPhone || false}
                    onChange={(checked) => setFormData({ ...formData, requireCustomerPhone: checked })}
                  />
                </div>
              </div>

            </div>

          </div>
        )}

        {/* 3. Network & Local Server Card */}
        {(activeTab === 'network' || activeTab === 'all') && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Network className="text-blue-600" size={22} />
              <div>
                <h2 className="text-xl font-bold text-slate-800">تنظیمات شبکه محلی، پورت و اتصال تبلت/میزها</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  مدیر سیستم می‌تواند پورت دلخواه و آدرس اشتراک‌گذاری در شبکه داخلی یا اینترنت را جهت اتصال تبلت گارسون و بارکد منوی میزها تعیین کند.
                </p>
              </div>
            </div>

            {/* System Execution Role: Server vs Client Workstation */}
            <div className="bg-gradient-to-r from-indigo-50/70 via-blue-50/60 to-slate-50 rounded-2xl border border-indigo-200/80 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Server size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                      نقش و حالت اجرای این نرم‌افزار در سیستم (سرور اصلی / کلاینت)
                    </h3>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      getAppExecutionMode() === 'server'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : (getAppExecutionMode() === 'client' ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-slate-200 text-slate-800')
                    }`}>
                      {getAppExecutionMode() === 'server' ? '🏢 سرور مرکزی' : (getAppExecutionMode() === 'client' ? '💻 کلاینت متصل به سرور' : 'پیش‌فرض مستقل')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {getAppExecutionMode() === 'client'
                      ? `این سیستم به عنوان صندوق فرعی به آدرس سرور (${getServerBaseUrl() || 'تعریف‌نشده'}) متصل است.`
                      : 'این رایانه به عنوان سرور مرکزی عمل می‌کند و دیتابیس اصلی روی آن مستقر است.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTauriModeModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <Server size={14} />
                <span>تغییر نقش سیستم (سرور / کلاینت)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Server size={14} className="text-blue-600" />
                  <span>پورت سرور شبکه محلی (Port)</span>
                </label>
                <input 
                  type="number"
                  name="localServerPort"
                  value={formData.localServerPort !== undefined ? formData.localServerPort : 3000}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      localServerPort: val === '' ? ('' as any) : Number(val)
                    }));
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-sm font-bold text-slate-800 outline-none transition-all"
                  placeholder="پیش‌فرض: 3000"
                  dir="ltr"
                  min="80"
                  max="65535"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">پورت‌های رایج: 3000, 7375, 8080</span>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Globe size={14} className="text-blue-600" />
                  <span>آدرس یا دامنه سرور اختصاصی (Custom Server URL / Domain)</span>
                </label>
                <input 
                  name="localServerUrl"
                  value={formData.localServerUrl || ''}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-sm text-slate-800 outline-none transition-all"
                  placeholder="http://192.168.1.50:3000 یا https://order.myrestaurant.com"
                  dir="ltr"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">در صورت خالی بودن، IP شبکه محلی سرور به‌صورت خودکار استفاده می‌شود.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Wifi size={14} className="text-blue-600" />
                  <span>نام وای‌فای رستوران (SSID)</span>
                </label>
                <input 
                  name="wifiSsid"
                  value={formData.wifiSsid || ''}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 outline-none transition-all"
                  placeholder="مثال: Arka-Guest-WiFi"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  <span>رمز عبور وای‌فای (Wi-Fi Password)</span>
                </label>
                <input 
                  name="wifiPassword"
                  value={formData.wifiPassword || ''}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 outline-none transition-all"
                  placeholder="رمز شبکه مهمان"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Real-time LAN Server Active Status Banner */}
            <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
                <div>
                  <span className="text-xs font-bold text-emerald-900 block">
                    سرور شبکه محلی فعال و آماده اتصال تبلت و موبایل:
                  </span>
                  <span className="text-xs font-mono font-bold text-blue-800 block mt-0.5" dir="ltr">
                    {formData.localServerUrl?.trim() || `http://${detectedLanIp || '192.168.1.100'}:${formData.localServerPort || 3000}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const url = formData.localServerUrl?.trim() || `http://${detectedLanIp || '192.168.1.100'}:${formData.localServerPort || 3000}`;
                    navigator.clipboard.writeText(url);
                    setCopiedLanUrl(true);
                    setTimeout(() => setCopiedLanUrl(false), 2000);
                  }}
                  className="py-1.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                >
                  {copiedLanUrl ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  <span>{copiedLanUrl ? 'کپی شد' : 'کپی آدرس'}</span>
                </button>
              </div>
            </div>

            {/* Central Server Database Real-Time Sync Section */}
            <div className="mt-4 p-5 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-slate-50 border border-blue-200/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Database size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>پایگاه داده مرکزی و یکپارچه سرور</span>
                    <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full">زنده و لینک‌شده</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    تمامی سیستم‌ها، تبلت‌ها و گوشی‌ها به همین پایگاه داده متصل هستند و تغییرات منو و سفارشات درلحظه همگام‌سازی می‌شود.
                  </p>
                  {serverSyncSuccess && (
                    <span className="text-xs font-bold text-emerald-700 block mt-1">
                      {serverSyncSuccess}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncingServer}
                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer shrink-0"
              >
                <RefreshCw size={14} className={isSyncingServer ? 'animate-spin' : ''} />
                <span>{isSyncingServer ? 'در حال همگام‌سازی...' : 'همگام‌سازی دستی با سرور'}</span>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                type="button"
                onClick={handleSaveNetworkSettings}
                disabled={isSaving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm active:scale-95"
              >
                <Save size={16} />
                <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات شبکه'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Bot Integration & Auto Hourly Backup Card */}
        {(activeTab === 'bots' || activeTab === 'all') && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-sm">
                  <Bot size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">ربات‌های تلگرام و بله و پشتیبان‌گیری خودکار</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ارسال خودکار و دوره‌ای (ساعتی یا روزانه) فایل دیتابیس به ادمین‌های تلگرام و پیام‌رسان بله
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSendBackupNow}
                disabled={isDispatchingBackup}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDispatchingBackup ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                <span>ارسال فوری بکاپ به بات‌ها</span>
              </button>
            </div>
          </div>

          {/* Schedule Frequency Selector */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">بازه زمانی ارسال خودکار فایل پشتیبان</h4>
                <p className="text-xs text-slate-500">پایگاه داده در پس‌زمینه خودکار استخراج و برای ادمین‌ها ارسال می‌شود</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={formData.autoBackupIntervalHours ?? 1}
                onChange={(e) => setFormData({ ...formData, autoBackupIntervalHours: Number(e.target.value) })}
                className="bg-white border border-blue-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                <option value={1}>⏱ ساعتی (هر ۱ ساعت یکبار)</option>
                <option value={3}>⏱ هر ۳ ساعت</option>
                <option value={6}>⏱ هر ۶ ساعت</option>
                <option value={12}>⏱ هر ۱۲ ساعت</option>
                <option value={24}>📅 روزانه (هر ۲۴ ساعت یکبار)</option>
                <option value={0}>⛔️ غیرفعال (فقط ارسال دستی)</option>
              </select>

              {settings?.lastAutoBackupTime && (
                <span className="text-[11px] font-mono text-slate-500 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                  آخرین ارسال: {formatJalali(new Date(settings.lastAutoBackupTime), 'MM/dd HH:mm')}
                </span>
              )}
            </div>
          </div>

          {/* Two Columns: Telegram vs Bale */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 1. Telegram Bot Card */}
            <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-slate-50/50 relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center text-sm font-bold shadow-xs">
                    TG
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">ربات تلگرام (Telegram Bot)</h3>
                    <span className="text-[10px] text-slate-400">از طریق @BotFather در تلگرام</span>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.telegramBackupEnabled ?? true}
                    onChange={(e) => setFormData({ ...formData, telegramBackupEnabled: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-700">فعال</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  توکن ربات تلگرام (Bot Token)
                </label>
                <input
                  name="telegramBotToken"
                  value={formData.telegramBotToken || ''}
                  onChange={handleChange}
                  placeholder="مثال: 123456789:ABCdefGhIJKlmNoPQRstuVWXyz"
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-xs text-slate-800 outline-none bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>چت‌آیدی ادمین‌های تلگرام (Admin Chat IDs)</span>
                  <span className="text-[10px] text-slate-400 font-normal">با کاما جدا کنید</span>
                </label>
                <input
                  name="telegramAdminChatIds"
                  value={formData.telegramAdminChatIds || ''}
                  onChange={handleChange}
                  placeholder="مثال: 123456789, 987654321"
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-xs text-slate-800 outline-none bg-white transition-all"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  چت‌آیدی عددی ادمین یا گروه جهت دریافت فایل بکاپ
                </span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={isTestingTg}
                  className="py-2 px-3.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isTestingTg ? <RefreshCw size={13} className="animate-spin" /> : <MessageSquare size={13} />}
                  <span>تست ارتباط با تلگرام</span>
                </button>
              </div>
            </div>

            {/* 2. Bale Bot Card (پیام‌رسان بله) */}
            <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-slate-50/50 relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm font-bold shadow-xs">
                    بله
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">ربات بله (Bale Messenger)</h3>
                    <span className="text-[10px] text-slate-400">از طریق @BotFather در پیام‌رسان بله</span>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.baleBackupEnabled ?? true}
                    onChange={(e) => setFormData({ ...formData, baleBackupEnabled: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-700">فعال</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  توکن ربات بله (Bale Bot Token)
                </label>
                <input
                  name="baleBotToken"
                  value={formData.baleBotToken || ''}
                  onChange={handleChange}
                  placeholder="مثال: 123456789:ABCdefGhIJKlmNoPQRstuVWXyz"
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-xs text-slate-800 outline-none bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>چت‌آیدی ادمین‌های بله (Bale Admin Chat IDs)</span>
                  <span className="text-[10px] text-slate-400 font-normal">با کاما جدا کنید</span>
                </label>
                <input
                  name="baleAdminChatIds"
                  value={formData.baleAdminChatIds || ''}
                  onChange={handleChange}
                  placeholder="مثال: 987654321, 11223344"
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-xs text-slate-800 outline-none bg-white transition-all"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  شناسه عددی کاربر یا کانال اختصاصی ادمین در بله
                </span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleTestBale}
                  disabled={isTestingBale}
                  className="py-2 px-3.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isTestingBale ? <RefreshCw size={13} className="animate-spin" /> : <MessageSquare size={13} />}
                  <span>تست ارتباط با بله</span>
                </button>
              </div>
            </div>

          </div>

          <div className="flex justify-end pt-2">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              <Save size={16} />
              <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات بات‌ها'}</span>
            </button>
          </div>
        </div>
        )}

        {/* SnappFood Integration & Auto-Accept / Auto-Invoice */}
        {(activeTab === 'snappfood' || activeTab === 'all') && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#E11383] text-white flex items-center justify-center font-black text-xl shadow-md shadow-pink-500/25 shrink-0">
                SF
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-800">اتصال به اسنپ‌فود (SnappFood Vendor API)</h2>
                  <span className="text-[10px] bg-pink-50 text-[#E11383] border border-pink-200 font-black px-2 py-0.5 rounded-full">
                    تایید و صدور خودکار فاکتور
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  دریافت مستقیم سفارشات اسنپ‌فود، تایید خودکار زمان پخت در پنل و ثبت آنی فاکتور در صندوق با کسر مواد اولیه از انبار.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer bg-pink-50/70 border border-pink-200/80 px-3.5 py-2 rounded-xl shrink-0 self-start sm:self-auto">
              <input
                type="checkbox"
                checked={formData.snappfoodEnabled ?? true}
                onChange={(e) => setFormData({ ...formData, snappfoodEnabled: e.target.checked })}
                className="rounded border-pink-300 text-[#E11383] focus:ring-pink-500 w-4 h-4"
              />
              <span className="text-xs font-black text-slate-800">فعال‌سازی سرویس اسنپ‌فود</span>
            </label>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                کد فروشگاه در اسنپ‌فود (Vendor Code)
              </label>
              <input
                name="snappfoodVendorCode"
                value={formData.snappfoodVendorCode || ''}
                onChange={handleChange}
                placeholder="مثال: VND-84920"
                dir="ltr"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#E11383] text-xs font-mono text-slate-800 outline-none transition-all"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">کد رستوران شما در پنل وندور اسنپ‌فود</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                توکن وب‌سرویس / کلید API اسنپ‌فود (API Token / Key)
              </label>
              <input
                name="snappfoodApiKey"
                type="password"
                value={formData.snappfoodApiKey || ''}
                onChange={handleChange}
                placeholder="توکن دریافتی از پشتیبانی اسنپ‌فود"
                dir="ltr"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#E11383] text-xs font-mono text-slate-800 outline-none transition-all"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">جهت ارسال درخواست تایید زمان پخت به سرورهای اسنپ‌فود</span>
            </div>
          </div>

          {/* Webhook URL Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe size={15} className="text-[#E11383]" />
                آدرس وب‌هوک دریافتی سفارشات اسنپ‌فود شما (SnappFood Webhook URL):
              </span>
              <button
                type="button"
                onClick={() => {
                  const url = `${window.location.origin}/api/snappfood/webhook`;
                  navigator.clipboard.writeText(url);
                  setCopiedSnappfoodWebhook(true);
                  setTimeout(() => setCopiedSnappfoodWebhook(false), 2500);
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-pink-700 hover:text-pink-800 bg-pink-50 border border-pink-200 px-3 py-1 rounded-xl shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                {copiedSnappfoodWebhook ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedSnappfoodWebhook ? 'کپی شد!' : 'کپی آدرس وب‌هوک'}</span>
              </button>
            </div>
            <code className="block bg-slate-900 text-pink-400 p-2.5 rounded-xl text-xs font-mono select-all overflow-x-auto" dir="ltr">
              {window.location.origin}/api/snappfood/webhook
            </code>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              این آدرس را به پشتیبان فنی اسنپ‌فود یا در تیکت وب‌سرویس اعلام کنید تا به محض ثبت هر سفارش، داده‌ها مستقیماً به صندوق شما فوروارد شوند.
            </p>
          </div>

          {/* Automation Rules */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.snappfoodAutoAccept ?? true}
                  onChange={(e) => setFormData({ ...formData, snappfoodAutoAccept: e.target.checked })}
                  className="rounded border-slate-300 text-[#E11383] focus:ring-pink-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-800">تایید خودکار سفارشات (Auto-Accept)</span>
              </label>
              <p className="text-[11px] text-slate-500">
                سفارش بدون معطلی و بدون نیاز به تایید دستی کاربر در پنل اسنپ‌فود تایید می‌شود.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                مدت زمان پیش‌فرض آماده‌سازی (دقیقه)
              </label>
              <select
                name="snappfoodDefaultPrepTime"
                value={formData.snappfoodDefaultPrepTime || 25}
                onChange={(e) => setFormData({ ...formData, snappfoodDefaultPrepTime: Number(e.target.value) })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 outline-none"
              >
                <option value={15}>۱۵ دقیقه (سریع)</option>
                <option value={20}>۲۰ دقیقه</option>
                <option value={25}>۲۵ دقیقه (استاندارد)</option>
                <option value={30}>۳۰ دقیقه</option>
                <option value={40}>۴۰ دقیقه</option>
                <option value={50}>۵۰ دقیقه</option>
              </select>
              <p className="text-[11px] text-slate-500">زمان تخمینی اعلام‌شده به مشتری و پیک اسنپ‌فود.</p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.snappfoodAutoPrint ?? true}
                  onChange={(e) => setFormData({ ...formData, snappfoodAutoPrint: e.target.checked })}
                  className="rounded border-slate-300 text-[#E11383] focus:ring-pink-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-800">چاپ خودکار فاکتور (Auto-Print)</span>
              </label>
              <p className="text-[11px] text-slate-500">
                به محض رسیدن سفارش، فیش فاکتور جهت ارسال به آشپزخانه و پیک چاپ می‌شود.
              </p>
            </div>
          </div>

          {/* Test & Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
            <button
              type="button"
              onClick={async () => {
                setIsTestingSnappfood(true);
                setSnappfoodTestResult(null);
                try {
                  const testOrder = await simulateTestSnappfoodOrder();
                  setSnappfoodTestResult(`سفارش تستی #${testOrder.snappfoodOrderCode} با موفقیت دریافت و با شماره فاکتور #${testOrder.invoiceNumber} ثبت گردید!`);
                  setTimeout(() => setSnappfoodTestResult(null), 7000);
                } catch (err: any) {
                  setSnappfoodTestResult(`خطا در تست: ${err.message}`);
                } finally {
                  setIsTestingSnappfood(false);
                }
              }}
              disabled={isTestingSnappfood}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-pink-50 hover:bg-pink-100 border border-pink-200 text-[#E11383] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isTestingSnappfood ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>تست دریافت سفارش اسنپ‌فود و صدور خودکار فاکتور</span>
            </button>

            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#E11383] hover:bg-pink-700 text-white px-8 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-md shadow-pink-500/20"
            >
              <Save size={16} />
              <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات اسنپ‌فود'}</span>
            </button>
          </div>

          {snappfoodTestResult && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{snappfoodTestResult}</span>
            </div>
          )}
        </div>
        )}

        {/* Hardware-Locked Server License & Activation Management */}
        {(activeTab === 'license' || activeTab === 'all') && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
                  <Key size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <span>لایسنس سرور و قفل انحصاری سخت‌افزار</span>
                    {serverLicense?.isActivated ? (
                      <span className="text-[11px] bg-emerald-500 text-white font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldCheck size={12} />
                        فعال و متصل به سخت‌افزار
                      </span>
                    ) : (
                      <span className="text-[11px] bg-rose-500 text-white font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                        <Lock size={12} />
                        نیازمند فعال‌سازی
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    اتصال انحصاری سرور به شناسه سخت‌افزاری کامپیوتر مرکزی بدون نیاز به اینترنت (کاملاً آفلاین)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchLicenseStatus}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw size={14} />
                  <span>بروزرسانی وضعیت</span>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Architecture Info Banner */}
              <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200/80 flex items-start gap-3.5">
                <Cpu size={22} className="text-[#007AFF] shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-slate-700 space-y-1">
                  <p className="font-bold text-slate-900">معماری امنیتی قفل سخت‌افزاری سرور مرکزی (Hardware Lock):</p>
                  <p>
                    این سیستم تنها روی کامپیوتر سرور قفل سخت‌افزاری دارد. شناسه اختصاصی بر اساس سریال مادربرد (BaseBoard)، شناسه پردازنده (CPU ID)، دیسک سخت و شناسه اختصاصی ویندوز رمزنگاری می‌شود.
                  </p>
                  <p className="text-[#007AFF] font-bold">
                    💡 مهم: تبلت‌ها، گوشی‌های سالن‌کاران، صندوق‌های فرعی و مشتریان داخل شبکه Wi-Fi نیازی به لایسنس جداگانه ندارند و با باز کردن آدرس سرور در مرورگر بدون محدودیت متصل می‌شوند.
                  </p>
                </div>
              </div>

              {/* Machine ID Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Laptop size={16} className="text-indigo-600" />
                    شناسه سخت‌افزاری این رایانه سرور (Machine ID):
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyServerMachineId}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs transition-all cursor-pointer shrink-0 active:scale-95"
                  >
                    {copiedServerMachineId ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{copiedServerMachineId ? 'کپی شد!' : 'کپی شناسه سخت‌افزار'}</span>
                  </button>
                </div>

                <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl font-mono text-center text-sm sm:text-base font-bold tracking-wider select-all border border-slate-800" dir="ltr">
                  {serverLicense?.machineId || 'در حال دریافت شناسه سخت‌افزار...'}
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
                  <span>وضعیت لایسنس سرور: {serverLicense?.isActivated ? '✅ لایسنس دائم فعال است' : '⚠️ غیرفعال'}</span>
                  {serverLicense?.activatedAt && (
                    <span>تاریخ فعال‌سازی: {formatJalali(new Date(serverLicense.activatedAt), 'yyyy/MM/dd - HH:mm:ss')}</span>
                  )}
                </div>
              </div>

              {/* Activation Key Input Form */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Key size={16} className="text-amber-500" />
                  <span>ثبت کد فعال‌سازی سرور (Activation Key)</span>
                </h3>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <input
                    type="text"
                    value={licenseInput}
                    onChange={(e) => setLicenseInput(e.target.value.toUpperCase())}
                    placeholder="ARKA-KEY-XXXX-XXXX-XXXX-XXXX"
                    dir="ltr"
                    className="w-full sm:flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 font-mono text-center text-sm font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 uppercase tracking-widest"
                  />

                  <button
                    type="button"
                    onClick={handleActivateServerLicense}
                    disabled={isActivatingLicense || !licenseInput.trim()}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
                  >
                    {isActivatingLicense ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>در حال بررسی...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} />
                        <span>فعال‌سازی دائمی سرور</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Customer Activation Guidance Notice */}
              <div className="border border-slate-200 bg-slate-50/80 rounded-2xl p-5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
                  <h4 className="text-sm font-bold text-slate-800">
                    راهنمای فعال‌سازی لایسنس سرور آرکا (Server Activation)
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  جهت راه‌اندازی و فعال‌سازی این سیستم به عنوان سرور مرکزی شبکه و اتصال تبلت‌ها و گوشی‌ها، کافیست «شناسه سخت‌افزاری سرور (Machine ID)» فوق را کپی کرده و برای واحد پشتیبانی و فروش نرم‌افزار ارسال فرمایید تا کد فعال‌سازی اختصاصی این سیستم برای شما صادر شود.
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] font-semibold text-slate-500">
                  <Lock size={13} className="text-slate-400" />
                  <span>هر کد فعال‌سازی منحصر به قطعات سخت‌افزاری همین کامپیوتر صادر می‌گردد و دائمی است.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Database Storage Location & Persistence Info */}
        {(activeTab === 'backup' || activeTab === 'all') && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Database className="text-indigo-600" size={22} />
            <h2 className="text-xl font-bold text-slate-800">محل ذخیره‌سازی پایگاه داده و امنیت اطلاعات</h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed mb-4">
            کلیه داده‌های شما (منوها، موجودی انبارها، فاکتورهای فروش و پرسنل) به‌صورت کاملاً محلی (Local IndexedDB) با موتور فوق‌سریع Dexie در سیستم ذخیره می‌شوند و بستن نرم‌افزار یا خاموش شدن سیستم هیچ خطری برای پاک شدن داده‌ها ندارد.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <HardDrive size={15} className="text-slate-500" />
                مسیر فیزیکی فایل‌های پایگاه داده در ویندوز (Tauri WebView2):
              </span>
              <button 
                onClick={handleCopyDbPath}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                {copiedDbPath ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedDbPath ? 'کپی شد!' : 'کپی مسیر'}</span>
              </button>
            </div>
            <code className="block bg-slate-900 text-emerald-400 p-2.5 rounded-lg text-xs font-mono select-all overflow-x-auto" dir="ltr">
              {tauriDbPath}
            </code>
            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-700">تغییر مسیر مستقیم دیتابیس:</span>
              <span>پایگاه داده IndexedDB مستقیماً در پروفایل امن کاربری ویندوز مدیریت می‌شود؛ جهت انتقال یا بایگانی داده‌ها می‌توانید از دکمه «دریافت فایل بکاپ» استفاده کنید و در هر سیستم دیگری آن را بازیابی (Import) نمایید.</span>
            </div>
          </div>

          <div className="mt-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={localDbIndependent}
                onChange={(e) => {
                  const val = e.target.checked;
                  setLocalDbIndependent(val);
                  localStorage.setItem('arka_local_db_independent', val ? 'true' : 'false');
                  alert(val ? '✅ استقلال کامل دیتابیس محلی فعال شد. اطلاعات شما کاملاً ایزوله و در برابر آپدیت‌ها ایمن است.' : '⚠️ همگام‌سازی با سرور فعال شد.');
                }}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <span className="text-xs font-bold text-slate-900">استقلال کامل دیتابیس محلی از سرور (جلوگیری از تداخل یا بازنویسی داده‌ها پس از آپدیت‌ها)</span>
            </label>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              با فعال بودن این گزینه (پیش‌فرض)، دیتابیس محلی دستگاه شما کاملاً مستقل از سرور است تا آپدیت‌ها و تغییرات سرور هیچ‌گونه تاثیری روی اطلاعات، موجودی انبار و فاکتورهای شما نداشته باشند.
            </p>
          </div>
        </div>
        )}

        {/* Progressive Web App (PWA) & Mobile Installation */}
        {(activeTab === 'network' || activeTab === 'backup' || activeTab === 'all') && (
        <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/70 to-slate-50 rounded-2xl shadow-sm border border-blue-200/80 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
                <Smartphone size={24} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>نصب نسخه وب‌اپلیکیشن روی گوشی و تبلت (PWA)</span>
                  <span className="text-[10px] bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full">تمام‌صفحه و آفلاین</span>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  اجرای نرم‌افزار بدون کادر مرورگر و مانند یک اپلیکیشن اختصاصی با آیکون اختصاصی و سرعت لود فوق‌العاده.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                localStorage.removeItem('arka_pwa_dismissed_until');
                window.dispatchEvent(new CustomEvent('open-pwa-prompt'));
                // Force banner to re-evaluate
                const event = new Event('beforeinstallprompt');
                window.dispatchEvent(event);
                // Also trigger alert or guide if on iOS/desktop
                const ua = navigator.userAgent.toLowerCase();
                if (/iphone|ipad|ipod/.test(ua)) {
                  alert('در آیفون (Safari): دکمه Share در پایین صفحه را بزنید و گزینه Add to Home Screen را انتخاب کنید.');
                }
              }}
              className="py-3 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer shrink-0"
            >
              <Download size={16} />
              <span>باز کردن راهنمای نصب PWA</span>
            </button>
          </div>
        </div>
        )}

        {/* Backup & Restore */}
        {(activeTab === 'backup' || activeTab === 'all') && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">پشتیبان‌گیری از اطلاعات (Backup)</h2>
          <p className="text-slate-500 mb-6">
            میتوانید از کل اطلاعات سیستم از جمله منوها، فاکتورها و تنظیمات فایل بکاپ تهیه کنید و یا آن را بازیابی کنید.
          </p>

          <div className="flex flex-wrap gap-4">
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <Download size={20} />
              دریافت فایل بکاپ
            </button>

            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <Upload size={20} />
              بازیابی از فایل
            </button>

            <button 
              disabled={isResettingDb}
              onClick={async () => {
                if (window.confirm('آیا مطمئن هستید؟ با این کار تمامی فاکتورهای تستی، موجودی انبار و داده‌های ثبت شده پاک شده و دیتابیس به حالت خام اولیه برمی‌گردد.')) {
                  setIsResettingDb(true);
                  try {
                    await resetDatabaseToRawCleanState();
                  } catch (e) {
                    console.error('Reset database error:', e);
                  } finally {
                    window.location.href = window.location.pathname + '?raw_clean=1&t=' + Date.now();
                  }
                }
              }}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={20} className={isResettingDb ? "animate-spin" : ""} />
              {isResettingDb ? 'در حال بازنشانی به حالت خام...' : 'بازنشانی داده‌ها به حالت خام اولیه'}
            </button>

            <button 
              onClick={async () => {
                if (window.confirm('آیا مایل به بارگذاری داده‌های نمونه (کالاها، انبار و حساب‌های آزمایشی) هستید؟')) {
                  localStorage.removeItem('user_wants_raw_clean');
                  await ensureDefaultInventoryData(true);
                  await ensureDefaultBankingData(true);
                  await ensureDefaultChartOfAccounts(true);
                  window.location.reload();
                }
              }}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-medium transition-colors cursor-pointer"
            >
              <Database size={20} />
              بارگذاری داده‌های نمونه (دمو)
            </button>

            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImport}
            />
          </div>
        </div>
        )}

        {/* Developer Credit Signature Card */}
        {(activeTab === 'backup' || activeTab === 'all') && (
        <div className="bg-slate-900 text-slate-100 rounded-2xl shadow-lg border border-slate-800 p-6 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="flex items-center gap-4 z-10">
            <div className="w-14 h-14 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xl">
              ME
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">طراح و توسعه‌دهنده سیستم</h3>
              <p className="text-sm text-slate-400 mt-1">{APP_DEVELOPER}</p>
            </div>
          </div>
          <div className="text-right z-10 border-r md:border-r-0 md:border-l border-slate-800 pr-4 md:pr-0 md:pl-6">
            <span className="text-xs text-slate-500 block">نسخه تجاری اختصاصی</span>
            <span className="text-sm font-semibold text-blue-400 mt-1 block">Arka System v{APP_VERSION}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">تاریخ بیلد: {APP_BUILD_DATE}</span>
          </div>
        </div>
        )}

        {/* Tauri Mode Selection Modal */}
        <TauriModeModal
          isOpen={isTauriModeModalOpen}
          onClose={() => setIsTauriModeModalOpen(false)}
        />

      </div>
    </div>
  );
}
