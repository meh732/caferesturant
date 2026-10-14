import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Sparkles, Check, Share2, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export default function TopPWAInstallBar() {
  const { isInstalled, isInstallable, isIOS, isAndroid, promptInstall } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    // Only dismiss for current session if explicitly closed by user
    const dismissedThisSession = sessionStorage.getItem('arka_top_pwa_bar_dismissed');
    if (dismissedThisSession === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // If running in standalone mode (already installed as an app) or dismissed, hide
  if (isInstalled || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    // Dismiss for current browser session
    sessionStorage.setItem('arka_top_pwa_bar_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      if (isInstallable) {
        const outcome = await promptInstall();
        if (outcome === 'accepted') {
          setInstalledSuccess(true);
          setTimeout(() => {
            setIsDismissed(true);
          }, 2500);
        } else {
          // If dismissed or manual needed, open full guided banner
          window.dispatchEvent(new CustomEvent('open-pwa-prompt'));
        }
      } else {
        // iOS Safari or browser without direct prompt -> trigger guided modal
        window.dispatchEvent(new CustomEvent('open-pwa-prompt'));
      }
    } catch (err) {
      console.warn('Install error:', err);
      window.dispatchEvent(new CustomEvent('open-pwa-prompt'));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div 
      className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-3 py-2 sm:px-5 sm:py-2.5 flex items-center justify-between gap-3 shadow-md z-40 border-b border-white/10 shrink-0 animate-in slide-in-from-top duration-300"
      dir="rtl"
    >
      {/* Right side: Icon & Title & Description */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
        <div className="relative shrink-0">
          <img 
            src="/pwa-192x192.png" 
            alt="Arka Logo" 
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-contain bg-white/15 p-1 border border-white/20 shadow-sm"
            onError={(e) => {
              // fallback if image not loaded yet
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-blue-700 animate-pulse" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
              نصب وب‌اپلیکیشن آرکا
            </span>
            <span className="text-[9px] sm:text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded-md font-semibold shrink-0">
              نسخه اختصاصی موبایل (PWA)
            </span>
          </div>
          <p className="text-[10px] sm:text-xs text-blue-100/90 truncate hidden xs:block">
            بدون نیاز به دانلود از بازار/گوگل‌پلی • کارکرد آفلاین و بدون نوار آدرس مرورگر
          </p>
        </div>
      </div>

      {/* Left side: Action Button & Close */}
      <div className="flex items-center gap-2 shrink-0">
        {installedSuccess ? (
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold shadow-xs">
            <Check size={14} />
            <span>نصب شد!</span>
          </span>
        ) : (
          <button
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-white text-blue-900 hover:bg-blue-50 active:scale-95 text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer whitespace-nowrap"
            title="نصب مستقیم وب‌اپلیکیشن"
          >
            {isIOS ? (
              <>
                <Share2 size={15} className="text-blue-700" />
                <span>نصب روی آیفون</span>
              </>
            ) : (
              <>
                <Download size={15} className="text-blue-700" />
                <span>نصب اپلیکیشن</span>
              </>
            )}
          </button>
        )}

        <button
          onClick={handleDismiss}
          className="p-1 sm:p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg active:scale-90 transition-all cursor-pointer"
          title="بستن این نوار"
          aria-label="بستن"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
