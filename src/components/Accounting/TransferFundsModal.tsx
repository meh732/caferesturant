import React, { useState } from 'react';
import { db, BankAccount, CashBox } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, ArrowLeftRight, Save, AlertCircle, Calendar } from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import { transferFunds } from '../../lib/accountingServices';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

interface TransferFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSourceType?: 'bank' | 'cashbox';
  defaultSourceId?: number;
}

export default function TransferFundsModal({
  isOpen,
  onClose,
  defaultSourceType = 'cashbox',
  defaultSourceId,
}: TransferFundsModalProps) {
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.filter(c => c.isActive).toArray()) || [];

  const [sourceType, setSourceType] = useState<'bank' | 'cashbox'>(defaultSourceType);
  const [sourceId, setSourceId] = useState<number | undefined>(defaultSourceId);

  const [targetType, setTargetType] = useState<'bank' | 'cashbox'>(defaultSourceType === 'cashbox' ? 'bank' : 'cashbox');
  const [targetId, setTargetId] = useState<number | undefined>(undefined);

  const [amount, setAmount] = useState<number>(0);
  const [dateObj, setDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [trackingCode, setTrackingCode] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default source and target when opened
  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setAmount(0);
      setTrackingCode('');
      setDescription('');
      setDateObj(new DateObject({ calendar: persian }));

      if (sourceType === 'bank' && bankAccounts.length > 0 && !sourceId) {
        setSourceId(bankAccounts[0].id);
      } else if (sourceType === 'cashbox' && cashBoxes.length > 0 && !sourceId) {
        setSourceId(cashBoxes[0].id);
      }

      if (targetType === 'bank' && bankAccounts.length > 0 && !targetId) {
        setTargetId(bankAccounts[0].id);
      } else if (targetType === 'cashbox' && cashBoxes.length > 0 && !targetId) {
        setTargetId(cashBoxes[0].id);
      }
    }
  }, [isOpen, bankAccounts.length, cashBoxes.length]);

  if (!isOpen) return null;

  // Selected source item
  const selectedSource = sourceType === 'bank' 
    ? bankAccounts.find(b => b.id === sourceId)
    : cashBoxes.find(c => c.id === sourceId);

  // Selected target item
  const selectedTarget = targetType === 'bank'
    ? bankAccounts.find(b => b.id === targetId)
    : cashBoxes.find(c => c.id === targetId);

  const sourceBalance = selectedSource?.balance || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sourceId) {
      setError('لطفا حساب یا صندوق مبدأ را مشخص کنید.');
      return;
    }
    if (!targetId) {
      setError('لطفا حساب یا صندوق مقصد را مشخص کنید.');
      return;
    }
    if (sourceType === targetType && sourceId === targetId) {
      setError('حساب مبدأ و مقصد نمی‌توانند یکسان باشند.');
      return;
    }
    if (amount <= 0) {
      setError('مبلغ انتقال باید بیشتر از صفر باشد.');
      return;
    }

    try {
      setIsSubmitting(true);
      await transferFunds({
        sourceType,
        sourceId,
        targetType,
        targetId,
        amount,
        date: dateObj ? dateObj.toDate() : new Date(),
        trackingCode,
        description: description || `انتقال وجه از ${selectedSource ? (sourceType === 'bank' ? (selectedSource as BankAccount).bankName : (selectedSource as CashBox).name) : 'مبدأ'} به ${selectedTarget ? (targetType === 'bank' ? (selectedTarget as BankAccount).bankName : (selectedTarget as CashBox).name) : 'مقصد'}`
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'خطا در ثبت انتقال وجه.');
    } finally {
      setIsSubmitting(false);
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
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <ArrowLeftRight size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              انتقال وجه بین حساب‌ها و صندوق‌ها
            </h3>
            <p className="text-xs text-slate-500">
              واریز وجوه نقد صندوق به بانک، جابجایی بین بانک‌ها یا تغذیه صندوق
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
          {/* Source Box */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">مبدأ کسر وجه</span>
              <div className="flex bg-slate-200 p-0.5 rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => { setSourceType('cashbox'); setSourceId(cashBoxes[0]?.id); }}
                  className={`px-2.5 py-1 rounded-md transition-all ${sourceType === 'cashbox' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                  صندوق نقدی
                </button>
                <button
                  type="button"
                  onClick={() => { setSourceType('bank'); setSourceId(bankAccounts[0]?.id); }}
                  className={`px-2.5 py-1 rounded-md transition-all ${sourceType === 'bank' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                  حساب بانکی
                </button>
              </div>
            </div>

            <select
              value={sourceId || ''}
              onChange={e => setSourceId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-semibold"
              required
            >
              {sourceType === 'bank' ? (
                bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} - موجودی: {formatCurrency(b.balance)}
                  </option>
                ))
              ) : (
                cashBoxes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.cashierName}) - موجودی: {formatCurrency(c.balance)}
                  </option>
                ))
              )}
            </select>

            <div className="text-[11px] text-slate-500 flex justify-between">
              <span>موجودی جاری مبدأ:</span>
              <span className="font-bold text-slate-800">{formatCurrency(sourceBalance)}</span>
            </div>
          </div>

          {/* Target Box */}
          <div className="p-3.5 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-900">مقصد واریز وجه</span>
              <div className="flex bg-indigo-100/70 p-0.5 rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => { setTargetType('bank'); setTargetId(bankAccounts[0]?.id); }}
                  className={`px-2.5 py-1 rounded-md transition-all ${targetType === 'bank' ? 'bg-white shadow text-indigo-900' : 'text-indigo-600'}`}
                >
                  حساب بانکی
                </button>
                <button
                  type="button"
                  onClick={() => { setTargetType('cashbox'); setTargetId(cashBoxes[0]?.id); }}
                  className={`px-2.5 py-1 rounded-md transition-all ${targetType === 'cashbox' ? 'bg-white shadow text-indigo-900' : 'text-indigo-600'}`}
                >
                  صندوق نقدی
                </button>
              </div>
            </div>

            <select
              value={targetId || ''}
              onChange={e => setTargetId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-semibold"
              required
            >
              {targetType === 'bank' ? (
                bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} - موجودی: {formatCurrency(b.balance)}
                  </option>
                ))
              ) : (
                cashBoxes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.cashierName}) - موجودی: {formatCurrency(c.balance)}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ انتقال (تومان) *</label>
              <input
                type="number"
                value={amount || ''}
                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold font-mono"
                dir="ltr"
                required
              />
              {amount > 0 && (
                <p className="text-[11px] text-indigo-600 font-bold mt-1 leading-snug">
                  {numberToPersianWords(amount)} تومان
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاریخ انتقال</label>
              <div className="relative">
                <DatePicker
                  value={dateObj}
                  onChange={setDateObj as any}
                  calendar={persian}
                  locale={persian_fa}
                  calendarPosition="bottom-right"
                  inputClass="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-slate-700"
                />
                <Calendar size={15} className="absolute right-2.5 top-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Tracking Code */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">شماره پیگیری فیش یا ارجاع بانکی</label>
            <input
              type="text"
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value)}
              placeholder="شماره فیش واریز نقدی به حساب یا تراکنش پایا/ساتنا"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-mono"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">شرح و بابت سند</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="مثال: واریز وجوه نقدی فروش شیفت به حساب بانک ملت"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 disabled:opacity-50"
            >
              <Save size={16} />
              <span>{isSubmitting ? 'در حال ثبت...' : 'ثبت سند انتقال وجه'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
