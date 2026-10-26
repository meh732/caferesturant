import React, { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, Key, Copy, Check, Server, Lock, AlertTriangle, RefreshCw } from 'lucide-react';

interface ServerLicenseModalProps {
  onActivated?: () => void;
}

export const ServerLicenseModal: React.FC<ServerLicenseModalProps> = ({ onActivated }) => {
  const [licenseStatus, setLicenseStatus] = useState<{
    isActivated: boolean;
    machineId: string;
    activatedAt: string | null;
  } | null>(null);
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchLicenseStatus = async () => {
    try {
      const res = await fetch('/api/license/status');
      if (res.ok) {
        const data = await res.json();
        setLicenseStatus(data);
        if (data.isActivated && onActivated) {
          onActivated();
        }
      }
    } catch (e) {
      // In purely offline mock/preview without server.js, don't block dev preview
      console.warn('Could not connect to /api/license/status:', e);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
  }, []);

  const handleCopyMachineId = () => {
    if (licenseStatus?.machineId) {
      navigator.clipboard.writeText(licenseStatus.machineId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = activationKeyInput.trim().toUpperCase();
    if (!cleanKey) {
      setErrorMessage('لطفاً کد فعال‌سازی را وارد فرمایید.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: cleanKey })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMessage('سرور آرکا با موفقیت فعال‌سازی گردید!');
        setLicenseStatus(prev => prev ? { ...prev, isActivated: true, activatedAt: new Date().toISOString() } : null);
        setTimeout(() => {
          if (onActivated) onActivated();
        }, 1200);
      } else {
        setErrorMessage(data.message || 'کد فعال‌سازی نامعتبر است. لطفاً با پشتیبانی هماهنگ فرمایید.');
      }
    } catch (err: any) {
      setErrorMessage(`خطا در ارتباط با سرور: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // If already activated or status not yet retrieved, don't show the blocking modal
  if (!licenseStatus || licenseStatus.isActivated) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
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
                  <span>قفل سخت‌افزاری سرور آرکا</span>
                  <span className="text-[10px] bg-red-500 text-white font-bold px-2 py-0.5 rounded-full">
                    نیازمند فعال‌سازی
                  </span>
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  فعال‌سازی آفلاین و اتصال انحصاری به سخت‌افزار این رایانه
                </p>
              </div>
            </div>

            <button
              onClick={fetchLicenseStatus}
              title="بررسی مجدد"
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
              <p className="font-bold mb-1">توجه مهم به مدیر سیستم:</p>
              <p className="text-amber-800">
                این نرم‌افزار به صورت انحصاری به قطعات سخت‌افزاری (مادربورد، پردازنده و دیسک) این کامپیوتر سرور قفل گردیده و امکان کپی کردن یا راه‌اندازی سرور روی رایانه‌های دیگر وجود ندارد.
              </p>
            </div>
          </div>

          {/* Machine ID Box */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Server size={14} className="text-blue-600" />
              <span>کد شناسه سخت‌افزاری این سرور (Machine Code):</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-900 text-emerald-400 font-mono text-center font-bold py-3 px-4 rounded-xl text-base tracking-wider border border-slate-700 select-all" dir="ltr">
                {licenseStatus.machineId}
              </div>
              <button
                type="button"
                onClick={handleCopyMachineId}
                className="py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
              >
                {copied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
                <span>{copied ? 'کپی شد!' : 'کپی کد'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              کد بالا را کپی کرده و به واحد پشتیبانی آرکا سیستم ارسال فرمایید تا کد فعال‌سازی اختصاصی این رایانه برای شما صادر گردد.
            </p>
          </div>

          {/* Activation Key Input Form */}
          <form onSubmit={handleActivate} className="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Key size={14} className="text-emerald-600" />
                <span>کد فعال‌سازی اختصاصی (Activation Key):</span>
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
                  <span>در حال اعتبارسنجی سخت‌افزار...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>فعال‌سازی قطعی و اتصال به سخت‌افزار</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>واحد فروش و پشتیبانی: ۰۹۱۹۳۳۵۱۳۶۵</span>
          <span className="font-mono">Arka POS Enterprise v1.2.4</span>
        </div>
      </div>
    </div>
  );
};
