import React, { useState, useEffect, useMemo } from 'react';
import { db, Warehouse, RawMaterial, WarehouseStock, TransferItem, transferStock } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, ArrowLeftRight, Plus, Trash2, Save, AlertCircle, Calendar, Hash, User, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

interface WarehouseTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (transferId?: number) => void;
}

export default function WarehouseTransferModal({
  isOpen,
  onClose,
  onSuccess,
}: WarehouseTransferModalProps) {
  const warehouses = useLiveQuery(() => db.warehouses.filter(w => w.isActive).toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const warehouseStocks = useLiveQuery(() => db.warehouseStocks.toArray()) || [];

  const [transferNumber, setTransferNumber] = useState('');
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number | undefined>(undefined);
  const [destWarehouseId, setDestWarehouseId] = useState<number | undefined>(undefined);
  const [dateObj, setDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [transferredBy, setTransferredBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');

  // Transfer Items row state
  const [items, setItems] = useState<Array<{
    materialId: number;
    quantity: number;
    notes?: string;
  }>>([]);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default warehouses
  useEffect(() => {
    if (warehouses.length >= 2) {
      if (!sourceWarehouseId) {
        const central = warehouses.find(w => w.type === 'central') || warehouses[0];
        setSourceWarehouseId(central.id);
      }
      if (!destWarehouseId) {
        const kitchen = warehouses.find(w => w.isProductionDefault) || warehouses[1];
        setDestWarehouseId(kitchen.id);
      }
    } else if (warehouses.length === 1) {
      setSourceWarehouseId(warehouses[0].id);
    }
  }, [warehouses, sourceWarehouseId, destWarehouseId]);

  useEffect(() => {
    if (isOpen) {
      db.warehouseTransfers.count().then(cnt => {
        setTransferNumber(`TR-${1001 + cnt}`);
      });
      setDateObj(new DateObject({ calendar: persian }));
      setTransferredBy('');
      setReceivedBy('');
      setNotes('');
      setItems([]);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Stock lookup map for source warehouse: materialId -> current quantity
  const sourceStockMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!sourceWarehouseId) return map;
    warehouseStocks
      .filter(s => s.warehouseId === sourceWarehouseId)
      .forEach(s => map.set(s.materialId, s.quantity));
    return map;
  }, [warehouseStocks, sourceWarehouseId]);

  // Materials lookup
  const materialsMap = useMemo(() => {
    const map = new Map<number, RawMaterial>();
    rawMaterials.forEach(m => {
      if (m.id) map.set(m.id, m);
    });
    return map;
  }, [rawMaterials]);

  if (!isOpen) return null;

  const handleAddItemRow = () => {
    // Pick first material that is not already in items
    const usedIds = new Set(items.map(i => i.materialId));
    const available = rawMaterials.find(m => m.id && !usedIds.has(m.id));
    if (available && available.id) {
      setItems([...items, { materialId: available.id, quantity: 1 }]);
    } else if (rawMaterials.length > 0 && rawMaterials[0].id) {
      setItems([...items, { materialId: rawMaterials[0].id, quantity: 1 }]);
    }
  };

  const handleUpdateItem = (index: number, updates: Partial<{ materialId: number; quantity: number; notes: string }>) => {
    setItems(items.map((item, idx) => idx === index ? { ...item, ...updates } : item));
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  // Calculations
  const calculatedItems: TransferItem[] = items.map(item => {
    const mat = materialsMap.get(item.materialId);
    const unitPrice = mat ? (mat.weightedAveragePrice || mat.unitPrice || 0) : 0;
    return {
      materialId: item.materialId,
      materialName: mat ? mat.name : 'کالای نامشخص',
      unit: mat ? mat.unit : 'عدد',
      quantity: Number(item.quantity) || 0,
      unitPrice,
      totalAmount: Math.round((Number(item.quantity) || 0) * unitPrice),
      notes: item.notes
    };
  });

  const totalQuantity = calculatedItems.reduce((sum, i) => sum + i.quantity, 0);
  const totalValue = calculatedItems.reduce((sum, i) => sum + i.totalAmount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sourceWarehouseId || !destWarehouseId) {
      setError('لطفا انبار مبدا و مقصد را مشخص کنید.');
      return;
    }

    if (sourceWarehouseId === destWarehouseId) {
      setError('انبار مبدا و مقصد نمی‌توانند یکسان باشند.');
      return;
    }

    if (calculatedItems.length === 0) {
      setError('لطفا حداقل یک قلم کالا به حواله اضافه کنید.');
      return;
    }

    // Check for negative or zero quantities
    for (const it of calculatedItems) {
      if (it.quantity <= 0) {
        setError(`مقدار انتقال برای "${it.materialName}" باید بزرگتر از صفر باشد.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const transfer = await transferStock({
        transferNumber: transferNumber.trim(),
        sourceWarehouseId,
        destWarehouseId,
        transferDate: dateObj ? dateObj.toDate() : new Date(),
        transferredBy: transferredBy.trim(),
        receivedBy: receivedBy.trim(),
        items: calculatedItems,
        notes: notes.trim()
      });

      if (onSuccess) onSuccess(transfer.id);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'خطا در ثبت و اجرای حواله انتقال بین انبارها.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative max-h-[92vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <ArrowLeftRight size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              صدور حواله انتقال بین انبارها
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              جابجایی کالا و مواد اولیه از انبار مبدا به انبار مقصد با به‌روزرسانی آنی موجودی و کاردکس
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 shrink-0">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden gap-4">
          
          {/* Top Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 shrink-0 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">شماره حواله *</label>
              <div className="relative">
                <input
                  type="text"
                  value={transferNumber}
                  onChange={e => setTransferNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold text-center outline-none"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">تاریخ حواله *</label>
              <DatePicker
                value={dateObj}
                onChange={(val: any) => setDateObj(val)}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-center outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-rose-700 mb-1.5">انبار مبدا (فرستنده) *</label>
              <select
                value={sourceWarehouseId || ''}
                onChange={e => setSourceWarehouseId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-rose-200 bg-rose-50/50 text-xs font-bold outline-none"
                required
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id} disabled={w.id === destWarehouseId}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-emerald-700 mb-1.5">انبار مقصد (گیرنده) *</label>
              <select
                value={destWarehouseId || ''}
                onChange={e => setDestWarehouseId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/50 text-xs font-bold outline-none"
                required
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id} disabled={w.id === sourceWarehouseId}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Personnel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تحویل دهنده (انباردار مبدا)</label>
              <input
                type="text"
                value={transferredBy}
                onChange={e => setTransferredBy(e.target.value)}
                placeholder="نام شخص تحویل‌دهنده"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تحویل گیرنده (انباردار مقصد)</label>
              <input
                type="text"
                value={receivedBy}
                onChange={e => setReceivedBy(e.target.value)}
                placeholder="نام شخص تحویل‌گیرنده"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs outline-none"
              />
            </div>
          </div>

          {/* Items Section Header */}
          <div className="flex items-center justify-between shrink-0 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">اقلام حواله انتقالی</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                {items.length} قلم
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddItemRow}
              className="py-1.5 px-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus size={15} />
              <span>افزودن کالا به حواله</span>
            </button>
          </div>

          {/* Items Table Container (Scrollable) */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl min-h-[160px]">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <ArrowLeftRight size={36} className="mb-2 text-slate-300" />
                <p className="text-xs font-medium">هنوز هیچ کالایی برای انتقال اضافه نشده است.</p>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="mt-3 py-1.5 px-4 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-sm hover:bg-blue-700 cursor-pointer"
                >
                  افزودن اولین قلم کالا
                </button>
              </div>
            ) : (
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">نام ماده اولیه / کالا</th>
                    <th className="p-3 text-center">موجودی انبار مبدا</th>
                    <th className="p-3 text-center">مقدار انتقال</th>
                    <th className="p-3 text-center">واحد</th>
                    <th className="p-3 text-left">ارزش تقریبی</th>
                    <th className="p-3 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const mat = materialsMap.get(item.materialId);
                    const sourceQty = sourceStockMap.get(item.materialId) || 0;
                    const isExceeding = Number(item.quantity) > sourceQty;
                    const calcItem = calculatedItems[idx];

                    return (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3">
                          <select
                            value={item.materialId}
                            onChange={e => handleUpdateItem(idx, { materialId: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-xs outline-none"
                          >
                            {rawMaterials.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.code})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${
                            sourceQty > 0 ? 'bg-slate-100 text-slate-700' : 'bg-rose-50 text-rose-600 font-bold'
                          }`}>
                            {sourceQty} {mat?.unit}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0.001"
                            value={item.quantity || ''}
                            onChange={e => handleUpdateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                            className={`w-24 px-2 py-1.5 rounded-lg border text-center font-bold text-xs outline-none ${
                              isExceeding
                                ? 'border-amber-400 bg-amber-50 text-amber-900'
                                : 'border-slate-200 bg-white'
                            }`}
                            dir="ltr"
                            required
                          />
                          {isExceeding && (
                            <span className="block text-[10px] text-amber-700 mt-0.5 font-bold">
                              هشدار: بیشتر از موجودی
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center text-slate-500 font-medium">
                          {mat?.unit || '-'}
                        </td>
                        <td className="p-3 text-left font-mono text-slate-700 font-bold">
                          {formatCurrency(calcItem?.totalAmount || 0)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom Bar: Notes & Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0 items-center">
            <div className="sm:col-span-2">
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="یادداشت و توضیحات حواله (مثلا: تحویل شیفت صبح جهت پخت روزانه)..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs outline-none"
              />
            </div>

            <div className="p-2.5 bg-teal-50 rounded-xl border border-teal-200 text-left flex justify-between items-center sm:block">
              <span className="text-[11px] text-teal-800 font-bold block">ارزش کل اقلام حواله:</span>
              <span className="text-sm font-bold text-teal-900 font-mono">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting || items.length === 0}
              className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-teal-500/20 flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>{isSubmitting ? 'در حال انتقال اقلام...' : 'ثبت و اعمال حواله انتقال'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
