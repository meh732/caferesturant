import React, { useState, useEffect } from 'react';
import { db, Employee } from '../../lib/db';
import { X, Save, User, Phone, CreditCard, DollarSign, Briefcase, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmployee?: Employee | null;
}

const COMMON_ROLES = [
  'سرآشپز (Head Chef)',
  'کمک آشپز / تخته‌کار',
  'صندوق‌دار و سفارش‌گیر',
  'باریستا و بارتندر',
  'سالن‌کار و ویتر',
  'پیک موتوری و ارسال',
  'انباردار و تدارکات',
  'نظافت و شستشو (ظرفشور)',
  'مدیر داخلی سالن',
  'حسابدار',
];

export default function EmployeeModal({ isOpen, onClose, initialEmployee }: EmployeeModalProps) {
  const [name, setName] = useState('');
  const [roleTitle, setRoleTitle] = useState(COMMON_ROLES[0]);
  const [phone, setPhone] = useState('');
  const [nationalCode, setNationalCode] = useState('');
  const [bankCard, setBankCard] = useState('');
  const [baseSalary, setBaseSalary] = useState<number>(0);
  const [salaryType, setSalaryType] = useState<'monthly' | 'daily' | 'hourly'>('monthly');
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialEmployee) {
      setName(initialEmployee.name);
      setRoleTitle(initialEmployee.roleTitle);
      setPhone(initialEmployee.phone);
      setNationalCode(initialEmployee.nationalCode || '');
      setBankCard(initialEmployee.bankCard || '');
      setBaseSalary(initialEmployee.baseSalary || 0);
      setSalaryType(initialEmployee.salaryType || 'monthly');
      setIsActive(initialEmployee.isActive);
      setNotes(initialEmployee.notes || '');
    } else {
      setName('');
      setRoleTitle(COMMON_ROLES[0]);
      setPhone('');
      setNationalCode('');
      setBankCard('');
      setBaseSalary(0);
      setSalaryType('monthly');
      setIsActive(true);
      setNotes('');
    }
    setError(null);
  }, [initialEmployee, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('لطفا نام و نام خانوادگی کارمند را وارد کنید.');
      return;
    }

    const employeeData: Employee = {
      name: name.trim(),
      roleTitle: roleTitle.trim(),
      phone: phone.trim(),
      nationalCode: nationalCode.trim() || undefined,
      bankCard: bankCard.trim() || undefined,
      baseSalary: Number(baseSalary) || 0,
      salaryType,
      isActive,
      notes: notes.trim() || undefined,
      createdAt: initialEmployee?.createdAt || new Date(),
    };

    try {
      if (initialEmployee?.id) {
        await db.employees.update(initialEmployee.id, employeeData);
      } else {
        await db.employees.add(employeeData);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError('خطا در ذخیره اطلاعات کارمند.');
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
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <User size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {initialEmployee?.id ? 'ویرایش مشخصات پرسنل' : 'ثبت کارمند / شخص جدید'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              مشخصات فردی، سمت شغلی و حقوق پایه جهت محاسبه حقوق و دستمزد
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">نام و نام خانوادگی *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="مثال: رضا محمدی"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">سمت شغلی</label>
              <input
                type="text"
                list="rolesList"
                value={roleTitle}
                onChange={e => setRoleTitle(e.target.value)}
                placeholder="انتخاب یا نوشتن سمت..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-xs sm:text-sm transition-all"
              />
              <datalist id="rolesList">
                {COMMON_ROLES.map(r => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">شماره تماس</label>
              <div className="relative">
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0912..."
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm transition-all"
                  dir="ltr"
                />
                <Phone size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">کد ملی (اختیاری)</label>
              <input
                type="text"
                value={nationalCode}
                onChange={e => setNationalCode(e.target.value)}
                placeholder="10 رقم کد ملی"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm transition-all"
                dir="ltr"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">حقوق پایه (تومان)</label>
              <div className="relative">
                <input
                  type="number"
                  value={baseSalary || ''}
                  onChange={e => setBaseSalary(parseFloat(e.target.value) || 0)}
                  placeholder="مبلغ حقوق توافق شده"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm font-bold transition-all"
                  dir="ltr"
                />
                <DollarSign size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
              </div>
              {baseSalary > 0 && (
                <p className="text-[11px] text-teal-600 font-bold mt-1">
                  معادل: {formatCurrency(baseSalary)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">دوره پرداخت حقوق</label>
              <select
                value={salaryType}
                onChange={e => setSalaryType(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-xs sm:text-sm"
              >
                <option value="monthly">ماهانه ثابت</option>
                <option value="daily">روزمزد</option>
                <option value="hourly">ساعتی / پروژه‌ای</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">شماره کارت یا شبا برای واریز حقوق</label>
            <div className="relative">
              <input
                type="text"
                value={bankCard}
                onChange={e => setBankCard(e.target.value)}
                placeholder="شماره ۱۶ رقمی کارت بانکی یا شبا"
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm font-mono transition-all"
                dir="ltr"
              />
              <CreditCard size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">یادداشت / توضیحات</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="نکات شغلی، ساعات کاری یا شرایط توافق..."
              rows={2}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm outline-none transition-all resize-none"
            />
          </div>

          <div className="pt-2 flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
              />
              <span className="text-xs font-bold text-slate-700">پرسنل فعال و مشغول به کار است</span>
            </label>
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
              className="py-2.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Save size={16} />
              <span>{initialEmployee?.id ? 'بروزرسانی مشخصات' : 'ثبت در لیست پرسنل'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
