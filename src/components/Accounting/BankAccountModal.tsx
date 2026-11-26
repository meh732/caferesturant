import React, { useState, useEffect } from 'react';
import { db, BankAccount } from '../../lib/db';
import {
  X, Building2, CreditCard, Save, AlertCircle, Wifi, Search,
  CheckCircle2, Loader2, PlugZap, Globe
} from 'lucide-react';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import { triggerServerDbSync } from '../../lib/serverSync';
import {
  POS_DRIVER_PRESETS,
  IranianPosDriver,
  suggestPosPresetForBank,
  scanLanPosTerminals,
  testPosTerminal,
  DiscoveredPosCandidate,
  getPosDriverLabel
} from '../../lib/posTerminalService';

interface BankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account?: BankAccount | null;
}

const COMMON_BANKS = [
  'بانک ملت',
  'بانک سامان',
  'بانک ملی ایران',
  'بانک صادرات ایران',
  'بانک تجارت',
  'بانک پاسارگاد',
  'بانک پارسیان',
  'بانک سپه',
  'بانک شهر',
  'بانک آینده',
  'بانک رفاه کارگران',
  'بانک کشاورزی',
  'بانک مسکن',
  'بانک کارآفرین',
  'بانک دی',
  'بانک رسالت',
  'بانک مهر ایران',
  'سایر بانک‌ها'
];

