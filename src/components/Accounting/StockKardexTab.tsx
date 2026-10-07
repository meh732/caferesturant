import React, { useState, useMemo } from 'react';
import { db, StockTransaction, Warehouse, RawMaterial, StockTransactionType } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrency } from '../../lib/utils';
import { format } from 'date-fns-jalali';
import { 
  FileSpreadsheet, Search, Filter, ArrowDownRight, ArrowUpRight, 
  ArrowLeftRight, Trash2, ShoppingBag, Utensils, ClipboardCheck, AlertTriangle 
} from 'lucide-react';

interface StockKardexTabProps {
  initialMaterialId?: number;
}

export default function StockKardexTab({
  initialMaterialId,
}: StockKardexTabProps) {
  const warehouses = useLiveQuery(() => db.warehouses.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const transactions = useLiveQuery(() => db.stockTransactions.toArray()) || [];

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | 'all'>('all');
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | 'all'>(initialMaterialId || 'all');
  const [selectedType, setSelectedType] = useState<StockTransactionType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(tx => {
        if (selectedWarehouseId !== 'all' && tx.warehouseId !== selectedWarehouseId) return false;
        if (selectedMaterialId !== 'all' && tx.materialId !== selectedMaterialId) return false;
        if (selectedType !== 'all' && tx.type !== selectedType) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const matchesMat = tx.materialName.toLowerCase().includes(q);
          const matchesWh = tx.warehouseName.toLowerCase().includes(q);
          const matchesRef = tx.referenceId?.toLowerCase().includes(q);
          const matchesDesc = tx.description?.toLowerCase().includes(q);
          return matchesMat || matchesWh || matchesRef || matchesDesc;
        }

        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedWarehouseId, selectedMaterialId, selectedType, searchQuery]);

  // Aggregate stats
  const totalInboundQty = useMemo(() => {
    return filteredTransactions
      .filter(tx => tx.quantityChange > 0)
      .reduce((sum, tx) => sum + tx.quantityChange, 0);
  }, [filteredTransactions]);

  const totalOutboundQty = useMemo(() => {
    return filteredTransactions
      .filter(tx => tx.quantityChange < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.quantityChange), 0);
  }, [filteredTransactions]);

  const totalTransactionsValue = useMemo(() => {
    return filteredTransactions.reduce((sum, tx) => sum + tx.totalCost, 0);
  }, [filteredTransactions]);

  const getTransactionBadge = (type: StockTransactionType) => {
    switch (type) {
      case 'purchase_in':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-max">
            <ArrowDownRight size={13} />
            <span>ورود از خرید</span>
          </span>
        );
      case 'sale_production_out':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 flex items-center gap-1 w-max">
            <Utensils size={13} />
            <span>مصرف پخت و فروش</span>
          </span>
        );
      case 'transfer_in':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 flex items-center gap-1 w-max">
            <ArrowLeftRight size={13} />
            <span>حواله ورودی</span>
          </span>
        );
      case 'transfer_out':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 flex items-center gap-1 w-max">
            <ArrowLeftRight size={13} />
            <span>حواله خروجی</span>
          </span>
        );
      case 'waste_out':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1 w-max">
            <Trash2 size={13} />
            <span>ضایعات و افت بار</span>
          </span>
        );
      case 'manual_adjust':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 flex items-center gap-1 w-max">
            <ClipboardCheck size={13} />
            <span>تعدیل انبارگردانی</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Aggregate Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-emerald-700">کل ورودی به انبار (+)</span>
            <h3 className="text-xl font-bold text-emerald-900 mt-1 font-mono">
              {totalInboundQty.toLocaleString()} واحد
            </h3>
            <span className="text-[11px] text-emerald-600 mt-1 block">
              خرید و حواله ورودی
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ArrowDownRight size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-amber-700">کل خروجی از انبار (-)</span>
            <h3 className="text-xl font-bold text-amber-900 mt-1 font-mono">
              {totalOutboundQty.toLocaleString()} واحد
            </h3>
            <span className="text-[11px] text-amber-600 mt-1 block">
              مصرف فروش، پخت و حواله
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <ArrowUpRight size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">گردش ریالی تراکنش‌های فیلترشده</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {formatCurrency(totalTransactionsValue)}
            </h3>
            <span className="text-[11px] text-slate-400 mt-1 block">
              ارزش کل رویدادهای مالی انبار
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
            <FileSpreadsheet size={24} />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجو در شرح سند یا کالا..."
              className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
            />
            <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
          </div>

          {/* Warehouse Filter */}
          <select
            value={selectedWarehouseId}
            onChange={e => setSelectedWarehouseId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none"
          >
            <option value="all">همه انبارها</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>

          {/* Material Filter */}
          <select
            value={selectedMaterialId}
            onChange={e => setSelectedMaterialId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none"
          >
            <option value="all">همه اقلام و کالاها</option>
            {rawMaterials.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>

          {/* Operation Type Filter */}
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs outline-none"
          >
            <option value="all">همه انواع عملیات</option>
            <option value="purchase_in">ورود از فاکتور خرید (+)</option>
            <option value="sale_production_out">مصرف پخت و سفارش فروش (-)</option>
            <option value="transfer_in">حواله ورودی بین انبارها (+)</option>
            <option value="transfer_out">حواله خروجی بین انبارها (-)</option>
            <option value="waste_out">ضایعات و افت کالا (-)</option>
            <option value="manual_adjust">تعدیل انبارگردانی</option>
          </select>
        </div>

        <span className="text-xs text-slate-500 font-bold">
          {filteredTransactions.length} ردیف کاردکس
        </span>
      </div>

      {/* Kardex Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">تاریخ و ساعت</th>
                <th className="py-3.5 px-4">نوع عملیات</th>
                <th className="py-3.5 px-4">انبار</th>
                <th className="py-3.5 px-4">شرح کالا / ماده اولیه</th>
                <th className="py-3.5 px-4 text-center">شماره سند / پیگیری</th>
                <th className="py-3.5 px-4 text-center font-bold text-emerald-800">وارده (+)</th>
                <th className="py-3.5 px-4 text-center font-bold text-amber-800">صادره (-)</th>
                <th className="py-3.5 px-4 text-center font-black text-slate-900">مانده بعد از سند</th>
                <th className="py-3.5 px-4 text-left">نرخ واحد (تومان)</th>
                <th className="py-3.5 px-4 text-left">ارزش کل (تومان)</th>
                <th className="py-3.5 px-4">شرح و توضیحات سند</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    هیچ تراکنش انباری با فیلترهای انتخابی یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => {
                  const isInbound = tx.quantityChange > 0;
                  const isOutbound = tx.quantityChange < 0;

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                        {format(new Date(tx.date), 'yyyy/MM/dd HH:mm')}
                      </td>
                      <td className="py-3 px-4">
                        {getTransactionBadge(tx.type)}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {tx.warehouseName}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {tx.materialName}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                        {tx.referenceId ? `#${tx.referenceId}` : '-'}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700">
                        {isInbound ? `+${tx.quantityChange} ${tx.unit}` : '-'}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-amber-700">
                        {isOutbound ? `${Math.abs(tx.quantityChange)} ${tx.unit}` : '-'}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-black text-slate-900">
                        {tx.quantityAfter} {tx.unit}
                      </td>

                      <td className="py-3 px-4 text-left font-mono text-slate-700">
                        {formatCurrency(tx.unitCost)}
                      </td>

                      <td className="py-3 px-4 text-left font-mono font-bold text-slate-900">
                        {formatCurrency(tx.totalCost)}
                      </td>

                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={tx.description}>
                        {tx.description}
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
  );
}
