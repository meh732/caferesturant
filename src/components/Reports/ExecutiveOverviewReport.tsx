import React, { useMemo } from 'react';
import { Order, Expense, SalaryPayment, RawMaterial, WarehouseStock, db } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel, printReportPDF } from '../../lib/reportExporter';
import { calculateFinancialMetrics } from '../../lib/financialServices';
import { 
  Building2, TrendingUp, DollarSign, AlertTriangle, 
  PieChart, Download, Printer, Percent, BarChart3,
  Boxes, ShoppingBag, Wallet, Layers, ShieldCheck
} from 'lucide-react';

interface ExecutiveOverviewReportProps {
  filteredOrders: Order[];
  filteredExpenses: Expense[];
  filteredSalaries: SalaryPayment[];
  rawMaterials: RawMaterial[];
  warehouseStocks: WarehouseStock[];
  dateRangeText: string;
}

export default function ExecutiveOverviewReport({
  filteredOrders,
  filteredExpenses,
  filteredSalaries,
  rawMaterials,
  warehouseStocks,
  dateRangeText,
}: ExecutiveOverviewReportProps) {
  
  // Live query for recipes needed for exact COGS calculation
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];

  // Compute exact financial metrics via centralized financial service
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
    const data = [
      { 'شاخص اجرایی مدیریتی': 'درآمد ناخالص فروش', 'مقدار / مبلغ': formatCurrency(metrics.grossSales) },
      { 'شاخص اجرایی مدیریتی': 'تخفیفات اعطایی مشتریان', 'مقدار / مبلغ': formatCurrency(metrics.totalDiscounts) },
      { 'شاخص اجرایی مدیریتی': 'درآمد خالص فروش', 'مقدار / مبلغ': formatCurrency(metrics.netSales) },
      { 'شاخص اجرایی مدیریتی': 'تعداد کل فاکتورها', 'مقدار / مبلغ': `${metrics.totalInvoices} فاکتور` },
      { 'شاخص اجرایی مدیریتی': 'میانگین هر سفارش (AOV)', 'مقدار / مبلغ': formatCurrency(metrics.avgInvoiceValue) },
      { 'شاخص اجرایی مدیریتی': 'بهای تمام‌شده مواد مصرفی (Food Cost / COGS)', 'مقدار / مبلغ': formatCurrency(metrics.cogs) },
      { 'شاخص اجرایی مدیریتی': 'نسبت هزینه غذا (Food Cost %)', 'مقدار / مبلغ': `${metrics.foodCostPercentage.toFixed(1)}%` },
      { 'شاخص اجرایی مدیریتی': 'سود ناخالص (Gross Profit)', 'مقدار / مبلغ': formatCurrency(metrics.grossProfit) },
      { 'شاخص اجرایی مدیریتی': 'حقوق و دستمزد پرسنل', 'مقدار / مبلغ': formatCurrency(metrics.laborCosts) },
      { 'شاخص اجرایی مدیریتی': 'هزینه‌های جاری و قبوض', 'مقدار / مبلغ': formatCurrency(metrics.operatingExpenses) },
      { 'شاخص اجرایی مدیریتی': 'سود خالص عملیاتی', 'مقدار / مبلغ': formatCurrency(metrics.netProfit) },
      { 'شاخص اجرایی مدیریتی': 'حاشیه سود خالص (Net Margin %)', 'مقدار / مبلغ': `${metrics.netProfitMarginPercentage.toFixed(1)}%` },
      { 'شاخص اجرایی مدیریتی': 'جمع کل خریدهای انبار در دوره (خروج نقدینگی)', 'مقدار / مبلغ': formatCurrency(metrics.totalPurchases) },
      { 'شاخص اجرایی مدیریتی': 'ارزش ریالی موجودی انبار (دارایی جاری)', 'مقدار / مبلغ': formatCurrency(metrics.inventoryValuation) },
      { 'شاخص اجرایی مدیریتی': 'عناوین کالای دارای کسری انبار', 'مقدار / مبلغ': `${metrics.negativeStockCount} کالا` },
    ];

    exportToExcel(data, `گزارش_مدیریتی_رستوران_${new Date().toLocaleDateString('fa-IR')}`);
  };

  // PDF Export
  const handlePrintPDF = () => {
    const summaryCards = [
      { label: 'درآمد خالص فروش', value: formatCurrency(metrics.netSales) },
      { label: 'بهای تمام‌شده (COGS)', value: formatCurrency(metrics.cogs) },
      { label: 'سود خالص عملیاتی', value: formatCurrency(metrics.netProfit) },
      { label: 'ارزش موجودی انبار', value: formatCurrency(metrics.inventoryValuation) },
    ];

    const sections = [
      {
        title: 'خلاصه شاخص‌های کلیدی عملکرد (KPIs)',
        headers: ['عنوان شاخص مدیریتی', 'مقدار محاسباتی', 'توضیحات و نوع حساب'],
        rows: [
          ['کل درآمد خالص حاصل از فروش', formatCurrency(metrics.netSales), `${metrics.totalInvoices} فاکتور صادرشده`],
          ['بهای تمام‌شده مواد مصرفی (Food Cost / COGS)', formatCurrency(metrics.cogs), `نسبت ${metrics.foodCostPercentage.toFixed(1)}% (بازه استاندارد صنعت ۲۸٪ تا ۳۵٪)`],
          ['حقوق و دستمزد پرسنل', formatCurrency(metrics.laborCosts), 'مجموع پرداختی‌های فیش حقوقی'],
          ['هزینه‌های جاری و اداری', formatCurrency(metrics.operatingExpenses), 'قبوض، اجاره، بسته‌بندی، تبلیغات'],
          ['سود خالص قابل برداشت', formatCurrency(metrics.netProfit), `حاشیه سود خالص ${metrics.netProfitMarginPercentage.toFixed(1)}% از درآمد`],
          ['جمع کل خریدهای انبار در دوره', formatCurrency(metrics.totalPurchases), 'افزایش موجودی دپو (پایش نقدینگی / بدون تاثیر در سود)'],
          ['ارزش ریالی موجودی فعلی انبار', formatCurrency(metrics.inventoryValuation), 'دارایی جاری انبار بر اساس قیمت تمام‌شده کالاها'],
          ['اقلام انبار دارای کسری/منفی', `${metrics.negativeStockCount} قلم کالا`, metrics.negativeStockCount > 0 ? 'نیازمند تعدیل و ثبت خرید' : 'وضعیت انبار نرمال است'],
        ]
      }
    ];

    printReportPDF(
      'گزارش خلاصه مدیریتی و شاخص‌های کلیدی رستوران',
      `دوره ارزیابی: ${dateRangeText}`,
      summaryCards,
      sections
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* Executive Banner & Actions */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#007AFF] text-white flex items-center justify-center shrink-0 shadow-lg">
            <Building2 size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-[#34C759] text-[11px] font-bold">
                داشبورد ارزیابی هیئت مدیره
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black mt-1">گزارش خلاصه اجرایی و شاخص‌های کلیدی (KPIs)</h2>
            <p className="text-xs text-neutral-300 font-normal mt-1">
              تحلیل استاندارد درآمد، بهای تمام‌شده کالای فروش‌رفته (COGS)، ارزیابی دارایی انبار و سود خالص
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold flex items-center gap-2 backdrop-blur-md transition-all cursor-pointer active:scale-95"
          >
            <Download size={15} />
            <span>اکسل (.xlsx)</span>
          </button>

          <button
            onClick={handlePrintPDF}
            className="px-4 py-2.5 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
          >
            <Printer size={15} />
            <span>چاپ گزارش PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid (6 Independent Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        
        {/* Card 1: Food Cost % */}
        <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-500 font-semibold block">نسبت هزینه غذا (Food Cost)</span>
            <div className="w-9 h-9 rounded-xl bg-[#FF9500]/10 text-[#FF9500] flex items-center justify-center shrink-0">
              <Percent size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-neutral-900 font-mono">
              {metrics.foodCostPercentage.toFixed(1)}%
            </h3>
            <span className="text-[10px] text-[#34C759] font-medium mt-1 block">
              بر پایه بهای مواد مصرفی در فروش
            </span>
          </div>
        </div>

        {/* Card 2: Net Profit Margin % */}
        <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-500 font-semibold block">حاشیه سود خالص (Margin %)</span>
            <div className="w-9 h-9 rounded-xl bg-[#34C759]/10 text-[#34C759] flex items-center justify-center shrink-0">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className={`text-2xl font-black font-mono ${metrics.netProfitMarginPercentage >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
              {metrics.netProfitMarginPercentage.toFixed(1)}%
            </h3>
            <span className="text-[10px] text-neutral-400 font-medium mt-1 block">
              از کل درآمد خالص فروش
            </span>
          </div>
        </div>

        {/* Card 3: Average Order Value */}
        <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-500 font-semibold block">میانگین هر سفارش (AOV)</span>
            <div className="w-9 h-9 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0">
              <BarChart3 size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-bold text-neutral-900 font-mono">
              {formatCurrency(metrics.avgInvoiceValue)}
            </h3>
            <span className="text-[10px] text-neutral-400 font-medium mt-1 block">
              {metrics.totalInvoices} فاکتور صادرشده
            </span>
          </div>
        </div>

        {/* Card 4: Total Purchases (Independent Procurement Monitoring) */}
        <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm flex flex-col justify-between bg-gradient-to-b from-purple-50/30 to-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-purple-900 font-bold block">جمع کل خریدهای دوره</span>
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-extrabold">
              خروج نقدینگی / تأمین
            </span>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-black text-purple-900 font-mono">
              {formatCurrency(metrics.totalPurchases)}
            </h3>
            <span className="text-[10px] text-purple-600 font-medium mt-1 block">
              ورودی دپو (بدون کسر از سود)
            </span>
          </div>
        </div>

        {/* Card 5: Inventory Valuation (Independent Current Asset Valuation) */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between bg-gradient-to-b from-emerald-50/30 to-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-emerald-900 font-bold block">ارزش ریالی موجودی انبار</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-extrabold">
              دارایی جاری
            </span>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-black text-emerald-900 font-mono">
              {formatCurrency(metrics.inventoryValuation)}
            </h3>
            <span className="text-[10px] text-emerald-600 font-medium mt-1 block">
              ارزش کل کالاهای موجود در دپو
            </span>
          </div>
        </div>

        {/* Card 6: Inventory Deficit Risk */}
        <div className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between ${
          metrics.negativeStockCount > 0 ? 'bg-[#FF3B30]/[0.03] border-[#FF3B30]/30' : 'bg-white border-black/[0.06]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#FF3B30] block">کسری‌های بحرانی انبار</span>
            <div className="w-9 h-9 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-bold text-[#FF3B30] font-mono">
              {metrics.negativeStockCount} <span className="text-xs font-normal text-neutral-500">کالا</span>
            </h3>
            <span className="text-[10px] text-neutral-500 font-medium mt-1 block">
              {metrics.negativeStockCount > 0 ? 'نیازمند شارژ و فاکتور خرید' : 'وضعیت انبارها نرمال است'}
            </span>
          </div>
        </div>

      </div>

      {/* Financial Structure Breakdown Table & Visual Distribution */}
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-6 space-y-6">
        <h3 className="font-bold text-base text-neutral-900 border-b border-black/[0.04] pb-3 flex items-center gap-2">
          <PieChart size={18} className="text-[#007AFF]" />
          <span>ساختار جریانات مالی و توزیع هزینه‌های مجموعه</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Detailed Financial Summary Rows */}
          <div className="space-y-3 text-xs">
            
            {/* Row 1: Sales Revenue */}
            <div className="flex justify-between items-center p-3.5 bg-neutral-50 rounded-2xl font-bold text-neutral-900">
              <span>۱. کل درآمد فروش (خالص):</span>
              <span className="font-mono text-sm text-[#007AFF]">{formatCurrency(metrics.netSales)}</span>
            </div>

            {/* Row 2: COGS / Food Cost (Renamed & Corrected explicitly per specification) */}
            <div className="flex justify-between items-center p-3.5 bg-[#FF9500]/10 rounded-2xl text-[#d97706]">
              <div>
                <span className="font-bold block">۲. بهای تمام‌شده مواد مصرفی (Food Cost / COGS):</span>
                <span className="text-[10px] text-[#d97706]/80 font-normal">محاسبه بر اساس فرمول رسپی و مقدار محصولات فروخته شده</span>
              </div>
              <span className="font-mono text-sm font-bold text-[#d97706]">- {formatCurrency(metrics.cogs)}</span>
            </div>

            {/* Row 3: Staff Payroll */}
            <div className="flex justify-between items-center p-3.5 bg-[#5856D6]/10 rounded-2xl text-[#5856D6]">
              <span>۳. حقوق، دستمزد و مزایای پرسنل:</span>
              <span className="font-mono text-sm font-bold text-[#5856D6]">- {formatCurrency(metrics.laborCosts)}</span>
            </div>

            {/* Row 4: Operating Expenses */}
            <div className="flex justify-between items-center p-3.5 bg-[#FF3B30]/10 rounded-2xl text-[#FF3B30]">
              <span>۴. هزینه‌های جاری، قبوض و اداری:</span>
              <span className="font-mono text-sm font-bold text-[#FF3B30]">- {formatCurrency(metrics.operatingExpenses)}</span>
            </div>

            {/* Row 5: Final Net Profit */}
            <div className={`flex justify-between items-center p-4 rounded-2xl font-black text-sm border ${
              metrics.netProfit >= 0 ? 'bg-[#34C759]/10 text-[#28a745] border-[#34C759]/30' : 'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/30'
            }`}>
              <span>= سود خالص قابل برداشت نهایی:</span>
              <span className="font-mono text-lg">{formatCurrency(metrics.netProfit)}</span>
            </div>

            {/* Supplementary Procurement / Stock Acquisition Banner (Independent Current Assets) */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center p-3 bg-purple-50/70 rounded-2xl text-purple-900">
              <div className="flex items-center gap-2">
                <ShoppingBag size={16} className="text-purple-600" />
                <div>
                  <span className="font-bold text-[11px] block">سرجمع خریدهای انبار در این دوره (افزایش موجودی / خروج نقدینگی):</span>
                  <span className="text-[10px] text-purple-600 font-normal">صرفاً جهت پایش نقدینگی؛ این مبلغ دارایی جاری است و در سود و زیان وارد نمیشود</span>
                </div>
              </div>
              <span className="font-bold font-mono text-xs bg-white px-3 py-1 rounded-xl border border-purple-200 shrink-0">
                {formatCurrency(metrics.totalPurchases)}
              </span>
            </div>

          </div>

          {/* Visual Percentage Distribution Progress Bars */}
          <div className="space-y-4 justify-center flex flex-col p-4 bg-neutral-50/70 rounded-2xl border border-black/[0.04]">
            <h4 className="text-xs font-bold text-neutral-800 mb-1">سهم هزینه‌ها و بهای تمام‌شده از کل درآمد فروش:</h4>

            {/* Food Cost Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold text-neutral-700">
                <span>بهای مواد مصرفی (Food Cost / COGS):</span>
                <span className="font-mono text-[#FF9500]">{metrics.foodCostPercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-black/[0.06] h-2.5 rounded-full overflow-hidden">
                <div className="bg-[#FF9500] h-full rounded-full transition-all" style={{ width: `${Math.min(metrics.foodCostPercentage, 100)}%` }} />
              </div>
            </div>

            {/* Salaries Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold text-neutral-700">
                <span>حقوق پرسنل:</span>
                <span className="font-mono text-[#5856D6]">
                  {metrics.netSales > 0 ? ((metrics.laborCosts / metrics.netSales) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="w-full bg-black/[0.06] h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-[#5856D6] h-full rounded-full transition-all" 
                  style={{ width: `${Math.min(metrics.netSales > 0 ? (metrics.laborCosts / metrics.netSales) * 100 : 0, 100)}%` }} 
                />
              </div>
            </div>

            {/* Operating Expenses Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold text-neutral-700">
                <span>هزینه‌های جاری و قبوض:</span>
                <span className="font-mono text-[#FF3B30]">
                  {metrics.netSales > 0 ? ((metrics.operatingExpenses / metrics.netSales) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="w-full bg-black/[0.06] h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-[#FF3B30] h-full rounded-full transition-all" 
                  style={{ width: `${Math.min(metrics.netSales > 0 ? (metrics.operatingExpenses / metrics.netSales) * 100 : 0, 100)}%` }} 
                />
              </div>
            </div>

            {/* Net Profit Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1 font-bold text-neutral-900">
                <span>حاشیه سود خالص نهایی:</span>
                <span className="font-mono text-[#34C759]">{metrics.netProfitMarginPercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-black/[0.06] h-3 rounded-full overflow-hidden">
                <div 
                  className="bg-[#34C759] h-full rounded-full transition-all" 
                  style={{ width: `${Math.max(Math.min(metrics.netProfitMarginPercentage, 100), 0)}%` }} 
                />
              </div>
            </div>

          </div>

        </div>
      </div>

    </div>
  );
}
