import React, { useState, useEffect, useRef } from 'react';
import { db, AppSettings } from '../../lib/db';
import { exportDB, importDB } from '../../lib/utils';
import { 
  Save, Download, Upload, Network, Wifi, Globe, HardDrive, Database, 
  Copy, Check, Server, Send, Bot, MessageSquare, Clock, RefreshCw, 
  CheckCircle2, AlertCircle, ShieldAlert, Sparkles, Smartphone
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  sendTelegramMessage, 
  sendBaleMessage, 
  dispatchBackupToBots, 
  parseChatIds 
} from '../../lib/botBackupService';
import { getNetworkInfo, initLanServer, isLocalhostOrTauri } from '../../lib/networkSync';
import { format as formatJalali } from 'date-fns-jalali';

export default function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  
  const [formData, setFormData] = useState<Partial<AppSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [copiedDbPath, setCopiedDbPath] = useState(false);
  const [copiedLanUrl, setCopiedLanUrl] = useState(false);
  const [detectedLanIp, setDetectedLanIp] = useState<string>('');
  const [isTestingTg, setIsTestingTg] = useState(false);
  const [isTestingBale, setIsTestingBale] = useState(false);
  const [isDispatchingBackup, setIsDispatchingBackup] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tauriDbPath = '%LOCALAPPDATA%\\com.arkasystem.pos\\EBWebView\\Default\\IndexedDB';

  const handleCopyDbPath = () => {
    navigator.clipboard.writeText(tauriDbPath);
    setCopiedDbPath(true);
    setTimeout(() => setCopiedDbPath(false), 2500);
  };

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  useEffect(() => {
    getNetworkInfo(Number(formData.localServerPort) || 3000).then(info => {
      const valid = (info.localIps || []).filter(ip => !ip.startsWith('127.') && ip !== '0.0.0.0');
      if (valid.length > 0) {
        setDetectedLanIp(valid[0]);
      }
    });
  }, [formData.localServerPort]);

  const handleSave = async () => {
    if (!settings?.id) return;
    setIsSaving(true);
    const targetPort = Number(formData.localServerPort) || 3000;
    await db.settings.update(settings.id, {
      ...formData,
      localServerPort: targetPort
    });
    
    // Start or restart embedded LAN server on Windows Tauri
    await initLanServer(targetPort);

    // Refresh IP
    const netInfo = await getNetworkInfo(targetPort);
    const valid = (netInfo.localIps || []).filter(ip => !ip.startsWith('127.') && ip !== '0.0.0.0');
    if (valid.length > 0) {
      setDetectedLanIp(valid[0]);
    }

    setIsSaving(false);
    alert(`تنظیمات ذخیره شد و سرور شبکه محلی روی پورت ${targetPort} فعال گردید.`);
  };

  const handleTestTelegram = async () => {
    const token = formData.telegramBotToken?.trim();
    const chatIds = parseChatIds(formData.telegramAdminChatIds);
    if (!token) {
      alert('لطفاً ابتدا توکن ربات تلگرام را وارد کنید.');
      return;
    }
    if (chatIds.length === 0) {
      alert('لطفاً حداقل یک چت‌آیدی (Chat ID) ادمین تلگرام وارد کنید.');
      return;
    }

    setIsTestingTg(true);
    let successCount = 0;
    const testMsg = `🔔 <b>پیام تست سامانه صندوقداری آرکا</b>\n\n` +
      `🏢 مجموعه: <b>${formData.restaurantName || 'سامانه آرکا'}</b>\n` +
      `✅ ارتباط با ربات تلگرام با موفقیت برقرار شد.\n` +
      `📅 زمان: <code>${formatJalali(new Date(), 'yyyy/MM/dd - HH:mm:ss')}</code>`;

    for (const id of chatIds) {
      const ok = await sendTelegramMessage(token, id, testMsg);
      if (ok) successCount++;
    }

    setIsTestingTg(false);
    if (successCount > 0) {
      alert(`✅ پیام تست با موفقیت به ${successCount} چت‌آیدی تلگرام ارسال شد.`);
    } else {
      alert('❌ ارسال پیام تست به تلگرام ناموفق بود. توکن یا چت‌آیدی را بررسی کنید.');
    }
  };

  const handleTestBale = async () => {
    const token = formData.baleBotToken?.trim();
    const chatIds = parseChatIds(formData.baleAdminChatIds);
    if (!token) {
      alert('لطفاً ابتدا توکن ربات پیام‌رسان بله را وارد کنید.');
      return;
    }
    if (chatIds.length === 0) {
      alert('لطفاً حداقل یک چت‌آیدی (Chat ID) ادمین بله وارد کنید.');
      return;
    }

    setIsTestingBale(true);
    let successCount = 0;
    const testMsg = `🔔 پیام تست سامانه صندوقداری آرکا\n\n` +
      `مجموعه: ${formData.restaurantName || 'سامانه آرکا'}\n` +
      `✅ ارتباط با ربات پیام‌رسان بله با موفقیت برقرار شد.\n` +
      `زمان: ${formatJalali(new Date(), 'yyyy/MM/dd - HH:mm:ss')}`;

    for (const id of chatIds) {
      const ok = await sendBaleMessage(token, id, testMsg);
      if (ok) successCount++;
    }

    setIsTestingBale(false);
    if (successCount > 0) {
      alert(`✅ پیام تست با موفقیت به ${successCount} چت‌آیدی در بله ارسال شد.`);
    } else {
      alert('❌ ارسال پیام تست به بله ناموفق بود. توکن یا چت‌آیدی را بررسی کنید.');
    }
  };

  const handleSendBackupNow = async () => {
    if (!settings) return;
    setIsDispatchingBackup(true);
    setDispatchStatus('در حال تهیه فایل پشتیبان و ارسال به ربات‌ها...');

    // Save latest form data first
    if (settings.id) {
      await db.settings.update(settings.id, formData);
    }

    const mergedSettings: AppSettings = { ...settings, ...formData } as AppSettings;
    const res = await dispatchBackupToBots(mergedSettings, true);

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

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-800">تنظیمات کسب‌وکار</h1>
          <p className="text-slate-500 mt-2">اطلاعات فروشگاه یا رستوران خود را برای چاپ در بالای فاکتورها وارد کنید.</p>
        </div>

        {/* Form Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">نام فروشگاه / رستوران</label>
              <input 
                name="restaurantName"
                value={formData.restaurantName || ''}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="مثال: فروشگاه البرز"
              />
            </div>
            
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">شماره تماس</label>
              <input 
                name="phone"
                value={formData.phone || ''}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="مثال: 021-12345678"
                dir="ltr"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">آدرس</label>
              <textarea 
                name="address"
                value={formData.address || ''}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="آدرس کامل فروشگاه / رستوران"
              />
            </div>

            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">وبسایت</label>
              <input 
                name="website"
                value={formData.website || ''}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="www.example.com"
                dir="ltr"
              />
            </div>

            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">آیدی اینستاگرام</label>
              <input 
                name="instagram"
                value={formData.instagram || ''}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="@username"
                dir="ltr"
              />
            </div>

            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">آیدی تلگرام</label>
              <input 
                name="telegram"
                value={formData.telegram || ''}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="@channel_or_username"
                dir="ltr"
              />
            </div>

             <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">لینک لوگو (URL)</label>
              <input 
                name="logoUrl"
                value={formData.logoUrl || ''}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="https://.../logo.png"
                dir="ltr"
              />
            </div>

            <div className="col-span-2 border-t border-slate-200 my-4 pt-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">تنظیمات مالیات</h3>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={formData.taxEnabled || false}
                      onChange={(e) => setFormData({ ...formData, taxEnabled: e.target.checked })}
                    />
                    <div className={`block w-14 h-8 rounded-full transition-colors ${formData.taxEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.taxEnabled ? 'transform translate-x-6' : ''}`}></div>
                  </div>
                  <span className="font-medium text-slate-700">اعمال مالیات به صورت پیش‌فرض</span>
                </label>

                {formData.taxEnabled && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-700">درصد مالیات:</label>
                    <input 
                      type="number"
                      name="taxPercentage"
                      value={formData.taxPercentage || 0}
                      onChange={handleChange}
                      className="w-24 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-center"
                      dir="ltr"
                      min="0"
                      max="100"
                    />
                    <span className="text-slate-500">%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2 border-t border-slate-200 my-4 pt-6">
              <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                <Network className="text-blue-600" size={20} />
                <span>تنظیمات شبکه محلی، پورت و اتصال تبلت/میزها</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                مدیر سیستم می‌تواند پورت دلخواه و آدرس اشتراک‌گذاری در شبکه داخلی یا اینترنت را جهت اتصال تبلت گارسون و بارکد منوی میزها تعیین کند.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Server size={14} className="text-blue-600" />
                    <span>پورت سرور شبکه محلی (Port)</span>
                  </label>
                  <input 
                    type="number"
                    name="localServerPort"
                    value={formData.localServerPort || 3000}
                    onChange={(e) => setFormData({ ...formData, localServerPort: Number(e.target.value) || 3000 })}
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
            </div>

            <div className="col-span-2 border-t border-slate-200 my-4 pt-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">تنظیمات فاکتور</h3>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={formData.requireCustomerPhone || false}
                      onChange={(e) => setFormData({ ...formData, requireCustomerPhone: e.target.checked })}
                    />
                    <div className={`block w-14 h-8 rounded-full transition-colors ${formData.requireCustomerPhone ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.requireCustomerPhone ? 'transform translate-x-6' : ''}`}></div>
                  </div>
                  <span className="font-medium text-slate-700">ثبت شماره موبایل مشتری اجباری باشد</span>
                </label>
              </div>
            </div>

          </div>

          <div className="mt-8 flex justify-end">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors"
            >
              <Save size={20} />
              {isSaving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
            </button>
          </div>
        </div>

        {/* Bot Integration & Auto Hourly Backup Card */}
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

        {/* Database Storage Location & Persistence Info */}
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
        </div>

        {/* Progressive Web App (PWA) & Mobile Installation */}
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

        {/* Backup & Restore */}
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
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImport}
            />
          </div>
        </div>

        {/* Developer Credit Signature Card */}
        <div className="bg-slate-900 text-slate-100 rounded-2xl shadow-lg border border-slate-800 p-6 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="flex items-center gap-4 z-10">
            <div className="w-14 h-14 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xl">
              ME
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">طراح و توسعه‌دهنده سیستم</h3>
              <p className="text-sm text-slate-400 mt-1">توسعه، شخصی‌سازی و راه‌اندازی شبکه توسط مهندس محمد ابراهیم حیدری (۰۹۱۹۳۳۵۱۳۶۵)</p>
            </div>
          </div>
          <div className="text-right z-10 border-r md:border-r-0 md:border-l border-slate-800 pr-4 md:pr-0 md:pl-6">
            <span className="text-xs text-slate-500 block">نسخه تجاری اختصاصی</span>
            <span className="text-sm font-semibold text-blue-400 mt-1 block">Arka System v1.0.0</span>
          </div>
        </div>

      </div>
    </div>
  );
}
