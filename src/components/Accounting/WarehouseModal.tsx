import React, { useState, useEffect } from 'react';
import { db, Warehouse, WarehouseType } from '../../lib/db';
import { X, Building2, Save, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface WarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialWarehouse?: Warehouse | null;
}

const WAREHOUSE_TYPES: { type: WarehouseType; label: string; desc: string }[] = [
  { type: 'central', label: 'انبار مرکزی (تدارکات و دپو)', desc: 'انبار مادر جهت دریافت عمده کالاها و توزیع' },
  { type: 'kitchen_production', label: 'انبار خط تولید و آشپزخانه', desc: 'انبار مصرف مستقیم در پخت (کسر خودکار هنگام فروش)' },
  { type: 'cold_storage', label: 'سردخانه مواد پروتئینی و لبنی', desc: 'نگهداری گوشت، مرغ و اقلام فسادپذیر در دمای پایین' },
  { type: 'dry_storage', label: 'انبار مواد خشک و غلات', desc: 'برنج، روغن، حبوبات، ادویه و بسته‌بندی‌ها' },
  { type: 'bar', label: 'انبار بار، نوشیدنی و کافه', desc: 'نوشیدنی‌ها، سیروپ و ملزومات بار' },
  { type: 'waste', label: 'انبار ضایعات و افت بار', desc: 'رهگیری اقلام اسقاطی یا فاسد شده' },
  { type: 'other', label: 'سایر انبارها', desc: 'انبار فرعی یا متفرقه' },
];

export default function WarehouseModal({
  isOpen,
  onClose,
  initialWarehouse,
}: WarehouseModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<WarehouseType>('central');
  const [manager, setManager] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [isProductionDefault, setIsProductionDefault] = useState(false);
  const [isPurchaseDefault, setIsPurchaseDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialWarehouse) {
      setName(initialWarehouse.name);
      setCode(initialWarehouse.code);
      setType(initialWarehouse.type);
      setManager(initialWarehouse.manager || '');
      setPhone(initialWarehouse.phone || '');
      setLocation(initialWarehouse.location || '');
      setIsProductionDefault(initialWarehouse.isProductionDefault || false);
      setIsPurchaseDefault(initialWarehouse.isPurchaseDefault || false);
      setIsActive(initialWarehouse.isActive !== undefined ? initialWarehouse.isActive : true);
      setNotes(initialWarehouse.notes || '');
    } else {
      // Auto generate code for new warehouse
      db.warehouses.count().then(cnt => {
        setCode(`WH-0${cnt + 1}`);
      });
      setName('');
      setType('central');
      setManager('');
      setPhone('');
      setLocation('');
      setIsProductionDefault(false);
      setIsPurchaseDefault(false);
      setIsActive(true);
      setNotes('');
    }
    setError(null);
  }, [initialWarehouse, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('لطفا نام انبار را وارد کنید.');
      return;
    }

    if (!code.trim()) {
      setError('لطفا کد انبار را وارد کنید.');
      return;
    }

    try {
      // If marking as default, unset other defaults
      if (isProductionDefault) {
        const others = await db.warehouses.where('isProductionDefault').equals(1 as any).toArray();
        for (const o of others) {
          if (o.id && (!initialWarehouse?.id || o.id !== initialWarehouse.id)) {
            await db.warehouses.update(o.id, { isProductionDefault: false });
          }
        }
      }

      if (isPurchaseDefault) {
        const others = await db.warehouses.where('isPurchaseDefault').equals(1 as any).toArray();
        for (const o of others) {
          if (o.id && (!initialWarehouse?.id || o.id !== initialWarehouse.id)) {
            await db.warehouses.update(o.id, { isPurchaseDefault: false });
          }
        }
      }

      const whData: Omit<Warehouse, 'id'> = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        type,
        manager: manager.trim(),
        phone: phone.trim(),
        location: location.trim(),
        isProductionDefault,
        isPurchaseDefault,
        isActive,
        notes: notes.trim(),
        createdAt: initialWarehouse?.createdAt || new Date(),
      };

      if (initialWarehouse?.id) {
        await db.warehouses.update(initialWarehouse.id, whData);
      } else {
        await db.warehouses.add(whData as Warehouse);
      }

      onClose();
    } catch (err: any) {
      console.error(err);
      setError('خطا در ذخیره‌سازی اطلاعات انبار.');
    }
  };

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
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Building2 size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {initialWarehouse?.id ? 'ویرایش مشخصات انبار' : 'تعریف انبار جدید'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              مدیریت انبارها و تعریف نقاط نگهداری و دپوی مواد اولیه
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">نام انبار *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="مثال: انبار مرکزی یا آشپزخانه و خط تولید"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">کد انبار *</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="WH-01"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-center font-mono font-bold"
                dir="ltr"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع و کاربری انبار</label>
            <select
              value={type}
              onChange={e => {
                const newT = e.target.value as WarehouseType;
                setType(newT);
                if (newT === 'kitchen_production') {
                  setIsProductionDefault(true);
                }
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            >
              {WAREHOUSE_TYPES.map(wt => (
                <option key={wt.type} value={wt.type}>
                  {wt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">نام انباردار / مسئول</label>
              <input
                type="text"
                value={manager}
                onChange={e => setManager(e.target.value)}
                placeholder="نام شخص تحویل‌گیرنده"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">شماره تماس مسئول</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0912..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">موقعیت فیزیکی یا آدرس انبار</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="مثال: طبقه منفی ۱، بخش سردخانه مرکزی یا سالن پخت"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>

          {/* Special Role Checkboxes */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isProductionDefault}
                onChange={e => setIsProductionDefault(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded-sm"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">
                  انبار پیش‌فرض خط تولید و پخت (آشپزخانه)
                </span>
                <p className="text-[11px] text-slate-500">
                  مواد اولیه مصرفی در فاکتورهای فروش رستوران به صورت اتوماتیک از این انبار کسر خواهد شد.
                </p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer pt-2 border-t border-slate-200">
              <input
                type="checkbox"
                checked={isPurchaseDefault}
                onChange={e => setIsPurchaseDefault(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded-sm"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">
                  انبار پیش‌فرض ورود فاکتورهای خرید کالا
                </span>
                <p className="text-[11px] text-slate-500">
                  هنگام ثبت فاکتور خرید مواد اولیه، این انبار به عنوان مقصد پیش‌فرض پیشنهاد می‌شود.
                </p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer pt-2 border-t border-slate-200">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded-sm"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">انبار فعال است</span>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">توضیحات و یادداشت</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="نکات مهم یا تجهیزات انبار..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Save size={16} />
              <span>ذخیره انبار</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