export default function BankAccountModal({ isOpen, onClose, account }: BankAccountModalProps) {
  const [bankName, setBankName] = useState(COMMON_BANKS[0]);
  const [customBankName, setCustomBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [shabaNumber, setShabaNumber] = useState('');
  const [branchName, setBranchName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);
  const [isDefaultPos, setIsDefaultPos] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');

  // LAN / PC-POS Connection Settings
  const [posEnabled, setPosEnabled] = useState(false);
  const [posDriver, setPosDriver] = useState<IranianPosDriver>('behpardakht');
  const [posConnectionMode, setPosConnectionMode] = useState<'tcp_direct' | 'http_bridge'>('tcp_direct');
  const [posIp, setPosIp] = useState('');
  const [posPort, setPosPort] = useState<number>(1197);
  const [posBridgeUrl, setPosBridgeUrl] = useState('http://127.0.0.1:8085/api/pay');
  const [posTerminalId, setPosTerminalId] = useState('');
  const [posCurrencyUnit, setPosCurrencyUnit] = useState<'rial' | 'toman'>('rial');
  const [posAutoSend, setPosAutoSend] = useState(true);

  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<DiscoveredPosCandidate[]>([]);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      if (COMMON_BANKS.includes(account.bankName)) {
        setBankName(account.bankName);
        setCustomBankName('');
      } else {
        setBankName('سایر بانک‌ها');
        setCustomBankName(account.bankName);
      }
      setAccountNumber(account.accountNumber || '');
      setCardNumber(account.cardNumber || '');
      setShabaNumber(account.shabaNumber || '');
      setBranchName(account.branchName || '');
      setAccountHolder(account.accountHolder || '');
      setInitialBalance(account.initialBalance || 0);
      setBalance(account.balance || 0);
      setIsDefaultPos(account.isDefaultPos || false);
      setIsActive(account.isActive ?? true);
      setNotes(account.notes || '');

      const suggested = suggestPosPresetForBank(account.bankName);
      setPosEnabled(account.posEnabled || false);
      setPosDriver((account.posDriver as IranianPosDriver) || suggested.id);
      setPosConnectionMode(account.posConnectionMode || 'tcp_direct');
      setPosIp(account.posIp || '');
      setPosPort(account.posPort || suggested.defaultPort);
      setPosBridgeUrl(account.posBridgeUrl || 'http://127.0.0.1:8085/api/pay');
      setPosTerminalId(account.posTerminalId || '');
      setPosCurrencyUnit(account.posCurrencyUnit || 'rial');
      setPosAutoSend(account.posAutoSend ?? true);
    } else {
      const defaultBank = COMMON_BANKS[0];
      const suggested = suggestPosPresetForBank(defaultBank);
      setBankName(defaultBank);
      setCustomBankName('');
      setAccountNumber('');
      setCardNumber('');
      setShabaNumber('');
      setBranchName('');
      setAccountHolder('');
      setInitialBalance(0);
      setBalance(0);
      setIsDefaultPos(false);
      setIsActive(true);
      setNotes('');

      setPosEnabled(false);
      setPosDriver(suggested.id);
      setPosConnectionMode('tcp_direct');
      setPosIp('');
      setPosPort(suggested.defaultPort);
      setPosBridgeUrl('http://127.0.0.1:8085/api/pay');
      setPosTerminalId('');
      setPosCurrencyUnit('rial');
      setPosAutoSend(true);
    }
    setScanResults([]);
    setScanMessage(null);
    setTestResult(null);
    setError(null);
  }, [account, isOpen]);

  const handleBankChange = (nextBank: string) => {
    setBankName(nextBank);
    const preset = suggestPosPresetForBank(nextBank);
    setPosDriver(preset.id);
    setPosPort(preset.defaultPort);
    setTestResult(null);
  };

  const handleDriverChange = (nextDriver: IranianPosDriver) => {
    setPosDriver(nextDriver);
    if (nextDriver === 'http_bridge') {
      setPosConnectionMode('http_bridge');
    } else {
      const preset = POS_DRIVER_PRESETS.find((p) => p.id === nextDriver);
      if (preset) {
        setPosPort(preset.defaultPort);
      }
    }
    setTestResult(null);
  };

  const handleScanLan = async () => {
    setIsScanning(true);
    setScanMessage(null);
    setScanResults([]);
    setTestResult(null);
    try {
      const customSubnet =
        posIp.trim().split('.').length === 4 ? posIp.trim().split('.').slice(0, 3).join('.') : undefined;
      const res = await scanLanPosTerminals(customSubnet);
      setScanResults(res.discovered || []);
      if (!res.discovered || res.discovered.length === 0) {
        setScanMessage(
          `در شبکه (${(res.scannedSubnets || []).join(' , ') || 'LAN'}) دستگاه پوز فعالی روی پورت‌های استاندارد پیدا نشد. مطمئن شوید کارتخوان به وای‌فای/کابل شبکه متصل است و گزینه PC-POS / LAN آن فعال است.`
        );
      } else if (res.discovered.length === 1) {
        const only = res.discovered[0];
        setPosConnectionMode('tcp_direct');
        setPosIp(only.ip);
        setPosPort(only.port);
        if (only.suggestedDriver !== 'auto') {
          setPosDriver(only.suggestedDriver);
        }
        setScanMessage(`۱ دستگاه کارتخوان روی ${only.ip}:${only.port} پیدا و به صورت خودکار تنظیم شد.`);
      } else {
        setScanMessage(`${res.discovered.length} دستگاه روی شبکه پیدا شد. یکی را انتخاب کنید:`);
      }
    } catch (err: any) {
      setScanMessage(err?.message || 'خطا در جستجوی خودکار شبکه.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testPosTerminal({
        mode: posConnectionMode,
        driver: posDriver,
        ip: posIp.trim(),
        port: posPort,
        bridgeUrl: posBridgeUrl.trim()
      });
      setTestResult({ ok: Boolean(res.ok), message: res.message });
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || 'خطا در تست اتصال کارتخوان' });
    } finally {
      setIsTesting(false);
    }
  };

  // Format card number with spaces (XXXX-XXXX-XXXX-XXXX)
  const handleCardNumberChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1-');
    setCardNumber(formatted);
  };

  // Format Shaba with IR prefix
  const handleShabaChange = (val: string) => {
    let clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.startsWith('IR')) {
      clean = clean.slice(2);
    }
    clean = clean.slice(0, 24);
    setShabaNumber(clean ? `IR${clean}` : '');
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalBankName = bankName === 'سایر بانک‌ها' ? customBankName.trim() : bankName.trim();
    if (!finalBankName) {
      setError('لطفا نام بانک را وارد کنید.');
      return;
    }
    if (!accountHolder.trim()) {
      setError('لطفا نام صاحب حساب را وارد کنید.');
      return;
    }

    if (posEnabled) {
      if (posConnectionMode === 'tcp_direct') {
        if (!posIp.trim()) {
          setError('برای اتصال مستقیم به کارتخوان شبکه، وارد کردن آدرس IP کارتخوان الزامی است (یا دکمه جستجوی خودکار را بزنید).');
          return;
        }
        if (!posPort || posPort < 1 || posPort > 65535) {
          setError('شماره پورت کارتخوان معتبر نیست.');
          return;
        }
      } else if (!posBridgeUrl.trim()) {
        setError('در حالت وب‌سرویس لوکال، آدرس URL سرویس کارتخوان الزامی است.');
        return;
      }
    }

    const posPayload = {
      posEnabled,
      posDriver,
      posConnectionMode,
      posIp: posIp.trim() || undefined,
      posPort: Number(posPort) || 1197,
      posBridgeUrl: posBridgeUrl.trim() || undefined,
      posTerminalId: posTerminalId.trim() || undefined,
      posCurrencyUnit,
      posAutoSend,
    };

    try {
      if (isDefaultPos) {
        const existingDefaults = await db.bankAccounts.filter(b => b.isDefaultPos).toArray();
        for (const b of existingDefaults) {
          if (b.id !== account?.id) {
            await db.bankAccounts.update(b.id!, { isDefaultPos: false });
          }
        }
      }

      if (account?.id) {
        await db.bankAccounts.update(account.id, {
          bankName: finalBankName,
          accountNumber: accountNumber.trim() || undefined,
          cardNumber: cardNumber.trim() || undefined,
          shabaNumber: shabaNumber.trim() || undefined,
          branchName: branchName.trim() || undefined,
          accountHolder: accountHolder.trim(),
          balance: Number(balance) || 0,
          isDefaultPos,
          isActive,
          notes: notes.trim() || undefined,
          ...posPayload
        });
      } else {
        const newId = await db.bankAccounts.add({
          bankName: finalBankName,
          accountNumber: accountNumber.trim() || undefined,
          cardNumber: cardNumber.trim() || undefined,
          shabaNumber: shabaNumber.trim() || undefined,
          branchName: branchName.trim() || undefined,
          accountHolder: accountHolder.trim(),
          initialBalance: Number(initialBalance) || 0,
          balance: Number(initialBalance) || 0,
          isDefaultPos,
          isActive,
          notes: notes.trim() || undefined,
          ...posPayload,
          createdAt: new Date(),
        });

        if (Number(initialBalance) > 0) {
          await db.financialTransactions.add({
            transactionNumber: `TX-${Date.now().toString().slice(-6)}`,
            type: 'deposit_manual',
            category: 'موجودی افتتاحیه',
            amount: Number(initialBalance),
            targetType: 'bank',
            targetId: newId as number,
            targetName: finalBankName,
            date: new Date(),
            description: `ثبت موجودی اولیه حساب بانکی ${finalBankName}`,
            balanceAfter: Number(initialBalance),
            createdAt: new Date(),
          });
        }
      }

      triggerServerDbSync(100);
      onClose();
    } catch (err) {
      console.error(err);
      setError('خطا در ذخیره حساب بانکی.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-hidden" dir="rtl">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90dvh] flex flex-col p-5 sm:p-6 shadow-2xl border border-slate-100 relative overflow-hidden">
        <button
          type="button"
          data-kbd-close="true"
          onClick={onClose}
          className="absolute left-5 top-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors z-10 cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
            <Building2 size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {account ? 'ویرایش حساب بانکی و کارتخوان' : 'تعریف حساب بانکی و کارتخوان شبکه'}
            </h3>
            <p className="text-xs text-slate-500">
              مشخصات حساب + اتصال مستقیم کارتخوان شبکه داخلی (LAN / PC-POS) • Enter: فیلد بعدی
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pl-1 -ml-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Bank selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نام بانک *</label>
                <select
                  value={bankName}
                  onChange={e => handleBankChange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium"
                  autoFocus
                >
                  {COMMON_BANKS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">صاحب حساب *</label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={e => setAccountHolder(e.target.value)}
                  placeholder="نام شخص یا شرکت"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                  required
                />
              </div>
            </div>

            {bankName === 'سایر بانک‌ها' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نام بانک دلخواه *</label>
                <input
                  type="text"
                  value={customBankName}
                  onChange={e => setCustomBankName(e.target.value)}
                  placeholder="مثال: بانک اقتصاد نوین"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                  required
                />
              </div>
            )}

            {/* Account number & branch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شماره حساب</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  placeholder="مثال: 4892110023"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نام یا کد شعبه</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                  placeholder="مثال: شعبه مرکزی کد ۲۱"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                />
              </div>
            </div>

            {/* Card Number & Shaba */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شماره کارت (۱۶ رقم)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={e => handleCardNumberChange(e.target.value)}
                    placeholder="6037-9918-XXXX-XXXX"
                    className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-mono font-bold"
                    dir="ltr"
                  />
                  <CreditCard size={15} className="absolute right-2.5 top-3 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شماره شبا (IBAN)</label>
                <input
                  type="text"
                  value={shabaNumber}
                  onChange={e => handleShabaChange(e.target.value)}
                  placeholder="IR..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-mono"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Balance fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!account ? (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">موجودی اولیه اول دوره ({getCurrencyLabel()})</label>
                  <input
                    type="number"
                    value={initialBalance || ''}
                    onChange={e => setInitialBalance(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold font-mono"
                    dir="ltr"
                  />
                  {initialBalance > 0 && (
                    <p className="text-[11px] text-blue-600 font-bold mt-1">
                      معادل: {formatCurrency(initialBalance)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">موجودی فعلی حساب ({getCurrencyLabel()})</label>
                  <input
                    type="number"
                    value={balance || ''}
                    onChange={e => setBalance(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold font-mono"
                    dir="ltr"
                  />
                  <p className="text-[11px] text-blue-600 font-bold mt-1">
                    معادل: {formatCurrency(balance)}
                  </p>
                </div>
              )}
            </div>

            {/* LAN POS Terminal Integration Section */}
            <div className={`p-3.5 rounded-2xl border transition-all space-y-3 ${
              posEnabled ? 'bg-blue-50/60 border-blue-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2.5 text-xs text-slate-800 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={posEnabled}
                    onChange={e => {
                      const checked = e.target.checked;
                      setPosEnabled(checked);
                      if (checked && !posPort) {
                        const preset = suggestPosPresetForBank(bankName);
                        setPosDriver(preset.id);
                        setPosPort(preset.defaultPort);
                      }
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                  />
                  <Wifi size={15} className={posEnabled ? 'text-blue-600' : 'text-slate-400'} />
                  <span>اتصال مستقیم به کارتخوان از طریق شبکه داخلی / لن (PC-POS)</span>
                </label>
              </div>

              {posEnabled && (
                <div className="space-y-3 pt-2 border-t border-blue-200/70 animate-in fade-in">
                  {/* Auto Discovery Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-blue-100">
                    <span className="text-[11px] text-slate-600 leading-snug">
                      برای تنظیم سریع، کارتخوان‌های روشن در شبکه داخلی را جستجو کنید:
                    </span>
                    <button
                      type="button"
                      data-kbd-skip="true"
                      onClick={handleScanLan}
                      disabled={isScanning}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      {isScanning ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                      <span>{isScanning ? 'در حال جستجو...' : 'یافتن خودکار کارتخوان در شبکه'}</span>
                    </button>
                  </div>

                  {scanMessage && (
                    <div className={`text-[11px] p-2.5 rounded-xl border ${
                      scanResults.length > 0
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}>
                      <p className="font-semibold">{scanMessage}</p>
                      {scanResults.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {scanResults.map((item) => (
                            <button
                              key={`${item.ip}:${item.port}`}
                              type="button"
                              data-kbd-skip="true"
                              onClick={() => {
                                setPosConnectionMode('tcp_direct');
                                setPosIp(item.ip);
                                setPosPort(item.port);
                                if (item.suggestedDriver !== 'auto') {
                                  setPosDriver(item.suggestedDriver);
                                }
                              }}
                              className="p-2 rounded-lg bg-white hover:bg-blue-50 border border-emerald-300 text-right flex items-center justify-between cursor-pointer"
                            >
                              <div>
                                <div className="font-mono font-bold text-xs text-slate-800" dir="ltr">
                                  {item.ip}:{item.port}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {getPosDriverLabel(item.suggestedDriver)}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                انتخاب
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Protocol & Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        شرکت ارائه دهنده / درایور پوز (شاپرک)
                      </label>
                      <select
                        value={posDriver}
                        onChange={(e) => handleDriverChange(e.target.value as IranianPosDriver)}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none text-xs font-medium"
                      >
                        {POS_DRIVER_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">روش ارتباط در شبکه</label>
                      <select
                        value={posConnectionMode}
                        onChange={(e) => setPosConnectionMode(e.target.value as 'tcp_direct' | 'http_bridge')}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none text-xs font-medium"
                      >
                        <option value="tcp_direct">مستقیم روی LAN (IP و پورت دستگاه)</option>
                        <option value="http_bridge">وب‌سرویس لوکال ویندوز (HTTP Bridge)</option>
                      </select>
                    </div>
                  </div>

                  {/* TCP IP & Port OR HTTP Bridge URL */}
                  {posConnectionMode === 'tcp_direct' ? (
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          آدرس IP کارتخوان در شبکه *
                        </label>
                        <input
                          type="text"
                          value={posIp}
                          onChange={(e) => setPosIp(e.target.value)}
                          placeholder="192.168.1.50"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none text-xs font-mono font-bold"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">پورت شبکه</label>
                        <input
                          type="number"
                          value={posPort || ''}
                          onChange={(e) => setPosPort(parseInt(e.target.value, 10) || 0)}
                          placeholder="1197"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none text-xs font-mono font-bold"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        آدرس سرویس محلی PC-POS (در شبکه داخلی یا همین سیستم) *
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={posBridgeUrl}
                          onChange={(e) => setPosBridgeUrl(e.target.value)}
                          placeholder="http://127.0.0.1:8085/api/pay"
                          className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none text-xs font-mono"
                          dir="ltr"
                        />
                        <Globe size={14} className="absolute right-2.5 top-2.5 text-slate-400" />
                      </div>
                    </div>
                  )}

                  {/* Terminal ID & Currency Unit */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">شماره پایانه / ترمینال (اختیاری)</label>
                      <input
                        type="text"
                        value={posTerminalId}
                        onChange={(e) => setPosTerminalId(e.target.value)}
                        placeholder="مثال: 10293847"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none text-xs font-mono"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">واحد مبلغ ارسالی به پوز</label>
                      <select
                        value={posCurrencyUnit}
                        onChange={(e) => setPosCurrencyUnit(e.target.value as 'rial' | 'toman')}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none text-xs font-medium"
                      >
                        <option value="rial">ریال (تبدیل خودکار تومان به ریال × ۱۰)</option>
                        <option value="toman">تومان (ارسال بدون تبدیل)</option>
                      </select>
                    </div>
                  </div>

                  {/* Auto-send + Test Connection */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={posAutoSend}
                        onChange={(e) => setPosAutoSend(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                      />
                      <span>ارسال خودکار مبلغ هنگام انتخاب این پوز در فاکتور</span>
                    </label>

                    <button
                      type="button"
                      data-kbd-skip="true"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-blue-300 text-blue-700 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {isTesting ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}
                      <span>تست اتصال شبکه پوز</span>
                    </button>
                  </div>

                  {testResult && (
                    <div className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 ${
                      testResult.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}>
                      {testResult.ok ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Checkbox options */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefaultPos}
                  onChange={e => setIsDefaultPos(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span>دستگاه پوز کارتخوان پیش‌فرض در صندوق فروشگاه (POS پیش‌فرض)</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span>حساب فعال است</span>
              </label>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">یادداشت و توضیحات</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="توضیحات اختیاری، شماره پیگیری دستگاه پوز یا ..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 mt-2 border-t border-slate-100 sticky bottom-0 bg-white pb-1 z-10">
              <button
                type="button"
                data-kbd-close="true"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                انصراف (Esc)
              </button>
              <button
                type="submit"
                data-kbd-submit="true"
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer"
              >
                <Save size={16} />
                <span>{account ? 'ذخیره تغییرات' : 'ثبت حساب بانکی'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
