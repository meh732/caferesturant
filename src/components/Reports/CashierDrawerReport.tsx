import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Order, Expense, SalaryPayment } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel, printReportPDF } from '../../lib/reportExporter';
import { 
  CreditCard, DollarSign, Wallet, ArrowDownRight, ArrowUpRight, 
  Printer, Download, AlertTriangle, CheckCircle2, Calculator, RefreshCw, ShoppingBag
} from 'lucide-react';

interface CashierDrawerReportProps {
  filteredOrders: Order[];
  filteredExpenses: Expense[];
  filteredSalaries: SalaryPayment[];
  dateRangeText: string;
}

export default function CashierDrawerReport({
  filteredOrders,
  filteredExpenses,
  filteredSalaries,
  dateRangeText
}: CashierDrawerReportProps) {
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [physicalCashCount, setPhysicalCashCount] = useState<string>('');

  // 1. Sales breakdown by payment method
  const salesByPayment = useMemo(() => {
    let cardSales = 0;
    let cashSales = 0;
    let chequeSales = 0;
    let snappfoodSales = 0;

    filteredOrders.forEach(o => {
      if (o.source === 'snappfood') {
        snappfoodSales += o.total;
      } else {
        if (o.paymentMethod === 'cash') {
          cashSales += o.total;
        } else if (o.paymentMethod === 'cheque') {
          chequeSales += o.total;
        } else {
          // Default to card
          cardSales += o.total;
        }
      }
    });

    return { cardSales, cashSales, chequeSales, snappfoodSales };
  }, [filteredOrders]);

  // 2. Cash Expenses Paid from Drawer
  const cashExpensesTotal = useMemo(() => {
    return filteredExpenses
      .filter(e => e.paymentMethod === 'cash' && e.status === 'paid')
      .reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // 3. Cash Salary Advances Paid
  const cashSalariesTotal = useMemo(() => {
    return filteredSalaries
      .filter(s => s.paymentMethod === 'cash')
      .reduce((sum, s) => sum + s.totalPaid, 0);
  }, [filteredSalaries]);

  // Total Cash Outflows
  const totalCashOutflows = cashExpensesTotal + cashSalariesTotal;

  // Expected Book Cash Balance (مانده دفتری صندوق)
  const expectedBookCash = openingCash + salesByPayment.cashSales - totalCashOutflows;

  // Physical Count vs Book Discrepancy (مغایرت صندوق)
  const parsedPhysicalCount = physicalCashCount !== '' ? Number(physicalCashCount) : null;
  const discrepancy = parsedPhysicalCount !== null ? parsedPhysicalCount - expectedBookCash : 0;

  // Excel Export
  const handleExportExcel = () => {
    const summaryData = [
      { 'عنوان شاخص': 'موجودی اولیه صندوق (تومان)', 'مبلغ': openingCash },
      { 'عنوان شاخص': 'فروش نقدی دریافتی (تومان)', 'مبلغ': salesByPayment.cashSales },
      { 'عنوان شاخص': 'فروش کارتخوان/دستگاه پوز (تومان)', 'مبلغ': salesByPayment.cardSales },
      { 'عنوان شاخص': 'فروش اسنپ‌فود و آنلاین (تومان)', 'مبلغ': salesByPayment.snappfoodSales },
      { 'عنوان شاخص': 'پرداخت هزینه‌های نقدی (تومان)', 'مبلغ': cashExpensesTotal },
      { 'عنوان شاخص': 'پرداخت نقدی حقوق و مساعده (تومان)', 'مبلغ': cashSalariesTotal },
      { 'عنوان شاخص': 'مجموع خروجی‌های نقدی (تومان)', 'مبلغ': totalCashOutflows },
      { 'عنوان شاخص': 'مانده دفتری محاسباتی صندوق (تومان)', 'مبلغ': expectedBookCash },
      { 'عنوان شاخص': 'مبلغ شمارش‌شده فیزیکی (تومان)', 'مبلغ': parsedPhysicalCount ?? 'نامشخص' },
      { 'عنوان شاخص': 'مغایرت صندوق (تومان)', 'مبلغ': parsedPhysicalCount !== null ? discrepancy : 'نامشخص' },
    ];

    exportToExcel(summaryData, `گزارش_صندوق_و_تسویه_${new Date().toLocaleDateString('fa-IR')}`);
  };

  // PDF Export
  const handlePrintPDF = () => {
    const summaryCards = [
      { label: 'فروش کارتخوان', value: formatCurrency(salesByPayment.cardSales) },
      { label: 'فروش نقدی', value: formatCurrency(salesByPayment.cashSales) },
      { label: 'فروش اسنپ‌فود', value: formatCurrency(salesByPayment.snappfoodSales) },
      { label: 'مانده دفتری صندوق', value: formatCurrency(expectedBookCash) },
    ];

    const sections = [
      {
        title: 'خلاصه گردش صندوق و تسویه شیفت',
        headers: ['عنوان تراکنش', 'روش تسویه', 'مبلغ ورودی (تومان)', 'مبلغ خروجی (تومان)'],
        rows: [
          ['موجودی اولیه صندوق', 'نقد', formatCurrency(openingCash), '-'],
          ['درآمد فروش نقدی فاکتورها', 'نقد', formatCurrency(salesByPayment.cashSales), '-'],
          ['درآمد فروش دستگاه کارتخوان (POS)', 'کارتخوان / بانک', formatCurrency(salesByPayment.cardSales), '-'],
          ['درآمد فروش اسنپ‌فود و سفارشات آنلاین', 'اعتباری آنلاین', formatCurrency(salesByPayment.snappfoodSales), '-'],
          ['پرداخت هزینه‌های جاری نقدی', 'نقد', '-', formatCurrency(cashExpensesTotal)],
          ['پرداخت حقوق / مساعده نقدی پرسنل', 'نقد', '-', formatCurrency(cashSalariesTotal)],
          ['مانده دفتری نهایی صندوق', 'نقد', formatCurrency(expectedBookCash), '-'],
          ['مبلغ شمارش‌شده فیزیکی صندوق', 'نقد', parsedPhysicalCount !== null ? formatCurrency(parsedPhysicalCount) : 'ثبت‌نشده', '-'],
          ['مغایرت صندوق (کسری / فزونی)', 'نقد', parsedPhysicalCount !== null ? formatCurrency(discrepancy) : 'ثبت‌نشده', '-'],
        ]
      }
    ];

    printReportPDF(
      'گزارش صندوق و تسویه حساب روزانه / شیفت',
      `بازه زمانی: ${dateRangeText}`,
      summaryCards,
      sections
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* Header Actions */}
      <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900">گزارش صندوق و تسویه حساب شیفت</h2>
          <p className="text-xs text-neutral-500 font-normal mt-0.5">
            محاسبه دقیق ورودی‌های نقد، کارتخوان، هزینه‌های نقدی و شمارش فیزیکی صندوق
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-[#34C759]/10 hover:bg-[#34C759]/20 text-[#34C759] rounded-2xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer active:scale-95"
          >
            <Download size={15} />
            <span>خروجی اکسل</span>
          </button>

          <button
            onClick={handlePrintPDF}
            className="px-4 py-2 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <Printer size={15} />
            <span>چاپ و خروجی PDF</span>
          </button>
        </div>
      </div>

      {/* Primary Payment Channel Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card Sales */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between">
          <div>
            <span className="text-xs text-neutral-500 font-medium block">درآمد کارتخوان (POS)</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-1 font-mono">{formatCurrency(salesByPayment.cardSales)}</h3>
            <span className="text-[11px] text-[#007AFF] mt-1 block">واریز مستقیم به حساب بانک</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0">
            <CreditCard size={22} />
          </div>
        </div>

        {/* Cash Sales */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#34C759] font-semibold block">درآمد فروش نقدی</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-1 font-mono">{formatCurrency(salesByPayment.cashSales)}</h3>
            <span className="text-[11px] text-neutral-400 mt-1 block">ورودی اسکناس به صندوق</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#34C759]/10 text-[#34C759] flex items-center justify-center shrink-0">
            <DollarSign size={22} />
          </div>
        </div>

        {/* SnappFood Sales */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#FF9500] font-semibold block">درآمد اسنپ‌فود / آنلاین</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-1 font-mono">{formatCurrency(salesByPayment.snappfoodSales)}</h3>
            <span className="text-[11px] text-neutral-400 mt-1 block">تسویه اعتباری اسنپ</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FF9500]/10 text-[#FF9500] flex items-center justify-center shrink-0">
            <ShoppingBag size={22} />
          </div>
        </div>

        {/* Total Cash Outflows */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#FF3B30] font-semibold block">خروجی‌های نقدی صندوق</span>
            <h3 className="text-xl font-bold text-[#FF3B30] mt-1 font-mono">{formatCurrency(totalCashOutflows)}</h3>
            <span className="text-[11px] text-neutral-400 mt-1 block">هزینه‌ها و مساعده نقدی</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FF3B30]/10 text-[#FF3B30] flex items-center justify-center shrink-0">
            <Wallet size={22} />
          </div>
        </div>

      </div>

      {/* Cash Register Calculation & Physical Reconciliation Box */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left: Book Cash Calculation Sheet */}
        <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-black/[0.04] pb-3">
            <Calculator size={20} className="text-[#007AFF]" />
            <h3 className="font-bold text-base text-neutral-900">محاسبه مانده دفتری صندوق</h3>
          </div>

          <div className="space-y-3 text-xs">
            {/* Opening Cash Input */}
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-2xl border border-black/[0.04]">
              <span className="font-semibold text-neutral-700">+ موجودی اولیه اول شیفت:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={openingCash || ''}
                  onChange={(e) => setOpeningCash(Number(e.target.value))}
                  placeholder="۰"
                  className="w-28 px-2 py-1 bg-white border border-black/[0.1] rounded-xl text-left font-mono font-bold text-neutral-900 outline-none focus:border-[#007AFF]"
                />
                <span className="text-neutral-500 font-medium">تومان</span>
              </div>
            </div>

            {/* Inflow Cash Sales */}
            <div className="flex items-center justify-between p-3 bg-[#34C759]/[0.06] rounded-2xl border border-[#34C759]/10 text-[#28a745]">
              <span className="font-semibold">+ ورودی فروش نقدی:</span>
              <span className="font-bold font-mono text-sm">{formatCurrency(salesByPayment.cashSales)}</span>
            </div>

            {/* Outflow Cash Expenses */}
            <div className="flex items-center justify-between p-3 bg-[#FF3B30]/[0.06] rounded-2xl border border-[#FF3B30]/10 text-[#FF3B30]">
              <span className="font-semibold">- هزینه‌های نقدی پرداخت‌شده:</span>
              <span className="font-bold font-mono text-sm">- {formatCurrency(cashExpensesTotal)}</span>
            </div>

            {/* Outflow Cash Salaries */}
            <div className="flex items-center justify-between p-3 bg-[#FF3B30]/[0.06] rounded-2xl border border-[#FF3B30]/10 text-[#FF3B30]">
              <span className="font-semibold">- حقوق و مساعده نقدی پرسنل:</span>
              <span className="font-bold font-mono text-sm">- {formatCurrency(cashSalariesTotal)}</span>
            </div>

            {/* Calculated Final Book Balance */}
            <div className="flex items-center justify-between p-4 bg-neutral-900 text-white rounded-2xl font-bold text-sm">
              <span>= مانده دفتری محاسباتی صندوق:</span>
              <span className="font-mono text-base text-[#34C759]">{formatCurrency(expectedBookCash)}</span>
            </div>
          </div>
        </div>

        {/* Right: Physical Cash Count & Discrepancy Alert */}
        <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-6 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-black/[0.04] pb-3">
              <Wallet size={20} className="text-[#34C759]" />
              <h3 className="font-bold text-base text-neutral-900">تطبیق و مغایرت‌گیری شمارش فیزیکی</h3>
            </div>

            <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
              لطفاً موجودی واقعی اسکناس‌های داخل کشوی صندوق را شمارش کرده و وارد نمایید تا سیستم کسر یا فزونی احتمالی را محاسبه کند.
            </p>

            <div className="mt-4 p-4 bg-neutral-50 rounded-2xl border border-black/[0.06] space-y-2">
              <label className="text-xs font-bold text-neutral-800 block">
                مبلغ اسکناس‌های شمارش‌شده (تومان):
              </label>
              <input
                type="number"
                value={physicalCashCount}
                onChange={(e) => setPhysicalCashCount(e.target.value)}
                placeholder="مثلاً: ۴,۵۰۰,۰۰۰"
                className="w-full px-4 py-2.5 bg-white border border-black/[0.1] rounded-2xl text-base font-mono font-bold text-neutral-900 outline-none focus:border-[#007AFF] shadow-inner"
              />
            </div>

            {/* Discrepancy Status Card */}
            {parsedPhysicalCount !== null && (
              <div className={`mt-4 p-4 rounded-2xl border flex items-center justify-between transition-all ${
                discrepancy === 0
                  ? 'bg-[#34C759]/10 border-[#34C759]/30 text-[#28a745]'
                  : discrepancy < 0
                  ? 'bg-[#FF3B30]/10 border-[#FF3B30]/30 text-[#FF3B30]'
                  : 'bg-[#007AFF]/10 border-[#007AFF]/30 text-[#007AFF]'
              }`}>
                <div className="flex items-center gap-3">
                  {discrepancy === 0 ? (
                    <CheckCircle2 size={24} />
                  ) : discrepancy < 0 ? (
                    <AlertTriangle size={24} />
                  ) : (
                    <RefreshCw size={24} />
                  )}
                  <div>
                    <span className="text-xs font-bold block">
                      {discrepancy === 0 
                        ? 'تطابق کامل صندوق (بدون مغایرت)' 
                        : discrepancy < 0 
                        ? 'کسری صندوق (کمبود نقدینگی)' 
                        : 'فزونی صندوق (مازاد اسکناس)'}
                    </span>
                    <span className="text-xs font-mono font-normal">
                      {discrepancy === 0 
                        ? 'موجود فیزیکی دقیقاً برابر با مانده دفتری است.' 
                        : `میزان اختلاف: ${formatCurrency(Math.abs(discrepancy))}`}
                    </span>
                  </div>
                </div>

                <div className="text-left">
                  <span className="text-lg font-black font-mono">
                    {formatCurrency(discrepancy)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="text-[11px] text-neutral-400 border-t border-black/[0.04] pt-3">
            نکته: در صورت وجود کسری یا فزونی، تاییدیه مسئول شیفت و مدیر سالن الزامی است.
          </div>
        </div>

      </div>

    </div>
  );
}
