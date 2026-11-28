import React, { useState, useEffect } from 'react';
import { Download, X, Check } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export default function TopPWAInstallBar() {
  const { isInstalled, isInstallable, promptInstall } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    const dismissedThisSession = sessionStorage.getItem('arka_top_pwa_bar_dismissed');
    if (dismissedThisSession === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Only show when browser genuinely supports native 1-click install (never show manual explanation bars)
  if (isInstalled || !isInstallable || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('arka_top_pwa_bar_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        setInstalledSuccess(true);
        setTimeout(() => {
          setIsDismissed(true);
        }, 2000);
      }
    } catch (err) {
      console.warn('Install error:', err);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div
      className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-3 py-1.5 sm:px-5 sm:py-2 flex items-center justify-between gap-3 shadow-sm z-40 border-b border-white/10 shrink-0"
      dir="rtl"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <img
          src="/pwa-192x192.png"
          alt="Arka POS"
          className="w-7 h-7 rounded-lg object-contain bg-white/15 p-0.5 border border-white/20 shrink-0"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
        <span className="text-xs sm:text-sm font-bold text-white truncate">
          نصب اپلیکیشن آرکا روی این دستگاه
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {installedSuccess ? (
          <span className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500 text-white text-xs font-bold">
            <Check size={14} />
            <span>نصب شد</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-lg bg-white text-blue-900 hover:bg-blue-50 active:scale-95 text-xs font-bold shadow-xs transition-all cursor-pointer whitespace-nowrap"
          >
            <Download size={14} className="text-blue-700" />
            <span>نصب برنامه</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 text-white/75 hover:text-white hover:bg-white/10 rounded-lg active:scale-90 transition-all cursor-pointer"
          aria-label="بستن"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
