import React, { useState, useMemo } from 'react';
import { db, Warehouse, RawMaterial, WarehouseStock } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, Package, ArrowLeftRight, ClipboardCheck, Plus, Search, Filter, 
  AlertTriangle, CheckCircle2, TrendingDown, Layers, DollarSign, Edit2, Trash2, 
  Eye, ShieldCheck, MapPin, Phone, User, ArrowDownRight, ArrowUpRight
} from 'lucide-react';

interface WarehousesInventoryTabProps {
  onOpenNewWarehouse: () => void;
  onEditWarehouse: (warehouse: Warehouse) => void;
  onOpenNewMaterial: () => void;
  onEditMaterial: (material: RawMaterial) => void;
  onOpenNewTransfer: () => void;
  onOpenAdjustModal: (whId?: number, matId?: number) => void;
  onSelectKardexMaterial?: (matId: number) => void;
}

type InnerView = 'live_matrix' | 'warehouses' | 'materials';

export default function WarehousesInventoryTab({
  onOpenNewWarehouse,
  onEditWarehouse,
  onOpenNewMaterial,
  onEditMaterial,
  onOpenNewTransfer,
  onOpenAdjustModal,
  onSelectKardexMaterial,
}: WarehousesInventoryTabProps) {
  const { can } = useAuth();
  const [innerView, setInnerView] = useState<InnerView>('live_matrix');
  const [selectedWhFilter, setSelectedWhFilter] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Queries
  const warehouses = useLiveQuery(() => db.warehouses.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const warehouseStocks = useLiveQuery(() => db.warehouseStocks.toArray()) || [];

  // Map of (warehouseId + '_' + materialId) -> quantity
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    warehouseStocks.forEach(s => {
      map.set(`${s.warehouseId}_${s.materialId}`, s.quantity);
    });
    return map;
  }, [warehouseStocks]);

  // Total quantity across all warehouses per materialId
  const totalStockPerMaterial = useMemo(() => {
    const map = new Map<number, number>();
    warehouseStocks.forEach(s => {
      const prev = map.get(s.materialId) || 0;
      map.set(s.materialId, prev + s.quantity);
    });
    return map;
  }, [warehouseStocks]);

  // Total inventory valuation (ریالی) across all warehouses
  const totalInventoryValuation = useMemo(() => {
    let sum = 0;
    rawMaterials.forEach(m => {
      if (!m.id) return;
      const totalQty = totalStockPerMaterial.get(m.id) || 0;
      const unitCost = m.weightedAveragePrice || m.unitPrice || 0;
      sum += (Math.max(0, totalQty) * unitCost);
    });
    return Math.round(sum);
  }, [rawMaterials, totalStockPerMaterial]);

  // Valuation per warehouse
  const valuationPerWarehouse = useMemo(() => {
    const map = new Map<number, number>();
    warehouses.forEach(w => {
      if (!w.id) return;
      let whSum = 0;
      warehouseStocks
        .filter(s => s.warehouseId === w.id)
        .forEach(s => {
          const mat = rawMaterials.find(m => m.id === s.materialId);
          const unitCost = mat ? (mat.weightedAveragePrice || mat.unitPrice || 0) : 0;
          whSum += (Math.max(0, s.quantity) * unitCost);
        });
      map.set(w.id, Math.round(whSum));
    });
    return map;
  }, [warehouses, warehouseStocks, rawMaterials]);

  // Low stock items count
  const lowStockCount = useMemo(() => {
    let count = 0;
    rawMaterials.forEach(m => {
      if (!m.id) return;
      const totalQty = totalStockPerMaterial.get(m.id) || 0;
      if (totalQty <= (m.minStockAlert || 10)) {
        count++;
      }
    });
    return count;
  }, [rawMaterials, totalStockPerMaterial]);

  // Unique categories
  const categoriesList = useMemo(() => {
    return Array.from(new Set(rawMaterials.map(m => m.category).filter(Boolean)));
  }, [rawMaterials]);

  // Filtered materials for Live Matrix table
  const displayedMaterials = useMemo(() => {
    return rawMaterials.filter(m => {
      if (!m.id) return false;
      const totalQty = totalStockPerMaterial.get(m.id) || 0;
      const specificQty = selectedWhFilter === 'all'
        ? totalQty
        : (stockMap.get(`${selectedWhFilter}_${m.id}`) || 0);

      // Low stock filter
      if (onlyLowStock && totalQty > (m.minStockAlert || 10)) {
        return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && m.category !== categoryFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = m.name.toLowerCase().includes(q);
        const matchesCode = m.code.toLowerCase().includes(q);
        const matchesCat = m.category.toLowerCase().includes(q);
        return matchesName || matchesCode || matchesCat;
      }

      return true;
    });
  }, [rawMaterials, totalStockPerMaterial, stockMap, selectedWhFilter, onlyLowStock, categoryFilter, searchQuery]);

  const handleDeleteWarehouse = async (id?: number) => {
    if (!id) return;
    const wh = warehouses.find(w => w.id === id);
    if (wh?.isProductionDefault) {
      alert('این انبار، انبار پیش‌فرض خط تولید و آشپزخانه است و قابل حذف نیست. ابتدا انبار دیگری را به عنوان پیش‌فرض پخت تعیین کنید.');
      return;
    }
    if (window.confirm(`آیا از حذف انبار "${wh?.name}" اطمینان دارید؟`)) {
      await db.warehouses.delete(id);
    }
  };

  const handleDeleteMaterial = async (id?: number) => {
    if (!id) return;
    const mat = rawMaterials.find(m => m.id === id);
    if (window.confirm(`آیا از حذف ماده اولیه "${mat?.name}" اطمینان دارید؟`)) {
      await db.rawMaterials.delete(id);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">ارزش کل موجودی انبارها</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {formatCurrency(totalInventoryValuation)}
            </h3>
            <span className="text-[11px] text-teal-600 font-bold mt-1 block">
              مجموع دارایی مواد اولیه
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">تعداد انبارهای فعال</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {warehouses.length} انبار
            </h3>
            <span className="text-[11px] text-blue-600 font-bold mt-1 block">
              تعریف انبار نامحدود
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Building2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">تنوع اقلام و مواد اولیه</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {rawMaterials.length} قلم
            </h3>
            <span className="text-[11px] text-indigo-600 font-bold mt-1 block">
              در {categoriesList.length} دسته‌بندی
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Package size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-rose-600">اقلام نیازمند سفارش</span>
            <h3 className="text-xl font-bold text-rose-700 mt-1 font-mono">
              {lowStockCount} قلم
            </h3>
            <span className="text-[11px] text-rose-500 mt-1 block">
              {lowStockCount > 0 ? 'موجودی زیر حداقل هشدار' : 'موجودی تمامی اقلام کافی است'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
        </div>
      </div>

      {/* Top Controls & Navigation Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        
        {/* Inner View Switcher */}
        <div className="flex p-1 bg-slate-100 rounded-xl gap-1 shrink-0">
          <button
            onClick={() => setInnerView('live_matrix')}
            className={`py-2 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              innerView === 'live_matrix'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={15} />
            <span>موجودی زنده انبارها</span>
          </button>

          <button
            onClick={() => setInnerView('warehouses')}
            className={`py-2 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              innerView === 'warehouses'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 size={15} />
            <span>مدیریت انبارها ({warehouses.length})</span>
          </button>

          <button
            onClick={() => setInnerView('materials')}
            className={`py-2 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              innerView === 'materials'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package size={15} />
            <span>کاتالوگ مواد اولیه ({rawMaterials.length})</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {can('stock_transfer') && (
            <button
              onClick={onOpenNewTransfer}
              className="py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeftRight size={15} />
              <span>حواله بین انبارها</span>
            </button>
          )}

          {can('stock_adjust') && (
            <button
              onClick={() => onOpenAdjustModal()}
              className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ClipboardCheck size={15} />
              <span>انبارگردانی و مغایرت</span>
            </button>
          )}

          {can('stock_manage_materials') && (
            <button
              onClick={onOpenNewMaterial}
              className="py-2 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>تعریف ماده اولیه</span>
            </button>
          )}

          {can('stock_manage_warehouses') && (
            <button
              onClick={onOpenNewWarehouse}
              className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Building2 size={15} />
              <span>تعریف انبار جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* ----------------- VIEW 1: LIVE INVENTORY MATRIX ----------------- */}
      {innerView === 'live_matrix' && (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              
              {/* Search */}
              <div className="relative min-w-[200px] flex-1 max-w-sm">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="جستجوی نام یا کد کالا..."
                  className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                />
                <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
              </div>

              {/* Warehouse Filter */}
              <select
                value={selectedWhFilter}
                onChange={e => setSelectedWhFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none"
              >
                <option value="all">همه انبارها (مجموع کل)</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs outline-none"
              >
                <option value="all">همه دسته‌بندی‌ها</option>
                {categoriesList.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Low stock checkbox */}
            <label className="flex items-center gap-2 text-xs font-bold text-rose-700 bg-rose-50 px-3 py-2 rounded-xl border border-rose-200 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={onlyLowStock}
                onChange={e => setOnlyLowStock(e.target.checked)}
                className="w-3.5 h-3.5 text-rose-600 rounded-sm"
              />
              <span>فقط اقلام دارای کسری (زیر حداقل موجودی)</span>
            </label>
          </div>

          {/* Live Inventory Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 w-12 text-center">کد کالا</th>
                    <th className="py-3.5 px-4">عنوان ماده اولیه / کالا</th>
                    <th className="py-3.5 px-4">دسته‌بندی</th>
                    <th className="py-3.5 px-4 text-center">واحد</th>
                    {selectedWhFilter === 'all' ? (
                      <>
                        <th className="py-3.5 px-4 text-center">انبار آشپزخانه/تولید</th>
                        <th className="py-3.5 px-4 text-center">انبار مرکزی</th>
                        <th className="py-3.5 px-4 text-center font-black text-slate-900">موجودی کل</th>
                      </>
                    ) : (
                      <th className="py-3.5 px-4 text-center font-black text-slate-900">
                        موجودی در {warehouses.find(w => w.id === selectedWhFilter)?.name || 'انبار'}
                      </th>
                    )}
                    <th className="py-3.5 px-4 text-center">حداقل هشدار</th>
                    <th className="py-3.5 px-4 text-center">وضعیت موجودی</th>
                    <th className="py-3.5 px-4 text-left">میانگین نرخ خرید</th>
                    <th className="py-3.5 px-4 text-left">ارزش کل موجودی</th>
                    <th className="py-3.5 px-4 text-center w-28">عملیات سریع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        هیچ کالایی با فیلترهای انتخابی یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    displayedMaterials.map(mat => {
                      if (!mat.id) return null;
                      const totalQty = totalStockPerMaterial.get(mat.id) || 0;
                      const minAlert = mat.minStockAlert || 10;

                      // Kitchen and central quantities
                      const kitchenWh = warehouses.find(w => w.isProductionDefault);
                      const centralWh = warehouses.find(w => w.type === 'central');
                      const kitchenQty = kitchenWh?.id ? (stockMap.get(`${kitchenWh.id}_${mat.id}`) || 0) : 0;
                      const centralQty = centralWh?.id ? (stockMap.get(`${centralWh.id}_${mat.id}`) || 0) : 0;
                      const specificQty = selectedWhFilter !== 'all' ? (stockMap.get(`${selectedWhFilter}_${mat.id}`) || 0) : 0;

                      // Displayed quantity & valuation for selected warehouse filter
                      const activeQty = selectedWhFilter === 'all' ? totalQty : specificQty;
                      const isLow = totalQty <= minAlert && totalQty > 0;
                      const isZeroOrNegative = activeQty <= 0;
                      const unitCost = mat.weightedAveragePrice || mat.unitPrice || 0;
                      const totalVal = Math.round(Math.max(0, activeQty) * unitCost);

                      return (
                        <tr key={mat.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-600">
                            {mat.code}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {mat.name}
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {mat.category}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-600 font-medium">
                            {mat.unit}
                          </td>

                          {selectedWhFilter === 'all' ? (
                            <>
                              <td className="py-3 px-4 text-center font-mono">
                                <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                                  kitchenQty > 0 ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {kitchenQty} {mat.unit}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center font-mono">
                                <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                                  centralQty > 0 ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {centralQty} {mat.unit}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center font-mono font-black text-slate-900 text-sm">
                                {totalQty} {mat.unit}
                              </td>
                            </>
                          ) : (
                            <td className="py-3 px-4 text-center font-mono font-black text-slate-900 text-sm">
                              {specificQty} {mat.unit}
                            </td>
                          )}

                          <td className="py-3 px-4 text-center font-mono text-slate-500">
                            {minAlert} {mat.unit}
                          </td>

                          <td className="py-3 px-4 text-center">
                            {isZeroOrNegative ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                ✕ اتمام موجودی
                              </span>
                            ) : isLow ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                ⚠ هشدار کسر موجودی
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ موجودی کافی
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-left font-mono text-slate-700">
                            {formatCurrency(unitCost)}
                          </td>

                          <td className="py-3 px-4 text-left font-mono font-bold text-slate-900">
                            {formatCurrency(totalVal)}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => onOpenAdjustModal(selectedWhFilter === 'all' ? undefined : selectedWhFilter, mat.id)}
                                title="تعدیل و انبارگردانی سریع"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <ClipboardCheck size={15} />
                              </button>
                              <button
                                onClick={onOpenNewTransfer}
                                title="حواله انتقال این کالا"
                                className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <ArrowLeftRight size={15} />
                              </button>
                              <button
                                onClick={() => onEditMaterial(mat)}
                                title="ویرایش کالا"
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- VIEW 2: WAREHOUSES LIST ----------------- */}
      {innerView === 'warehouses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Building2 size={20} className="text-blue-600" />
              <span>فهرست انبارهای تعریف‌شده در سیستم</span>
            </h3>
            <button
              onClick={onOpenNewWarehouse}
              className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>تعریف انبار جدید</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.map(wh => {
              const whValuation = valuationPerWarehouse.get(wh.id!) || 0;
              const itemsCountInWh = warehouseStocks.filter(s => s.warehouseId === wh.id && s.quantity > 0).length;

              return (
                <div
                  key={wh.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
                >
                  <div>
                    {/* Header tags */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {wh.code}
                        </span>
                        <h4 className="text-base font-bold text-slate-900 mt-1">
                          {wh.name}
                        </h4>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {wh.isProductionDefault && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                            ★ خط تولید/آشپزخانه
                          </span>
                        )}
                        {wh.isPurchaseDefault && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200">
                            ★ پیش‌فرض خرید
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Info rows */}
                    <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                      {wh.manager && (
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-slate-400" />
                          <span>مسئول انبار: <strong className="text-slate-800">{wh.manager}</strong></span>
                        </div>
                      )}
                      {wh.phone && (
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-slate-400" />
                          <span dir="ltr">{wh.phone}</span>
                        </div>
                      )}
                      {wh.location && (
                        <div className="flex items-center gap-2">
                          <MapPin size={14} className="text-slate-400" />
                          <span>موقعیت: {wh.location}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats and Action Footer */}
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex justify-between items-center text-xs mb-3">
                      <span className="text-slate-500">ارزش کل کالاهای این انبار:</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {formatCurrency(whValuation)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">
                        {itemsCountInWh} قلم کالا موجود
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedWhFilter(wh.id!);
                            setInnerView('live_matrix');
                          }}
                          className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                        >
                          مشاهده موجودی
                        </button>
                        <button
                          onClick={() => onEditWarehouse(wh)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                          <Edit2 size={15} />
                        </button>
                        {!wh.isProductionDefault && (
                          <button
                            onClick={() => handleDeleteWarehouse(wh.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ----------------- VIEW 3: MATERIALS CATALOG ----------------- */}
      {innerView === 'materials' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Package size={20} className="text-amber-600" />
              <span>کاتالوگ مواد اولیه و اقلام مصرفی</span>
            </h3>
            <button
              onClick={onOpenNewMaterial}
              className="py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>تعریف ماده اولیه جدید</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 w-12 text-center">کد</th>
                    <th className="py-3.5 px-4">عنوان کالا</th>
                    <th className="py-3.5 px-4">دسته‌بندی</th>
                    <th className="py-3.5 px-4 text-center">واحد سنجش</th>
                    <th className="py-3.5 px-4 text-left">آخرین نرخ خرید (تومان)</th>
                    <th className="py-3.5 px-4 text-left">میانگین موزون نرخ (تومان)</th>
                    <th className="py-3.5 px-4 text-center">حداقل هشدار</th>
                    <th className="py-3.5 px-4 text-center">موجودی کل انبارها</th>
                    <th className="py-3.5 px-4 text-center w-24">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rawMaterials.map(m => {
                    const totalQty = totalStockPerMaterial.get(m.id!) || 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-500">
                          {m.code}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {m.name}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {m.category}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-600 font-medium">
                          {m.unit}
                        </td>
                        <td className="py-3 px-4 text-left font-mono text-slate-700">
                          {formatCurrency(m.unitPrice || 0)}
                        </td>
                        <td className="py-3 px-4 text-left font-mono font-bold text-teal-800">
                          {formatCurrency(m.weightedAveragePrice || m.unitPrice || 0)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-500">
                          {m.minStockAlert || 10} {m.unit}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                          {totalQty} {m.unit}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => onEditMaterial(m)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteMaterial(m.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
