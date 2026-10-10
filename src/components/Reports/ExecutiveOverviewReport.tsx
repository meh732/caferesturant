import React, { useMemo } from 'react';
import { Order, Expense, SalaryPayment, RawMaterial, WarehouseStock } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel, printReportPDF } from '../../lib/reportExporter';
import { 
  Building2, TrendingUp, DollarSign, Award, AlertTriangle, 
  CheckCircle2, PieChart, ShieldCheck, Download, Printer, Percent, BarChart3
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
  
  // 1. Total Gross Revenue
  const grossRevenue = useMemo(() => filteredOrders.reduce((sum, o) => sum + o.total, 0), [filteredOrders]);
  const totalInvoices = filteredOrders.length;
  const avgInvoiceValue = totalInvoices > 0 ? Math.round(grossRevenue / totalInvoices) : 0;

  // 2. Material Cost (Either calculated via COGS or Expense Purchases)
  const materialExpenses = useMemo(() => {
    return filteredExpenses.filter(e => e.type === 'material').reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // Food Cost %
  const foodCostPercent = grossRevenue > 0 ? ((materialExpenses / grossRevenue) * 100).toFixed(1) : '0';

  // 3. Operating Expenses
  const operatingExpenses = useMemo(() => {
    return filteredExpenses.filter(e => e.type === 'general_expense').reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // 4. Payroll Total
  const salariesTotal = useMemo(() => {
    return filteredSalaries.reduce((sum, s) => sum + s.totalPaid, 0);
  }, [filteredSalaries]);

  // Total Outflow & Net Profit
  const totalOutflows = materialExpenses + operatingExpenses + salariesTotal;
  const netProfit = grossRevenue - totalOutflows;
  const netProfitMargin = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100).toFixed(1) : '0';

  // 5. Inventory Vulnerability Analysis
  const negativeStockCount = useMemo(() => {
    let count = 0;
    rawMaterials.forEach(mat => {
      if (!mat.id) return;
      const stocks = warehouseStocks.filter(s => s.materialId === mat.id);
      const totalQty = stocks.reduce((sum, s) => sum + s.quantity, 0);
      if (totalQty < 0) count++;
    });
    return count;
  }, [rawMaterials, warehouseStocks]);

  // Excel Export
  const handleExportExcel = () => {
    const data = [
      { 'شاخص اجرایی مدیریتی': 'درآمد کل فروش ناخالص', 'مقدار / مبلغ': formatCurrency(grossRevenue) },
      { 'شاخص اجرایی مدیریتی': 'تعداد کل فاکتورها', 'مقدار / مبلغ': `${totalInvoices} فاکتور` },
      { 'شاخص اجرایی مدیریتی': 'میانگین هر سفارش (AOV)', 'مقدار / مبلغ': formatCurrency(avgInvoiceValue) },
      { 'شاخص اجرایی مدیریتی': 'هزینه مواد اولیه و مصرفی', 'مقدار / مبلغ': formatCurrency(materialExpenses) },
      { 'شاخص اجرایی مدیریتی': 'درصد هزینه غذا (Food Cost %)', 'مقدار / مبلغ': `${foodCostPercent}%` },
      { 'شاخص اجرایی مدیریتی': 'حقوق و دستمزد پرسنل', 'مقدار / مبلغ': formatCurrency(salariesTotal) },
      { 'شاخص اجرایی مدیریتی': 'هزینه‌های جاری و قبوض', 'مقدار / مبلغ': formatCurrency(operatingExpenses) },
      { 'شاخص اجرایی مدیریتی': 'سود خالص عملیاتی', 'مقدار / مبلغ': formatCurrency(netProfit) },
      { 'شاخص اجرایی مدیریتی': 'حاشیه سود خالص (Net Margin %)', 'مقدار / مبلغ': `${netProfitMargin}%` },
      { 'شاخص اجرایی مدیریتی': 'عناوین کالای دارای کسری انبار', 'مقدار / مبلغ': `${negativeStockCount} کالا` },
    ];

    exportToExcel(data, `گزارش_مدیریتی_رستوران_${new Date().toLocaleDateString('fa-IR')}`);
  };

  // PDF Export
  const handlePrintPDF = () => {
    const summaryCards = [
      { label: 'درآمد کل فروش', value: formatCurrency(grossRevenue) },
      { label: 'سود خالص عملیاتی', value: formatCurrency(netProfit) },
      { label: 'نسبت هزینه غذا', value: `${foodCostPercent}%` },
      { label: 'حاشیه سود خالص', value: `${netProfitMargin}%` },
    ];

    const sections = [
      {
        title: 'خلاصه شاخص‌های کلیدی عملکرد (KPIs)',
        headers: ['عنوان شاخص مدیریتی', 'مقدار محاسباتی', 'توضیحات و استاندارد صنعت'],
        rows: [
          ['کل درآمد حاصل از فروش', formatCurrency(grossRevenue), `${totalInvoices} فاکتور صادرشده`],
          ['بهای مواد اولیه (Food Cost)', formatCurrency(materialExpenses), `نسبت ${foodCostPercent}% (بازه استاندارد صنعت ۲۸٪ تا ۳۲٪)`],
          ['حقوق و دستمزد پرسنل', formatCurrency(salariesTotal), 'مجموع پرداختی‌های فیش حقوقی'],
          ['هزینه‌های جاری و اداری', formatCurrency(operatingExpenses), 'قبوض، اجاره، بسته‌بندی، تبلیغات'],
          ['سود خالص قابل برداشت', formatCurrency(netProfit), `حاشیه سود خالص ${netProfitMargin}% از درآمد`],
          ['اقلام انبار دارای کسری/منفی', `${negativeStockCount} قلم کالا`, negativeStockCount > 0 ? 'نیازمند تعدیل و ثبت خرید' : 'وضعیت انبار نرمال است'],
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
      <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
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
              تحلیل عملکرد کلی مجموعه، حاشیه سود، کیفیت هزینه غذا و ریسک‌های عملیاتی
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold flex items-center gap-2 backdrop-blur-md transition-all cursor-pointer"
          >
            <Download size={15} />
            <span>اکسل (.xlsx)</span>
          </button>

          <button
            onClick={handlePrintPDF}
            className="px-4 py-2.5 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <Printer size={15} />
            <span>چاپ گزارش PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Food Cost % */}
        <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-neutral-500 font-medium block">نسبت هزینه غذا (Food Cost)</span>
            <h3 className="text-2xl font-black text-neutral-900 mt-1 font-mono">{foodCostPercent}%</h3>
            <span className="text-[11px] text-[#34C759] font-medium mt-1 block">استاندارد رستوران: ۲۸٪ الی ۳۵٪</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FF9500]/10 text-[#FF9500] flex items-center justify-center shrink-0">
            <Percent size={22} />
          </div>
        </div>

        {/* Net Profit Margin % */}
        <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-neutral-500 font-medium block">حاشیه سود خالص (Margin %)</span>
            <h3 className={`text-2xl font-black mt-1 font-mono ${Number(netProfitMargin) >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
              {netProfitMargin}%
            </h3>
            <span className="text-[11px] text-neutral-400 mt-1 block">از کل درآمد فروش</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#34C759]/10 text-[#34C759] flex items-center justify-center shrink-0">
            <TrendingUp size={22} />
          </div>
        </div>

        {/* Average Order Value */}
        <div className="bg-white p-5 rounded-2xl border border-black/[0.06] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-neutral-500 font-medium block">میانگین ارزش فاکتور (AOV)</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-1 font-mono">{formatCurrency(avgInvoiceValue)}</h3>
            <span className="text-[11px] text-neutral-400 mt-1 block">{totalInvoices} فاکتور صادرشده</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0">
            <BarChart3 size={22} />
          </div>
        </div>

        {/* Inventory Deficit Risk */}
        <div className={`p-5 rounded-2xl border shadow-sm flex items-center justify-between ${
          negativeStockCount > 0 ? 'bg-[#FF3B30]/[0.03] border-[#FF3B30]/30' : 'bg-white border-black/[0.06]'
        }`}>
          <div>
            <span className="text-xs font-semibold text-[#FF3B30] block">کسری‌های بحرانی انبار</span>
            <h3 className="text-xl font-bold text-[#FF3B30] mt-1 font-mono">{negativeStockCount} <span className="text-xs font-normal text-neutral-500">کالا</span></h3>
            <span className="text-[11px] text-neutral-500 mt-1 block">
              {negativeStockCount > 0 ? 'نیازمند فاکتور خرید فوری' : 'موجودی انبارها بدون کسری'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FF3B30]/10 text-[#FF3B30] flex items-center justify-center shrink-0">
            <AlertTriangle size={22} />
          </div>
        </div>

      </div>

      {/* Financial Structure Breakdown */}
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-6 space-y-6">
        <h3 className="font-bold text-base text-neutral-900 border-b border-black/[0.04] pb-3 flex items-center gap-2">
          <PieChart size={18} className="text-[#007AFF]" />
          <span>ساختار جریانات مالی و توزیع هزینه‌های مجموعه</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Detailed Financial Summary Rows */}
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-3 bg-neutral-50 rounded-2xl font-bold text-neutral-900">
              <span>۱. کل درآمد فروش (ناخالص):</span>
              <span className="font-mono text-sm text-[#007AFF]">{formatCurrency(grossRevenue)}</span>
            </div>

            <div className="flex justify-between items-center p-3 bg-neutral-50 rounded-2xl text-neutral-700">
              <span>۲. بهای مواد اولیه و خریدهای انبار (Food Cost):</span>
              <span className="font-mono text-sm font-bold text-[#FF9500]">- {formatCurrency(materialExpenses)}</span>
            </div>

            <div className="flex justify-between items-center p-3 bg-neutral-50 rounded-2xl text-neutral-700">
              <span>۳. حقوق، دستمزد و مزایای پرسنل:</span>
              <span className="font-mono text-sm font-bold text-[#5856D6]">- {formatCurrency(salariesTotal)}</span>
            </div>

            <div className="flex justify-between items-center p-3 bg-neutral-50 rounded-2xl text-neutral-700">
              <span>۴. هزینه‌های جاری، قبوض و اداری:</span>
              <span className="font-mono text-sm font-bold text-[#FF3B30]">- {formatCurrency(operatingExpenses)}</span>
            </div>

            <div className={`flex justify-between items-center p-4 rounded-2xl font-black text-sm ${
              netProfit >= 0 ? 'bg-[#34C759]/10 text-[#28a745] border border-[#34C759]/30' : 'bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/30'
            }`}>
              <span>= سود خالص قابل برداشت نهایی:</span>
              <span className="font-mono text-lg">{formatCurrency(netProfit)}</span>
            </div>
          </div>

          {/* Visual Percentage Distribution Progress Bars */}
          <div className="space-y-4 justify-center flex flex-col p-4 bg-neutral-50/70 rounded-2xl border border-black/[0.04]">
            <h4 className="text-xs font-bold text-neutral-800 mb-1">سهم هزینه‌ها از کل درآمد فروش:</h4>

            {/* Food Cost Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold text-neutral-700">
                <span>مواد اولیه (Food Cost):</span>
                <span className="font-mono text-[#FF9500]">{foodCostPercent}%</span>
              </div>
              <div className="w-full bg-black/[0.06] h-2.5 rounded-full overflow-hidden">
                <div className="bg-[#FF9500] h-full rounded-full transition-all" style={{ width: `${Math.min(Number(foodCostPercent), 100)}%` }} />
              </div>
            </div>

            {/* Salaries Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold text-neutral-700">
                <span>حقوق پرسنل:</span>
                <span className="font-mono text-[#5856D6]">
                  {grossRevenue > 0 ? ((salariesTotal / grossRevenue) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="w-full bg-black/[0.06] h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-[#5856D6] h-full rounded-full transition-all" 
                  style={{ width: `${Math.min(grossRevenue > 0 ? (salariesTotal / grossRevenue) * 100 : 0, 100)}%` }} 
                />
              </div>
            </div>

            {/* Operating Expenses Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold text-neutral-700">
                <span>هزینه‌های جاری:</span>
                <span className="font-mono text-[#FF3B30]">
                  {grossRevenue > 0 ? ((operatingExpenses / grossRevenue) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="w-full bg-black/[0.06] h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-[#FF3B30] h-full rounded-full transition-all" 
                  style={{ width: `${Math.min(grossRevenue > 0 ? (operatingExpenses / grossRevenue) * 100 : 0, 100)}%` }} 
                />
              </div>
            </div>

            {/* Net Profit Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1 font-bold text-neutral-900">
                <span>سود خالص نهایی:</span>
                <span className="font-mono text-[#34C759]">{netProfitMargin}%</span>
              </div>
              <div className="w-full bg-black/[0.06] h-3 rounded-full overflow-hidden">
                <div 
                  className="bg-[#34C759] h-full rounded-full transition-all" 
                  style={{ width: `${Math.max(Math.min(Number(netProfitMargin), 100), 0)}%` }} 
                />
              </div>
            </div>

          </div>

        </div>
      </div>

    </div>
  );
}
