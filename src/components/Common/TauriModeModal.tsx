import React, { useState, useEffect } from 'react';
import { Server, Laptop, ShieldCheck, Lock, Wifi, Check, AlertCircle, RefreshCw, X, ChevronRight, Globe, ArrowRight } from 'lucide-react';
import { db } from '../../lib/db';
import { getAppExecutionMode, setAppExecutionMode, getServerBaseUrl, initialTwoWaySync } from '../../lib/serverSync';
import { initLanServer } from '../../lib/networkSync';

interface TauriModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  forceRequired?: boolean;
}

export const TauriModeModal: React.FC<TauriModeModalProps> = ({ isOpen, onClose, forceRequired = false }) => {
  const [selectedRole, setSelectedRole] = useState<'server' | 'client' | null>(null);
  const [serverPassword, setServerPassword] = useState('');
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{ success: boolean; message: string; ms?: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const currentMode = getAppExecutionMode();
  const currentBaseUrl = getServerBaseUrl();

  useEffect(() => {
    if (isOpen) {
      const mode = getAppExecutionMode();
      setSelectedRole(mode === 'standalone' ? null : mode);
      setServerUrlInput(getServerBaseUrl() || 'http://192.168.1.100:3000');
      setServerPassword('');
      setPingResult(null);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestServerConnection = async () => {
    let url = serverUrlInput.trim().replace(/\/+$/, '');
    if (!url) {
      setPingResult({ success: false, message: 'لطفاً آدرس سرور را وارد فرمایید.' });
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }

    setIsTestingPing(true);
    setPingResult(null);
    setErrorMessage(null);

    const startTime = performance.now();
    try {
      // Ping server license or version endpoint
      const res = await fetch(`${url}/api/license/status`, {
        signal: AbortSignal.timeout(4000)
      }).catch(async () => {
        return await fetch(`${url}/api/db/version`, {
          signal: AbortSignal.timeout(4000)
        });
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (res && res.ok) {
        setPingResult({
          success: true,
          message: `ارتباط با سرور برقرار شد! زمان پاسخ: ${latencyMs} میلی‌ثانیه`,
          ms: latencyMs
        });
      } else {
        setPingResult({
          success: false,
          message: `سرور پاسخ داد اما وضعیت نامعتبر بود (کد: ${res?.status || 'نامشخص'}).`
        });
      }
    } catch (err: any) {
      setPingResult({
        success: false,
        message: 'ارتباط برقرار نشد. لطفاً مطمئن شوید سرور روشن است و آدرس IP و پورت صحیح است.'
      });
    } finally {
      setIsTestingPing(false);
    }
  };

  const handleConfirmServerMode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = serverPassword.trim();
    if (!cleanPass) {
      setErrorMessage('لطفاً رمز عبور راه‌اندازی سرور را وارد فرمایید.');
      return;
    }

    setIsApplying(true);
    setErrorMessage(null);

    try {
      // Validate password: Master admin passwords OR match against existing admin users in database
      const adminUsers = await db.users.filter(u => u.role === 'admin').toArray();
      const validPasswords = ['arka1234', '123456', 'arka@2026', ...adminUsers.map(u => u.password)];

      const isMatch = validPasswords.includes(cleanPass);

      if (!isMatch) {
        setErrorMessage('رمز عبور وارد شده اشتباه است. لطفاً رمز عبور مدیر سیستم را وارد فرمایید.');
        setIsApplying(false);
        return;
      }

      // Success: Save Server Mode
      setAppExecutionMode('server');
      await initLanServer(3000).catch(() => {});

      setSuccessMessage('حالت «سرور مرکزی» با موفقیت فعال شد!');
      setTimeout(() => {
        setIsApplying(false);
        onClose();
        window.location.reload();
      }, 1000);
    } catch (e: any) {
      setErrorMessage(`خطا در ذخیره حالت سرور: ${e.message || e}`);
      setIsApplying(false);
    }
  };

  const handleConfirmClientMode = async (e: React.FormEvent) => {
    e.preventDefault();
    let url = serverUrlInput.trim().replace(/\/+$/, '');
    if (!url) {
      setErrorMessage('لطفاً آدرس سرور مرکزی را وارد فرمایید.');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }

    setIsApplying(true);
    setErrorMessage(null);

    try {
      // Set Client Mode
      setAppExecutionMode('client', url);

      setSuccessMessage('حالت «کلاینت متصل به سرور» با موفقیت ثبت شد!');
      // Initial two-way pull from remote server
      await initialTwoWaySync().catch(() => {});

      setTimeout(() => {
        setIsApplying(false);
        onClose();
        window.location.reload();
      }, 1000);
    } catch (e: any) {
      setErrorMessage(`خطا در ثبت آدرس سرور: ${e.message || e}`);
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white relative flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <Server size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                انتخاب حالت اجرای سیستم آرکا در ویندوز
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                تعیین نقش این رایانه به عنوان سرور مرکزی یا صندوق فرعی (کلاینت)
              </p>
            </div>
          </div>

          {!forceRequired && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">

          {/* Current Mode Badge if configured */}
          {currentMode !== 'standalone' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-bold text-slate-700">
              <span>حالت فعلی این سیستم:</span>
              <span className={`px-2.5 py-1 rounded-lg ${currentMode === 'server' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                {currentMode === 'server' ? '🏢 سرور اصلی پایگاه داده' : `💻 کلاینت متصل به (${currentBaseUrl || 'سرور مرکزی'})`}
              </span>
            </div>
          )}

          {/* Step 1: Mode Selection Cards */}
          {!selectedRole && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-700">
                لطفاً نحوه استفاده از این رایانه را مشخص نمایید:
              </p>

              {/* Card 1: Server Mode */}
              <button
                type="button"
                onClick={() => setSelectedRole('server')}
                className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-indigo-600 bg-white hover:bg-indigo-50/30 transition-all text-right flex items-center justify-between gap-4 group cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Server size={24} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-900">
                      🏢 حالت سرور اصلی (Server Mode)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      این رایانه به عنوان سرور مرکزی تعریف می‌شود و دیتابیس اصلی روی آن نگهداری خواهد شد.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-indigo-600">
                  <Lock size={14} />
                  <span>نیازمند رمز</span>
                  <ChevronRight size={16} />
                </div>
              </button>

              {/* Card 2: Client Mode */}
              <button
                type="button"
                onClick={() => setSelectedRole('client')}
                className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-600 bg-white hover:bg-blue-50/30 transition-all text-right flex items-center justify-between gap-4 group cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Laptop size={24} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 group-hover:text-blue-900">
                      💻 حالت صندوق فرعی / کلاینت شبکه (Client Mode)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      این سیستم به عنوان صندوق شماره ۲ یا کلاینت به سرور اصلی متصل شده و اطلاعات را زنده دریافت می‌کند.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-blue-600">
                  <Wifi size={14} />
                  <span>آدرس سرور</span>
                  <ChevronRight size={16} />
                </div>
              </button>
            </div>
          )}

          {/* Step 2A: Server Mode Password Form */}
          {selectedRole === 'server' && (
            <form onSubmit={handleConfirmServerMode} className="space-y-4 animate-in fade-in">
              <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-center gap-2">
                <Lock size={16} className="text-indigo-600 shrink-0" />
                <span>جهت راه‌اندازی این کامپیوتر به عنوان <b>سرور اصلی</b>، رمز عبور مدیریت را وارد فرمایید:</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رمز عبور مدیریت سیستم:
                </label>
                <input
                  type="password"
                  value={serverPassword}
                  onChange={(e) => setServerPassword(e.target.value)}
                  placeholder="رمز عبور مدیر (پیش‌فرض: arka1234)"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-slate-900 outline-none"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  رمز عبور پیش‌فرض مدیر: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">arka1234</code> یا رمز ادمین شما در سیستم
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <Check size={16} className="text-emerald-600 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRole(null)}
                  className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer transition-all"
                >
                  بازگشت
                </button>
                <button
                  type="submit"
                  disabled={isApplying || !serverPassword.trim()}
                  className="flex-1 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
                >
                  {isApplying ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={16} />}
                  <span>تایید و راه‌اندازی سرور اصلی</span>
                </button>
              </div>
            </form>
          )}

          {/* Step 2B: Client Mode Server URL Form */}
          {selectedRole === 'client' && (
            <form onSubmit={handleConfirmClientMode} className="space-y-4 animate-in fade-in">
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
                <Globe size={16} className="text-blue-600 shrink-0" />
                <span>لطفاً آدرس IP یا دامنه سرور مرکزی کافه/رستوران را وارد فرمایید:</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>آدرس کامل سرور مرکزی (IP:Port):</span>
                  <span className="text-[11px] text-slate-400 font-normal">مثال: 192.168.1.100:3000</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    placeholder="http://192.168.1.100:3000"
                    dir="ltr"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-sm font-bold text-slate-900 outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleTestServerConnection}
                    disabled={isTestingPing || !serverUrlInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-all"
                  >
                    {isTestingPing ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
                    <span>تست اتصال</span>
                  </button>
                </div>
              </div>

              {pingResult && (
                <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 animate-in fade-in ${
                  pingResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {pingResult.success ? <Check size={16} className="text-emerald-600 shrink-0" /> : <AlertCircle size={16} className="text-rose-600 shrink-0" />}
                  <span>{pingResult.message}</span>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <Check size={16} className="text-emerald-600 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRole(null)}
                  className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer transition-all"
                >
                  بازگشت
                </button>
                <button
                  type="submit"
                  disabled={isApplying || !serverUrlInput.trim()}
                  className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
                >
                  {isApplying ? <RefreshCw size={14} className="animate-spin" /> : <Check size={16} />}
                  <span>اتصال به سرور و راه‌اندازی کلاینت</span>
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>سیستم صندوقداری و مدیریت رستوران آرکا</span>
          <span className="font-mono">v1.2.4</span>
        </div>
      </div>
    </div>
  );
};
