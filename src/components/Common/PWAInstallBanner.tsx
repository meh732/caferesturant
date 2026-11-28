import React, { useState, useEffect } from 'react';
import { X, Share2, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

/**
 * Lightweight iOS-only fallback sheet triggered ONLY when explicitly requested on iOS Safari
 * (since iOS Safari does not expose beforeinstallprompt or an address-bar install icon).
 * On Desktop/Android Chrome, native install (omnibox icon + 1-click promptInstall) is used directly
 * with zero explanation popups.
 */
export default function PWAInstallBanner() {
  const { isInstalled, isInstallable, isIOS, promptInstall } = usePWAInstall();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isInstalled) {
      setIsOpen(false);
      return;
    }

    const handleCustomOpen = async () => {
      if (isInstallable) {
        await promptInstall();
        return;
      }
      if (isIOS) {
        setIsOpen(true);
      }
    };

    window.addEventListener('open-pwa-prompt', handleCustomOpen);
    return () => {
      window.removeEventListener('open-pwa-prompt', handleCustomOpen);
    };
  }, [isInstalled, isInstallable, isIOS, promptInstall]);

  if (isInstalled || !isIOS || !isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      dir="rtl"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-blue-700 to-indigo-600 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/pwa-192x192.png"
              alt="Arka POS"
              className="w-9 h-9 rounded-xl bg-white p-1 object-contain"
            />
            <div>
              <h3 className="text-sm font-black">افزودن آرکا به صفحه اصلی آیفون</h3>
              <p className="text-[11px] text-blue-100">نصب نسخه وب‌اپلیکیشن در Safari</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center cursor-pointer"
            aria-label="بستن"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-2.5 text-xs text-slate-700">
          <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200/70">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۱</span>
            <span>دکمه <strong>Share</strong> <Share2 size={13} className="inline text-blue-600 mx-0.5" /> را در پایین مرورگر سافاری بزنید.</span>
          </div>
          <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200/70">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۲</span>
            <span>گزینه <strong>Add to Home Screen</strong> <PlusSquare size={13} className="inline text-slate-700 mx-0.5" /> و سپس <strong>Add</strong> را انتخاب کنید.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
