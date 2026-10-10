import React, { useMemo } from 'react';
import { Order, Expense, SalaryPayment } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel, printReportPDF } from '../../lib/reportExporter';
import { 
  TrendingUp, TrendingDown, DollarSign, Download, Printer, 
  Receipt, Building, ShieldCheck, ArrowDownRight, ArrowUpRight
} from 'lucide-react';

interface ProfitLossReportProps {
  filteredOrders: Order[];
  filteredExpenses: Expense[];
  filteredSalaries: SalaryPayment[];
  dateRangeText: string;
}

export default function ProfitLossReport({
  filteredOrders,
  filteredExpenses,
  filteredSalaries,
  dateRangeText,
}: ProfitLossReportProps) {

  // Revenue Calculations
  const grossRevenue = useMemo(() => filteredOrders.reduce((sum, o) => sum + o.subtotal, 0), [filteredOrders]);
  const totalDiscounts = useMemo(() => filteredOrders.reduce((sum, o) => sum + (o.discountValue || 0), 0), [filteredOrders]);
  const netSalesRevenue = useMemo(() => filteredOrders.reduce((sum, o) => sum + o.total, 0), [filteredOrders]);

  // Expenses
  const rawMaterialsCost = useMemo(() => {
    return filteredExpenses.filter(e => e.type === 'material').reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const grossProfit = netSalesRevenue - rawMaterialsCost;
  const grossMargin = netSalesRevenue > 0 ? ((grossProfit / netSalesRevenue) * 100).toFixed(1) : '0';

  const operatingExpenses = useMemo(() => {
    return filteredExpenses.filter(e => e.type === 'general_expense').reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const salariesTotal = useMemo(() => {
    return filteredSalaries.reduce((sum, s) => sum + s.totalPaid, 0);
  }, [filteredSalaries]);

  const totalAllExpenses = rawMaterialsCost + operatingExpenses + salariesTotal;
  const netProfit = netSalesRevenue - (operatingExpenses + salariesTotal + rawMaterialsCost);
  const netMargin = netSalesRevenue > 0 ? ((netProfit / netSalesRevenue) * 100).toFixed(1) : '0';

  // Excel Export
  const handleExportExcel = () => {
    const pnlRows = [
      { 'بخش مالی': '۱. درآمدها', 'عنوان حساب': 'درآمد ناخالص فروش', 'مبلغ (تومان)': grossRevenue },
      { 'بخش مالی': '۱. درآمدها', 'عنوان حساب': 'تخفیفات اعطایی به مشتریان', 'مبلغ (تومان)': totalDiscounts },
      { 'بخش مالی': '۱. درآمدها', 'عنوان حساب': 'درآمد خالص فروش', 'مبلغ (تومان)': netSalesRevenue },
      { 'بخش مالی': '۲. بهای تمام شده', 'عنوان حساب': 'بهای مواد اولیه و ملزومات (COGS)', 'مبلغ (تومان)': rawMaterialsCost },
      { 'بخش مالی': '۲. بهای تمام شده', 'عنوان حساب': 'سود ناخالص (Gross Profit)', 'مبلغ (تومان)': grossProfit },
      { 'بخش مالی': '۳. هزینه‌های عملیاتی', 'عنوان حساب': 'حقوق و دستمزد پرسنل', 'مبلغ (تومان)': salariesTotal },
      { 'بخش مالی': '۳. هزینه‌های عملیاتی', 'عنوان حساب': 'هزینه‌های جاری، قبوض و اداری', 'مبلغ (تومان)': operatingExpenses },
      { 'بخش مالی': '۴. نتیجه نهایی', 'عنوان حساب': 'سود / زیان خالص عملیاتی', 'مبلغ (تومان)': netProfit },
    ];

    exportToExcel(pnlRows, `صورت_سود_و_زیان_${new Date().toLocaleDateString('fa-IR')}`);
  };

  // PDF Export
  const handlePrintPDF = () => {
    const summaryCards = [
      { label: 'درآمد خالص فروش', value: formatCurrency(netSalesRevenue) },
      { label: 'سود ناخالص', value: formatCurrency(grossProfit) },
      { label: 'کل هزینه‌ها', value: formatCurrency(totalAllExpenses) },
      { label: 'سود خالص عملیاتی', value: formatCurrency(netProfit) },
    ];

    const sections = [
      {
        title: 'صورت استاندارد سود و زیان (P&L Statement)',
        headers: ['ردیف', 'عنوان سرفصل حسابداري', 'مبلغ (تومان)', 'توضیحات و نسبت'],
        rows: [
          [1, 'درآمد فروش ناخالص', formatCurrency(grossRevenue), `${filteredOrders.length} فاکتور`],
          [2, 'تخفیفات اعطایی مشتریان', formatCurrency(totalDiscounts), 'کسری مستقیم از درآمد'],
          [3, 'درآمد خالص فروش', formatCurrency(netSalesRevenue), 'پایه محاسبات سودآوری'],
          [4, 'بهای تمام شده مواد اولیه (COGS)', formatCurrency(rawMaterialsCost), `بهای مواد (${netSalesRevenue > 0 ? ((rawMaterialsCost / netSalesRevenue) * 100).toFixed(1) : 0}٪)`],
          [5, 'سود ناخالص (Gross Profit)', formatCurrency(grossProfit), `حاشیه سود ناخالص: ${grossMargin}٪`],
          [6, 'حقوق و دستمزد پرسنل', formatCurrency(salariesTotal), 'فیش‌های پرداختی'],
          [7, 'هزینه‌های جاری و قبوض', formatCurrency(operatingExpenses), 'اداری، اجاره، بسته‌بندی'],
          [8, 'سود / زیان خالص عملیاتی', formatCurrency(netProfit), `حاشیه سود خالص: ${netMargin}٪`],
        ]
      }
    ];

    printReportPDF(
      'صورت سود و زیان (P&L)',
      `دوره ارزیابی: ${dateRangeText}`,
      summaryCards,
      sections
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* Header Actions */}
      <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900">صورت استاندارد سود و زیان (P&L)</h2>
          <p className="text-xs text-neutral-500 font-normal mt-0.5">
            تحلیل دقیق درآمد خالص، بهای تمام شده، هزینه‌های جاری و سود خالص دوره
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

      {/* Net Profit Big Banner Card */}
      <div className={`p-6 sm:p-8 rounded-3xl border shadow-lg flex flex-col sm:flex-row justify-between items-center gap-6 ${
        netProfit >= 0 
          ? 'bg-gradient-to-r from-[#34C759]/15 to-[#34C759]/5 border-[#34C759]/30 text-neutral-900' 
          : 'bg-gradient-to-r from-[#FF3B30]/15 to-[#FF3B30]/5 border-[#FF3B30]/30 text-neutral-900'
      }`}>
        <div className="flex items-center gap-5">
          <div className={`w-16 h-16 rounded-2xl text-white flex items-center justify-center shadow-lg ${
            netProfit >= 0 ? 'bg-[#34C759]' : 'bg-[#FF3B30]'
          }`}>
            {netProfit >= 0 ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-600 block">سود / زیان خالص قابل برداشت:</span>
            <h3 className={`text-3xl font-black mt-1 font-mono ${netProfit >= 0 ? 'text-[#28a745]' : 'text-[#FF3B30]'}`}>
              {formatCurrency(netProfit)}
            </h3>
            <span className="text-xs text-neutral-500 font-medium font-mono mt-0.5 block">
              حاشیه سود خالص: {netMargin}% از درآمد فروش
            </span>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-md p-4 px-6 rounded-2xl border border-black/[0.08] text-xs text-left">
          <span className="text-neutral-500 block mb-0.5">مجموع خروجی‌های مالی دوره:</span>
          <span className="font-extrabold text-[#FF3B30] font-mono text-base">{formatCurrency(totalAllExpenses)}</span>
        </div>
      </div>

      {/* Structured Income Statement Table */}
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-6 space-y-4">
        <h3 className="font-bold text-base text-neutral-900 border-b border-black/[0.04] pb-3 flex items-center gap-2">
          <DollarSign size={20} className="text-[#007AFF]" />
          <span>جدول صورت سود و زیان (P&L Table)</span>
        </h3>

        <div className="space-y-2 text-xs">
          
          {/* Gross Sales */}
          <div className="flex justify-between items-center p-3.5 bg-neutral-50 rounded-2xl">
            <span className="font-semibold text-neutral-800">+ درآمد فروش ناخالص:</span>
            <span className="font-bold text-[#007AFF] font-mono text-sm">{formatCurrency(grossRevenue)}</span>
          </div>

          {/* Discounts */}
          <div className="flex justify-between items-center p-3.5 bg-neutral-50 rounded-2xl text-neutral-600">
            <span>- تخفیفات اعطایی به مشتریان:</span>
            <span className="font-bold font-mono text-neutral-800">- {formatCurrency(totalDiscounts)}</span>
          </div>

          {/* Net Sales */}
          <div className="flex justify-between items-center p-4 bg-[#007AFF]/10 text-[#007AFF] rounded-2xl font-bold text-sm">
            <span>= درآمد خالص فروش:</span>
            <span className="font-mono text-base">{formatCurrency(netSalesRevenue)}</span>
          </div>

          {/* COGS */}
          <div className="flex justify-between items-center p-3.5 bg-[#FF9500]/10 rounded-2xl text-[#d97706]">
            <span className="font-semibold">- بهای تمام شده مواد اولیه و خریدهای انبار (COGS):</span>
            <span className="font-bold font-mono text-sm">- {formatCurrency(rawMaterialsCost)}</span>
          </div>

          {/* Gross Profit */}
          <div className="flex justify-between items-center p-4 bg-neutral-100 rounded-2xl font-bold text-sm text-neutral-900">
            <span>= سود ناخالص (Gross Profit) - حاشیه {grossMargin}%:</span>
            <span className="font-mono text-base text-[#34C759]">{formatCurrency(grossProfit)}</span>
          </div>

          {/* Salaries */}
          <div className="flex justify-between items-center p-3.5 bg-[#5856D6]/10 rounded-2xl text-[#5856D6]">
            <span className="font-semibold">- هزینه‌های حقوق و دستمزد پرسنل:</span>
            <span className="font-bold font-mono text-sm">- {formatCurrency(salariesTotal)}</span>
          </div>

          {/* Operating Expenses */}
          <div className="flex justify-between items-center p-3.5 bg-[#FF3B30]/10 rounded-2xl text-[#FF3B30]">
            <span className="font-semibold">- هزینه‌های جاری، قبوض، اجاره و اداری:</span>
            <span className="font-bold font-mono text-sm">- {formatCurrency(operatingExpenses)}</span>
          </div>

          {/* Final Net Profit */}
          <div className={`flex justify-between items-center p-5 rounded-2xl font-black text-base border-2 ${
            netProfit >= 0 
              ? 'bg-[#34C759]/15 text-[#28a745] border-[#34C759]' 
              : 'bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]'
          }`}>
            <span>= سود / زیان خالص نهایی دوره:</span>
            <span className="font-mono text-xl">{formatCurrency(netProfit)}</span>
          </div>

        </div>
      </div>

    </div>
  );
}
