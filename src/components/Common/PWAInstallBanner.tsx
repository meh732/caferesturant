import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if already in standalone PWA mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if (isStandalone) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show only if not previously dismissed in this session
      const dismissed = sessionStorage.getItem('arka_pwa_dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setIsDismissed(true);
    sessionStorage.setItem('arka_pwa_dismissed', 'true');
  };

  if (!showBanner || isDismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-slate-900/95 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-md animate-in slide-in-from-bottom-5" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-500/30">
            <Smartphone size={22} />
          </div>
          <div>
            <h4 className="font-bold text-sm text-white">نصب نسخه وب‌اپلیکیشن (PWA)</h4>
            <p className="text-xs text-slate-300 mt-0.5">اجرای سریع و بدون اینترنت روی صفحه گوشی</p>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={handleDismiss}
          className="py-1.5 px-3 rounded-xl text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          بعداً
        </button>
        <button
          onClick={handleInstallClick}
          className="py-1.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/25 transition-all cursor-pointer"
        >
          <Download size={14} />
          <span>نصب روی گوشی</span>
        </button>
      </div>
    </div>
  );
}
