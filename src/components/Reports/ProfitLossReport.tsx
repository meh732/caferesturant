import React, { useMemo } from 'react';
import { Order, Expense, SalaryPayment, db } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel, printReportPDF } from '../../lib/reportExporter';
import { calculateFinancialMetrics } from '../../lib/financialServices';
import { 
  TrendingUp, TrendingDown, DollarSign, Download, Printer, ShoppingBag
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
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const warehouseStocks = useLiveQuery(() => db.warehouseStocks.toArray()) || [];

  // Centralized standardized calculation
  const metrics = useMemo(() => {
    return calculateFinancialMetrics({
      orders: filteredOrders,
      expenses: filteredExpenses,
      salaries: filteredSalaries,
      recipes,
      rawMaterials,
      warehouseStocks,
    });
  }, [filteredOrders, filteredExpenses, filteredSalaries, recipes, rawMaterials, warehouseStocks]);

  // Excel Export
  const handleExportExcel = () => {
    const pnlRows = [
      { 'بخش مالی': '۱. درآمدها', 'عنوان حساب': 'درآمد ناخالص فروش', 'مبلغ (تومان)': metrics.grossSales },
      { 'بخش مالی': '۱. درآمدها', 'عنوان حساب': 'تخفیفات اعطایی به مشتریان', 'مبلغ (تومان)': metrics.totalDiscounts },
      { 'بخش مالی': '۱. درآمدها', 'عنوان حساب': 'درآمد خالص فروش', 'مبلغ (تومان)': metrics.netSales },
      { 'بخش مالی': '۲. بهای تمام شده', 'عنوان حساب': 'بهای تمام‌شده مواد مصرفی (Food Cost / COGS)', 'مبلغ (تومان)': metrics.cogs },
      { 'بخش مالی': '۲. بهای تمام شده', 'عنوان حساب': 'سود ناخالص (Gross Profit)', 'مبلغ (تومان)': metrics.grossProfit },
      { 'بخش مالی': '۳. هزینه‌های عملیاتی', 'عنوان حساب': 'حقوق و دستمزد پرسنل', 'مبلغ (تومان)': metrics.laborCosts },
      { 'بخش مالی': '۳. هزینه‌های عملیاتی', 'عنوان حساب': 'هزینه‌های جاری، قبوض و اداری', 'مبلغ (تومان)': metrics.operatingExpenses },
      { 'بخش مالی': '۴. نتیجه نهایی', 'عنوان حساب': 'سود / زیان خالص عملیاتی', 'مبلغ (تومان)': metrics.netProfit },
      { 'بخش مالی': '۵. ارزیابی سرمایه', 'عنوان حساب': 'کل خریدهای مواد اولیه در این دوره (ورودی دپو / خروج نقدینگی)', 'مبلغ (تومان)': metrics.totalPurchases },
      { 'بخش مالی': '۵. ارزیابی سرمایه', 'عنوان حساب': 'ارزش ریالی کل موجودی فیزیکی انبار (دارایی جاری)', 'مبلغ (تومان)': metrics.inventoryValuation },
    ];

    exportToExcel(pnlRows, `صورت_سود_و_زیان_${new Date().toLocaleDateString('fa-IR')}`);
  };

  // PDF Export
  const handlePrintPDF = () => {
    const summaryCards = [
      { label: 'درآمد خالص فروش', value: formatCurrency(metrics.netSales) },
      { label: 'بهای تمام‌شده (COGS)', value: formatCurrency(metrics.cogs) },
      { label: 'سود ناخالص', value: formatCurrency(metrics.grossProfit) },
      { label: 'سود خالص عملیاتی', value: formatCurrency(metrics.netProfit) },
    ];

    const sections = [
      {
        title: 'صورت استاندارد سود و زیان (P&L Statement)',
        headers: ['ردیف', 'عنوان سرفصل حسابداری', 'مبلغ (تومان)', 'توضیحات و نسبت'],
        rows: [
          [1, 'درآمد فروش ناخالص', formatCurrency(metrics.grossSales), `${metrics.totalInvoices} فاکتور صادرشده`],
          [2, 'تخفیفات اعطایی مشتریان', formatCurrency(metrics.totalDiscounts), 'کسری مستقیم از درآمد'],
          [3, 'درآمد خالص فروش', formatCurrency(metrics.netSales), 'پایه محاسبات سودآوری'],
          [4, 'بهای تمام‌شده مواد مصرفی (Food Cost / COGS)', formatCurrency(metrics.cogs), `بهای مواد مصرف‌شده در ${metrics.totalInvoices} فاکتور (${metrics.foodCostPercentage.toFixed(1)}٪)`],
          [5, 'سود ناخالص (Gross Profit)', formatCurrency(metrics.grossProfit), `حاشیه سود ناخالص: ${metrics.grossMarginPercentage.toFixed(1)}٪`],
          [6, 'حقوق و دستمزد پرسنل', formatCurrency(metrics.laborCosts), 'فیش‌های پرداختی حقوق'],
          [7, 'هزینه‌های جاری و قبوض', formatCurrency(metrics.operatingExpenses), 'اداری، اجاره، بسته‌بندی'],
          [8, 'سود / زیان خالص عملیاتی', formatCurrency(metrics.netProfit), `حاشیه سود خالص: ${metrics.netProfitMarginPercentage.toFixed(1)}٪`],
          [9, 'خریدهای مواد اولیه انبار (ورودی به دپو)', formatCurrency(metrics.totalPurchases), 'افزایش موجودی (دارایی جاری / بدون کسر از سود)'],
          [10, 'ارزش ریالی موجودی فیزیکی انبار', formatCurrency(metrics.inventoryValuation), 'دارایی جاری موجود در انبارها'],
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
            تحلیل دقیق درآمد خالص، بهای تمام‌شده کالای فروش‌رفته (COGS)، هزینه‌های جاری و سود خالص دوره
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
        metrics.netProfit >= 0 
          ? 'bg-gradient-to-r from-[#34C759]/15 to-[#34C759]/5 border-[#34C759]/30 text-neutral-900' 
          : 'bg-gradient-to-r from-[#FF3B30]/15 to-[#FF3B30]/5 border-[#FF3B30]/30 text-neutral-900'
      }`}>
        <div className="flex items-center gap-5">
          <div className={`w-16 h-16 rounded-2xl text-white flex items-center justify-center shadow-lg ${
            metrics.netProfit >= 0 ? 'bg-[#34C759]' : 'bg-[#FF3B30]'
          }`}>
            {metrics.netProfit >= 0 ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-600 block">سود / زیان خالص قابل برداشت:</span>
            <h3 className={`text-3xl font-black mt-1 font-mono ${metrics.netProfit >= 0 ? 'text-[#28a745]' : 'text-[#FF3B30]'}`}>
              {formatCurrency(metrics.netProfit)}
            </h3>
            <span className="text-xs text-neutral-500 font-medium font-mono mt-0.5 block">
              حاشیه سود خالص: {metrics.netProfitMarginPercentage.toFixed(1)}% از درآمد فروش
            </span>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-md p-4 px-6 rounded-2xl border border-black/[0.08] text-xs text-left">
          <span className="text-neutral-500 block mb-0.5">مجموع خروجی‌های مالی دوره:</span>
          <span className="font-extrabold text-[#FF3B30] font-mono text-base">{formatCurrency(metrics.totalOperationalCosts)}</span>
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
            <span className="font-bold text-[#007AFF] font-mono text-sm">{formatCurrency(metrics.grossSales)}</span>
          </div>

          {/* Discounts */}
          <div className="flex justify-between items-center p-3.5 bg-neutral-50 rounded-2xl text-neutral-600">
            <span>- تخفیفات اعطایی به مشتریان:</span>
            <span className="font-bold font-mono text-neutral-800">- {formatCurrency(metrics.totalDiscounts)}</span>
          </div>

          {/* Net Sales */}
          <div className="flex justify-between items-center p-4 bg-[#007AFF]/10 text-[#007AFF] rounded-2xl font-bold text-sm">
            <span>= درآمد خالص فروش:</span>
            <span className="font-mono text-base">{formatCurrency(metrics.netSales)}</span>
          </div>

          {/* COGS (Food Cost) */}
          <div className="flex justify-between items-center p-3.5 bg-[#FF9500]/10 rounded-2xl text-[#d97706]">
            <div>
              <span className="font-semibold block">- بهای تمام‌شده مواد مصرفی (Food Cost / COGS):</span>
              <span className="text-[11px] text-[#d97706]/80 font-normal">محاسبه بر اساس وزن، تعداد و فرمول محصولات فروخته شده</span>
            </div>
            <span className="font-bold font-mono text-sm">- {formatCurrency(metrics.cogs)}</span>
          </div>

          {/* Gross Profit */}
          <div className="flex justify-between items-center p-4 bg-neutral-100 rounded-2xl font-bold text-sm text-neutral-900">
            <span>= سود ناخالص (Gross Profit) - حاشیه {metrics.grossMarginPercentage.toFixed(1)}%:</span>
            <span className="font-mono text-base text-[#34C759]">{formatCurrency(metrics.grossProfit)}</span>
          </div>

          {/* Salaries */}
          <div className="flex justify-between items-center p-3.5 bg-[#5856D6]/10 rounded-2xl text-[#5856D6]">
            <span className="font-semibold">- هزینه‌های حقوق و دستمزد پرسنل:</span>
            <span className="font-bold font-mono text-sm">- {formatCurrency(metrics.laborCosts)}</span>
          </div>

          {/* Operating Expenses */}
          <div className="flex justify-between items-center p-3.5 bg-[#FF3B30]/10 rounded-2xl text-[#FF3B30]">
            <span className="font-semibold">- هزینه‌های جاری، قبوض، اجاره و اداری:</span>
            <span className="font-bold font-mono text-sm">- {formatCurrency(metrics.operatingExpenses)}</span>
          </div>

          {/* Final Net Profit */}
          <div className={`flex justify-between items-center p-5 rounded-2xl font-black text-base border-2 ${
            metrics.netProfit >= 0 
              ? 'bg-[#34C759]/15 text-[#28a745] border-[#34C759]' 
              : 'bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]'
          }`}>
            <span>= سود / زیان خالص نهایی دوره:</span>
            <span className="font-mono text-xl">{formatCurrency(metrics.netProfit)}</span>
          </div>

          {/* Inventory Purchase Info Section (Independent Asset Acquisition) */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center p-3.5 bg-purple-50/70 rounded-2xl text-purple-900">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-purple-600" />
              <div>
                <span className="font-bold text-xs block">کل خریدهای مواد اولیه در این دوره (ورودی به دپوی انبار - خروج نقدینگی):</span>
                <span className="text-[11px] text-purple-600 font-normal">خریدهای صورت‌گرفته دارایی جاری هستند و تا زمان فروش محصول در COGS وارد نمی‌شوند</span>
              </div>
            </div>
            <span className="font-bold font-mono text-xs bg-white px-3 py-1 rounded-xl border border-purple-200 shrink-0">
              {formatCurrency(metrics.totalPurchases)}
            </span>
          </div>

        </div>
      </div>

    </div>
  );
}
