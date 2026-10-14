import React, { useState, useEffect } from 'react';
import { db, BankAccount, ChequeBook } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, X, Check, Building2, Hash, Layers, FileText, AlertCircle } from 'lucide-react';
import { triggerServerDbSync } from '../../lib/serverSync';
import { formatCurrency } from '../../lib/utils';

interface ChequeBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingChequeBook?: ChequeBook | null;
  defaultBankAccountId?: number;
}

export default function ChequeBookModal({
  isOpen,
  onClose,
  editingChequeBook,
  defaultBankAccountId
}: ChequeBookModalProps) {
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];

  const [bankAccountId, setBankAccountId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [series, setSeries] = useState('ص/۱۴');
  const [sayadPrefix, setSayadPrefix] = useState('');
  const [startSerial, setStartSerial] = useState<number>(1001);
  const [totalLeaves, setTotalLeaves] = useState<number>(25);
  const [endSerial, setEndSerial] = useState<number>(1025);
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingChequeBook) {
      setBankAccountId(editingChequeBook.bankAccountId);
      setTitle(editingChequeBook.title);
      setSeries(editingChequeBook.series);
      setSayadPrefix(editingChequeBook.sayadPrefix || '');
      setStartSerial(editingChequeBook.startSerial);
      setEndSerial(editingChequeBook.endSerial);
      setTotalLeaves(editingChequeBook.totalLeaves);
      setNotes(editingChequeBook.notes || '');
      setIsActive(editingChequeBook.isActive);
    } else {
      const initialBankId = defaultBankAccountId || (bankAccounts[0]?.id ?? '');
      setBankAccountId(initialBankId);
      const b = bankAccounts.find(x => x.id === initialBankId);
      setTitle(b ? `دسته چک ۲۵ برگی ${b.bankName}` : 'دسته چک ۲۵ برگی');
      setSeries('ص/۱۴');
      setSayadPrefix('');
      setStartSerial(1001);
      setTotalLeaves(25);
      setEndSerial(1001 + 25 - 1);
      setNotes('');
      setIsActive(true);
    }
    setError(null);
  }, [editingChequeBook, isOpen, defaultBankAccountId, bankAccounts.length]);

  // When startSerial or totalLeaves changes, auto-update endSerial
  const handleLeavesChange = (leaves: number) => {
    setTotalLeaves(leaves);
    setEndSerial(startSerial + leaves - 1);
  };

  const handleStartSerialChange = (start: number) => {
    setStartSerial(start);
    setEndSerial(start + totalLeaves - 1);
  };

  const handleBankChange = (id: number) => {
    setBankAccountId(id);
    const b = bankAccounts.find(x => x.id === id);
    if (b && !editingChequeBook) {
      setTitle(`دسته چک ${totalLeaves} برگی ${b.bankName}`);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankAccountId) {
      setError('لطفاً حساب بانکی متصل به این دسته چک را انتخاب کنید.');
      return;
    }
    if (!title.trim()) {
      setError('لطفاً عنوان یا نام دسته چک را وارد کنید.');
      return;
    }
    if (startSerial <= 0) {
      setError('شماره برگ شروع باید بزرگتر از صفر باشد.');
      return;
    }
    if (endSerial < startSerial) {
      setError('شماره برگ پایان نمی‌تواند کوچکتر از شماره برگ شروع باشد.');
      return;
    }

    const selectedBank = bankAccounts.find(b => b.id === Number(bankAccountId));
    if (!selectedBank) {
      setError('حساب بانکی انتخاب شده معتبر نیست.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Omit<ChequeBook, 'id'> = {
        bankAccountId: Number(bankAccountId),
        bankName: selectedBank.bankName,
        accountNumber: selectedBank.accountNumber,
        title: title.trim(),
        series: series.trim() || 'ص',
        sayadPrefix: sayadPrefix.trim() || undefined,
        startSerial: Number(startSerial),
        endSerial: Number(endSerial),
        totalLeaves: Number(totalLeaves) || (endSerial - startSerial + 1),
        notes: notes.trim() || undefined,
        isActive,
        createdAt: editingChequeBook ? editingChequeBook.createdAt : new Date()
      };

      if (editingChequeBook?.id) {
        await db.chequeBooks.update(editingChequeBook.id, payload);
      } else {
        await db.chequeBooks.add(payload);
      }

      triggerServerDbSync(100);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'خطا در ثبت دسته چک.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
            <BookOpen size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {editingChequeBook ? 'ویرایش دسته چک صیادی' : 'تعریف دسته چک جدید'}
            </h2>
            <p className="text-xs text-slate-500">
              مدیریت برگه‌ها، شماره‌های سریال و اتصال به حساب جاری بانکی
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Select Bank */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              حساب بانکی متصل <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={bankAccountId}
                onChange={e => handleBankChange(Number(e.target.value))}
                className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-amber-500 outline-none transition-all"
                required
              >
                <option value="">انتخاب حساب جاری بانکی...</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} {b.accountNumber ? `(حساب: ${b.accountNumber})` : ''} - مانده: {formatCurrency(b.balance)}
                  </option>
                ))}
              </select>
            </div>
            {bankAccounts.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                ابتدا باید یک حساب بانکی فعال در سیستم تعریف کنید.
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              عنوان دسته چک <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="مثلا: دسته چک ۲۵ برگی بانک سامان شعبه ونک"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-amber-500 outline-none transition-all"
              required
            />
          </div>

          {/* Series & Sayad Prefix */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                سری دسته چک
              </label>
              <input
                type="text"
                value={series}
                onChange={e => setSeries(e.target.value)}
                placeholder="مثلا: ص/۱۴ یا 12/الف"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-amber-500 outline-none transition-all text-center"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                پیش‌شماره صیاد (۴ رقم اول)
              </label>
              <input
                type="text"
                value={sayadPrefix}
                onChange={e => setSayadPrefix(e.target.value)}
                placeholder="مثلا: 2847"
                maxLength={4}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-center font-bold text-slate-800 focus:bg-white focus:border-amber-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Leaves Quick Buttons */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              تعداد برگ‌های دسته چک
            </label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[10, 25, 50, 100].map(cnt => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleLeavesChange(cnt)}
                  className={`py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    totalLeaves === cnt
                      ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {cnt} برگی
                </button>
              ))}
            </div>
          </div>

          {/* Start and End Serial */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                شماره برگ شروع <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                value={startSerial}
                onChange={e => handleStartSerialChange(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-center font-bold text-slate-800 focus:border-amber-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                شماره برگ پایان
              </label>
              <input
                type="number"
                value={endSerial}
                onChange={e => {
                  const end = Number(e.target.value);
                  setEndSerial(end);
                  setTotalLeaves(Math.max(1, end - startSerial + 1));
                }}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-center font-bold text-slate-800 focus:border-amber-500 outline-none"
                required
              />
            </div>
            <div className="col-span-2 text-center text-[11px] text-slate-500">
              محدوده برگ‌ها: از شماره <span className="font-bold font-mono text-amber-600">{startSerial}</span> تا{' '}
              <span className="font-bold font-mono text-amber-600">{endSerial}</span> (مجموعاً{' '}
              <span className="font-bold text-slate-800">{totalLeaves}</span> برگ چک صیادی)
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">توضیحات اختیاری</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="مثلا: تحویل گرفته شده از شعبه در تاریخ ..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-amber-500 outline-none transition-all"
            />
          </div>

          {/* Active Status */}
          <div className="pt-1 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-slate-300 cursor-pointer"
              />
              <span className="font-bold text-slate-700">دسته چک فعال و آماده صدور برگ باشد</span>
            </label>
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Check size={16} />
              <span>{editingChequeBook ? 'بروزرسانی دسته چک' : 'ثبت نهایی دسته چک'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
