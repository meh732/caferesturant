import React, { useState, useEffect, useRef } from 'react';
import { db, AppSettings } from '../../lib/db';
import { exportDB, importDB } from '../../lib/utils';
import { Save, Download, Upload, Network, Wifi, Globe, HardDrive, Database, Copy, Check, Server } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export default function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  
  const [formData, setFormData] = useState<Partial<AppSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [copiedDbPath, setCopiedDbPath] = useState(false);
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

  const handleSave = async () => {
    if (!settings?.id) return;
    setIsSaving(true);
    await db.settings.update(settings.id, formData);
    setIsSaving(false);
    alert('تنظیمات با موفقیت ذخیره شد.');
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
