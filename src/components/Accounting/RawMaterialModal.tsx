import React, { useState, useEffect } from 'react';
import { db, RawMaterial, Warehouse, adjustWarehouseStock, DEFAULT_RAW_MATERIAL_CATEGORIES, ensureDefaultRawMaterialCategories } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Package, Save, AlertCircle, DollarSign, FolderPlus, Edit2, Plus, Minus, Trash2, Building2 } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import RawMaterialCategoryModal from './RawMaterialCategoryModal';

interface RawMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMaterial?: RawMaterial | null;
  canDelete?: boolean;
}

const COMMON_UNITS = ['کیلوگرم', 'گرم', 'عدد', 'لیتر', 'میلی‌لیتر', 'بسته', 'کارتن', 'قوطی', 'بطری', 'پرس', 'شانه', 'کیسه'];

export default function RawMaterialModal({
  isOpen,
  onClose,
  initialMaterial,
  canDelete = true,
}: RawMaterialModalProps) {
  const warehouses = useLiveQuery(() => db.warehouses.filter(w => w.isActive).toArray()) || [];
  const allStocks = useLiveQuery(() => db.warehouseStocks.toArray(), []) || [];
  const dbCategories = useLiveQuery(
    () => db.rawMaterialCategories.toArray().then(cats => 
      cats.sort((a, b) => (a.order ?? a.id ?? 0) - (b.order ?? b.id ?? 0))
    ),
    []
  ) || [];

  const categoryOptions = dbCategories.length > 0
    ? dbCategories.map(c => c.name)
    : DEFAULT_RAW_MATERIAL_CATEGORIES.map(c => c.name);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState(categoryOptions[0] || 'پروتئینی (گوشت، مرغ، ماهی)');
  const [unit, setUnit] = useState('کیلوگرم');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [minStockAlert, setMinStockAlert] = useState<number>(10);
  const [notes, setNotes] = useState('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Per-warehouse stock map: warehouseId -> quantity
  const [warehouseQuantities, setWarehouseQuantities] = useState<Record<number, number>>({});

  // Auto-seed default raw material categories if empty
  useEffect(() => {
    if (dbCategories.length === 0) {
      ensureDefaultRawMaterialCategories();
    }
  }, [dbCategories.length]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialMaterial) {
      setName(initialMaterial.name);
      setCode(initialMaterial.code);
      setCategory(initialMaterial.category);
      setUnit(initialMaterial.unit);
      setUnitPrice(initialMaterial.unitPrice || 0);
      setMinStockAlert(initialMaterial.minStockAlert || 10);
      setNotes(initialMaterial.notes || '');

      const map: Record<number, number> = {};
      warehouses.forEach(w => {
        if (w.id) {
          const st = allStocks.find(s => s.warehouseId === w.id && s.materialId === initialMaterial.id);
          map[w.id] = st ? Number(st.quantity) || 0 : 0;
        }
      });
      setWarehouseQuantities(map);
    } else {
      db.rawMaterials.count().then(cnt => {
        setCode(`RM-${101 + cnt}`);
      });
      setName('');
      setCategory(categoryOptions[0] || 'پروتئینی (گوشت، مرغ، ماهی)');
      setUnit('کیلوگرم');
      setUnitPrice(0);
      setMinStockAlert(10);
      setNotes('');
      const map: Record<number, number> = {};
      warehouses.forEach(w => {
        if (w.id) map[w.id] = 0;
      });
      setWarehouseQuantities(map);
    }
    setError(null);
  }, [initialMaterial, isOpen, warehouses.length, allStocks.length]);

  if (!isOpen) return null;

  const handleStepWarehouseQty = (whId: number, delta: number) => {
    setWarehouseQuantities(prev => {
      const current = Number(prev[whId]) || 0;
      const next = Math.max(0, Math.round((current + delta) * 1000) / 1000);
      return { ...prev, [whId]: next };
    });
  };

  const handleSetWarehouseQty = (whId: number, val: string) => {
    const parsed = val === '' ? 0 : Math.max(0, parseFloat(val) || 0);
    setWarehouseQuantities(prev => ({ ...prev, [whId]: parsed }));
  };

  const handleDeleteMaterial = async () => {
    if (!initialMaterial?.id) return;
    if (!window.confirm(`آیا از حذف کامل کالای «${initialMaterial.name}» و موجودی‌های مرتبط با آن در انبارها اطمینان دارید؟`)) {
      return;
    }
    try {
      await db.warehouseStocks.where('materialId').equals(initialMaterial.id).delete();
      await db.rawMaterials.delete(initialMaterial.id);
      onClose();
    } catch (err) {
      console.error(err);
      setError('خطا در حذف کالا.');
    }
  };

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
          weightedAveragePrice: Number(unitPrice),
          minStockAlert: Number(minStockAlert),
          notes: notes.trim(),
        });

        // Sync any modified warehouse stock quantities
        for (const wh of warehouses) {
          if (!wh.id) continue;
          const newQty = Number(warehouseQuantities[wh.id]) || 0;
          const existingSt = allStocks.find(s => s.warehouseId === wh.id && s.materialId === initialMaterial.id);
          const oldQty = existingSt ? Number(existingSt.quantity) || 0 : 0;
          if (Math.abs(newQty - oldQty) > 0.0001) {
            await adjustWarehouseStock({
              warehouseId: wh.id,
              materialId: initialMaterial.id,
              newQuantity: newQty,
              reason: `ویرایش موجودی از پنجره ویرایش کالا (${name.trim()})`,
              referenceId: `EDIT-MAT-${initialMaterial.id}`
            });
          }
        }
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

        // Save initial stocks for any warehouse with quantity > 0
        for (const wh of warehouses) {
          if (!wh.id) continue;
          const initQty = Number(warehouseQuantities[wh.id]) || 0;
          if (initQty > 0) {
            await db.warehouseStocks.add({
              warehouseId: wh.id,
              materialId: newId,
              quantity: initQty,
              lastUpdated: new Date()
            });

            await db.stockTransactions.add({
              warehouseId: wh.id,
              warehouseName: wh.name,
              materialId: newId,
              materialName: name.trim(),
              unit,
              type: 'manual_adjust',
              quantityChange: initQty,
              quantityBefore: 0,
              quantityAfter: initQty,
              unitCost: Number(unitPrice),
              totalCost: Math.round(initQty * Number(unitPrice)),
              referenceId: 'INIT-BALANCE',
              referenceType: 'adjustment',
              description: 'ثبت موجودی ابتدای دوره در انبار',
              date: new Date(),
              createdAt: new Date()
            });
          }
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
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative max-h-[94vh] overflow-y-auto">
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
              {initialMaterial?.id ? 'ویرایش کالا / ماده اولیه و موجودی انبارها' : 'تعریف ماده اولیه و کالای انبار'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ویرایش مشخصات، دسته‌بندی، قیمت واحد و افزایش یا کاهش موجودی در هر انبار
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">دسته‌بندی</label>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 hover:underline cursor-pointer"
                  title="افزودن دسته جدید، ویرایش نام یا حذف دسته‌بندی‌ها"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>مدیریت دسته‌ها</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs font-medium"
                >
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  title="ویرایش، افزودن یا حذف دسته‌بندی‌ها"
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 text-slate-600 transition-colors cursor-pointer shrink-0"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
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

          {/* Warehouse Stock Management (Add / Subtract / Edit for both new and existing materials) */}
          {warehouses.length > 0 && (
            <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Building2 size={15} className="text-amber-700" />
                  <span>
                    {initialMaterial?.id
                      ? `موجودی این کالا در انبارها (افزایش / کاهش / ویرایش بر حسب ${unit})`
                      : `موجودی ابتدای دوره در انبارها (بر حسب ${unit})`}
                  </span>
                </span>
                <span className="text-[11px] font-bold text-amber-700">
                  جمع کل: {Object.values(warehouseQuantities).reduce((s, q) => s + (Number(q) || 0), 0)} {unit}
                </span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {warehouses.map(w => {
                  const whId = w.id!;
                  const currentVal = warehouseQuantities[whId] ?? 0;
                  return (
                    <div
                      key={whId}
                      className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-amber-200/80 shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800 truncate">{w.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{w.code}</div>
                      </div>

                      <div className="flex items-center gap-1.5" dir="ltr">
                        <button
                          type="button"
                          onClick={() => handleStepWarehouseQty(whId, -1)}
                          className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center transition-colors cursor-pointer"
                          title="کاهش ۱ واحد"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={currentVal}
                          onChange={e => handleSetWarehouseQty(whId, e.target.value)}
                          className="w-20 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-center font-mono font-bold text-xs text-slate-800 outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleStepWarehouseQty(whId, 1)}
                          className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center transition-colors cursor-pointer"
                          title="افزایش ۱ واحد"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
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

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div>
              {initialMaterial?.id && canDelete && (
                <button
                  type="button"
                  onClick={handleDeleteMaterial}
                  className="px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 size={15} />
                  <span>حذف کالا</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
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
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Category Manager Modal */}
      <RawMaterialCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSelectCategory={(catName) => setCategory(catName)}
      />
    </div>
  );
}

