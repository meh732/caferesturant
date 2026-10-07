import React from 'react';
import { formatCurrency } from '../../lib/utils';
import { Order, AppSettings } from '../../lib/db';
import { format } from 'date-fns-jalali';

interface ReceiptProps {
  order: Order;
  settings: AppSettings;
}

export const Receipt = React.forwardRef<HTMLDivElement, ReceiptProps>(({ order, settings }, ref) => {
  return (
    <div 
      ref={ref} 
      className="receipt-print-wrapper w-full max-w-[66mm] mx-auto bg-white text-black font-sans box-border select-none" 
      dir="rtl" 
      style={{ fontSize: '11px', lineHeight: '1.4', padding: '2mm 1.5mm' }}
    >
      {/* Header */}
      <div className="text-center mb-3 border-b border-dashed border-black pb-2.5">
        {settings.logoUrl && (
          <img src={settings.logoUrl} alt="Logo" className="w-10 h-10 mx-auto mb-1.5 grayscale object-contain" />
        )}
        <h1 className="text-[15px] font-bold mb-0.5 tracking-tight">{settings.restaurantName || 'رستوران'}</h1>
        {settings.phone && <p className="text-[10px] text-gray-800">تلفن: <span dir="ltr" className="font-semibold">{settings.phone}</span></p>}
        {settings.address && <p className="text-[10px] text-gray-800 mt-0.5 whitespace-pre-wrap leading-tight">{settings.address}</p>}
      </div>

      {/* Meta */}
      <div className="mb-2.5 text-[10.5px] border-b border-dashed border-black pb-2 space-y-1">
        <div className="flex justify-between items-center font-medium">
          <p>فاکتور: <span className="font-bold">{order.invoiceNumber}</span></p>
          <p dir="ltr" className="text-[10px] font-mono">{format(new Date(order.createdAt), 'yyyy/MM/dd HH:mm')}</p>
        </div>

        {order.tableTitle && (
          <div className="bg-black text-white text-center py-1 px-2 rounded font-black text-xs my-1">
            شماره میز: {order.tableTitle} {order.waiterName ? `(سفارش‌گیر: ${order.waiterName})` : ''}
          </div>
        )}
        
        {order.customerPhone && (
          <div className="bg-gray-50 border border-gray-200 p-1.5 rounded space-y-0.5 mt-1 text-[10px]">
            {order.customerName && <p><strong>نام مشتری:</strong> {order.customerName}</p>}
            <p><strong>تلفن:</strong> <span dir="ltr" className="font-mono font-semibold">{order.customerPhone}</span></p>
            {order.customerSubscriptionCode && <p><strong>کد اشتراک:</strong> {order.customerSubscriptionCode}</p>}
            {order.customerAddress && (
              <p className="mt-0.5 leading-tight whitespace-normal border-t border-gray-200 pt-0.5">
                <strong>آدرس:</strong> {order.customerAddress}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="mb-2.5 border-b border-dashed border-black pb-2.5">
        <table className="w-full table-fixed text-[11px] border-collapse">
          <thead className="border-b border-black">
            <tr>
              <th className="text-right py-1 w-[48%] font-bold pr-0.5">شرح</th>
              <th className="text-center py-1 w-[16%] font-bold">تعداد</th>
              <th className="text-left py-1 w-[36%] font-bold pl-0.5">مبلغ</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={index} className="border-b border-gray-200 border-dashed">
                <td className="py-1.5 pr-0.5 text-right align-top break-words whitespace-normal w-[48%]">
                  <div className="font-bold leading-tight text-[11px]">{item.name}</div>
                  <div className="text-[9.5px] text-gray-600 mt-0.5 font-mono">فی: {new Intl.NumberFormat('fa-IR').format(item.price)}</div>
                </td>
                <td className="py-1.5 text-center align-top font-bold text-[11px] w-[16%]">{item.quantity}</td>
                <td className="py-1.5 pl-0.5 text-left align-top font-bold text-[11px] w-[36%] whitespace-nowrap">{new Intl.NumberFormat('fa-IR').format(item.price * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="mb-3 space-y-1 text-[11px] px-0.5">
        <div className="flex justify-between items-center">
          <span>جمع اقلام:</span>
          <span className="font-semibold">{formatCurrency(order.subtotal || 0)}</span>
        </div>
        {(order.discountValue || 0) > 0 && (
          <div className="flex justify-between items-center">
            <span>تخفیف {order.discountType === 'percent' ? `(${order.discountValue}%)` : ''}:</span>
            <span className="font-semibold">{order.discountType === 'percent' ? formatCurrency((order.subtotal * order.discountValue) / 100) : formatCurrency(order.discountValue)}</span>
          </div>
        )}
        {(order.taxAmount || 0) > 0 && (
          <div className="flex justify-between items-center">
            <span>مالیات ({order.taxPercentage}%):</span>
            <span className="font-semibold">{formatCurrency(order.taxAmount)}</span>
          </div>
        )}
        <div className="flex justify-between items-center font-bold text-[12.5px] border-t border-black pt-1.5 mt-1">
          <span>قابل پرداخت:</span>
          <span>{formatCurrency(order.total)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[9.5px] mt-2.5 space-y-1 border-t border-dashed border-gray-300 pt-2">
        <p className="font-bold text-[11px] mb-1">از خرید شما متشکریم!</p>
        {settings.website && <p dir="ltr" className="font-mono">{settings.website}</p>}
        <div className="flex flex-col items-center justify-center gap-0.5 mt-1 text-[9px]" dir="ltr">
          {settings.instagram && <span>IG: {settings.instagram}</span>}
          {settings.telegram && <span>TG: {settings.telegram}</span>}
        </div>
      </div>
    </div>
  );
});

Receipt.displayName = 'Receipt';
