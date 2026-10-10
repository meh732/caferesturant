import React, { useState, useMemo } from 'react';
import { Order } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel, printReportPDF } from '../../lib/reportExporter';
import { format } from 'date-fns-jalali';
import { 
  TrendingUp, Receipt, Users, ShoppingBag, Download, Printer, 
  Search, Utensils, Bike, Layers, Clock, CreditCard
} from 'lucide-react';

interface SalesReportProps {
  filteredOrders: Order[];
  dateRangeText: string;
}

export default function SalesReport({ filteredOrders, dateRangeText }: SalesReportProps) {
  const [searchInvoice, setSearchInvoice] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  // Key Calculations
  const totalRevenue = useMemo(() => filteredOrders.reduce((sum, o) => sum + o.total, 0), [filteredOrders]);
  const totalOrdersCount = filteredOrders.length;
  const averageOrderValue = totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0;

  // Breakdown by Order Type / Channel
  const salesByChannel = useMemo(() => {
    let dineInCount = 0; let dineInRev = 0;
    let takeawayCount = 0; let takeawayRev = 0;
    let deliveryCount = 0; let deliveryRev = 0;
    let snappfoodCount = 0; let snappfoodRev = 0;

    filteredOrders.forEach(o => {
      if (o.source === 'snappfood') {
        snappfoodCount++;
        snappfoodRev += o.total;
      } else if (o.orderType === 'dine_in' || o.tableNumber) {
        dineInCount++;
        dineInRev += o.total;
      } else if (o.orderType === 'delivery') {
        deliveryCount++;
        deliveryRev += o.total;
      } else {
        takeawayCount++;
        takeawayRev += o.total;
      }
    });

    return {
      dineIn: { count: dineInCount, rev: dineInRev },
      takeaway: { count: takeawayCount, rev: takeawayRev },
      delivery: { count: deliveryCount, rev: deliveryRev },
      snappfood: { count: snappfoodCount, rev: snappfoodRev },
    };
  }, [filteredOrders]);

  // Breakdown by Menu Item Sales
  const topSellingItems = useMemo(() => {
    const counts: Record<string, { qty: number; revenue: number }> = {};
    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        if (!counts[item.name]) {
          counts[item.name] = { qty: 0, revenue: 0 };
        }
        counts[item.name].qty += item.quantity;
        counts[item.name].revenue += item.price * item.quantity;
      });
    });
    return Object.entries(counts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty);
  }, [filteredOrders]);

  // Hourly Sales Peak Breakdown
  const hourlySales = useMemo(() => {
    const hours: Record<number, { count: number; revenue: number }> = {};
    for (let h = 0; h < 24; h++) hours[h] = { count: 0, revenue: 0 };

    filteredOrders.forEach(o => {
      const h = new Date(o.createdAt).getHours();
      hours[h].count += 1;
      hours[h].revenue += o.total;
    });

    return Object.entries(hours)
      .map(([hour, data]) => ({ hour: Number(hour), ...data }))
      .filter(h => h.count > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  // Filtered Orders for table
  const displayedOrders = useMemo(() => {
    return filteredOrders.filter(o => {
      // Channel Filter
      if (channelFilter === 'dine_in' && o.orderType !== 'dine_in' && !o.tableNumber) return false;
      if (channelFilter === 'takeaway' && o.orderType !== 'takeaway') return false;
      if (channelFilter === 'delivery' && o.orderType !== 'delivery') return false;
      if (channelFilter === 'snappfood' && o.source !== 'snappfood') return false;

      // Search Query
      if (searchInvoice.trim()) {
        const q = searchInvoice.trim().toLowerCase();
        const matchInvoice = String(o.invoiceNumber).includes(q);
        const matchCustomer = (o.customerName || '').toLowerCase().includes(q);
        const matchPhone = (o.customerPhone || '').includes(q);
        return matchInvoice || matchCustomer || matchPhone;
      }

      return true;
    });
  }, [filteredOrders, channelFilter, searchInvoice]);

  // Excel Export
  const handleExportExcel = () => {
    const excelRows = displayedOrders.map((o, idx) => ({
      'ردیف': idx + 1,
      'شماره فاکتور': o.invoiceNumber,
      'تاریخ و زمان': format(new Date(o.createdAt), 'yyyy/MM/dd HH:mm'),
      'نام مشتری': o.customerName || 'مشتری عمومی',
      'تلفن مشتری': o.customerPhone || '-',
      'نوع سفارش': o.source === 'snappfood' ? 'اسنپ‌فود' : o.orderType === 'dine_in' ? 'سالن' : o.orderType === 'delivery' ? 'پیک' : 'بیرون‌بر',
      'شماره میز': o.tableNumber ? `میز ${o.tableNumber}` : '-',
      'روش پرداخت': o.paymentMethod === 'cash' ? 'نقدی' : o.paymentMethod === 'cheque' ? 'چک' : 'کارتخوان',
      'مبلغ کل (تومان)': o.total,
      'وضعیت': o.status === 'paid' ? 'تسویه شده' : 'باطل شده',
    }));

    exportToExcel(excelRows, `گزارش_جامع_فروش_${new Date().toLocaleDateString('fa-IR')}`);
  };

  // PDF Export
  const handlePrintPDF = () => {
    const summaryCards = [
      { label: 'مجموع فروش کل', value: formatCurrency(totalRevenue) },
      { label: 'تعداد فاکتورها', value: `${totalOrdersCount} عدد` },
      { label: 'میانگین فاکتور', value: formatCurrency(averageOrderValue) },
    ];

    const sections = [
      {
        title: 'فروش به تفکیک کانال‌های سفارش',
        headers: ['کانال فروش', 'تعداد فاکتور', 'درآمد حاصل (تومان)', 'سهم از کل'],
        rows: [
          ['سالن و حضور در رستوران', salesByChannel.dineIn.count, formatCurrency(salesByChannel.dineIn.rev), `${totalRevenue > 0 ? Math.round((salesByChannel.dineIn.rev / totalRevenue) * 100) : 0}%`],
          ['بیرون‌بر (تحویل حضوری)', salesByChannel.takeaway.count, formatCurrency(salesByChannel.takeaway.rev), `${totalRevenue > 0 ? Math.round((salesByChannel.takeaway.rev / totalRevenue) * 100) : 0}%`],
          ['ارسال با پیک اختصاصی', salesByChannel.delivery.count, formatCurrency(salesByChannel.delivery.rev), `${totalRevenue > 0 ? Math.round((salesByChannel.delivery.rev / totalRevenue) * 100) : 0}%`],
          ['سفارشات آنلاین اسنپ‌فود', salesByChannel.snappfood.count, formatCurrency(salesByChannel.snappfood.rev), `${totalRevenue > 0 ? Math.round((salesByChannel.snappfood.rev / totalRevenue) * 100) : 0}%`],
        ]
      },
      {
        title: '۱۰ قلم کالا پرفروش دوره',
        headers: ['نام کالا / آیتم منو', 'تعداد فروش', 'درآمد کل (تومان)'],
        rows: topSellingItems.slice(0, 10).map(item => [
          item.name,
          `${item.qty} عدد`,
          formatCurrency(item.revenue)
        ])
      }
    ];

    printReportPDF('گزارش جامع فروش و درآمد', `بازه: ${dateRangeText}`, summaryCards, sections);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* Stat Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium mb-0.5">مجموع درآمد فروش ناخالص</p>
            <h3 className="text-xl font-bold text-neutral-900 font-mono">{formatCurrency(totalRevenue)}</h3>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#34C759]/10 text-[#34C759] flex items-center justify-center shrink-0">
            <Receipt size={22} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium mb-0.5">تعداد فاکتورهای صادرشده</p>
            <h3 className="text-xl font-bold text-neutral-900 font-mono">{totalOrdersCount} <span className="text-xs font-normal text-neutral-500">فاکتور</span></h3>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FF9500]/10 text-[#FF9500] flex items-center justify-center shrink-0">
            <Users size={22} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium mb-0.5">میانگین مبلغ هر فاکتور (AOV)</p>
            <h3 className="text-xl font-bold text-neutral-900 font-mono">{formatCurrency(averageOrderValue)}</h3>
          </div>
        </div>

      </div>

      {/* Sales Channel Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Saloon / Dine-in */}
        <div className="bg-white p-4 rounded-2xl border border-black/[0.06] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-neutral-600 block">سالن و حضور مشتری</span>
            <span className="text-base font-bold text-neutral-900 font-mono block mt-1">{formatCurrency(salesByChannel.dineIn.rev)}</span>
            <span className="text-[11px] text-neutral-400 mt-0.5 block">{salesByChannel.dineIn.count} فاکتور</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center">
            <Utensils size={18} />
          </div>
        </div>

        {/* Takeaway */}
        <div className="bg-white p-4 rounded-2xl border border-black/[0.06] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-neutral-600 block">بیرون‌بر (تحویل حضوری)</span>
            <span className="text-base font-bold text-neutral-900 font-mono block mt-1">{formatCurrency(salesByChannel.takeaway.rev)}</span>
            <span className="text-[11px] text-neutral-400 mt-0.5 block">{salesByChannel.takeaway.count} فاکتور</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center">
            <ShoppingBag size={18} />
          </div>
        </div>

        {/* Delivery */}
        <div className="bg-white p-4 rounded-2xl border border-black/[0.06] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-neutral-600 block">پیک و ارسال اختصاصی</span>
            <span className="text-base font-bold text-neutral-900 font-mono block mt-1">{formatCurrency(salesByChannel.delivery.rev)}</span>
            <span className="text-[11px] text-neutral-400 mt-0.5 block">{salesByChannel.delivery.count} فاکتور</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center">
            <Bike size={18} />
          </div>
        </div>

        {/* SnappFood */}
        <div className="bg-white p-4 rounded-2xl border border-black/[0.06] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#FF9500] block">اسنپ‌فود و آنلاین</span>
            <span className="text-base font-bold text-neutral-900 font-mono block mt-1">{formatCurrency(salesByChannel.snappfood.rev)}</span>
            <span className="text-[11px] text-neutral-400 mt-0.5 block">{salesByChannel.snappfood.count} فاکتور</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FF9500]/10 text-[#FF9500] flex items-center justify-center">
            <Layers size={18} />
          </div>
        </div>

      </div>

      {/* Top Sellers & Peak Hours */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top Sellers */}
        <div className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-black/[0.06] overflow-hidden flex flex-col h-80">
          <div className="p-4 border-b border-black/[0.04] bg-neutral-50/60 flex items-center justify-between">
            <h3 className="text-sm font-bold text-neutral-900">پرفروش‌ترین غذاها و نوشیدنی‌ها</h3>
            <span className="text-xs text-neutral-500 font-mono">{topSellingItems.length} عنوان</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <table className="w-full text-right text-xs">
              <thead className="text-neutral-500 sticky top-0 bg-white border-b border-black/[0.04]">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">نام آیتم</th>
                  <th className="py-2.5 px-3 font-semibold">تعداد فروش</th>
                  <th className="py-2.5 px-3 font-semibold">درآمد حاصل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {topSellingItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-neutral-900">{item.name}</td>
                    <td className="py-2.5 px-3 text-neutral-700 font-bold font-mono">{item.qty} عدد</td>
                    <td className="py-2.5 px-3 text-[#007AFF] font-bold font-mono">{formatCurrency(item.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hourly Peak Traffic */}
        <div className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-black/[0.06] overflow-hidden flex flex-col h-80">
          <div className="p-4 border-b border-black/[0.04] bg-neutral-50/60 flex items-center justify-between">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Clock size={16} className="text-[#007AFF]" />
              <span>ساعات اوج شلوغی و ترافیک فروش</span>
            </h3>
            <span className="text-xs text-neutral-500">تحلیل زمانی</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <table className="w-full text-right text-xs">
              <thead className="text-neutral-500 sticky top-0 bg-white border-b border-black/[0.04]">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">ساعت روز</th>
                  <th className="py-2.5 px-3 font-semibold">تعداد فاکتور</th>
                  <th className="py-2.5 px-3 font-semibold">درآمد حاصل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {hourlySales.map((h, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-neutral-900 font-mono">
                      ساعت {h.hour}:00 الی {h.hour + 1}:00
                    </td>
                    <td className="py-2.5 px-3 text-neutral-700 font-bold font-mono">{h.count} فاکتور</td>
                    <td className="py-2.5 px-3 text-[#34C759] font-bold font-mono">{formatCurrency(h.revenue)}</td>
                  </tr>
                ))}
                {hourlySales.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-neutral-400">اطلاعاتی ثبت نشده است.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Sales Invoices List */}
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-black/[0.04] bg-neutral-50/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Receipt size={18} className="text-[#007AFF]" />
            <h3 className="font-bold text-sm text-neutral-900">لیست فاکتورهای فروش صادرشده</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-48">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchInvoice}
                onChange={(e) => setSearchInvoice(e.target.value)}
                placeholder="شماره فاکتور، نام یا تلفن..."
                className="w-full pr-8 pl-3 py-1.5 bg-neutral-100 border border-black/[0.04] rounded-2xl text-xs outline-none focus:border-[#007AFF]"
              />
            </div>

            {/* Export Buttons */}
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-[#34C759]/10 hover:bg-[#34C759]/20 text-[#34C759] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={14} />
              <span>اکسل</span>
            </button>

            <button
              onClick={handlePrintPDF}
              className="px-3 py-1.5 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={14} />
              <span>چاپ PDF</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-neutral-100/70 text-neutral-600 font-semibold border-b border-black/[0.06]">
              <tr>
                <th className="py-3 px-4">شماره فاکتور</th>
                <th className="py-3 px-4">تاریخ و زمان</th>
                <th className="py-3 px-4">نام مشتری</th>
                <th className="py-3 px-4">نوع سفارش</th>
                <th className="py-3 px-4">روش تسویه</th>
                <th className="py-3 px-4">مبلغ کل (تومان)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {[...displayedOrders].reverse().map(order => (
                <tr key={order.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-neutral-900">#{order.invoiceNumber}</td>
                  <td className="py-3 px-4 text-neutral-500 font-mono" dir="ltr">
                    {format(new Date(order.createdAt), 'yyyy/MM/dd HH:mm')}
                  </td>
                  <td className="py-3 px-4 text-neutral-700">{order.customerName || 'مشتری عمومی'}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded-full text-[11px] font-medium">
                      {order.source === 'snappfood' ? 'اسنپ‌فود' : order.orderType === 'dine_in' ? 'سالن' : order.orderType === 'delivery' ? 'پیک' : 'بیرون‌بر'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-neutral-600">
                    {order.paymentMethod === 'cash' ? 'نقدی' : order.paymentMethod === 'cheque' ? 'چک' : 'کارتخوان'}
                  </td>
                  <td className="py-3 px-4 text-[#007AFF] font-bold font-mono text-sm">{formatCurrency(order.total)}</td>
                </tr>
              ))}
              {displayedOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-neutral-400">فاکتوری در این بازه یافت نشد.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
