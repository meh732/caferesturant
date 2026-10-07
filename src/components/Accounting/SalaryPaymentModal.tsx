import React, { useState, useEffect } from 'react';
import { db, Employee, SalaryPayment } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Save, DollarSign, Calendar, CreditCard, Hash, AlertCircle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

interface SalaryPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedEmployeeId?: number;
}

const PERSIAN_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

export default function SalaryPaymentModal({
  isOpen,
  onClose,
  preselectedEmployeeId,
}: SalaryPaymentModalProps) {
  const employees = useLiveQuery(() => db.employees.filter(e => e.isActive).toArray()) || [];

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | undefined>(preselectedEmployeeId);
  const [periodMonth, setPeriodMonth] = useState('');
  const [baseAmount, setBaseAmount] = useState<number>(0);
  const [bonusAmount, setBonusAmount] = useState<number>(0);
  const [deductionsAmount, setDeductionsAmount] = useState<number>(0);
  const [paymentDateObj, setPaymentDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'cheque'>('card');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Initialize default period based on Jalali month
  useEffect(() => {
    if (isOpen) {
      const todayJalali = new DateObject({ calendar: persian });
      const currentMonthIndex = todayJalali.month.index;
      const currentYear = todayJalali.year;
      setPeriodMonth(`حقوق ${PERSIAN_MONTHS[currentMonthIndex]} ${currentYear}`);

      if (preselectedEmployeeId) {
        setSelectedEmployeeId(preselectedEmployeeId);
        const emp = employees.find(e => e.id === preselectedEmployeeId);
        if (emp) {
          setBaseAmount(emp.baseSalary || 0);
        }
      } else if (employees.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(employees[0].id);
        setBaseAmount(employees[0].baseSalary || 0);
      }
      setBonusAmount(0);
      setDeductionsAmount(0);
      setTrackingNumber('');
      setNotes('');
      setError(null);
    }
  }, [isOpen, preselectedEmployeeId, employees.length]);

  const handleEmployeeChange = (id: number) => {
    setSelectedEmployeeId(id);
    const emp = employees.find(e => e.id === id);
    if (emp) {
      setBaseAmount(emp.baseSalary || 0);
    }
  };

  const totalPaid = Math.max(0, (Number(baseAmount) || 0) + (Number(bonusAmount) || 0) - (Number(deductionsAmount) || 0));

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedEmployeeId) {
      setError('لطفا کارمند مورد نظر را انتخاب کنید.');
      return;
    }

    if (totalPaid <= 0) {
      setError('مبلغ پرداختی حقوق باید بیشتر از صفر باشد.');
      return;
    }

    const employee = employees.find(e => e.id === selectedEmployeeId);
    const employeeName = employee ? employee.name : 'کارمند';

    const paymentData: SalaryPayment = {
      employeeId: selectedEmployeeId,
      employeeName,
      periodMonth: periodMonth.trim() || 'دوره جاری',
      baseAmount: Number(baseAmount) || 0,
      bonusAmount: Number(bonusAmount) || 0,
      deductionsAmount: Number(deductionsAmount) || 0,
      totalPaid,
      paymentDate: paymentDateObj ? paymentDateObj.toDate() : new Date(),
      paymentMethod,
      trackingNumber: trackingNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date(),
    };

    try {
      await db.salaryPayments.add(paymentData);
      onClose();
    } catch (err) {
      console.error(err);
      setError('خطا در ثبت پرداخت حقوق.');
    }
  };

  const selectedEmp = employees.find(e => e.id === selectedEmployeeId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <DollarSign size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">ثبت پرداخت حقوق و دستمزد</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ثبت فیش پرداختی حقوق به پرسنل و شناسایی خودکار در هزینه‌های سیستم
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">انتخاب کارمند / شخص *</label>
            <select
              value={selectedEmployeeId || ''}
              onChange={e => handleEmployeeChange(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm transition-all font-medium"
              required
            >
              {employees.length === 0 && <option value="">هیچ کارمند فعالی تعریف نشده است</option>}
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} — {e.roleTitle} {e.baseSalary ? `(حقوق پایه: ${formatCurrency(e.baseSalary)})` : ''}
                </option>
              ))}
            </select>
            {selectedEmp?.bankCard && (
              <p className="text-[11px] text-slate-500 mt-1 font-mono flex items-center gap-1" dir="ltr">
                <CreditCard size={12} />
                <span>شماره واریز: {selectedEmp.bankCard}</span>
              </p>
            )}
          </div>

          {/* Period Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">عنوان دوره یا ماه پرداخت</label>
            <input
              type="text"
              value={periodMonth}
              onChange={e => setPeriodMonth(e.target.value)}
              placeholder="مثال: حقوق فروردین 1405"
              className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm outline-none"
              required
            />
          </div>

          {/* Calculation breakdown: Base + Bonus - Deductions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">حقوق پایه (تومان)</label>
              <input
                type="number"
                value={baseAmount || ''}
                onChange={e => setBaseAmount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold outline-none"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-emerald-800 mb-1 flex items-center gap-0.5">
                <ArrowUpRight size={13} className="text-emerald-600" />
                <span>پاداش و اضافه‌کاری</span>
              </label>
              <input
                type="number"
                value={bonusAmount || ''}
                onChange={e => setBonusAmount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl border border-emerald-200 bg-white text-sm font-bold text-emerald-700 outline-none"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-rose-800 mb-1 flex items-center gap-0.5">
                <ArrowDownRight size={13} className="text-rose-600" />
                <span>کسورات و مساعده</span>
              </label>
              <input
                type="number"
                value={deductionsAmount || ''}
                onChange={e => setDeductionsAmount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl border border-rose-200 bg-white text-sm font-bold text-rose-700 outline-none"
                dir="ltr"
              />
            </div>
          </div>

          {/* Net Paid Highlight Display */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900">خالص پرداختی نهایی به کارمند:</span>
            <div className="text-right">
              <span className="text-xl font-black text-emerald-700">{formatCurrency(totalPaid)}</span>
            </div>
          </div>

          {/* Row: Payment Date & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">تاریخ پرداخت (شمسی)</label>
              <DatePicker
                value={paymentDateObj}
                onChange={(d: any) => setPaymentDateObj(d)}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm outline-none"
                containerClassName="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">روش پرداخت</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs sm:text-sm outline-none"
              >
                <option value="card">کارت به کارت / واریز پایا</option>
                <option value="cash">نقدی</option>
                <option value="cheque">چک بانکی</option>
              </select>
            </div>
          </div>

          {/* Tracking Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">شماره پیگیری یا ارجاع بانکی (اختیاری)</label>
            <div className="relative">
              <input
                type="text"
                value={trackingNumber}
                onChange={e => setTrackingNumber(e.target.value)}
                placeholder="مثال: پیگیری 9823412"
                className="w-full pl-4 pr-10 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm font-mono outline-none"
                dir="ltr"
              />
              <Hash size={16} className="absolute right-3.5 top-3 text-slate-400" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">توضیحات فیش حقوق</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="توضیحات تکمیلی پیرامون ساعات کار، کارکرد یا مساعده‌ها..."
              rows={2}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm outline-none resize-none"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={employees.length === 0}
              className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save size={16} />
              <span>ثبت پرداخت حقوق</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
