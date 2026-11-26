import React, { useState, useEffect } from 'react';
import {
  Download, X, Smartphone, Share2, PlusSquare, Sparkles,
  Wifi, Zap, Check, MoreVertical, HelpCircle, Monitor,
  Copy, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export default function PWAInstallBanner() {
  const {
    isInstalled,
    isInstallable,
    isIOS,
    isAndroid,
    promptInstall
  } = usePWAInstall();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'auto' | 'android' | 'ios' | 'desktop'>('desktop');
  const [installSuccess, setInstallSuccess] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedFlag, setCopiedFlag] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isLocalHttpLan =
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';
  const isSecureContextReady = typeof window !== 'undefined' ? window.isSecureContext : true;

  useEffect(() => {
    // If already running as standalone app, never show the banner
    if (isInstalled) {
      setIsOpen(false);
      return;
    }

    // Determine initial guide tab based on device
    if (isIOS) {
      setActiveTab('ios');
    } else if (isAndroid) {
      setActiveTab('android');
    } else {
      setActiveTab('desktop');
    }

    // Listen for custom trigger to open PWA modal manually (e.g. from Settings or Sidebar)
    const handleCustomOpen = () => {
      setIsOpen(true);
      if (isIOS) setActiveTab('ios');
      else if (isAndroid) setActiveTab('android');
      else setActiveTab('desktop');
    };
    window.addEventListener('open-pwa-prompt', handleCustomOpen);

    // Auto-show prompt if not recently dismissed
    const dismissedUntil = localStorage.getItem('arka_pwa_dismissed_until');
    const isDismissed = dismissedUntil && Date.now() < Number(dismissedUntil);

    if (!isDismissed) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1200);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('open-pwa-prompt', handleCustomOpen);
      };
    }

    return () => {
      window.removeEventListener('open-pwa-prompt', handleCustomOpen);
    };
  }, [isInstalled, isIOS, isAndroid, isInstallable]);

  const handleDismiss = (days: number = 3) => {
    setIsOpen(false);
    const expireTime = Date.now() + days * 24 * 60 * 60 * 1000;
    localStorage.setItem('arka_pwa_dismissed_until', expireTime.toString());
  };

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        setInstallSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
        }, 2000);
      }
    } else {
      if (isIOS) setActiveTab('ios');
      else if (isAndroid) setActiveTab('android');
      else setActiveTab('desktop');
    }
  };

  const handleCopy = (text: string, which: 'origin' | 'flag') => {
    navigator.clipboard?.writeText(text).catch(() => {});
    if (which === 'origin') {
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2000);
    } else {
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2000);
    }
  };

  if (isInstalled || !isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-300"
      dir="rtl"
      onClick={() => handleDismiss(1)}
    >
      {/* Modal Container */}
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[92vh] animate-in slide-in-from-bottom-6 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-600 text-white p-5 relative shrink-0">
          <button
            type="button"
            onClick={() => handleDismiss(1)}
            className="absolute left-4 top-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="بستن"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3.5 pr-1">
            <div className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-md flex items-center justify-center shrink-0">
              <img
                src="/pwa-192x192.png"
                alt="Arka POS"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/arka_logo.png';
                }}
              />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold text-white mb-1">
                <Sparkles size={11} className="text-amber-300" />
                <span>نصب نسخه اپلیکیشن (PWA)</span>
              </div>
              <h3 className="text-lg font-black text-white leading-tight">سامانه صندوق و سفارش‌گیر آرکا</h3>
              <p className="text-xs text-blue-100">اجرای تمام‌صفحه بدون منوی مرورگر + آیکون دسکتاپ</p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {installSuccess ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2 animate-in zoom-in-95">
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <Check size={24} />
              </div>
              <h4 className="text-base font-bold text-emerald-900">برنامه با موفقیت نصب شد!</h4>
              <p className="text-xs text-emerald-700">آیکون آرکا به دستگاه شما افزوده شد و اکنون مثل یک نرم‌افزار مستقل باز می‌شود.</p>
            </div>
          ) : (
            <>
              {/* Feature Highlights */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-2xl flex flex-col items-center gap-1">
                  <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Monitor size={15} />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800">پنجره مستقل</span>
                  <span className="text-[9px] text-slate-400">بدون نوار مرورگر</span>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-2xl flex flex-col items-center gap-1">
                  <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Wifi size={15} />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800">بدون نیاز به اکانت</span>
                  <span className="text-[9px] text-slate-400">حتی بدون ساین‌این کروم</span>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-2xl flex flex-col items-center gap-1">
                  <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Zap size={15} />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800">سرعت فوق‌العاده</span>
                  <span className="text-[9px] text-slate-400">اجرای فوری از دسکتاپ</span>
                </div>
              </div>

              {/* Direct 1-Click Install Button (When browser supports native prompt) */}
              {isInstallable && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-4 text-center space-y-3">
                  <p className="text-xs text-slate-700 font-medium leading-relaxed">
                    مرورگر شما آماده <strong>نصب خودکار با ۱ کلیک</strong> است:
                  </p>
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <Download size={18} />
                    <span>نصب فوری و خودکار برنامه (Install PWA)</span>
                  </button>
                </div>
              )}

              {/* Device Tabs for Step-by-Step Instructions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <HelpCircle size={14} className="text-blue-600" />
                    <span>راهنمای نصب بر اساس دستگاه شما:</span>
                  </span>
                </div>

                {/* Tab Selectors */}
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1 text-xs font-bold text-slate-600">
                  <button
                    type="button"
                    onClick={() => setActiveTab('desktop')}
                    className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      activeTab === 'desktop' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
                    }`}
                  >
                    <Monitor size={13} />
                    <span>ویندوز / مک</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('android')}
                    className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      activeTab === 'android' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
                    }`}
                  >
                    <Smartphone size={13} />
                    <span>اندروید</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ios')}
                    className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      activeTab === 'ios' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
                    }`}
                  >
                    <Share2 size={13} />
                    <span>آیفون (iOS)</span>
                  </button>
                </div>

                {/* Tab Content 1: Desktop (Chrome / Edge) */}
                {activeTab === 'desktop' && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 animate-in fade-in">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-[11px] text-emerald-900 flex items-start gap-2">
                      <ShieldCheck size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">
                        <strong>نصب در کروم نیاز به لاگین یا اکانت گوگل ندارد.</strong> فقط نباید در حالت مهمان (Guest) یا ناشناس (Incognito) باشید.
                      </span>
                    </div>

                    {isLocalHttpLan && !isSecureContextReady && (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2 text-[11px] text-amber-950">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-bold">علت نمایش ندادن آیکون دانلود در نوار آدرس روی شبکه داخلی:</p>
                            <p className="leading-relaxed text-amber-900">
                              چون با آدرس <code className="bg-white px-1 rounded font-mono" dir="ltr">http://</code> و IP شبکه وارد شده‌اید (بدون HTTPS)، کروم آیکون خودکار نوار آدرس را مخفی می‌کند. هر دو روش زیر مشکل را حل می‌کنند:
                            </p>
                          </div>
                        </div>
                        <div className="bg-white/90 rounded-lg p-2 border border-amber-200 space-y-1.5">
                          <div className="font-bold text-slate-800">راه سریع (بدون تغییر سرور):</div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-600">۱. آدرس زیر را در نوار آدرس کروم باز کنید:</span>
                            <button
                              type="button"
                              onClick={() => handleCopy('chrome://flags/#unsafely-treat-insecure-origin-as-secure', 'flag')}
                              className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              {copiedFlag ? <Check size={11} /> : <Copy size={11} />}
                              <span>{copiedFlag ? 'کپی شد' : 'کپی لینک تنظیمات'}</span>
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-600">۲. این آدرس سرور را در کادر آن وارد و Enabled کنید:</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(currentOrigin, 'origin')}
                              className="px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-[10px] flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              {copiedOrigin ? <Check size={11} /> : <Copy size={11} />}
                              <span dir="ltr">{copiedOrigin ? 'کپی شد' : currentOrigin}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 text-xs text-slate-700">
                      <div className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">۱</span>
                        <span className="leading-relaxed">
                          اگر آیکون نصب (مانیتور کوچک کنار ستاره) در نوار آدرس نبود، روی <strong>سه نقطه بالای کروم (⋮)</strong> کلیک کنید.
                        </span>
                      </div>

                      <div className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">۲</span>
                        <span className="leading-relaxed">
                          وارد بخش <strong>Cast, save, and share</strong> (ارسال، ذخیره و اشتراک‌گذاری) شوید و گزینه <strong>Install page as app...</strong> یا <strong>Create shortcut...</strong> را بزنید.
                        </span>
                      </div>

                      <div className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">۳</span>
                        <span className="leading-relaxed">
                          در پنجره بازشده، تیک <strong>Open as window</strong> (باز شدن در پنجره مجزا) را بزنید و روی <strong>Install / Create</strong> کلیک کنید تا آیکون روی دسکتاپ ساخته شود.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab Content 2: Android */}
                {activeTab === 'android' && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 animate-in fade-in">
                    <div className="text-[11px] font-bold text-slate-800 mb-1 flex items-center justify-between">
                      <span>مراحل نصب در اندروید (Chrome / Samsung):</span>
                      <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md font-normal">برای حذف کادر بالای مرورگر</span>
                    </div>

                    <div className="space-y-2 text-xs text-slate-700">
                      <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۱</span>
                        <span>در بالای مرورگر، آیکون <strong>سه نقطه (⋮)</strong> <MoreVertical size={13} className="inline text-slate-700 mx-0.5" /> را لمس کنید.</span>
                      </div>

                      <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۲</span>
                        <span>گزینه <strong>«نصب برنامه (Install App)»</strong> یا <strong>«افزودن به صفحه اصلی»</strong> را انتخاب کنید.</span>
                      </div>

                      <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۳</span>
                        <span>در پنجره باز شده، دکمه <strong>«نصب (Install)»</strong> را بزنید.</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab Content 3: iOS Safari */}
                {activeTab === 'ios' && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 animate-in fade-in">
                    <div className="text-[11px] font-bold text-slate-800 mb-1 flex items-center justify-between">
                      <span>مراحل نصب در آیفون و آیپد (Safari):</span>
                      <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md font-normal">اجرای Native Standalone</span>
                    </div>

                    <div className="space-y-2 text-xs text-slate-700">
                      <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۱</span>
                        <span>در پایین مرورگر سافاری، دکمه <strong>Share</strong> <Share2 size={13} className="inline text-blue-600 mx-0.5" /> را لمس کنید.</span>
                      </div>

                      <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۲</span>
                        <span>گزینه <strong>«Add to Home Screen»</strong> <PlusSquare size={13} className="inline text-slate-700 mx-0.5" /> را بزنید.</span>
                      </div>

                      <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">۳</span>
                        <span>در گوشه بالا دکمه <strong>«Add (افزودن)»</strong> را لمس کنید.</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Action Footer */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleDismiss(1)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 py-1 px-3 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              فعلاً نه، ادامه در مرورگر
            </button>

            <button
              type="button"
              onClick={() => handleDismiss(30)}
              className="text-xs text-slate-400 hover:text-slate-600 py-1 px-2 transition-colors cursor-pointer"
            >
              دیگر نشان نده
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
