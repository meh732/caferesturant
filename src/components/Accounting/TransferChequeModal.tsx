import React, { useState, useEffect } from 'react';
import { db, Cheque, Expense, Customer } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, ArrowUpRight, Check, AlertCircle, Building2, Calendar, FileText } from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import { transferReceivedCheque } from '../../lib/accountingServices';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

interface TransferChequeModalProps {
  isOpen: boolean;
  onClose: () => void;
  cheque: Cheque | null;
}

export default function TransferChequeModal({
  isOpen,
  onClose,
  cheque
}: TransferChequeModalProps) {
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];

  // Unique list of suppliers/parties
  const suggestedParties = React.useMemo(() => {
    const set = new Set<string>();
    expenses.forEach(e => {
      if (e.supplierOrPerson?.trim()) set.add(e.supplierOrPerson.trim());
    });
    customers.forEach(c => {
      if (c.name?.trim()) set.add(c.name.trim());
    });
    return Array.from(set).sort();
  }, [expenses, customers]);

  const [transferredTo, setTransferredTo] = useState('');
  const [transferDateObj, setTransferDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTransferredTo('');
      setTransferDateObj(new DateObject({ calendar: persian }));
      setNotes('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !cheque) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferredTo.trim()) {
      setError('لطفاً نام شخص یا تأمین‌کننده دریافت‌کننده چک را مشخص کنید.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await transferReceivedCheque({
        chequeId: cheque.id!,
        transferredTo: transferredTo.trim(),
        transferredDate: transferDateObj ? transferDateObj.toDate() : new Date(),
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'خطا در ثبت واگذاری و خرج چک.');
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
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ArrowUpRight size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">خرج کردن و واگذاری چک دریافتی</h3>
            <p className="text-xs text-slate-500">
              انتقال برگ چک به تأمین‌کننده یا شخص ثالث و ثبت سند تسویه حساب
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Cheque Summary Card */}
        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200/70 mb-5 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-600">شماره سریال چک:</span>
            <span className="font-mono font-bold text-slate-900 text-sm">#{cheque.chequeNumber}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600">بانک صادرکننده:</span>
            <span className="font-bold text-slate-800">{cheque.bankName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600">مبلغ چک:</span>
            <span className="font-mono font-bold text-emerald-700 text-sm">{formatCurrency(cheque.amount)}</span>
          </div>
          <div className="text-[11px] text-amber-800 font-bold text-left pt-1 border-t border-amber-200/50">
            {numberToPersianWords(cheque.amount)} تومان
          </div>
          <div className="flex justify-between items-center pt-1 text-slate-500 text-[11px]">
            <span>صادرکننده اصلی: {cheque.drawerName}</span>
            <span>سررسید: {new Date(cheque.dueDate).toLocaleDateString('fa-IR')}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Transferred To */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              تحویل‌گیرنده / شخص یا تأمین‌کننده مقصد <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={transferredTo}
                onChange={e => setTransferredTo(e.target.value)}
                placeholder="نام شرکت تأمین‌کننده، طلبکار یا شخص..."
                list="party-suggestions"
                className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-indigo-500 outline-none transition-all"
                required
              />
              <datalist id="party-suggestions">
                {suggestedParties.map((p, idx) => (
                  <option key={idx} value={p} />
                ))}
              </datalist>
            </div>
            {suggestedParties.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400 self-center">پیشنهادات:</span>
                {suggestedParties.slice(0, 4).map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTransferredTo(p)}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transfer Date */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              تاریخ واگذاری و تحویل چک <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <DatePicker
                value={transferDateObj}
                onChange={setTransferDateObj as any}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 outline-none text-xs font-bold text-slate-800"
              />
              <Calendar size={16} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">بابت / توضیحات سند</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="مثلا: بابت تسویه فاکتور خرید مواد اولیه شماره ..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-700 hover:to-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Check size={16} />
              <span>{isSubmitting ? 'در حال ثبت واگذاری...' : 'تأیید و خرج کردن چک'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
