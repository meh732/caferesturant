import React, { useState } from 'react';
import { db, BankAccount, CashBox } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, PlusCircle, MinusCircle, Save, AlertCircle, Calendar } from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import { manualDepositOrWithdrawal } from '../../lib/accountingServices';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

interface ManualTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAction?: 'deposit' | 'withdrawal';
  defaultAccountType?: 'bank' | 'cashbox';
  defaultAccountId?: number;
}

const DEPOSIT_CATEGORIES = [
  'آورده و سرمایه‌گذاری شرکا',
  'سایر درآمدهای متفرقه',
  'سود سپرده بانکی',
  'بازگشت وجه خرید یا بیعانه',
  'وام و تسهیلات دریافتی',
  'تعدیل مثبت موجودی نقد و بانک',
];

const WITHDRAWAL_CATEGORIES = [
  'برداشت شخصی صاحب کسب و کار',
  'کارمزد بانکی و خدمات مالی',
  'تنخواه‌گردان متفرقه',
  'بازپرداخت وام یا اقساط',
  'تعدیل منفی و کسری شمارش فیزیکی',
  'سایر مصارف نقدی متفرقه',
];

export default function ManualTransactionModal({
  isOpen,
  onClose,
  defaultAction = 'deposit',
  defaultAccountType = 'bank',
  defaultAccountId,
}: ManualTransactionModalProps) {
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.filter(c => c.isActive).toArray()) || [];

  const [action, setAction] = useState<'deposit' | 'withdrawal'>(defaultAction);
  const [accountType, setAccountType] = useState<'bank' | 'cashbox'>(defaultAccountType);
  const [accountId, setAccountId] = useState<number | undefined>(defaultAccountId);
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState<string>(DEPOSIT_CATEGORIES[0]);
  const [dateObj, setDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [trackingCode, setTrackingCode] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setAmount(0);
      setTrackingCode('');
      setDescription('');
      setDateObj(new DateObject({ calendar: persian }));
      setCategory(action === 'deposit' ? DEPOSIT_CATEGORIES[0] : WITHDRAWAL_CATEGORIES[0]);

      if (accountType === 'bank' && bankAccounts.length > 0 && !accountId) {
        setAccountId(bankAccounts[0].id);
      } else if (accountType === 'cashbox' && cashBoxes.length > 0 && !accountId) {
        setAccountId(cashBoxes[0].id);
      }
    }
  }, [isOpen, action, accountType, bankAccounts.length, cashBoxes.length]);

  if (!isOpen) return null;

  const currentCategories = action === 'deposit' ? DEPOSIT_CATEGORIES : WITHDRAWAL_CATEGORIES;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!accountId) {
      setError('لطفا حساب یا صندوق را انتخاب کنید.');
      return;
    }
    if (amount <= 0) {
      setError('مبلغ باید بیشتر از صفر باشد.');
      return;
    }

    try {
      setIsSubmitting(true);
      await manualDepositOrWithdrawal({
        action,
        accountType,
        accountId,
        amount,
        category,
        date: dateObj ? dateObj.toDate() : new Date(),
        trackingCode,
        description: description.trim() || `${action === 'deposit' ? 'واریز' : 'برداشت'} بابت ${category}`,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'خطا در ثبت سند مالی.');
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
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold ${
            action === 'deposit' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}>
            {action === 'deposit' ? <PlusCircle size={24} /> : <MinusCircle size={24} />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {action === 'deposit' ? 'واریز نقدی یا بانکی متفرقه' : 'برداشت نقدی یا بانکی متفرقه'}
            </h3>
            <p className="text-xs text-slate-500">
              ثبت اسناد افزایش یا کاهش موجودی حساب‌ها و صندوق‌ها خارج از چرخه فروش و خرید
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
          {/* Action toggle (Deposit / Withdrawal) */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => { setAction('deposit'); setCategory(DEPOSIT_CATEGORIES[0]); }}
              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                action === 'deposit'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              + واریز به حساب / صندوق
            </button>
            <button
              type="button"
              onClick={() => { setAction('withdrawal'); setCategory(WITHDRAWAL_CATEGORIES[0]); }}
              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                action === 'withdrawal'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              - برداشت از حساب / صندوق
            </button>
          </div>

          {/* Account selector */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">انتخاب حساب مقصد/مبدأ</span>
              <div className="flex bg-slate-200 p-0.5 rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => { setAccountType('bank'); setAccountId(bankAccounts[0]?.id); }}
                  className={`px-2.5 py-1 rounded-md transition-all ${accountType === 'bank' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                  بانک
                </button>
                <button
                  type="button"
                  onClick={() => { setAccountType('cashbox'); setAccountId(cashBoxes[0]?.id); }}
                  className={`px-2.5 py-1 rounded-md transition-all ${accountType === 'cashbox' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                  صندوق نقدی
                </button>
              </div>
            </div>

            <select
              value={accountId || ''}
              onChange={e => setAccountId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold"
              required
            >
              {accountType === 'bank' ? (
                bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} - موجودی فعلی: {formatCurrency(b.balance)}
                  </option>
                ))
              ) : (
                cashBoxes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.cashierName}) - موجودی فعلی: {formatCurrency(c.balance)}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">دسته‌بندی و سرفصل مالی</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium"
            >
              {currentCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ سند (تومان) *</label>
              <input
                type="number"
                value={amount || ''}
                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold font-mono"
                dir="ltr"
                required
              />
              {amount > 0 && (
                <p className="text-[11px] text-blue-600 font-bold mt-1 leading-snug">
                  {numberToPersianWords(amount)} تومان
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاریخ سند</label>
              <div className="relative">
                <DatePicker
                  value={dateObj}
                  onChange={setDateObj as any}
                  calendar={persian}
                  locale={persian_fa}
                  calendarPosition="bottom-right"
                  inputClass="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs text-slate-700"
                />
                <Calendar size={15} className="absolute right-2.5 top-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Tracking Code */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">شماره پیگیری / کد ارجاع</label>
            <input
              type="text"
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value)}
              placeholder="شماره پیگیری واریز، شماره چک یا فیش"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-mono"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">شرح و توضیحات</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="توضیحات تکمیلی بابت این تراکنش..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
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
              className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-50 ${
                action === 'deposit'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
              }`}
            >
              <Save size={16} />
              <span>{isSubmitting ? 'در حال ثبت...' : (action === 'deposit' ? 'ثبت سند واریز' : 'ثبت سند برداشت')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
