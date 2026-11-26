import React, { useMemo, useState } from 'react';
import { Order } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { format as formatJalali } from 'date-fns-jalali';
import {
  X,
  Search,
  Printer,
  ChefHat,
  Edit3,
  Receipt as ReceiptIcon,
  Clock,
  CreditCard,
  Banknote,
  Wallet,
  UtensilsCrossed,
  ShoppingBag,
  Truck,
  User
} from 'lucide-react';
import { ReceiptPrintMode } from './Receipt';

interface POSDailySalesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  todayOrders: Order[];
  canEdit: boolean;
  onPrintOrder: (order: Order, mode: ReceiptPrintMode) => void;
  onEditOrder: (order: Order) => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  card: 'کارتخوان',
  cash: 'نقدی',
  wallet: 'کیف پول',
  credit: 'نسیه',
  mixed: 'ترکیبی',
  cheque: 'چک',
};

export default function POSDailySalesDrawer({
  isOpen,
  onClose,
  todayOrders,
  canEdit,
  onPrintOrder,
  onEditOrder,
}: POSDailySalesDrawerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'cancelled'>('all');

  const todayDateLabel = useMemo(() => {
    try {
      return formatJalali(new Date(), 'EEEE dd MMMM yyyy');
    } catch {
      return 'امروز';
    }
  }, []);

  const summary = useMemo(() => {
    const paid = todayOrders.filter(o => o.status !== 'cancelled');
    let totalRevenue = 0;
    let cardTotal = 0;
    let cashTotal = 0;
    let otherTotal = 0;

    for (const o of paid) {
      const amt = Number(o.total) || 0;
      totalRevenue += amt;
      if (o.paymentMethod === 'card') {
        cardTotal += amt;
      } else if (o.paymentMethod === 'cash') {
        cashTotal += amt;
      } else if (o.paymentMethod === 'mixed') {
        cardTotal += Number(o.cardAmount) || 0;
        cashTotal += Number(o.cashAmount) || 0;
      } else {
        otherTotal += amt;
      }
    }

    return {
      count: paid.length,
      cancelledCount: todayOrders.length - paid.length,
      totalRevenue,
      cardTotal,
      cashTotal,
      otherTotal,
    };
  }, [todayOrders]);

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return todayOrders.filter(order => {
      if (statusFilter === 'paid' && order.status === 'cancelled') return false;
      if (statusFilter === 'cancelled' && order.status !== 'cancelled') return false;
      if (!q) return true;

      const invMatch = String(order.invoiceNumber || '').includes(q);
      const custMatch = (order.customerName || '').toLowerCase().includes(q);
      const phoneMatch = (order.customerPhone || '').includes(q);
      const tableMatch = (order.tableTitle || '').toLowerCase().includes(q);
      const itemMatch = (order.items || []).some(it => (it.name || '').toLowerCase().includes(q));
      return invMatch || custMatch || phoneMatch || tableMatch || itemMatch;
    });
  }, [todayOrders, searchTerm, statusFilter]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/45 backdrop-blur-xs flex justify-end animate-in fade-in duration-150"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-full bg-[#F5F5F7] shadow-2xl border-r border-black/10 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="bg-white border-b border-black/[0.06] px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0">
              <ReceiptIcon size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-neutral-900 truncate">
                فروش‌های امروز صندوق
              </h2>
              <p className="text-xs text-neutral-500 font-medium truncate">
                {todayDateLabel} — {summary.count} فاکتور ثبت‌شده
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-black/[0.05] hover:bg-black/[0.1] text-neutral-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="بستن"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary Strip */}
        <div className="bg-white border-b border-black/[0.06] px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <div className="bg-[#007AFF]/[0.06] border border-[#007AFF]/15 rounded-2xl px-3 py-2">
            <div className="text-[11px] font-medium text-neutral-600">جمع فروش امروز</div>
            <div className="text-sm font-black text-[#007AFF] font-mono tabular-nums mt-0.5">
              {formatCurrency(summary.totalRevenue)}
            </div>
          </div>

          <div className="bg-neutral-50 border border-black/[0.05] rounded-2xl px-3 py-2">
            <div className="text-[11px] font-medium text-neutral-500 flex items-center gap-1">
              <CreditCard size={12} className="text-indigo-500" />
              <span>کارتخوان</span>
            </div>
            <div className="text-xs sm:text-sm font-bold text-neutral-900 font-mono tabular-nums mt-0.5">
              {formatCurrency(summary.cardTotal)}
            </div>
          </div>

          <div className="bg-neutral-50 border border-black/[0.05] rounded-2xl px-3 py-2">
            <div className="text-[11px] font-medium text-neutral-500 flex items-center gap-1">
              <Banknote size={12} className="text-emerald-600" />
              <span>نقدی</span>
            </div>
            <div className="text-xs sm:text-sm font-bold text-neutral-900 font-mono tabular-nums mt-0.5">
              {formatCurrency(summary.cashTotal)}
            </div>
          </div>

          <div className="bg-neutral-50 border border-black/[0.05] rounded-2xl px-3 py-2">
            <div className="text-[11px] font-medium text-neutral-500 flex items-center gap-1">
              <Wallet size={12} className="text-amber-600" />
              <span>سایر / کیف پول</span>
            </div>
            <div className="text-xs sm:text-sm font-bold text-neutral-900 font-mono tabular-nums mt-0.5">
              {formatCurrency(summary.otherTotal)}
            </div>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="px-5 py-3 bg-white/80 border-b border-black/[0.06] flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجو بر اساس شماره فاکتور، نام غذا یا مشتری..."
              className="w-full pr-9 pl-8 py-2 bg-black/[0.04] focus:bg-white border border-black/[0.06] focus:border-[#007AFF] rounded-xl text-xs text-neutral-900 outline-none transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center bg-black/[0.05] p-0.5 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              همه ({todayOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'paid' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              تسویه ({summary.count})
            </button>
            {summary.cancelledCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('cancelled')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'cancelled' ? 'bg-white text-rose-600 shadow-2xs' : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                لغو ({summary.cancelledCount})
              </button>
            )}
          </div>
        </div>

        {/* Orders List (Item-by-Item) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/[0.06] py-16 px-6 text-center text-neutral-400">
              <ReceiptIcon size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold text-neutral-600">
                {todayOrders.length === 0
                  ? 'هنوز هیچ فروشی برای امروز ثبت نشده است.'
                  : 'فاکتوری با این مشخصات یافت نشد.'}
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                به محض ثبت اولین فاکتور در صندوق، لیست فروش‌های امروز اینجا نمایش داده می‌شود.
              </p>
            </div>
          ) : (
            filteredOrders.map(order => {
              let timeStr = '';
              try {
                timeStr = formatJalali(new Date(order.createdAt), 'HH:mm');
              } catch {
                timeStr = '';
              }

              const isCancelled = order.status === 'cancelled';
              const totalQty = (order.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
              const paymentLabel = PAYMENT_LABELS[order.paymentMethod || 'card'] || order.paymentMethod || 'کارتخوان';

              return (
                <div
                  key={order.id ?? order.invoiceNumber}
                  className={`bg-white rounded-2xl border p-4 transition-all ${
                    isCancelled
                      ? 'border-rose-200 bg-rose-50/30 opacity-80'
                      : 'border-black/[0.07] hover:border-black/[0.14]'
                  }`}
                >
                  {/* Top Row: Invoice #, Time, Type, Payment, Total */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-black/[0.05]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-black text-sm text-neutral-900 tabular-nums">
                        #{order.invoiceNumber}
                      </span>

                      <span className="inline-flex items-center gap-1 text-xs text-neutral-500 font-mono tabular-nums">
                        <Clock size={12} />
                        <span>{timeStr}</span>
                      </span>

                      <span className="text-neutral-300">•</span>

                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700">
                        {order.tableTitle ? (
                          <>
                            <UtensilsCrossed size={12} className="text-[#007AFF]" />
                            <span>{order.tableTitle}</span>
                          </>
                        ) : order.orderType === 'delivery' ? (
                          <>
                            <Truck size={12} className="text-amber-600" />
                            <span>پیک</span>
                          </>
                        ) : (
                          <>
                            <ShoppingBag size={12} className="text-neutral-500" />
                            <span>بیرون‌بر / حضوری</span>
                          </>
                        )}
                      </span>

                      {order.customerName && (
                        <>
                          <span className="text-neutral-300">•</span>
                          <span className="inline-flex items-center gap-1 text-xs text-neutral-600 font-medium">
                            <User size={12} className="text-neutral-400" />
                            <span>{order.customerName}</span>
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-neutral-500">
                        {paymentLabel}
                      </span>
                      {isCancelled ? (
                        <span className="text-xs font-bold text-rose-600">لغوشده</span>
                      ) : (
                        <span className="text-sm font-black text-[#007AFF] font-mono tabular-nums">
                          {formatCurrency(order.total)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ordered Items Breakdown */}
                  <div className="py-2.5 space-y-1">
                    {(order.items || []).map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs text-neutral-800"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-[#007AFF] tabular-nums shrink-0">
                            {item.quantity}×
                          </span>
                          <span className="font-medium truncate">{item.name}</span>
                          {item.notes && (
                            <span className="text-[11px] text-neutral-400 truncate">({item.notes})</span>
                          )}
                        </div>
                        <span className="font-mono tabular-nums text-neutral-500 shrink-0 mr-2">
                          {formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Quick Print & Edit Actions */}
                  <div className="pt-2.5 border-t border-black/[0.05] flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-neutral-400 font-medium tabular-nums">
                      تعداد کل اقلام: {totalQty} عدد
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPrintOrder(order, 'customer')}
                        className="px-3 py-1.5 rounded-xl bg-black/[0.05] hover:bg-black/[0.1] text-neutral-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="چاپ مجدد فیش مشتری (با مبلغ)"
                      >
                        <Printer size={13} />
                        <span>فیش مشتری</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onPrintOrder(order, 'kitchen')}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="چاپ فیش آشپزخانه / بار (بدون مبلغ)"
                      >
                        <ChefHat size={13} />
                        <span>فیش آشپزخانه</span>
                      </button>

                      {canEdit && !isCancelled && (
                        <button
                          type="button"
                          onClick={() => onEditOrder(order)}
                          className="px-3 py-1.5 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="ویرایش اقلام یا روش پرداخت فاکتور"
                        >
                          <Edit3 size={13} />
                          <span>ویرایش</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
