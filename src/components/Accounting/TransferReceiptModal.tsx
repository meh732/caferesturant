import React, { useRef } from 'react';
import { WarehouseTransfer } from '../../lib/db';
import { X, Printer, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { format } from 'date-fns-jalali';

interface TransferReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: WarehouseTransfer | null;
}

export default function TransferReceiptModal({
  isOpen,
  onClose,
  transfer,
}: TransferReceiptModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !transfer) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Printable Section */}
        <div ref={printAreaRef} className="space-y-6">
          {/* Header */}
          <div className="text-center border-b-2 border-slate-800 pb-4">
            <h2 className="text-xl font-black text-slate-900">حواله رسمی انتقال بین انبارها</h2>
            <p className="text-xs text-slate-500 mt-1">سامانه جامع مدیریت انبار و حسابداری صنعتی آرکا</p>
            <div className="flex justify-between items-center text-xs mt-4 px-2 text-slate-600 font-bold">
              <span>شماره حواله: <span className="font-mono text-slate-900">{transfer.transferNumber}</span></span>
              <span>تاریخ: <span>{format(new Date(transfer.transferDate), 'yyyy/MM/dd')}</span></span>
            </div>
          </div>

          {/* Warehouses Info Box */}
          <div className="grid grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block mb-1">انبار مبدا (فرستنده):</span>
              <span className="font-bold text-slate-800 text-sm block">{transfer.sourceWarehouseName}</span>
              {transfer.transferredBy && (
                <span className="text-[11px] text-slate-600 mt-0.5 block">تحویل‌دهنده: {transfer.transferredBy}</span>
              )}
            </div>

            <div>
              <span className="text-slate-500 block mb-1">انبار مقصد (گیرنده):</span>
              <span className="font-bold text-slate-800 text-sm block">{transfer.destWarehouseName}</span>
              {transfer.receivedBy && (
                <span className="text-[11px] text-slate-600 mt-0.5 block">تحویل‌گیرنده: {transfer.receivedBy}</span>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-300 rounded-xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2.5 text-center w-8">#</th>
                  <th className="p-2.5">شرح کالا / ماده اولیه</th>
                  <th className="p-2.5 text-center">مقدار</th>
                  <th className="p-2.5 text-center">واحد</th>
                  <th className="p-2.5 text-left">نرخ واحد (تومان)</th>
                  <th className="p-2.5 text-left">مبلغ کل (تومان)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transfer.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-2.5 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="p-2.5 font-bold text-slate-800">{item.materialName}</td>
                    <td className="p-2.5 text-center font-bold font-mono">{item.quantity}</td>
                    <td className="p-2.5 text-center text-slate-600">{item.unit}</td>
                    <td className="p-2.5 text-left font-mono">{formatCurrency(item.unitPrice)}</td>
                    <td className="p-2.5 text-left font-mono font-bold text-slate-900">{formatCurrency(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-300">
                <tr>
                  <td colSpan={2} className="p-2.5 text-right">جمع کل حواله:</td>
                  <td className="p-2.5 text-center font-mono">{transfer.totalQuantity}</td>
                  <td className="p-2.5"></td>
                  <td className="p-2.5"></td>
                  <td className="p-2.5 text-left font-mono text-sm">{formatCurrency(transfer.totalValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {transfer.notes && (
            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="font-bold">یادداشت: </span>
              {transfer.notes}
            </p>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-dashed border-slate-300 text-center text-xs">
            <div>
              <span className="text-slate-500 block mb-8">امضای تحویل‌دهنده (مبدا)</span>
              <div className="h-6 border-b border-slate-400 w-3/4 mx-auto"></div>
            </div>
            <div>
              <span className="text-slate-500 block mb-8">امضای تحویل‌گیرنده (مقصد)</span>
              <div className="h-6 border-b border-slate-400 w-3/4 mx-auto"></div>
            </div>
            <div>
              <span className="text-slate-500 block mb-8">تایید حسابداری / مدیریت</span>
              <div className="h-6 border-b border-slate-400 w-3/4 mx-auto"></div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
          >
            بستن
          </button>
          <button
            onClick={handlePrint}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
          >
            <Printer size={16} />
            <span>چاپ حواله انبار</span>
          </button>
        </div>
      </div>
    </div>
  );
}
