import React, { useState, useEffect, useMemo } from 'react';
import { db, Warehouse, RawMaterial, adjustWarehouseStock } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, ClipboardCheck, Save, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { formatQuantityWithSubUnit } from '../../lib/utils';

interface WarehouseStockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultWarehouseId?: number;
  defaultMaterialId?: number;
}

export default function WarehouseStockAdjustModal({
  isOpen,
  onClose,
  defaultWarehouseId,
  defaultMaterialId,
}: WarehouseStockAdjustModalProps) {
  const warehouses = useLiveQuery(() => db.warehouses.filter(w => w.isActive).toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const warehouseStocks = useLiveQuery(() => db.warehouseStocks.toArray()) || [];

  const [warehouseId, setWarehouseId] = useState<number | undefined>(defaultWarehouseId);
  const [materialId, setMaterialId] = useState<number | undefined>(defaultMaterialId);
  const [actualQuantity, setActualQuantity] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState('انبارگردانی و تطبیق موجودی فیزیکی');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (defaultWarehouseId) setWarehouseId(defaultWarehouseId);
      else if (warehouses.length > 0) setWarehouseId(warehouses[0].id);

      if (defaultMaterialId) setMaterialId(defaultMaterialId);
      else if (rawMaterials.length > 0) setMaterialId(rawMaterials[0].id);

      setActualQuantity(undefined);
      setReason('انبارگردانی و تطبیق موجودی فیزیکی');
      setError(null);
    }
  }, [isOpen, defaultWarehouseId, defaultMaterialId, warehouses.length, rawMaterials.length]);

  const currentSystemQty = useMemo(() => {
    if (!warehouseId || !materialId) return 0;
    const stock = warehouseStocks.find(s => s.warehouseId === warehouseId && s.materialId === materialId);
    return stock ? stock.quantity : 0;
  }, [warehouseStocks, warehouseId, materialId]);

  const selectedMaterial = useMemo(() => {
    return rawMaterials.find(m => m.id === materialId);
  }, [rawMaterials, materialId]);

  const diff = actualQuantity !== undefined ? actualQuantity - currentSystemQty : 0;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!warehouseId || !materialId) {
      setError('لطفا انبار و کالا را مشخص کنید.');
      return;
    }

    if (actualQuantity === undefined || actualQuantity < 0) {
      setError('لطفا موجودی فیزیکی معتبر وارد کنید.');
      return;
    }

    try {
      await adjustWarehouseStock({
        warehouseId,
        materialId,
        newQuantity: Number(actualQuantity),
        reason: reason.trim()
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError('خطا در ثبت تعدیل انبارگردانی.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              انبارگردانی و مغایرت‌گیری
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تطبیق موجودی سیستمی با موجودی فیزیکی واقعی انبار
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
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">انتخاب انبار *</label>
            <select
              value={warehouseId || ''}
              onChange={e => setWarehouseId(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm font-bold outline-none"
              required
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">انتخاب کالا / ماده اولیه *</label>
            <select
              value={materialId || ''}
              onChange={e => setMaterialId(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm font-bold outline-none"
              required
            >
              {rawMaterials.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
          </div>

          {/* Current vs Actual Comparison */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 gap-3 text-center">
            <div>
              <span className="text-[11px] text-slate-500 block mb-1">موجودی فعلی سیستم</span>
              <span className="text-sm font-bold text-slate-800 font-mono">
                {formatQuantityWithSubUnit(currentSystemQty, selectedMaterial?.unit)}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block mb-1">مغایرت محاسبه‌شده</span>
              <span className={`text-sm font-bold font-mono ${
                diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-600'
              }`}>
                {diff > 0 ? `+${diff}` : diff} {selectedMaterial?.unit}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              موجودی فیزیکی شمارش‌شده در انبار ({selectedMaterial?.unit}) *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={actualQuantity !== undefined ? actualQuantity : ''}
              onChange={e => setActualQuantity(e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="مثلا 28"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-base text-center font-mono outline-none"
              dir="ltr"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">علت و شرح مغایرت</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="مثال: انبارگردانی دوره‌ای، ضایعات و افت ناشی از رطوبت یا ..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs outline-none"
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
              <span>ثبت تعدیل انبارگردانی</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
