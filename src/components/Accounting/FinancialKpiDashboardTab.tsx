import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { 
  getBalanceSheet, getProfitAndLossStatement, getTrialBalance, 
  exportFinancialStatementToExcel 
} from '../../lib/accountingJournalService';
import { formatCurrency } from '../../lib/utils';
import { 
  TrendingUp, TrendingDown, DollarSign, Wallet, ArrowUpRight, ArrowDownRight, 
  Scale, FileSpreadsheet, Printer, Activity, CheckCircle2, AlertTriangle, 
  Calendar, Layers, ShieldCheck, PieChart, BarChart3, HelpCircle, ArrowRight
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

interface FinancialKpiDashboardTabProps {
  onNavigateToTab?: (tabKey: any) => void;
}

export default function FinancialKpiDashboardTab({ onNavigateToTab }: FinancialKpiDashboardTabProps) {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const bankAccounts = useLiveQuery(() => db.bankAccounts.toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.toArray()) || [];
  const cheques = useLiveQuery(() => db.cheques.toArray()) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const orders = useLiveQuery(() => db.orders.toArray()) || [];

  const [timeRange, setTimeRange] = useState<'month' | 'quarter' | 'year' | 'all'>('month');
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Print ref
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'داشبورد_مدیریتی_شاخص‌های_مالی_آرکا'
  });

  // Calculate dates based on range
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    const to = now;
    let from = new Date();

    if (timeRange === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeRange === 'quarter') {
      from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    } else if (timeRange === 'year') {
      from = new Date(now.getFullYear(), 0, 1);
    } else {
      from = new Date(2020, 0, 1);
    }
    return { fromDate: from, toDate: to };
  }, [timeRange]);

  // Fetch financial statements
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [bs, pl] = await Promise.all([
          getBalanceSheet(toDate),
          getProfitAndLossStatement({ fromDate, toDate })
        ]);
        if (isMounted) {
          setBalanceSheet(bs);
          setPnl(pl);
        }
      } catch (err) {
        console.error('Failed to load KPI metrics:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [fromDate, toDate]);

  // Derived financial KPIs
  const currentAssets = balanceSheet?.totalCurrentAssets || 0;
  const currentLiabilities = balanceSheet?.totalCurrentLiabilities || 0;
  const workingCapital = currentAssets - currentLiabilities;
  const currentRatio = currentLiabilities > 0 ? (currentAssets / currentLiabilities) : (currentAssets > 0 ? 99 : 1);

  const netRevenue = pnl?.netRevenue || 0;
  const cogs = pnl?.totalCogs || 0;
  const grossProfit = pnl?.grossProfit || 0;
  const totalExpenses = pnl?.totalOperatingExpenses || 0;
  const netProfit = pnl?.netProfit || 0;

  const grossMarginPercent = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 100) : 0;
  const netMarginPercent = netRevenue > 0 ? Math.round((netProfit / netRevenue) * 100) : 0;

  // Real-time cash & liquid assets
  const totalBankBalance = useMemo(() => {
    return bankAccounts.filter(b => b.isActive).reduce((s, b) => s + (b.balance || 0), 0);
  }, [bankAccounts]);

  const totalCashBalance = useMemo(() => {
    return cashBoxes.filter(c => c.isActive).reduce((s, c) => s + (c.balance || 0), 0);
  }, [cashBoxes]);

  const totalLiquidity = totalBankBalance + totalCashBalance;

  // Cheque stats
  const pendingReceivedCheques = useMemo(() => {
    return cheques.filter(c => c.type === 'received' && c.status === 'pending');
  }, [cheques]);

  const totalPendingReceivedCheques = pendingReceivedCheques.reduce((s, c) => s + c.amount, 0);

  const pendingPayableCheques = useMemo(() => {
    return cheques.filter(c => c.type === 'paid' && c.status === 'pending');
  }, [cheques]);

  const totalPendingPayableCheques = pendingPayableCheques.reduce((s, c) => s + c.amount, 0);

  // Expense distribution calculation
  const expenseCategories = useMemo(() => {
    if (!pnl) return [];
    const items = [
      { name: 'بهای تمام‌شده مواد اولیه (COGS)', amount: pnl.totalCogs || 0, color: 'bg-rose-500', barColor: '#f43f5e' },
      { name: 'حقوق و دستمزد پرسنل', amount: pnl.salariesExpense || 0, color: 'bg-indigo-500', barColor: '#6366f1' },
      { name: 'اجاره و نگهداری محل', amount: pnl.rentExpense || 0, color: 'bg-amber-500', barColor: '#f59e0b' },
      { name: 'قبوض و انرژی (آب، برق، گاز)', amount: pnl.utilitiesExpense || 0, color: 'bg-cyan-500', barColor: '#06b6d4' },
      { name: 'پیک و ارسال سفارشات', amount: pnl.deliveryExpense || 0, color: 'bg-emerald-500', barColor: '#10b981' },
      { name: 'تبلیغات و بازاریابی', amount: pnl.marketingExpense || 0, color: 'bg-purple-500', barColor: '#a855f7' },
      { name: 'سایر هزینه‌های جاری و مصرفی', amount: pnl.otherOperatingExpenses || 0, color: 'bg-slate-500', barColor: '#64748b' },
    ];
    const total = items.reduce((s, i) => s + i.amount, 0);
    return items.map(i => ({
      ...i,
      percent: total > 0 ? Math.round((i.amount / total) * 100) : 0
    })).filter(i => i.amount > 0);
  }, [pnl]);

  // Export Excel
  const handleExportExcel = () => {
    const headers = ['شاخص مالی / قلم گزارش', 'مقدار / مبلغ (تومان)', 'توضیحات و تحلیل'];
    const rows: (string | number)[][] = [
      ['سرمایه در گردش خالص (Working Capital)', workingCapital, currentAssets > currentLiabilities ? 'مثبت و متعادل' : 'هشدار کسری نقدینگی'],
      ['نسبت جاری (Current Ratio)', `${currentRatio.toFixed(2)}x`, currentRatio >= 1.5 ? 'عالی' : currentRatio >= 1 ? 'نرمال' : 'ریسک نقدینگی'],
      ['مجموع نقدینگی و مانده بانک‌ها و صندوق‌ها', totalLiquidity, `شامل ${bankAccounts.length} حساب بانکی و ${cashBoxes.length} صندوق`],
      ['اسناد دریافتنی (چک‌های در جریان وصول)', totalPendingReceivedCheques, `${pendingReceivedCheques.length} فقره چک دریافتی`],
      ['اسناد پرداختنی (چک‌های صادره سررسیدنشده)', totalPendingPayableCheques, `${pendingPayableCheques.length} فقره چک صادره`],
      ['فروش خالص دوره', netRevenue, 'درآمد حاصل از فروش کالا و خدمات'],
      ['بهای تمام شده کالای فروش رفته (COGS)', cogs, 'مصرف مواد اولیه و ضایعات'],
      ['سود ناخالص (Gross Profit)', grossProfit, `حاشیه سود ناخالص: ${grossMarginPercent}%`],
      ['جمع کل هزینه‌های عملیاتی', totalExpenses, 'هزینه‌های اداری، حقوق، اجاره و قبوض'],
      ['سود خالص دوره (Net Profit)', netProfit, `حاشیه سود خالص: ${netMarginPercent}%`]
    ];

    exportFinancialStatementToExcel({
      reportTitle: 'داشبورد شاخص‌های کلیدی مالی و سودآوری آرکا (Financial KPI Executive Summary)',
      headers,
      rows,
      fileName: 'شاخص‌های_مالی_و_سودآوری_آرکا',
      sheetName: 'خلاصه شاخص‌ها'
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">داشبورد شاخص‌های کلیدی مالی و سودآوری (Financial KPIs)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              نمای جامع و هوشمند سلامت اقتصادی، سرمایه در گردش، ساختار هزینه‌ها و بازدهی کسب‌وکار
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setTimeRange('month')}
              className={`px-3 py-1.5 rounded-lg transition-all ${timeRange === 'month' ? 'bg-white shadow-xs text-blue-600 font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              ماه جاری
            </button>
            <button
              onClick={() => setTimeRange('quarter')}
              className={`px-3 py-1.5 rounded-lg transition-all ${timeRange === 'quarter' ? 'bg-white shadow-xs text-blue-600 font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              ۳ ماهه
            </button>
            <button
              onClick={() => setTimeRange('year')}
              className={`px-3 py-1.5 rounded-lg transition-all ${timeRange === 'year' ? 'bg-white shadow-xs text-blue-600 font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              امسال
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${timeRange === 'all' ? 'bg-white shadow-xs text-blue-600 font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              کل دوره
            </button>
          </div>

          <button
            onClick={handleExportExcel}
            className="py-2.5 px-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-emerald-200"
          >
            <FileSpreadsheet size={15} />
            <span>خروجی اکسل</span>
          </button>

          <button
            onClick={() => handlePrint()}
            className="py-2.5 px-4 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <Printer size={15} />
            <span>چاپ رسمی A4</span>
          </button>
        </div>
      </div>

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Working Capital */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group hover:border-blue-400 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">سرمایه در گردش خالص</span>
            <div className={`p-2 rounded-xl ${workingCapital >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <Scale size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black ${workingCapital >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
              {formatCurrency(Math.abs(workingCapital))}
            </span>
            <span className="text-xs text-slate-400 font-medium">تومان</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
            <span>نسبت جاری: <strong className="text-slate-800">{currentRatio.toFixed(2)}x</strong></span>
            <span className={`px-2 py-0.5 rounded-full font-bold ${currentRatio >= 1.2 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {currentRatio >= 1.2 ? 'پایدار و مطمئن' : 'نیازمند نظارت'}
            </span>
          </div>
        </div>

        {/* 2. Total Liquidity */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group hover:border-emerald-400 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">نقدینگی زنده (بانک و صندوق)</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Wallet size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{formatCurrency(totalLiquidity)}</span>
            <span className="text-xs text-slate-400 font-medium">تومان</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
            <span>بانک: {formatCurrency(totalBankBalance)}</span>
            <span>صندوق: {formatCurrency(totalCashBalance)}</span>
          </div>
        </div>

        {/* 3. Net Sales */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group hover:border-indigo-400 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">فروش خالص و درآمد دوره</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{formatCurrency(netRevenue)}</span>
            <span className="text-xs text-slate-400 font-medium">تومان</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
            <span>سود ناخالص: {formatCurrency(grossProfit)}</span>
            <span className="font-bold text-indigo-600">{grossMarginPercent}% حاشیه</span>
          </div>
        </div>

        {/* 4. Net Profit */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group hover:border-emerald-400 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">سود (زیان) خالص دوره</span>
            <div className={`p-2 rounded-xl ${netProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <DollarSign size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatCurrency(Math.abs(netProfit))}
            </span>
            <span className="text-xs text-slate-400 font-medium">تومان</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
            <span>بازده خالص فروش:</span>
            <span className={`font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {netMarginPercent}% {netProfit >= 0 ? 'سود' : 'زیان'}
            </span>
          </div>
        </div>
      </div>

      {/* Cheques & Obligations Mini-Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Receivables & Inflow Cheques */}
        <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-200/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                📥
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-950">جریان ورودی آتی و چک‌های دریافتی</h4>
                <p className="text-[11px] text-emerald-700">اسناد دریافتنی در جریان وصول</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
              {pendingReceivedCheques.length} فقره چک
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-2 border-t border-emerald-200/60">
            <span className="text-xs text-emerald-800">مجموع ارزش وصولی:</span>
            <span className="text-xl font-black text-emerald-900">{formatCurrency(totalPendingReceivedCheques)} تومان</span>
          </div>
        </div>

        {/* Payables & Outflow Cheques */}
        <div className="bg-amber-50/50 rounded-2xl p-5 border border-amber-200/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-xs">
                📤
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-950">تعهدات آتی و چک‌های صادره</h4>
                <p className="text-[11px] text-amber-700">اسناد پرداختنی سررسیدنشده نزد تأمین‌کنندگان</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg">
              {pendingPayableCheques.length} فقره چک
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-2 border-t border-amber-200/60">
            <span className="text-xs text-amber-800">مجموع تعهدات پرداختی:</span>
            <span className="text-xl font-black text-amber-900">{formatCurrency(totalPendingPayableCheques)} تومان</span>
          </div>
        </div>
      </div>

      {/* Analytics & Cost Structure Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Structure Breakdown (2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <PieChart size={18} className="text-blue-600" />
                <span>آنالیز و سهم هزینه‌ها در دوره مالی</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تفکیک بهای تمام شده، حقوق پرسنل، اجاره و هزینه‌های جاری
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
              جمع هزینه‌ها: {formatCurrency(cogs + totalExpenses)} تومان
            </span>
          </div>

          {/* Progress Bars for Costs */}
          <div className="space-y-3.5 pt-2">
            {expenseCategories.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-700">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{formatCurrency(item.amount)} تومان</span>
                    <span className="text-[11px] text-slate-400 font-semibold w-8 text-left">({item.percent}%)</span>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${item.color} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.min(100, Math.max(3, item.percent))}%` }}
                  />
                </div>
              </div>
            ))}
            {expenseCategories.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">
                هنوز داده‌ای برای هزینه‌ها در این بازه ثبت نشده است.
              </div>
            )}
          </div>
        </div>

        {/* Quick Diagnostic Insights (1 Column) */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-md flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={20} className="text-emerald-400" />
              <h3 className="text-base font-bold text-white">تحلیل هوشمند سلامت مالی</h3>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="bg-white/10 p-3.5 rounded-2xl border border-white/10 space-y-1">
                <div className="flex items-center justify-between font-bold text-white">
                  <span>وضعیت نقدینگی:</span>
                  <span className={totalLiquidity > totalPendingPayableCheques ? 'text-emerald-400' : 'text-amber-400'}>
                    {totalLiquidity > totalPendingPayableCheques ? 'مطلوب و مازاد' : 'احتیاط و سررسید چک'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  موجودی نقد و بانک شما {totalLiquidity > totalPendingPayableCheques ? 'بیشتر از' : 'کمتر از'} تعهدات چک‌های صادره است.
                </p>
              </div>

              <div className="bg-white/10 p-3.5 rounded-2xl border border-white/10 space-y-1">
                <div className="flex items-center justify-between font-bold text-white">
                  <span>سرمایه در گردش:</span>
                  <span className={workingCapital >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {workingCapital >= 0 ? 'مثبت (+)' : 'منفی (-)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {workingCapital >= 0 
                    ? 'دارایی‌های جاری توانایی پوشش کامل بدهی‌های جاری را دارا هستند.'
                    : 'بدهی‌های جاری از دارایی‌ها بیشتر است؛ نیاز به برنامه‌ریزی وصول مطالبات.'}
                </p>
              </div>

              <div className="bg-white/10 p-3.5 rounded-2xl border border-white/10 space-y-1">
                <div className="flex items-center justify-between font-bold text-white">
                  <span>حاشیه سود خالص:</span>
                  <span className={netMarginPercent >= 20 ? 'text-emerald-400' : netMarginPercent >= 10 ? 'text-blue-400' : 'text-amber-400'}>
                    {netMarginPercent}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {netMarginPercent >= 20 
                    ? 'بازدهی عالی بر مبنای استانداردهای صنعت رستوران و خدمات.'
                    : 'بازدهی در حد متعارف، کنترل ضایعات و هزینه‌ها پیشنهاد می‌شود.'}
                </p>
              </div>
            </div>
          </div>

          {/* Action Links */}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            {onNavigateToTab && (
              <>
                <button
                  onClick={() => onNavigateToTab('financial_statements')}
                  className="w-full py-2.5 px-3 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer"
                >
                  <span>مشاهده ترازنامه و سود و زیان رسمی</span>
                  <ArrowRight size={14} className="rotate-180" />
                </button>
                <button
                  onClick={() => onNavigateToTab('journal_entries')}
                  className="w-full py-2.5 px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer"
                >
                  <span>دفتر روزنامه و اسناد دوبل</span>
                  <ArrowRight size={14} className="rotate-180" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hidden Printable Official KPI Report for PDF */}
      <div className="hidden">
        <div ref={printRef} className="p-8 max-w-4xl mx-auto font-sans bg-white text-slate-900" dir="rtl">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{settings?.restaurantName || 'مجموعه آرکا'}</h1>
              <h2 className="text-sm font-semibold text-slate-700 mt-1">گزارش مدیریتی شاخص‌های کلیدی مالی و سودآوری</h2>
            </div>
            <div className="text-left text-xs space-y-1">
              <div>تاریخ گزارش: {new Date().toLocaleDateString('fa-IR')}</div>
              <div>دوره انتخابی: {timeRange === 'month' ? 'ماه جاری' : timeRange === 'quarter' ? '۳ ماهه' : 'سالانه'}</div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full border-collapse border border-slate-300 text-xs mb-8">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-right">عنوان شاخص مالی</th>
                <th className="border border-slate-300 p-2 text-left">مقدار (تومان)</th>
                <th className="border border-slate-300 p-2 text-right">وضعیت و نسبت</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-2">سرمایه در گردش خالص</td>
                <td className="border border-slate-300 p-2 font-bold text-left">{formatCurrency(workingCapital)}</td>
                <td className="border border-slate-300 p-2">نسبت جاری: {currentRatio.toFixed(2)}x</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-2">نقدینگی زنده (بانک و صندوق)</td>
                <td className="border border-slate-300 p-2 font-bold text-left">{formatCurrency(totalLiquidity)}</td>
                <td className="border border-slate-300 p-2">بانک: {formatCurrency(totalBankBalance)} | صندوق: {formatCurrency(totalCashBalance)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-2">فروش خالص و درآمد دوره</td>
                <td className="border border-slate-300 p-2 font-bold text-left">{formatCurrency(netRevenue)}</td>
                <td className="border border-slate-300 p-2">سود ناخالص: {formatCurrency(grossProfit)} ({grossMarginPercent}%)</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-2">سود خالص دوره مالی</td>
                <td className="border border-slate-300 p-2 font-bold text-left">{formatCurrency(netProfit)}</td>
                <td className="border border-slate-300 p-2">حاشیه سود خالص: {netMarginPercent}%</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-2">اسناد دریافتنی (چک‌های در جریان وصول)</td>
                <td className="border border-slate-300 p-2 font-bold text-left">{formatCurrency(totalPendingReceivedCheques)}</td>
                <td className="border border-slate-300 p-2">{pendingReceivedCheques.length} فقره چک</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-2">اسناد پرداختنی (چک‌های صادره)</td>
                <td className="border border-slate-300 p-2 font-bold text-left">{formatCurrency(totalPendingPayableCheques)}</td>
                <td className="border border-slate-300 p-2">{pendingPayableCheques.length} فقره چک</td>
              </tr>
            </tbody>
          </table>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs">
            <div className="border-t border-slate-400 pt-2 font-semibold">تهیه‌کننده / حسابدار</div>
            <div className="border-t border-slate-400 pt-2 font-semibold">مدیر مالی</div>
            <div className="border-t border-slate-400 pt-2 font-semibold">مدیرعامل / صاحب امتیاز</div>
          </div>
        </div>
      </div>
    </div>
  );
}
