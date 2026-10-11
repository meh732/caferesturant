import React, { useState, useEffect } from 'react';
import { db, Cheque, BankAccount } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, FileText, Save, AlertCircle, Calendar } from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import { triggerServerDbSync } from '../../lib/serverSync';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

interface ChequeModalProps {
  isOpen: boolean;
  onClose: () => void;
  cheque?: Cheque | null;
  defaultType?: 'received' | 'paid';
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
  'سایر بانک‌ها'
];

export default function ChequeModal({
  isOpen,
  onClose,
  cheque,
  defaultType = 'received'
}: ChequeModalProps) {
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];

  const [type, setType] = useState<'received' | 'paid'>(defaultType);
  const [chequeNumber, setChequeNumber] = useState('');
  const [sayadNumber, setSayadNumber] = useState('');
  const [bankName, setBankName] = useState(COMMON_BANKS[0]);
  const [customBankName, setCustomBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [issueDateObj, setIssueDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [dueDateObj, setDueDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [drawerName, setDrawerName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [bankAccountId, setBankAccountId] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<Cheque['status']>('pending');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cheque) {
      setType(cheque.type);
      setChequeNumber(cheque.chequeNumber);
      setSayadNumber(cheque.sayadNumber || '');
      if (COMMON_BANKS.includes(cheque.bankName)) {
        setBankName(cheque.bankName);
        setCustomBankName('');
      } else {
        setBankName('سایر بانک‌ها');
        setCustomBankName(cheque.bankName);
      }
      setBranch(cheque.branch || '');
      setAmount(cheque.amount);
      setIssueDateObj(new DateObject({ date: new Date(cheque.issueDate), calendar: persian }));
      setDueDateObj(new DateObject({ date: new Date(cheque.dueDate), calendar: persian }));
      setDrawerName(cheque.drawerName);
      setRecipientName(cheque.recipientName || '');
      setBankAccountId(cheque.bankAccountId);
      setStatus(cheque.status);
      setNotes(cheque.notes || '');
    } else {
      setType(defaultType);
      setChequeNumber('');
      setSayadNumber('');
      setBankName(COMMON_BANKS[0]);
      setCustomBankName('');
      setBranch('');
      setAmount(0);
      setIssueDateObj(new DateObject({ calendar: persian }));
      const nextWeek = new DateObject({ calendar: persian }).add(7, 'days');
      setDueDateObj(nextWeek);
      setDrawerName(defaultType === 'received' ? '' : 'فروشگاه من');
      setRecipientName(defaultType === 'received' ? 'فروشگاه من' : '');
      setBankAccountId(bankAccounts[0]?.id);
      setStatus('pending');
      setNotes('');
    }
    setError(null);
  }, [cheque, defaultType, isOpen, bankAccounts.length]);

  if (!isOpen) return null;

  const handleSayadChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 16);
    setSayadNumber(raw);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalBank = bankName === 'سایر بانک‌ها' ? customBankName.trim() : bankName.trim();
    if (!chequeNumber.trim()) {
      setError('لطفا شماره سریال چک را وارد کنید.');
      return;
    }
    if (!finalBank) {
      setError('لطفا نام بانک صادرکننده را مشخص کنید.');
      return;
    }
    if (amount <= 0) {
      setError('مبلغ چک باید بیشتر از صفر باشد.');
      return;
    }
    if (!drawerName.trim()) {
      setError('لطفا نام صادرکننده چک را وارد کنید.');
      return;
    }

    try {
      const issueDate = issueDateObj ? issueDateObj.toDate() : new Date();
      const dueDate = dueDateObj ? dueDateObj.toDate() : new Date();

      if (cheque?.id) {
        await db.cheques.update(cheque.id, {
          type,
          chequeNumber: chequeNumber.trim(),
          sayadNumber: sayadNumber.trim() || undefined,
          bankName: finalBank,
          branch: branch.trim() || undefined,
          amount: Number(amount) || 0,
          issueDate,
          dueDate,
          drawerName: drawerName.trim(),
          recipientName: recipientName.trim() || undefined,
          bankAccountId,
          status,
          notes: notes.trim() || undefined,
        });
      } else {
        await db.cheques.add({
          type,
          chequeNumber: chequeNumber.trim(),
          sayadNumber: sayadNumber.trim() || undefined,
          bankName: finalBank,
          branch: branch.trim() || undefined,
          amount: Number(amount) || 0,
          issueDate,
          dueDate,
          drawerName: drawerName.trim(),
          recipientName: recipientName.trim() || undefined,
          bankAccountId,
          status,
          notes: notes.trim() || undefined,
          createdAt: new Date(),
        });
      }

      triggerServerDbSync(100);
      onClose();
    } catch (err) {
      console.error(err);
      setError('خطا در ثبت اطلاعات چک.');
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
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {cheque ? 'ویرایش مشخصات چک صیادی' : (type === 'received' ? 'ثبت چک صیادی دریافتی' : 'ثبت چک صیادی پرداختی')}
            </h3>
            <p className="text-xs text-slate-500">
              ثبت در سامانه صیاد و دفتر چک، پیگیری تاریخ سررسید و وصول
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
          {/* Cheque Type Toggle */}
          {!cheque && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setType('received');
                  setDrawerName('');
                  setRecipientName('فروشگاه من');
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-all ${
                  type === 'received'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                چک دریافتی (از مشتری در فروش)
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('paid');
                  setDrawerName('فروشگاه من');
                  setRecipientName('');
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-all ${
                  type === 'paid'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                چک پرداختی (به تأمین‌کننده در خرید)
              </button>
            </div>
          )}

          {/* Serial & Sayad ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">شماره سریال چک *</label>
              <input
                type="text"
                value={chequeNumber}
                onChange={e => setChequeNumber(e.target.value)}
                placeholder="مثال: 789102"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs font-mono font-bold"
                dir="ltr"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">شناسه صیادی (۱۶ رقم)</label>
              <input
                type="text"
                value={sayadNumber}
                onChange={e => handleSayadChange(e.target.value)}
                placeholder="شناسه ۱۶ رقمی چک صیاد"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs font-mono"
                dir="ltr"
                maxLength={16}
              />
            </div>
          </div>

          {/* Bank & Branch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">بانک صادرکننده *</label>
              <select
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs font-medium"
              >
                {COMMON_BANKS.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نام یا کد شعبه</label>
              <input
                type="text"
                value={branch}
                onChange={e => setBranch(e.target.value)}
                placeholder="مثال: شعبه مرکزی"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs"
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
                placeholder="نام بانک صادرکننده"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs"
                required
              />
            </div>
          )}

          {/* Amount & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ چک (تومان) *</label>
              <input
                type="number"
                value={amount || ''}
                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-sm font-bold font-mono"
                dir="ltr"
                required
              />
              {amount > 0 && (
                <p className="text-[11px] text-amber-600 font-bold mt-1 leading-snug">
                  {numberToPersianWords(amount)} تومان
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاریخ سررسید چک *</label>
              <div className="relative">
                <DatePicker
                  value={dueDateObj}
                  onChange={setDueDateObj as any}
                  calendar={persian}
                  locale={persian_fa}
                  calendarPosition="bottom-right"
                  inputClass="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs text-slate-700 font-bold"
                />
                <Calendar size={15} className="absolute right-2.5 top-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Drawer & Recipient */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">صادرکننده / صاحب حساب *</label>
              <input
                type="text"
                value={drawerName}
                onChange={e => setDrawerName(e.target.value)}
                placeholder="نام صاحب حساب صادرکننده"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">در وجه / ذینفع</label>
              <input
                type="text"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                placeholder="نام شخص یا شرکت دریافت‌کننده"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs"
              />
            </div>
          </div>

          {/* Associated Bank Account */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">حساب بانکی متصل جهت واریز یا کسر وجه</label>
            <select
              value={bankAccountId || ''}
              onChange={e => setBankAccountId(Number(e.target.value) || undefined)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs font-medium"
            >
              <option value="">-- بدون انتخاب حساب بانکی مشخص --</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bankName} ({b.accountHolder}) - موجودی: {formatCurrency(b.balance)}
                </option>
              ))}
            </select>
          </div>

          {/* Status selector (if editing) */}
          {cheque && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">وضعیت چک</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs font-bold text-slate-800"
              >
                <option value="pending">⏳ در جریان وصول (نزد صندوق / در انتظار سررسید)</option>
                <option value="cleared">✅ وصول شده / پاس شده (واریز به حساب)</option>
                <option value="bounced">❌ برگشت خورده (نکول شده)</option>
                <option value="returned">↩️ عودت داده شده به صاحب چک</option>
                <option value="transferred">➡️ خرج شده (واگذار شده به شخص ثالث)</option>
                <option value="cancelled">🚫 باطل شده</option>
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات و بابت</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="توضیحات اختیاری، بابت فاکتور خرید یا فروش، شماره تماس صادرکننده..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs"
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
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20 active:scale-95"
            >
              <Save size={16} />
              <span>{cheque ? 'ذخیره تغییرات' : 'ثبت چک در سامانه'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
