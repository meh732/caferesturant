import React, { useState, useEffect } from 'react';
import { db, RawMaterial, Warehouse } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Package, Save, AlertCircle, DollarSign, Layers } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

interface RawMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMaterial?: RawMaterial | null;
}

const MATERIAL_CATEGORIES = [
  'پروتئینی (گوشت، مرغ، ماهی)',
  'لبنیات و پنیر',
  'برنج، حبوبات و غلات',
  'نان و خمیر پیتزا',
  'روغن، سس و چاشنی‌ها',
  'سبزیجات، صیفی‌جات و ترشی',
  'نوشیدنی‌ها و شربت‌ها',
  'ملزومات بسته‌بندی و ظروف',
  'ادویه‌جات و طعم‌دهنده‌ها',
  'سایر اقلام مصرفی',
];

const COMMON_UNITS = ['کیلوگرم', 'گرم', 'عدد', 'لیتر', 'میلی‌لیتر', 'بسته', 'کارتن', 'قوطی', 'بطری'];

export default function RawMaterialModal({
  isOpen,
  onClose,
  initialMaterial,
}: RawMaterialModalProps) {
  const warehouses = useLiveQuery(() => db.warehouses.filter(w => w.isActive).toArray()) || [];

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState(MATERIAL_CATEGORIES[0]);
  const [unit, setUnit] = useState('کیلوگرم');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [minStockAlert, setMinStockAlert] = useState<number>(10);
  const [notes, setNotes] = useState('');

  // Initial stock for new material
  const [initialWarehouseId, setInitialWarehouseId] = useState<number | undefined>(undefined);
  const [initialQuantity, setInitialQuantity] = useState<number | undefined>(undefined);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMaterial) {
      setName(initialMaterial.name);
      setCode(initialMaterial.code);
      setCategory(initialMaterial.category);
      setUnit(initialMaterial.unit);
      setUnitPrice(initialMaterial.unitPrice || 0);
      setMinStockAlert(initialMaterial.minStockAlert || 10);
      setNotes(initialMaterial.notes || '');
      setInitialWarehouseId(undefined);
      setInitialQuantity(undefined);
    } else {
      db.rawMaterials.count().then(cnt => {
        setCode(`RM-${101 + cnt}`);
      });
      setName('');
      setCategory(MATERIAL_CATEGORIES[0]);
      setUnit('کیلوگرم');
      setUnitPrice(0);
      setMinStockAlert(10);
      setNotes('');
      if (warehouses.length > 0) {
        const defaultWh = warehouses.find(w => w.isPurchaseDefault) || warehouses[0];
        setInitialWarehouseId(defaultWh.id);
      }
      setInitialQuantity(undefined);
    }
    setError(null);
  }, [initialMaterial, isOpen, warehouses.length]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('لطفا نام کالا / ماده اولیه را وارد کنید.');
      return;
    }

    if (!code.trim()) {
      setError('لطفا کد کالا را وارد کنید.');
      return;
    }

    try {
      if (initialMaterial?.id) {
        await db.rawMaterials.update(initialMaterial.id, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          category,
          unit,
          unitPrice: Number(unitPrice),
          weightedAveragePrice: initialMaterial.weightedAveragePrice || Number(unitPrice),
          minStockAlert: Number(minStockAlert),
          notes: notes.trim(),
        });
      } else {
        const newId = await db.rawMaterials.add({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          category,
          unit,
          unitPrice: Number(unitPrice),
          weightedAveragePrice: Number(unitPrice),
          minStockAlert: Number(minStockAlert),
          notes: notes.trim(),
          createdAt: new Date(),
        });

        // If starting stock is specified
        if (initialWarehouseId && initialQuantity && initialQuantity > 0) {
          await db.warehouseStocks.add({
            warehouseId: initialWarehouseId,
            materialId: newId,
            quantity: Number(initialQuantity),
            lastUpdated: new Date()
          });

          const wh = warehouses.find(w => w.id === initialWarehouseId);
          await db.stockTransactions.add({
            warehouseId: initialWarehouseId,
            warehouseName: wh ? wh.name : 'انبار',
            materialId: newId,
            materialName: name.trim(),
            unit,
            type: 'manual_adjust',
            quantityChange: Number(initialQuantity),
            quantityBefore: 0,
            quantityAfter: Number(initialQuantity),
            unitCost: Number(unitPrice),
            totalCost: Math.round(Number(initialQuantity) * Number(unitPrice)),
            referenceId: 'INIT-BALANCE',
            referenceType: 'adjustment',
            description: 'ثبت موجودی ابتدای دوره در انبار',
            date: new Date(),
            createdAt: new Date()
          });
        }
      }

      onClose();
    } catch (err) {
      console.error(err);
      setError('خطا در ذخیره‌سازی اطلاعات کالا.');
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
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Package size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {initialMaterial?.id ? 'ویرایش کالا / ماده اولیه' : 'تعریف ماده اولیه و کالای انبار'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              کاتالوگ مواد اولیه جهت استفاده در خریدها، فرمول تولید و کنترل موجودی
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
              <label className="block text-xs font-bold text-slate-700 mb-1.5">عنوان کالا / ماده اولیه *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="مثال: فیله مرغ تازه، پنیر پیتزا مطهر"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">کد کالا *</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="RM-101"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-center font-mono font-bold"
                dir="ltr"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">دسته‌بندی</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
              >
                {MATERIAL_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">واحد سنجش</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
              >
                {COMMON_UNITS.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                نرخ پایه / آخرین خرید هر واحد (تومان)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={unitPrice || ''}
                  onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
                  placeholder="مثال: 320000"
                  className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  dir="ltr"
                />
                <DollarSign size={16} className="absolute right-2.5 top-3 text-slate-400" />
              </div>
              {unitPrice > 0 && (
                <p className="text-[11px] text-teal-600 font-bold mt-1">
                  {formatCurrency(unitPrice)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                حداقل موجودی هشدار ({unit})
              </label>
              <input
                type="number"
                step="any"
                value={minStockAlert}
                onChange={e => setMinStockAlert(parseFloat(e.target.value) || 0)}
                placeholder="مثال: 10"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                dir="ltr"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                اگر موجودی از این عدد کمتر شود، هشدار کسری نمایش داده می‌شود.
              </p>
            </div>
          </div>

          {/* If creating new: Optional starting balance in warehouse */}
          {!initialMaterial && warehouses.length > 0 && (
            <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200/60 space-y-2.5">
              <span className="text-xs font-bold text-amber-900 block">
                موجودی ابتدای دوره در انبار (اختیاری)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-amber-800 mb-1">انبار تحویل</label>
                  <select
                    value={initialWarehouseId || ''}
                    onChange={e => setInitialWarehouseId(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-xl border border-amber-200 bg-white text-xs outline-none"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-amber-800 mb-1">مقدار موجودی ({unit})</label>
                  <input
                    type="number"
                    step="any"
                    value={initialQuantity !== undefined ? initialQuantity : ''}
                    onChange={e => setInitialQuantity(e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="مثلا 25"
                    className="w-full px-2.5 py-2 rounded-xl border border-amber-200 bg-white text-xs outline-none"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">یادداشت و مشخصات فنی</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="برند، تاریخ انقضا، دمای نگهداری یا شرایط تحویل..."
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
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Save size={16} />
              <span>ذخیره کالا</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
