import React, { useState, useEffect } from 'react';
import { db, BankAccount } from '../../lib/db';
import { X, Building2, CreditCard, Save, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { triggerServerDbSync } from '../../lib/serverSync';

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
    } else {
      setBankName(COMMON_BANKS[0]);
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
    }
    setError(null);
  }, [account, isOpen]);

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

    try {
      // If setting as default POS, unset previous default POS
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
          createdAt: new Date(),
        });

        // Add initial balance transaction if initialBalance > 0
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Building2 size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {account ? 'ویرایش حساب بانکی' : 'تعریف حساب بانکی جدید'}
            </h3>
            <p className="text-xs text-slate-500">
              مشخصات حساب بانکی، کارتخوان پوز و شماره شبا
            </p>
          </div>
        </div>

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
                onChange={e => setBankName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium"
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
                <label className="block text-xs font-bold text-slate-700 mb-1">موجودی اولیه اول دوره (تومان)</label>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">موجودی فعلی حساب (تومان)</label>
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

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95"
            >
              <Save size={16} />
              <span>{account ? 'ذخیره تغییرات' : 'ثبت حساب بانکی'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
