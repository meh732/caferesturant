import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Key, Copy, Check, Server, Lock, AlertTriangle, RefreshCw, Share2, Globe } from 'lucide-react';
import {
  fetchUnifiedLicenseStatus,
  activateUnifiedServerLicense,
  UnifiedLicenseStatus
} from '../../lib/serverSync';

interface ServerLicenseModalProps {
  onActivated?: () => void;
}

export const ServerLicenseModal: React.FC<ServerLicenseModalProps> = ({ onActivated }) => {
  const [licenseStatus, setLicenseStatus] = useState<UnifiedLicenseStatus | null>(null);
  const [isCheckingInitial, setIsCheckingInitial] = useState(true);
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchLicenseStatus = async () => {
    try {
      const status = await fetchUnifiedLicenseStatus();
      setLicenseStatus(status);
      if (status.isActivated && onActivated) {
        onActivated();
      }
    } catch (e) {
      console.warn('Error fetching unified license status:', e);
    } finally {
      setIsCheckingInitial(false);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
    const handleLicenseUpdate = () => {
      fetchLicenseStatus();
    };
    window.addEventListener('arka_license_updated', handleLicenseUpdate);
    return () => window.removeEventListener('arka_license_updated', handleLicenseUpdate);
  }, []);

  const handleCopyMachineId = () => {
    if (licenseStatus?.machineId) {
      navigator.clipboard.writeText(licenseStatus.machineId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareWhatsApp = () => {
    if (!licenseStatus?.machineId) return;
    const currentHost = typeof window !== 'undefined' ? window.location.host : '';
    const msg = encodeURIComponent(`سلام و احترام،\nشناسه سخت‌افزاری سرور نرم‌افزار آرکا برای سرور (${currentHost}):\n${licenseStatus.machineId}\nلطفاً کلید فعال‌سازی دائم را از فایل keygen.html برای من ارسال فرمایید.`);
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = activationKeyInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!cleanKey) {
      setErrorMessage('لطفاً کد فعال‌سازی را وارد فرمایید.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await activateUnifiedServerLicense(cleanKey);

      if (res.success) {
        setSuccessMessage(res.message || 'سرور آرکا با موفقیت فعال‌سازی گردید!');
        if (res.status) {
          setLicenseStatus(res.status);
        } else {
          setLicenseStatus(prev => prev ? { ...prev, isActivated: true, activatedAt: new Date().toISOString() } : null);
        }
        window.dispatchEvent(new CustomEvent('arka_license_updated'));
        setTimeout(() => {
          if (onActivated) onActivated();
        }, 900);
      } else {
        setErrorMessage(res.message || 'کد فعال‌سازی نامعتبر است. لطفاً با پشتیبانی هماهنگ فرمایید.');
      }
    } catch (err: any) {
      setErrorMessage(`خطا در اعتبارسنجی لایسنس: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Initial Loading Screen - prevents flash and blocks view while checking status
  if (isCheckingInitial) {
    return (
      <div className="fixed inset-0 z-[99999] bg-slate-950 flex flex-col items-center justify-center p-4 text-white" dir="rtl">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-xl">
            <RefreshCw size={28} className="animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold">سامانه اتوماسیون جامع آرکا</h3>
            <p className="text-xs text-slate-400">در حال بررسی قفل سخت‌افزاری و وضعیت لایسنس سرور...</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. If the server is already activated, do NOT show the modal at all!
  // That IP/domain or desktop app is fully active and permanently unlocked for everyone.
  if (licenseStatus?.isActivated) {
    return null;
  }

  const currentHost = typeof window !== 'undefined' ? (window.location.host || window.location.hostname) : 'این سرور';

  // 3. Server is NOT activated: Render full-screen mandatory hardware activation screen
  // Allows activating directly from Web (IP / Domain), Desktop Tauri, or Mobile browser!
  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-inner">
                <Lock size={24} />
              </div>
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span>قفل و فعال‌سازی سرور آرکا</span>
                  <span className="text-[10px] bg-red-500 text-white font-bold px-2 py-0.5 rounded-full">
                    نیازمند فعال‌سازی اولیه
                  </span>
                </h2>
                <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5 font-mono" dir="ltr">
                  <Globe size={13} className="text-indigo-400 shrink-0" />
                  <span>{currentHost}</span>
                </p>
              </div>
            </div>

            <button
              onClick={fetchLicenseStatus}
              title="بررسی مجدد وضعیت سرور"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs leading-relaxed flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-1">راهنمای راه‌اندازی سرور آرکا:</p>
              <p className="text-amber-800">
                این سرور (با آدرس فوق) هنوز فعال‌سازی نشده است. لطفاً شناسه سخت‌افزاری سرور زیر را به فروشنده ارائه دهید تا کلید فعال‌سازی دائم صادر شود. پس از ثبت کلید در کادر زیر، این سرور به طور دائم فعال شده و دیگر روی این آدرس/دامنه از هیچ کاربری کد فعال‌سازی نخواهد خواست.
              </p>
            </div>
          </div>

          {/* Machine ID Box */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Server size={14} className="text-blue-600" />
              <span>شناسه سخت‌افزاری اختصاصی سرور (Server Machine ID):</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-900 text-emerald-400 font-mono text-center font-bold py-3 px-4 rounded-xl text-sm sm:text-base tracking-wider border border-slate-700 select-all" dir="ltr">
                {licenseStatus?.machineId || 'در حال دریافت شناسه از سرور...'}
              </div>
              <button
                type="button"
                onClick={handleCopyMachineId}
                className="py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
              >
                {copied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
                <span>{copied ? 'کپی شد!' : 'کپی شناسه'}</span>
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              <span>شناسه بالا را به واحد پشتیبانی ارسال فرمایید تا کد فعال‌سازی دائم صادر گردد.</span>
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Share2 size={12} />
                <span>ارسال در واتساپ</span>
              </button>
            </div>
          </div>

          {/* Activation Key Input Form */}
          <form onSubmit={handleActivate} className="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Key size={14} className="text-emerald-600" />
                <span>کد فعال‌سازی دریافتی از فروشنده (Activation Key):</span>
              </label>
              <input
                type="text"
                value={activationKeyInput}
                onChange={(e) => setActivationKeyInput(e.target.value.toUpperCase())}
                placeholder="ARKA-KEY-XXXX-XXXX-XXXX-XXXX"
                dir="ltr"
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 font-mono text-center text-sm font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 uppercase tracking-widest"
              />
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                <ShieldAlert size={16} className="text-red-500 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !activationKeyInput.trim()}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>در حال اعتبارسنجی و ثبت دائم در سرور...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>فعال‌سازی دائم سرور و اتصال</span>
                </>
              )}
            </button>

            {typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || window.location.protocol.startsWith('tauri') || window.location.hostname === 'tauri.localhost') && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-tauri-mode-modal'))}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 border border-slate-200 transition-all cursor-pointer"
              >
                <Globe size={15} className="text-indigo-600" />
                <span>این کامپیوتر کلاینت است؟ اتصال به آدرس سرور اصلی در شبکه (بدون نیاز به لایسنس)</span>
              </button>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>واحد فروش و پشتیبانی نرم‌افزار آرکا: ۰۹۱۹۳۳۵۱۳۶۵</span>
          <span className="font-mono">Arka POS Enterprise v1.2.4</span>
        </div>
      </div>
    </div>
  );
};
