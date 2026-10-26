import React, { useState, useEffect } from 'react';
import { Server, Laptop, ShieldCheck, Lock, Wifi, Check, AlertCircle, RefreshCw, X, ChevronRight, Globe, Copy, CheckCheck, Share2 } from 'lucide-react';
import {
  getAppExecutionMode,
  setAppExecutionMode,
  getServerBaseUrl,
  initialTwoWaySync,
  fetchUnifiedLicenseStatus,
  activateUnifiedServerLicense
} from '../../lib/serverSync';
import { initLanServer } from '../../lib/networkSync';

interface TauriModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  forceRequired?: boolean;
}

export const TauriModeModal: React.FC<TauriModeModalProps> = ({ isOpen, onClose, forceRequired = false }) => {
  const [selectedRole, setSelectedRole] = useState<'server' | 'client' | null>(null);

  // Server Hardware Licensing States
  const [machineId, setMachineId] = useState<string>('');
  const [isLicenseActivated, setIsLicenseActivated] = useState<boolean>(false);
  const [activeLicenseKey, setActiveLicenseKey] = useState<string>('');
  const [activationKeyInput, setActivationKeyInput] = useState<string>('');
  const [isCopiedId, setIsCopiedId] = useState(false);
  const [isLoadingLicense, setIsLoadingLicense] = useState(false);

  // Client Mode States
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{ success: boolean; message: string; ms?: number } | null>(null);

  // General States
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const currentMode = getAppExecutionMode();
  const currentBaseUrl = getServerBaseUrl();

  const loadHardwareLicenseInfo = async () => {
    setIsLoadingLicense(true);
    try {
      const info = await fetchUnifiedLicenseStatus();
      setMachineId(info.machineId);
      setIsLicenseActivated(info.isActivated);
      setActiveLicenseKey(info.licenseKey || '');
    } catch (e) {
      console.warn('Failed to load hardware license info:', e);
    } finally {
      setIsLoadingLicense(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const savedMode = localStorage.getItem('arka_tauri_mode') as 'server' | 'client' | null;
      setSelectedRole(savedMode === 'server' || savedMode === 'client' ? savedMode : null);
      setServerUrlInput(localStorage.getItem('arka_server_url') || 'http://192.168.1.100:3000');
      setActivationKeyInput('');
      setPingResult(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      loadHardwareLicenseInfo();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyMachineId = () => {
    if (!machineId) return;
    navigator.clipboard.writeText(machineId);
    setIsCopiedId(true);
    setTimeout(() => setIsCopiedId(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!machineId) return;
    const msg = encodeURIComponent(`سلام، شناسه سخت‌افزاری سرور نرم‌افزار آرکا برای این کامپیوتر:\n${machineId}\nلطفاً کلید فعال‌سازی را از فایل keygen.html برای من ارسال فرمایید.`);
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  };

  const handleActivateServerHardware = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = activationKeyInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!cleanKey) {
      setErrorMessage('لطفاً کد فعال‌سازی صادر شده را وارد فرمایید.');
      return;
    }

    setIsApplying(true);
    setErrorMessage(null);

    try {
      const res = await activateUnifiedServerLicense(cleanKey);
      if (!res.success) {
        setErrorMessage(`❌ ${res.message}`);
        setIsApplying(false);
        return;
      }

      setIsLicenseActivated(true);
      setActiveLicenseKey(cleanKey);
      window.dispatchEvent(new CustomEvent('arka_license_updated'));

      // Set App Mode to Server and launch LAN server
      setAppExecutionMode('server');
      const activePort = Number(localStorage.getItem('arka_active_lan_port')) || 3000;
      await initLanServer(activePort).catch(() => {});

      setSuccessMessage('✅ فعال‌سازی سرور با موفقیت انجام شد! سامانه به سخت‌افزار این کامپیوتر قفل گردید.');
      setTimeout(() => {
        setIsApplying(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(`خطا در بررسی فعال‌سازی: ${err.message || err}`);
      setIsApplying(false);
    }
  };

  const handleLaunchActivatedServer = async () => {
    setIsApplying(true);
    setErrorMessage(null);
    try {
      setAppExecutionMode('server');
      await initLanServer(3000).catch(() => {});
      setSuccessMessage('حالت سرور مرکزی با لایسنس سخت‌افزاری معتبر راه‌اندازی شد.');
      setTimeout(() => {
        setIsApplying(false);
        onClose();
        window.location.reload();
      }, 800);
    } catch (err: any) {
      setErrorMessage(`خطا در راه‌اندازی سرور: ${err.message || err}`);
      setIsApplying(false);
    }
  };

  const handleTestServerConnection = async () => {
    let url = serverUrlInput.trim().replace(/\/+$/, '');
    if (!url) {
      setPingResult({ success: false, message: 'لطفاً آدرس سرور را وارد فرمایید.' });
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }

    setIsTestingPing(true);
    setPingResult(null);
    setErrorMessage(null);

    const startTime = performance.now();
    try {
      const res = await fetch(`${url}/api/license/status`, {
        signal: AbortSignal.timeout(4000)
      }).catch(async () => {
        return await fetch(`${url}/api/db/version`, {
          signal: AbortSignal.timeout(4000)
        });
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (res && res.ok) {
        setPingResult({
          success: true,
          message: `ارتباط با سرور برقرار شد! زمان پاسخ: ${latencyMs} میلی‌ثانیه`,
          ms: latencyMs
        });
      } else {
        setPingResult({
          success: false,
          message: `سرور پاسخ داد اما وضعیت نامعتبر بود (کد: ${res?.status || 'نامشخص'}).`
        });
      }
    } catch (err: any) {
      setPingResult({
        success: false,
        message: 'ارتباط برقرار نشد. لطفاً مطمئن شوید سرور روشن است و آدرس IP و پورت صحیح است.'
      });
    } finally {
      setIsTestingPing(false);
    }
  };

  const handleConfirmClientMode = async (e: React.FormEvent) => {
    e.preventDefault();
    let url = serverUrlInput.trim().replace(/\/+$/, '');
    if (!url) {
      setErrorMessage('لطفاً آدرس سرور مرکزی را وارد فرمایید.');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }

    setIsApplying(true);
    setErrorMessage(null);

    try {
      setAppExecutionMode('client', url);
      setSuccessMessage('حالت «کلاینت متصل به سرور» با موفقیت ثبت شد!');
      await initialTwoWaySync().catch(() => {});

      setTimeout(() => {
        setIsApplying(false);
        onClose();
        window.location.reload();
      }, 1000);
    } catch (e: any) {
      setErrorMessage(`خطا در ثبت آدرس سرور: ${e.message || e}`);
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white relative flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <Server size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                تعیین نقش و قفل سخت‌افزاری سیستم در تائوری (ویندوز)
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                فعال‌سازی سرور با شناسه سخت‌افزاری یا اتصال به عنوان کلاینت
              </p>
            </div>
          </div>

          {!forceRequired && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">

          {/* Current Mode Badge if configured */}
          {currentMode !== 'standalone' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-bold text-slate-700">
              <span>حالت فعلی این سیستم:</span>
              <span className={`px-2.5 py-1 rounded-lg ${currentMode === 'server' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                {currentMode === 'server' ? '🏢 سرور اصلی (قفل سخت‌افزاری فعال)' : `💻 کلاینت متصل به (${currentBaseUrl || 'سرور مرکزی'})`}
              </span>
            </div>
          )}

          {/* Step 1: Mode Selection Cards */}
          {!selectedRole && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-700">
                لطفاً نحوه استفاده از این رایانه را مشخص نمایید:
              </p>

              {/* Card 1: Server Mode */}
              <button
                type="button"
                onClick={() => {
                  setSelectedRole('server');
                  loadHardwareLicenseInfo();
                }}
                className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-indigo-600 bg-white hover:bg-indigo-50/30 transition-all text-right flex items-center justify-between gap-4 group cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Server size={24} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-900">
                      🏢 حالت سرور اصلی (Server Mode)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      این رایانه سرور مرکزی بوده و طبق روال لینوکس با <b>شناسه سخت‌افزاری و کلید keygen</b> فعال و قفل می‌شود.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-indigo-600">
                  <ShieldCheck size={14} />
                  <span>قفل سخت‌افزار</span>
                  <ChevronRight size={16} />
                </div>
              </button>

              {/* Card 2: Client Mode */}
              <button
                type="button"
                onClick={() => setSelectedRole('client')}
                className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-600 bg-white hover:bg-blue-50/30 transition-all text-right flex items-center justify-between gap-4 group cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Laptop size={24} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 group-hover:text-blue-900">
                      💻 حالت صندوق فرعی / کلاینت شبکه (Client Mode)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      صندوق فرعی یا تبلت بدون نیاز به کلید لایسنس، تنها با وارد کردن آدرس IP سرور مرکزی متصل می‌شود.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-blue-600">
                  <Wifi size={14} />
                  <span>آدرس سرور</span>
                  <ChevronRight size={16} />
                </div>
              </button>
            </div>
          )}

          {/* Step 2A: Server Mode Hardware Detection & Activation */}
          {selectedRole === 'server' && (
            <div className="space-y-4 animate-in fade-in">
              
              {/* Machine ID Display Box */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-inner border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5 font-bold">
                    <Lock size={14} className="text-indigo-400" />
                    <span>شناسه سخت‌افزاری سرور (Machine ID):</span>
                  </span>
                  {isLoadingLicense && <RefreshCw size={13} className="animate-spin text-slate-400" />}
                </div>

                <div className="flex items-center justify-between gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800 font-mono text-sm sm:text-base tracking-wider text-indigo-300 select-all" dir="ltr">
                  <span>{machineId || 'در حال شناسایی قطعات...'}</span>
                  <button
                    type="button"
                    onClick={handleCopyMachineId}
                    disabled={!machineId}
                    className="p-1.5 px-2.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-xs flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isCopiedId ? <CheckCheck size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span className="font-sans text-[11px]">{isCopiedId ? 'کپی شد' : 'کپی شناسه'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>این کد از پردازنده، مادربرد و دیسک این رایانه خوانده شده است.</span>
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold cursor-pointer transition-colors"
                  >
                    <Share2 size={13} />
                    <span>ارسال در واتساپ</span>
                  </button>
                </div>
              </div>

              {/* Status 1: Already Activated */}
              {isLicenseActivated ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                    <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
                    <span>لایسنس سرور برای این سخت‌افزار تایید و فعال است.</span>
                  </div>
                  {activeLicenseKey && (
                    <div className="text-[11px] text-emerald-800 bg-white/80 p-2.5 rounded-xl border border-emerald-100 font-mono" dir="ltr">
                      کلید ثبت‌شده: {activeLicenseKey}
                    </div>
                  )}
                  <p className="text-[11px] text-emerald-700 leading-relaxed">
                    این کامپیوتر به عنوان سرور مجاز شناخته شد و پایگاه داده محلی روی آن قفل است.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedRole(null)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer transition-all"
                    >
                      بازگشت
                    </button>
                    <button
                      type="button"
                      onClick={handleLaunchActivatedServer}
                      disabled={isApplying}
                      className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
                    >
                      {isApplying ? <RefreshCw size={14} className="animate-spin" /> : <Server size={16} />}
                      <span>تایید و اجرای سرور اصلی</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Status 2: Not Activated Yet -> Require key from keygen.html */
                <form onSubmit={handleActivateServerHardware} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle size={15} className="text-amber-600 shrink-0" />
                      <span>این رایانه نیازمند کلید فعال‌سازی سخت‌افزاری است:</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      شناسه سخت‌افزاری بالا را برای مدیر/سازنده نرم‌افزار ارسال کنید تا با وارد کردن آن در فایل <b>keygen.html</b>، کد فعال‌سازی سرور را برای شما صادر کند.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      کد فعال‌سازی صادر شده (Activation Key):
                    </label>
                    <input
                      type="text"
                      value={activationKeyInput}
                      onChange={(e) => setActivationKeyInput(e.target.value.toUpperCase())}
                      placeholder="ARKA-KEY-XXXX-XXXX-XXXX-XXXX"
                      dir="ltr"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 font-mono text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-sans"
                      autoFocus
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      فرمت کلید باید دقیقاً به صورت <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">ARKA-KEY-XXXX-XXXX-XXXX-XXXX</code> باشد.
                    </p>
                  </div>

                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                      <AlertCircle size={16} className="text-rose-600 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {successMessage && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                      <Check size={16} className="text-emerald-600 shrink-0" />
                      <span>{successMessage}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRole(null)}
                      className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer transition-all"
                    >
                      بازگشت
                    </button>
                    <button
                      type="submit"
                      disabled={isApplying || !activationKeyInput.trim()}
                      className="flex-1 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
                    >
                      {isApplying ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={16} />}
                      <span>اعتبارسنجی سخت‌افزاری و راه‌اندازی سرور</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Step 2B: Client Mode Server URL Form */}
          {selectedRole === 'client' && (
            <form onSubmit={handleConfirmClientMode} className="space-y-4 animate-in fade-in">
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
                <Globe size={16} className="text-blue-600 shrink-0" />
                <span>لطفاً آدرس IP یا دامنه سرور مرکزی کافه/رستوران را وارد فرمایید:</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>آدرس کامل سرور مرکزی (IP:Port):</span>
                  <span className="text-[11px] text-slate-400 font-normal">مثال: 192.168.1.100:3000</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    placeholder="http://192.168.1.100:3000"
                    dir="ltr"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-mono text-sm font-bold text-slate-900 outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleTestServerConnection}
                    disabled={isTestingPing || !serverUrlInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-all"
                  >
                    {isTestingPing ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
                    <span>تست اتصال</span>
                  </button>
                </div>
              </div>

              {pingResult && (
                <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 animate-in fade-in ${
                  pingResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {pingResult.success ? <Check size={16} className="text-emerald-600 shrink-0" /> : <AlertCircle size={16} className="text-rose-600 shrink-0" />}
                  <span>{pingResult.message}</span>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <Check size={16} className="text-emerald-600 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRole(null)}
                  className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer transition-all"
                >
                  بازگشت
                </button>
                <button
                  type="submit"
                  disabled={isApplying || !serverUrlInput.trim()}
                  className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
                >
                  {isApplying ? <RefreshCw size={14} className="animate-spin" /> : <Check size={16} />}
                  <span>اتصال به سرور و راه‌اندازی کلاینت</span>
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>سامانه جامع صندوقداری و سرور آرکا (قفل سخت‌افزاری آفلاین)</span>
          <span className="font-mono">v1.2.4</span>
        </div>
      </div>
    </div>
  );
};
