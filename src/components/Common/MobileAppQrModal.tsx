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
        ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.startsWith('169.254.') && !ip.startsWith('192.168.56.') && !ip.includes('localhost')
      );

      const savedIp = localStorage.getItem('arka_lan_ip');
      if (validIps.length > 0) {
        const chosenIp = (savedIp && validIps.includes(savedIp) && !savedIp.startsWith('192.168.56.')) ? savedIp : validIps[0];
        setActiveIp(chosenIp);
        localStorage.setItem('arka_lan_ip', chosenIp);
      } else if (savedIp && savedIp !== '192.168.1.100' && !savedIp.startsWith('192.168.56.')) {
        setActiveIp(savedIp);
      } else {
        setActiveIp('192.168.1.100');
      }

      initLanServer(portToUse).catch(() => {});

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

    await initLanServer(newPort);

    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

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
      ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.startsWith('169.254.') && !ip.startsWith('192.168.56.') && !ip.includes('localhost')
    );
    const chosenIp = activeIp && activeIp !== '127.0.0.1' ? activeIp : (validIps[0] || '192.168.1.100');

    const hostname = window.location.hostname;
    const isLocalTauri = isLocalhostOrTauri() || hostname === 'tauri.localhost' || hostname === 'localhost' || hostname.startsWith('127.');

    if (!isLocalTauri && hostname && !hostname.startsWith('192.168.56.')) {
      return `${window.location.protocol}//${window.location.host}`;
    }

    return `http://${chosenIp}:${port}`;
  };

  const currentUrl = (() => {
    const base = computeBaseUrl();
    if (appMode === 'waiter') {
      return `${base}/?mode=waiter`;
    } else if (appMode === 'menu') {
      return `${base}/?mode=menu`;
    }
    return base;
  })();

  useEffect(() => {
    if (!isOpen) return;
    QRCode.toDataURL(currentUrl, {
      width: 320,
      margin: 1.5,
      color: {
        dark: '#1d1d1f',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error(err));
  }, [currentUrl, isOpen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const validIps = (networkInfo?.localIps || []).filter(
    ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.startsWith('169.254.') && !ip.startsWith('192.168.56.') && !ip.includes('localhost')
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-md animate-in fade-in font-sans" dir="rtl">
      <div className="bg-white/95 backdrop-blur-2xl rounded-3xl max-w-lg w-full shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header (Apple Translucent Header) */}
        <div className="p-4 px-6 border-b border-black/[0.04] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center shadow-xs">
              <Smartphone size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-neutral-900 tracking-tight">نصب اپلیکیشن روی گوشی و تبلت</h3>
              <p className="text-[11px] text-neutral-500 font-normal">استفاده همزمان چند صندوق‌دار و گارسون بدون نیاز به نصب</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-black/[0.04] transition-all cursor-pointer active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 scrollbar-none">
          
          {/* Cupertino Segmented Mode Selector */}
          <div className="flex p-1 bg-black/[0.05] rounded-2xl gap-1 border border-black/[0.04]">
            <button
              onClick={() => setAppMode('full')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                appMode === 'full' 
                  ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]' 
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Store size={14} className={appMode === 'full' ? 'text-[#007AFF]' : ''} />
              <span>کل سامانه (صندوق)</span>
            </button>

            <button
              onClick={() => setAppMode('waiter')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                appMode === 'waiter' 
                  ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]' 
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Tablet size={14} className={appMode === 'waiter' ? 'text-[#30B0C7]' : ''} />
              <span>سفارش‌گیر گارسون</span>
            </button>

            <button
              onClick={() => setAppMode('menu')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                appMode === 'menu' 
                  ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]' 
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Utensils size={14} className={appMode === 'menu' ? 'text-[#FF9500]' : ''} />
              <span>منوی دیجیتال</span>
            </button>
          </div>

          {/* IP & Port Configuration Card */}
          <div className="bg-neutral-50/70 p-3.5 rounded-2xl border border-black/[0.04] space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                <Network size={13} className="text-[#007AFF]" />
                <span>تنظیم آی‌پی و پورت شبکه سرور:</span>
              </label>

              <button
                type="button"
                onClick={refreshIp}
                disabled={isLoadingIp}
                className="text-[11px] text-[#007AFF] hover:text-[#0062cc] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 active:scale-95"
                title="تشخیص خودکار آی‌پی سیستم"
              >
                <RefreshCw size={11} className={isLoadingIp ? 'animate-spin' : ''} />
                <span>تشخیص خودکار IP</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <label className="block text-[10px] text-neutral-400 mb-1">آدرس آی‌پی سیستم (IP):</label>
                {validIps.length > 1 ? (
                  <select
                    value={activeIp}
                    onChange={(e) => handleApplyIpAndPort(e.target.value, activePort)}
                    dir="ltr"
                    className="w-full bg-white border border-black/[0.08] rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-neutral-900 outline-none focus:border-[#007AFF]"
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
                    placeholder="192.168.1.50"
                    dir="ltr"
                    className="w-full bg-white border border-black/[0.08] rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-neutral-900 outline-none focus:border-[#007AFF]"
                  />
                )}
              </div>

              <div>
                <label className="block text-[10px] text-neutral-400 mb-1">پورت (Port):</label>
                <input
                  type="number"
                  value={activePort}
                  onChange={(e) => handleApplyIpAndPort(activeIp, Number(e.target.value) || 3000)}
                  placeholder="3000"
                  dir="ltr"
                  className="w-full bg-white border border-black/[0.08] rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-neutral-900 outline-none focus:border-[#007AFF] text-center"
                />
              </div>
            </div>

            {isSavedNotice && (
              <div className="text-[10px] font-bold text-[#34C759] flex items-center gap-1">
                <Check size={11} />
                <span>آی‌پی و پورت با موفقیت اعمال شد و بارکد بروز گردید.</span>
              </div>
            )}
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center bg-neutral-50/70 border border-black/[0.04] rounded-3xl p-4 relative">
            {qrDataUrl ? (
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-black/[0.06] relative group">
                <img src={qrDataUrl} alt="Mobile App QR Code" className="w-44 h-44 sm:w-48 sm:h-48 object-contain rounded-xl" />
              </div>
            ) : (
              <div className="w-44 h-44 flex items-center justify-center text-neutral-400">
                <div className="w-7 h-7 border-3 border-[#007AFF] border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            <div className="mt-3 text-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#007AFF]/10 text-[#007AFF] text-xs font-semibold">
                <QrCode size={13} />
                <span>با دوربین موبایل (بدون نیاز به نصب) اسکن کنید</span>
              </span>
            </div>
          </div>

          {/* URL & Copy Bar */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-neutral-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Globe size={13} className="text-[#007AFF]" />
                <span>آدرس مستقیم تحت‌وب (URL):</span>
              </span>
              <span className="text-[10px] text-neutral-400 font-normal">جهت ارسال در پیام‌رسان‌ها</span>
            </label>

            <div className="flex items-center gap-2">
              <input 
                type="text" 
                readOnly 
                value={currentUrl} 
                dir="ltr"
                className="flex-1 bg-black/[0.03] border border-black/[0.08] rounded-xl px-3 py-2 text-xs font-mono text-neutral-800 outline-none select-all font-semibold"
              />
              <button
                onClick={handleCopy}
                className="py-2 px-3.5 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white font-semibold text-xs flex items-center gap-1.5 shadow-[0_2px_8px_rgba(0,122,255,0.25)] transition-all cursor-pointer shrink-0 active:scale-95"
              >
                {copied ? <Check size={14} className="text-white" /> : <Copy size={14} />}
                <span>{copied ? 'کپی شد!' : 'کپی لینک'}</span>
              </button>
            </div>
          </div>

          {/* PWA Install Instructions Guide */}
          <div className="bg-[#007AFF]/5 border border-[#007AFF]/15 rounded-2xl p-3.5 space-y-1.5 text-xs text-neutral-700">
            <h4 className="font-semibold text-neutral-900 flex items-center gap-1.5">
              <Download size={13} className="text-[#007AFF]" />
              <span>نحوه نصب نسخه اپلیکیشن روی گوشی (PWA):</span>
            </h4>
            
            <ul className="space-y-1 text-[11px] text-neutral-600 list-disc list-inside font-normal">
              <li>
                <strong className="text-neutral-800">گوشی‌های اندروید (Chrome):</strong> روی سه نقطه بالای مرورگر بزنید و گزینه <span className="text-[#007AFF] font-semibold">«نصب برنامه (Install App)»</span> را انتخاب کنید.
              </li>
              <li>
                <strong className="text-neutral-800">گوشی‌های آیفون (Safari):</strong> دکمه <span className="text-[#007AFF] font-semibold">Share</span> در پایین صفحه را بزنید و گزینه <span className="text-[#007AFF] font-semibold">«Add to Home Screen»</span> را انتخاب کنید.
              </li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-neutral-50/70 border-t border-black/[0.04] p-3 px-6 flex justify-between items-center text-xs text-neutral-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <Wifi size={13} className="text-[#34C759]" />
            <span>گوشی و سرور به یک شبکه وای‌فای مشترک متصل باشند</span>
          </div>
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl bg-black/[0.05] hover:bg-black/[0.08] text-neutral-700 font-semibold transition-all cursor-pointer active:scale-95"
          >
            بستن
          </button>
        </div>

      </div>
    </div>
  );
}
