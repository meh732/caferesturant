import React, { useState, useEffect } from 'react';
import { db, CashBox } from '../../lib/db';
import { X, Wallet, Save, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { triggerServerDbSync } from '../../lib/serverSync';

interface CashBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashBox?: CashBox | null;
}

export default function CashBoxModal({ isOpen, onClose, cashBox }: CashBoxModalProps) {
  const [name, setName] = useState('');
  const [cashierName, setCashierName] = useState('');
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cashBox) {
      setName(cashBox.name);
      setCashierName(cashBox.cashierName || '');
      setInitialBalance(cashBox.initialBalance || 0);
      setBalance(cashBox.balance || 0);
      setIsDefault(cashBox.isDefault || false);
      setIsActive(cashBox.isActive ?? true);
      setNotes(cashBox.notes || '');
    } else {
      setName('');
      setCashierName('');
      setInitialBalance(0);
      setBalance(0);
      setIsDefault(false);
      setIsActive(true);
      setNotes('');
    }
    setError(null);
  }, [cashBox, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('لطفا عنوان صندوق را وارد کنید.');
      return;
    }
    if (!cashierName.trim()) {
      setError('لطفا نام مسئول / صندوق‌دار را وارد کنید.');
      return;
    }

    try {
      if (isDefault) {
        const existingDefaults = await db.cashBoxes.filter(c => c.isDefault).toArray();
        for (const c of existingDefaults) {
          if (c.id !== cashBox?.id) {
            await db.cashBoxes.update(c.id!, { isDefault: false });
          }
        }
      }

      if (cashBox?.id) {
        await db.cashBoxes.update(cashBox.id, {
          name: name.trim(),
          cashierName: cashierName.trim(),
          balance: Number(balance) || 0,
          isDefault,
          isActive,
          notes: notes.trim() || undefined,
        });
      } else {
        const newId = await db.cashBoxes.add({
          name: name.trim(),
          cashierName: cashierName.trim(),
          initialBalance: Number(initialBalance) || 0,
          balance: Number(initialBalance) || 0,
          isDefault,
          isActive,
          notes: notes.trim() || undefined,
          createdAt: new Date(),
        });

        if (Number(initialBalance) > 0) {
          await db.financialTransactions.add({
            transactionNumber: `TX-${Date.now().toString().slice(-6)}`,
            type: 'deposit_manual',
            category: 'موجودی افتتاحیه',
            amount: Number(initialBalance),
            targetType: 'cashbox',
            targetId: newId as number,
            targetName: name.trim(),
            date: new Date(),
            description: `ثبت موجودی اولیه نقدی صندوق ${name.trim()}`,
            balanceAfter: Number(initialBalance),
            createdAt: new Date(),
          });
        }
      }

      triggerServerDbSync(100);
      onClose();
    } catch (err) {
      console.error(err);
      setError('خطا در ذخیره صندوق نقدی.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Wallet size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {cashBox ? 'ویرایش صندوق نقدی' : 'تعریف صندوق نقدی جدید'}
            </h3>
            <p className="text-xs text-slate-500">
              صندوق سالن، تحویل سفارشات، دلیوری و نگهداری وجوه نقد
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
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">نام یا عنوان صندوق *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثال: صندوق ۱ سالن اصلی، صندوق دلیوری"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">صندوق‌دار یا مسئول تحویل *</label>
            <input
              type="text"
              value={cashierName}
              onChange={e => setCashierName(e.target.value)}
              placeholder="مثال: علی احمدی (شیفت صبح)"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-xs"
              required
            />
          </div>

          <div>
            {!cashBox ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">موجودی اولیه نقدی (تومان)</label>
                <input
                  type="number"
                  value={initialBalance || ''}
                  onChange={e => setInitialBalance(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold font-mono"
                  dir="ltr"
                />
                {initialBalance > 0 && (
                  <p className="text-[11px] text-emerald-600 font-bold mt-1">
                    معادل: {formatCurrency(initialBalance)}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">موجودی فعلی نقدی صندوق (تومان)</label>
                <input
                  type="number"
                  value={balance || ''}
                  onChange={e => setBalance(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold font-mono"
                  dir="ltr"
                />
                <p className="text-[11px] text-emerald-600 font-bold mt-1">
                  معادل: {formatCurrency(balance)}
                </p>
              </div>
            )}
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={e => setIsDefault(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <span>صندوق نقدی پیش‌فرض دریافت وجه فروشگاه</span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <span>صندوق فعال است</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات اختیاری</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="توضیحات تکمیلی..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-xs"
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
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95"
            >
              <Save size={16} />
              <span>{cashBox ? 'ذخیره تغییرات' : 'ثبت صندوق'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
