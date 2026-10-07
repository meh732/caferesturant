import React, { useState, useMemo } from 'react';
import { db, WarehouseTransfer } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrency } from '../../lib/utils';
import { format } from 'date-fns-jalali';
import { ArrowLeftRight, Plus, Search, Printer, Eye, Trash2, Calendar, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface WarehouseTransfersTabProps {
  onOpenNewTransfer: () => void;
  onViewReceipt: (transfer: WarehouseTransfer) => void;
}

export default function WarehouseTransfersTab({
  onOpenNewTransfer,
  onViewReceipt,
}: WarehouseTransfersTabProps) {
  const { can } = useAuth();
  const transfers = useLiveQuery(() => db.warehouseTransfers.toArray()) || [];
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTransfers = useMemo(() => {
    return transfers
      .filter(t => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        const matchesNum = t.transferNumber.toLowerCase().includes(q);
        const matchesSrc = t.sourceWarehouseName.toLowerCase().includes(q);
        const matchesDst = t.destWarehouseName.toLowerCase().includes(q);
        const matchesTransferredBy = t.transferredBy?.toLowerCase().includes(q);
        return matchesNum || matchesSrc || matchesDst || matchesTransferredBy;
      })
      .sort((a, b) => new Date(b.transferDate).getTime() - new Date(a.transferDate).getTime());
  }, [transfers, searchQuery]);

  const totalTransfersValue = useMemo(() => {
    return transfers.reduce((sum, t) => sum + t.totalValue, 0);
  }, [transfers]);

  const totalTransfersQty = useMemo(() => {
    return transfers.reduce((sum, t) => sum + t.totalQuantity, 0);
  }, [transfers]);

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (window.confirm('آیا از حذف این رکورد حواله اطمینان دارید؟ (توجه: اثرات انبار قبلا اعمال شده است)')) {
      await db.warehouseTransfers.delete(id);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">تعداد کل حواله‌های صادره</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {transfers.length} حواله
            </h3>
            <span className="text-[11px] text-teal-600 font-bold mt-1 block">
              جابجایی بین انبارها
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <ArrowLeftRight size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">مجموع اقلام جابجا شده</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {totalTransfersQty} واحد
            </h3>
            <span className="text-[11px] text-blue-600 font-bold mt-1 block">
              ورود و خروج کنترل‌شده
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <FileText size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">ارزش کل گردش انتقالی</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {formatCurrency(totalTransfersValue)}
            </h3>
            <span className="text-[11px] text-amber-600 font-bold mt-1 block">
              گردش ریالی حواله‌ها
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <ArrowLeftRight size={24} />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative min-w-[260px] flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجوی شماره حواله، انبار مبدا یا مقصد..."
            className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
          />
          <Search size={16} className="absolute right-3 top-3 text-slate-400" />
        </div>

        {can('stock_transfer') && (
          <button
            onClick={onOpenNewTransfer}
            className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>صدور حواله انتقال جدید</span>
          </button>
        )}
      </div>

      {/* Transfers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 w-12 text-center">شماره حواله</th>
                <th className="py-3.5 px-4">تاریخ حواله</th>
                <th className="py-3.5 px-4">انبار مبدا (فرستنده)</th>
                <th className="py-3.5 px-4">انبار مقصد (گیرنده)</th>
                <th className="py-3.5 px-4 text-center">تعداد اقلام</th>
                <th className="py-3.5 px-4 text-center">مجموع مقدار</th>
                <th className="py-3.5 px-4 text-left">ارزش کل حواله</th>
                <th className="py-3.5 px-4">تحویل‌دهنده / گیرنده</th>
                <th className="py-3.5 px-4 text-center w-28">عملیات و چاپ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    هنوز هیچ حواله انتقالی ثبت نشده است.
                  </td>
                </tr>
              ) : (
                filteredTransfers.map(tr => (
                  <tr key={tr.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-teal-800">
                      {tr.transferNumber}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {format(new Date(tr.transferDate), 'yyyy/MM/dd')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                        {tr.sourceWarehouseName}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                        {tr.destWarehouseName}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                      {tr.items.length} قلم
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800">
                      {tr.totalQuantity}
                    </td>
                    <td className="py-3.5 px-4 text-left font-mono font-bold text-slate-900">
                      {formatCurrency(tr.totalValue)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {tr.transferredBy || tr.receivedBy ? (
                        <span>{tr.transferredBy || '-'} ← {tr.receivedBy || '-'}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onViewReceipt(tr)}
                          title="مشاهده و چاپ حواله"
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(tr.id)}
                          title="حذف رکورد حواله"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
