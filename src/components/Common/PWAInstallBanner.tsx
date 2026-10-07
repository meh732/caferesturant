import React, { useState, useEffect } from 'react';
import { 
  Download, X, Smartphone, Share2, PlusSquare, Sparkles, 
  Wifi, Zap, ShieldCheck, Check, ChevronLeft, ArrowDown
} from 'lucide-react';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // 1. Check if already installed & running as standalone PWA
    const standaloneCheck = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    if (standaloneCheck) {
      setIsStandalone(true);
      return;
    }

    // 2. Detect Mobile Platform
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(ua);
    const isMobileDevice = isIOSDevice || isAndroidDevice || /mobile|tablet|silk/.test(ua) || window.innerWidth <= 820;

    setIsIOS(isIOSDevice);
    setIsAndroid(isAndroidDevice);

    // 3. Listen for Android Chrome 'beforeinstallprompt'
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Auto-show prompt on Android/Chrome
      const dismissed = localStorage.getItem('arka_pwa_dismissed_until');
      if (!dismissed || Date.now() > Number(dismissed)) {
        setShowModal(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // 4. If on mobile (especially iOS where beforeinstallprompt doesn't fire), show after a pleasant 1.5s delay
    if (isMobileDevice) {
      const dismissed = localStorage.getItem('arka_pwa_dismissed_until');
      if (!dismissed || Date.now() > Number(dismissed)) {
        const timer = setTimeout(() => {
          setShowModal(true);
        }, 1500);
        return () => {
          clearTimeout(timer);
          window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        };
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowModal(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // General instructions for other browsers
      alert('لطفاً از منوی مرورگر خود (سه نقطه در بالا) گزینه «نصب برنامه (Install App)» یا «افزودن به صفحه اصلی» را انتخاب فرمایید.');
    }
  };

  const handleDismiss = (days: number = 3) => {
    setShowModal(false);
    // Remember dismissal for a few days so it's not irritating
    const expireTime = Date.now() + days * 24 * 60 * 60 * 1000;
    localStorage.setItem('arka_pwa_dismissed_until', expireTime.toString());
  };

  if (isStandalone || !showModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-300" dir="rtl">
      
      {/* Bottom Sheet Modal Container */}
      <div 
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-6 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Top Header with App Branding */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white p-5 relative">
          <button
            onClick={() => handleDismiss(1)}
            className="absolute left-4 top-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="بستن"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3.5 pr-1">
            <div className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-md flex items-center justify-center shrink-0">
              <img src="/arka_logo.png" alt="Arka POS" className="w-full h-full object-contain" onError={(e) => {
                (e.currentTarget as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232563eb"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
              }} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold text-white mb-1">
                <Sparkles size={11} className="text-amber-300" />
                <span>نسخه هوشمند وب‌اپلیکیشن (PWA)</span>
              </div>
              <h3 className="text-lg font-black text-white leading-tight">سامانه صندوق و سفارش‌گیر آرکا</h3>
              <p className="text-xs text-blue-100">نصب مستقیم روی گوشی بدون نیاز به دانلود از بازار یا گوگل‌پلی</p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          
          {/* Feature Highlights Badges */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-2xl flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Zap size={15} />
              </div>
              <span className="text-[11px] font-bold text-slate-800">سرعت فوق‌العاده</span>
              <span className="text-[9px] text-slate-400">لود سریع و روان</span>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-2xl flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Wifi size={15} />
              </div>
              <span className="text-[11px] font-bold text-slate-800">کارکرد آفلاین</span>
              <span className="text-[9px] text-slate-400">در شبکه وای‌فای</span>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-2xl flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Smartphone size={15} />
              </div>
              <span className="text-[11px] font-bold text-slate-800">تمام‌صفحه</span>
              <span className="text-[9px] text-slate-400">مشابه اپ بومی</span>
            </div>
          </div>

          {/* iOS Step-by-step Interactive Guide */}
          {isIOS && showIOSGuide ? (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3 animate-in fade-in">
              <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <Share2 size={16} className="text-blue-600" />
                <span>مراحل نصب روی آیفون و آیپد (Safari):</span>
              </h4>

              <div className="space-y-2 text-xs text-slate-700">
                <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۱</span>
                  <span>در پایین صفحه دکمه <strong className="text-blue-600">Share (اشتراک‌گذاری)</strong> <Share2 size={14} className="inline text-blue-600 mx-1" /> را لمس کنید.</span>
                </div>

                <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۲</span>
                  <span>گزینه <strong className="text-slate-900">Add to Home Screen</strong> <PlusSquare size={14} className="inline text-slate-700 mx-1" /> (افزودن به صفحه اصلی) را بزنید.</span>
                </div>

                <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۳</span>
                  <span>در بالای صفحه دکمه <strong className="text-emerald-700">Add (افزودن)</strong> را لمس کنید.</span>
                </div>
              </div>

              <div className="text-center pt-1">
                <span className="text-[11px] text-blue-700 font-bold">آیکون برنامه روی صفحه اصلی گوشی شما قرار گرفت 🎉</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed text-center px-2">
              با نصب نسخه وب‌اپلیکیشن، برنامه بدون کادر مرورگر و مانند یک اپلیکیشن اختصاصی با آیکون اختصاصی روی صفحه گوشی شما قرار می‌گیرد.
            </p>
          )}

          {/* Action CTA Buttons */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleInstallClick}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-[0.99] transition-all cursor-pointer"
            >
              {isIOS && !showIOSGuide ? (
                <>
                  <Share2 size={18} />
                  <span>راهنمای نصب روی آیفون (iOS)</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>نصب مستقیم اپلیکیشن روی گوشی</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between px-2 pt-1">
              <button
                onClick={() => handleDismiss(1)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 py-1 transition-colors cursor-pointer"
              >
                ادامه در مرورگر وب
              </button>

              <button
                onClick={() => handleDismiss(30)}
                className="text-xs text-slate-400 hover:text-slate-600 py-1 transition-colors cursor-pointer"
              >
                دیگر نشان نده
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
