import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Smartphone, QrCode, Copy, Check, X, Tablet, Store, Utensils, Download, Globe, Wifi } from 'lucide-react';
import { getNetworkInfo, NetworkInfo } from '../../lib/networkSync';
import { db, AppSettings } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';

interface MobileAppQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileAppQrModal({ isOpen, onClose }: MobileAppQrModalProps) {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [appMode, setAppMode] = useState<'full' | 'waiter' | 'menu'>('full');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getNetworkInfo().then(info => setNetworkInfo(info));
    }
  }, [isOpen]);

  // Compute Base URL for the full mobile web app
  const computeBaseUrl = () => {
    if (settings?.localServerUrl?.trim()) {
      return settings.localServerUrl.trim().replace(/\/$/, '');
    }
    if (networkInfo?.localIps && networkInfo.localIps.length > 0) {
      const ip = networkInfo.localIps[0];
      const port = settings?.localServerPort || networkInfo.port || 3000;
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return window.location.origin + window.location.pathname.replace(/\/$/, '');
      }
      return `http://${ip}:${port}`;
    }
    return window.location.origin + window.location.pathname.replace(/\/$/, '');
  };

  const getTargetUrl = () => {
    const base = computeBaseUrl();
    if (appMode === 'waiter') return `${base}?mode=waiter`;
    if (appMode === 'menu') return `${base}?mode=menu`;
    return base;
  };

  const currentUrl = getTargetUrl();

  useEffect(() => {
    if (isOpen && currentUrl) {
      QRCode.toDataURL(currentUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      }).then(dataUrl => {
        setQrDataUrl(dataUrl);
      }).catch(err => {
        console.error('QR generation error', err);
      });
    }
  }, [isOpen, currentUrl, appMode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white p-6 relative">
          <button 
            onClick={onClose}
            className="absolute left-4 top-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-white shadow-inner">
              <Smartphone size={26} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">اسکن بارکد و اتصال گوشی (PWA)</h2>
              <p className="text-xs text-blue-100 mt-0.5">
                اجرای آنی کل نرم‌افزار روی موبایل و تبلت با قابلیت نصب به عنوان اپلیکیشن
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          
          {/* Mode Selector Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-2xl gap-1">
            <button
              onClick={() => setAppMode('full')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                appMode === 'full' 
                  ? 'bg-white text-blue-600 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Store size={15} />
              <span>کل سامانه (صندوق و مدیریت)</span>
            </button>

            <button
              onClick={() => setAppMode('waiter')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                appMode === 'waiter' 
                  ? 'bg-white text-teal-600 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tablet size={15} />
              <span>سفارش‌گیر گارسون</span>
            </button>

            <button
              onClick={() => setAppMode('menu')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                appMode === 'menu' 
                  ? 'bg-white text-amber-600 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Utensils size={15} />
              <span>منوی دیجیتال</span>
            </button>
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-2xl p-5 relative">
            {qrDataUrl ? (
              <div className="bg-white p-3 rounded-2xl shadow-md border border-slate-100 relative group">
                <img src={qrDataUrl} alt="Mobile App QR Code" className="w-56 h-56 object-contain rounded-lg" />
                <div className="absolute inset-0 flex items-center justify-center bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none">
                  <span className="bg-slate-900/90 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg">
                    با دوربین گوشی اسکن کنید
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-slate-400">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            <div className="mt-4 text-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                <QrCode size={14} />
                <span>با دوربین موبایل (بدون نیاز به نصب برنامه) اسکن کنید</span>
              </span>
            </div>
          </div>

          {/* URL & Copy Bar */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Globe size={14} className="text-blue-600" />
                <span>آدرس مستقیم تحت‌وب (URL):</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">جهت ارسال در ایتا، تلگرام یا مرورگر گوشی</span>
            </label>

            <div className="flex items-center gap-2">
              <input 
                type="text" 
                readOnly 
                value={currentUrl} 
                dir="ltr"
                className="flex-1 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-800 outline-none select-all font-semibold"
              />
              <button
                onClick={handleCopy}
                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
              >
                {copied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
                <span>{copied ? 'کپی شد!' : 'کپی لینک'}</span>
              </button>
            </div>
          </div>

          {/* PWA Install Instructions Guide */}
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 space-y-2.5 text-xs text-slate-700">
            <h4 className="font-bold text-indigo-900 flex items-center gap-1.5">
              <Download size={16} className="text-indigo-600" />
              <span>نحوه نصب نسخه اپلیکیشن روی گوشی (PWA):</span>
            </h4>
            
            <ul className="space-y-1.5 text-[11px] text-slate-600 list-disc list-inside">
              <li>
                <strong className="text-slate-800">گوشی‌های اندروید (Chrome):</strong> روی سه نقطه بالای مرورگر بزنید و گزینه <span className="text-blue-700 font-bold">«نصب برنامه (Install App)»</span> یا «افزودن به صفحه اصلی» را انتخاب کنید.
              </li>
              <li>
                <strong className="text-slate-800">گوشی‌های آیفون (Safari):</strong> دکمه <span className="text-blue-700 font-bold">Share (اشتراک‌گذاری)</span> در پایین صفحه را بزنید و گزینه <span className="text-blue-700 font-bold">«Add to Home Screen»</span> را انتخاب فرمایید.
              </li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-100 p-4 flex justify-between items-center text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Wifi size={14} className="text-emerald-600" />
            <span>گوشی و سرور به یک شبکه وای‌فای مشترک متصل باشند</span>
          </div>
          <button
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition-colors cursor-pointer"
          >
            بستن
          </button>
        </div>

      </div>
    </div>
  );
}
