import React, { useState, useEffect } from 'react';
import { db, Cheque } from '../../lib/db';
import { X, AlertTriangle, Check, AlertCircle, Calendar, FileText, Building2, Ban, ShieldAlert } from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import { bounceCheque } from '../../lib/accountingServices';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

interface BounceChequeModalProps {
  isOpen: boolean;
  onClose: () => void;
  cheque: Cheque | null;
}

const COMMON_BOUNCE_REASONS = [
  'کسری موجودی (عدم کفایت موجودی در حساب صادرکننده)',
  'مغایرت یا عدم تطابق امضای صادرکننده با نمونه امضای بانک',
  'مسدود بودن یا غیرفعال بودن حساب بانکی صادرکننده',
  'دستور عدم پرداخت (اعلام مفقودی یا دستور قضایی)',
  'قلم‌خوردگی یا اختلاف در تاریخ / رقم و حروف چک',
  'نقص اطلاعات یا عدم ثبت/تأیید در سامانه پیچک صیاد',
  'سایر موارد'
];

export default function BounceChequeModal({
  isOpen,
  onClose,
  cheque
}: BounceChequeModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(COMMON_BOUNCE_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [bounceDateObj, setBounceDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [certificateNumber, setCertificateNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedReason(COMMON_BOUNCE_REASONS[0]);
      setCustomReason('');
      setBounceDateObj(new DateObject({ calendar: persian }));
      setCertificateNumber('');
      setNotes('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !cheque) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = selectedReason === 'سایر موارد' ? customReason.trim() : selectedReason;
    if (!finalReason) {
      setError('لطفاً علت برگشت چک را مشخص نمایید.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await bounceCheque({
        chequeId: cheque.id!,
        bounceReason: finalReason,
        bounceDate: bounceDateObj ? bounceDateObj.toDate() : new Date(),
        certificateNumber: certificateNumber.trim() || undefined,
        notes: notes.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'خطا در ثبت برگشت چک.');
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
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/20">
            <ShieldAlert size={26} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">اعلام برگشت چک صیادی</h3>
            <p className="text-xs text-slate-500">
              ثبت گواهی عدم پرداخت، علت برگشت و اصلاح تراز و اسناد حسابداری
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Cheque Summary */}
        <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-200/70 mb-5 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-600">نوع چک:</span>
            <span className="font-bold text-slate-800">
              {cheque.type === 'received' ? 'چک دریافتی از مشتری' : 'چک صادره پرداختی به تأمین‌کننده'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600">شماره سریال و شناسه:</span>
            <span className="font-mono font-bold text-slate-900 text-sm">
              #{cheque.chequeNumber}
              {cheque.sayadNumber && <span className="text-xs text-slate-500 mr-2 font-mono">({cheque.sayadNumber})</span>}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600">بانک صادرکننده:</span>
            <span className="font-bold text-slate-800">{cheque.bankName} {cheque.branch ? `(شعبه ${cheque.branch})` : ''}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600">صاحب حساب / صادرکننده:</span>
            <span className="font-bold text-slate-800">{cheque.drawerName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600">مبلغ چک:</span>
            <span className="font-mono font-bold text-rose-700 text-base">{formatCurrency(cheque.amount)}</span>
          </div>
          <div className="text-[11px] text-rose-800 font-bold text-left pt-1 border-t border-rose-200/50">
            {numberToPersianWords(cheque.amount)} تومان
          </div>
          <div className="flex justify-between items-center pt-1 text-slate-500 text-[11px]">
            <span>سررسید چک: {new Date(cheque.dueDate).toLocaleDateString('fa-IR')}</span>
            <span>وضعیت فعلی: {cheque.status === 'pending' ? 'در جریان وصول' : cheque.status === 'cleared' ? 'وصول شده' : cheque.status}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Reason */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              علت برگشت چک بانکی <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={e => setSelectedReason(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-rose-500 outline-none transition-all cursor-pointer"
            >
              {COMMON_BOUNCE_REASONS.map((r, idx) => (
                <option key={idx} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {selectedReason === 'سایر موارد' && (
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                توضیح دقیق علت برگشت <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="علت درج شده در گواهی عدم پرداخت..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-rose-500 outline-none transition-all"
                required
              />
            </div>
          )}

          {/* Certificate Number & Bounce Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                تاریخ برگشت خوردن <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <DatePicker
                  value={bounceDateObj}
                  onChange={setBounceDateObj as any}
                  calendar={persian}
                  locale={persian_fa}
                  calendarPosition="bottom-right"
                  inputClass="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-rose-500 outline-none text-xs font-bold text-slate-800"
                />
                <Calendar size={16} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                شماره گواهی عدم پرداخت
              </label>
              <div className="relative">
                <FileText size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={certificateNumber}
                  onChange={e => setCertificateNumber(e.target.value)}
                  placeholder="کد رهگیری بانک..."
                  className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:bg-white focus:border-rose-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">اقدامات انجام‌شده / توضیحات پیگیری</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="مثلا: تماس با صاحب حساب جهت واریز وجه ظرف ۲ روز کاری یا ارسال به واحد حقوقی..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-rose-500 outline-none transition-all resize-none"
            />
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 leading-relaxed flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 text-amber-600 mt-0.5" />
            <span>
              با ثبت برگشت، وضعیت چک به «برگشت‌خورده» تغییر یافته و سند حسابداری برگشت در گردش تفصیلی و معین شخص ثبت می‌شود تا مطالبات پیگیری شود.
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
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
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white font-bold shadow-lg shadow-rose-600/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Ban size={16} />
              <span>{isSubmitting ? 'در حال ثبت...' : 'ثبت قطعی برگشت چک'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
