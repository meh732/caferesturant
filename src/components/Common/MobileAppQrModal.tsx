import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  Smartphone, QrCode, Copy, Check, X, Tablet, Store, Utensils, 
  Download, Globe, Wifi, Network, RefreshCw, ChevronDown, Save, Server
} from 'lucide-react';
import { getNetworkInfo, NetworkInfo, isLocalhostOrTauri, initLanServer } from '../../lib/networkSync';
import { db, AppSettings } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';

interface MobileAppQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileAppQrModal({ isOpen, onClose }: MobileAppQrModalProps) {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [activeIp, setActiveIp] = useState<string>('');
  const [activePort, setActivePort] = useState<number>(3000);
  const [appMode, setAppMode] = useState<'full' | 'waiter' | 'menu'>('full');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isLoadingIp, setIsLoadingIp] = useState(false);
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  const refreshIp = async () => {
    setIsLoadingIp(true);
    try {
      const portToUse = activePort || settings?.localServerPort || 3000;
      const info = await getNetworkInfo(portToUse);
      setNetworkInfo(info);
      
      const validIps = (info?.localIps || []).filter(
        ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.includes('localhost')
      );

      const savedIp = localStorage.getItem('arka_lan_ip');
      if (savedIp && !activeIp) {
        setActiveIp(savedIp);
      } else if (validIps.length > 0 && !activeIp) {
        setActiveIp(validIps[0]);
      } else if (!activeIp) {
        setActiveIp('192.168.1.100');
      }

      if (settings?.localServerPort) {
        setActivePort(settings.localServerPort);
      }
    } finally {
      setIsLoadingIp(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (settings?.localServerPort) {
        setActivePort(settings.localServerPort);
      }
      refreshIp();
    }
  }, [isOpen, settings]);

  const handleApplyIpAndPort = async (newIp: string, newPort: number) => {
    setActiveIp(newIp);
    setActivePort(newPort);
    localStorage.setItem('arka_lan_ip', newIp);

    if (settings?.id) {
      await db.settings.update(settings.id, {
        localServerPort: newPort
      });
    }

    // Start or restart LAN HTTP server
    await initLanServer(newPort);

    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  // Compute Base URL for the mobile web app with 100% safety against tauri.localhost
  const computeBaseUrl = () => {
    if (settings?.localServerUrl?.trim()) {
      let url = settings.localServerUrl.trim().replace(/\/$/, '');
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `http://${url}`;
      }
      return url;
    }

    const port = activePort || settings?.localServerPort || networkInfo?.port || 3000;
    const validIps = (networkInfo?.localIps || []).filter(
      ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.includes('localhost')
    );
    const ip = activeIp || (validIps.length > 0 ? validIps[0] : '192.168.1.100');

    // In web production domain (non-localhost)
    const hostname = window.location.hostname;
    if (hostname && !isLocalhostOrTauri(hostname) && hostname.includes('.')) {
      return window.location.origin + window.location.pathname.replace(/\/$/, '');
    }

    // Desktop Tauri / Local Network default
    return `http://${ip}:${port}`;
  };

  const getTargetUrl = () => {
    let base = computeBaseUrl();
    // Strict safety check: Never permit tauri.localhost in mobile links
    if (base.includes('tauri.localhost') || base.includes('127.0.0.1') || base.includes('localhost')) {
      const port = activePort || settings?.localServerPort || 3000;
      const ip = activeIp || '192.168.1.100';
      base = `http://${ip}:${port}`;
    }

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

  const validIps = (networkInfo?.localIps || []).filter(
    ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.includes('localhost')
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-4 duration-300">
        
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
                اشتراک‌گذاری در شبکه وای‌فای (Wi-Fi) با IP و پورت اختصاصی
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          
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
              <span>کل سامانه (صندوق)</span>
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

          {/* IP & Port Configuration Card */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Network size={14} className="text-blue-600" />
                <span>تنظیم آی‌پی و پورت شبکه سرور:</span>
              </label>

              <button
                type="button"
                onClick={refreshIp}
                disabled={isLoadingIp}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="تشخیص خودکار آی‌پی سیستم"
              >
                <RefreshCw size={12} className={isLoadingIp ? 'animate-spin' : ''} />
                <span>تشخیص خودکار IP</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <label className="block text-[10px] text-slate-500 mb-1">آدرس آی‌پی سیستم (IP):</label>
                {validIps.length > 1 ? (
                  <select
                    value={activeIp}
                    onChange={(e) => handleApplyIpAndPort(e.target.value, activePort)}
                    dir="ltr"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-500"
                  >
                    {validIps.map(ip => (
                      <option key={ip} value={ip}>{ip}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={activeIp}
                    onChange={(e) => handleApplyIpAndPort(e.target.value, activePort)}
                    placeholder="مثال: 192.168.1.50"
                    dir="ltr"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 mb-1">پورت (Port):</label>
                <input
                  type="number"
                  value={activePort}
                  onChange={(e) => handleApplyIpAndPort(activeIp, Number(e.target.value) || 3000)}
                  placeholder="3000"
                  dir="ltr"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-500 text-center"
                />
              </div>
            </div>

            {isSavedNotice && (
              <div className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                <Check size={12} />
                <span>آی‌پی و پورت با موفقیت اعمال شد و بارکد بروز گردید.</span>
              </div>
            )}
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-2xl p-4 relative">
            {qrDataUrl ? (
              <div className="bg-white p-3 rounded-2xl shadow-md border border-slate-100 relative group">
                <img src={qrDataUrl} alt="Mobile App QR Code" className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-lg" />
                <div className="absolute inset-0 flex items-center justify-center bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none">
                  <span className="bg-slate-900/90 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg">
                    با دوربین گوشی اسکن کنید
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-slate-400">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            <div className="mt-3 text-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                <QrCode size={14} />
                <span>با دوربین موبایل (بدون نیاز به نصب برنامه) اسکن کنید</span>
              </span>
            </div>
          </div>

          {/* URL & Copy Bar */}
          <div className="space-y-1.5">
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
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3.5 space-y-2 text-xs text-slate-700">
            <h4 className="font-bold text-indigo-900 flex items-center gap-1.5">
              <Download size={15} className="text-indigo-600" />
              <span>نحوه نصب نسخه اپلیکیشن روی گوشی (PWA):</span>
            </h4>
            
            <ul className="space-y-1 text-[11px] text-slate-600 list-disc list-inside">
              <li>
                <strong className="text-slate-800">گوشی‌های اندروید (Chrome):</strong> روی سه نقطه بالای مرورگر بزنید و گزینه <span className="text-blue-700 font-bold">«نصب برنامه (Install App)»</span> را انتخاب کنید.
              </li>
              <li>
                <strong className="text-slate-800">گوشی‌های آیفون (Safari):</strong> دکمه <span className="text-blue-700 font-bold">Share</span> در پایین صفحه را بزنید و گزینه <span className="text-blue-700 font-bold">«Add to Home Screen»</span> را انتخاب کنید.
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
