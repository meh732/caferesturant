import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { 
  getTrialBalance, getBalanceSheet, getProfitAndLossStatement, 
  exportFinancialStatementToExcel, TrialBalanceRow 
} from '../../lib/accountingJournalService';
import { formatCurrency } from '../../lib/utils';
import { 
  FileSpreadsheet, Printer, Scale, TrendingUp, PieChart, 
  Calendar, CheckCircle, AlertTriangle, Layers, Building2, Download
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

type StatementType = 'balance_sheet' | 'trial_balance' | 'profit_loss';

export default function FinancialStatementsTab() {
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  const [activeStatement, setActiveStatement] = useState<StatementType>('balance_sheet');
  const [trialColumnCount, setTrialColumnCount] = useState<4 | 6>(4);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const [balanceSheetData, setBalanceSheetData] = useState<any>(null);
  const [trialBalanceData, setTrialBalanceData] = useState<any>(null);
  const [profitAndLossData, setProfitAndLossData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Print ref
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `گزارش_مالی_${activeStatement}`
  });

  // Fetch statement data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const fromD = fromDate ? new Date(fromDate) : undefined;
        const toD = toDate ? new Date(toDate) : undefined;

        if (activeStatement === 'balance_sheet') {
          const bs = await getBalanceSheet(toD);
          setBalanceSheetData(bs);
        } else if (activeStatement === 'trial_balance') {
          const tb = await getTrialBalance({ fromDate: fromD, toDate: toD, level: 'subsidiary' });
          setTrialBalanceData(tb);
        } else if (activeStatement === 'profit_loss') {
          const pl = await getProfitAndLossStatement({ fromDate: fromD, toDate: toD });
          setProfitAndLossData(pl);
        }
      } catch (err) {
        console.error('Failed to load financial statement:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeStatement, fromDate, toDate, trialColumnCount]);

  // Excel Export
  const handleExportExcel = () => {
    if (activeStatement === 'balance_sheet' && balanceSheetData) {
      const headers = ['بخش', 'کد حساب', 'عنوان حساب', 'مبلغ (تومان)'];
      const rows: (string | number)[][] = [];

      rows.push(['--- دارایی‌های جاری ---', '', '', '']);
      balanceSheetData.currentAssets.forEach((a: any) => rows.push(['دارایی جاری', a.code, a.name, a.amount]));
      rows.push(['جمع دارایی‌های جاری', '', '', balanceSheetData.totalCurrentAssets]);

      rows.push(['--- دارایی‌های غیرجاری ---', '', '', '']);
      balanceSheetData.nonCurrentAssets.forEach((a: any) => rows.push(['دارایی غیرجاری', a.code, a.name, a.amount]));
      rows.push(['جمع دارایی‌های غیرجاری', '', '', balanceSheetData.totalNonCurrentAssets]);
      rows.push(['مجموع کل دارایی‌ها', '', '', balanceSheetData.totalAssets]);

      rows.push(['--- بدهی‌های جاری ---', '', '', '']);
      balanceSheetData.currentLiabilities.forEach((a: any) => rows.push(['بدهی جاری', a.code, a.name, a.amount]));
      rows.push(['جمع بدهی‌های جاری', '', '', balanceSheetData.totalCurrentLiabilities]);

      rows.push(['--- حقوق صاحبان سهام و سرمایه ---', '', '', '']);
      balanceSheetData.equityItems.forEach((a: any) => rows.push(['سرمایه', a.code, a.name, a.amount]));
      rows.push(['سود (زیان) جاری دوره مالی', '', '', balanceSheetData.currentPeriodProfit]);
      rows.push(['جمع حقوق صاحبان سهام', '', '', balanceSheetData.totalEquity]);
      rows.push(['مجموع کل بدهی‌ها و سرمایه', '', '', balanceSheetData.totalLiabilitiesAndEquity]);

      exportFinancialStatementToExcel({
        reportTitle: 'ترازنامه مالی استاندارد (Balance Sheet)',
        headers,
        rows,
        fileName: 'ترازنامه_مالی_آرکا',
        sheetName: 'ترازنامه'
      });
    } else if (activeStatement === 'trial_balance' && trialBalanceData) {
      const headers = trialColumnCount === 6
        ? ['کد حساب', 'عنوان حساب', 'گردش بدهکار ابتدای دوره', 'گردش بستانکار ابتدای دوره', 'گردش بدهکار دوره', 'گردش بستانکار دوره', 'مانده بدهکار پایان دوره', 'مانده بستانکار پایان دوره']
        : ['کد حساب', 'عنوان حساب', 'گردش بدهکار دوره', 'گردش بستانکار دوره', 'مانده بدهکار پایان دوره', 'مانده بستانکار پایان دوره'];

      const rows = (trialBalanceData.rows || []).map((r: TrialBalanceRow) => {
        if (trialColumnCount === 6) {
          return [r.code, r.name, r.openingDebit, r.openingCredit, r.periodDebit, r.periodCredit, r.closingDebit, r.closingCredit];
        }
        return [r.code, r.name, r.periodDebit, r.periodCredit, r.closingDebit, r.closingCredit];
      });

      exportFinancialStatementToExcel({
        reportTitle: `تراز آزمایشی ${trialColumnCount} ستونی حساب‌ها`,
        headers,
        rows,
        fileName: `تراز_آزمایشی_${trialColumnCount}_ستونی`,
        sheetName: 'تراز آزمایشی'
      });
    } else if (activeStatement === 'profit_loss' && profitAndLossData) {
      const headers = ['شرح سرفصل مالی', 'مبلغ جزء (تومان)', 'مبلغ کل (تومان)'];
      const rows: (string | number)[][] = [
        ['فروش ناخالص غذا و سفارشات', profitAndLossData.grossSales, ''],
        ['کسر می‌شود: تخفیفات اعطایی به مشتریان', `(${profitAndLossData.salesDiscounts})`, ''],
        ['فروش خالص و درآمد عملیاتی', '', profitAndLossData.netRevenue],
        ['کسر می‌شود: بهای تمام‌شده کالای فروش‌رفته (COGS)', `(${profitAndLossData.totalCogs})`, ''],
        ['سود ناخالص (Gross Profit)', '', profitAndLossData.grossProfit],
        ['هزینه‌های حقوق و دستمزد', profitAndLossData.salariesExpense, ''],
        ['هزینه‌های اجاره محل کسب', profitAndLossData.rentExpense, ''],
        ['هزینه‌های انرژی و قبوض', profitAndLossData.utilitiesExpense, ''],
        ['هزینه‌های تبلیغات و بازاریابی', profitAndLossData.marketingExpense, ''],
        ['هزینه‌های حمل و ارسال پیک', profitAndLossData.deliveryExpense, ''],
        ['سایر هزینه‌های عمومی و اداری', profitAndLossData.otherOperatingExpenses, ''],
        ['جمع کل هزینه‌های عملیاتی', '', `(${profitAndLossData.totalOperatingExpenses})`],
        ['سود (زیان) عملیاتی', '', profitAndLossData.operatingProfit],
        ['درآمدهای غیرعملیاتی (سود بانکی و سرمایه‌گذاری)', profitAndLossData.nonOperatingIncome, ''],
        ['هزینه‌های غیرعملیاتی (کارمزد بانکی)', `(${profitAndLossData.nonOperatingExpenses})`, ''],
        ['سود (زیان) خالص دوره مالی (Net Profit)', '', profitAndLossData.netProfit],
      ];

      exportFinancialStatementToExcel({
        reportTitle: 'صورت سود و زیان جامع (Income Statement)',
        headers,
        rows,
        fileName: 'صورت_سود_و_زیان_آرکا',
        sheetName: 'سود و زیان'
      });
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Scale size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">صورت‌های مالی اساسی و ترازنامه‌ها (Financial Statements)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ترازنامه دوطرفه، تراز آزمایشی ۴ و ۶ ستونی، و صورت سود و زیان جامع بر اساس استانداردهای حسابداری
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Statement Selection Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Toggle between Balance Sheet, Trial Balance, Profit & Loss */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
          <button
            onClick={() => setActiveStatement('balance_sheet')}
            className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeStatement === 'balance_sheet' ? 'bg-white text-emerald-700 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <Scale size={14} />
            <span>ترازنامه مالی (Balance Sheet)</span>
          </button>

          <button
            onClick={() => setActiveStatement('trial_balance')}
            className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeStatement === 'trial_balance' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <Layers size={14} />
            <span>تراز آزمایشی (Trial Balance)</span>
          </button>

          <button
            onClick={() => setActiveStatement('profit_loss')}
            className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeStatement === 'profit_loss' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <TrendingUp size={14} />
            <span>صورت سود و زیان (P&L)</span>
          </button>
        </div>

        {/* Column count toggle for Trial balance */}
        {activeStatement === 'trial_balance' && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
            <button
              onClick={() => setTrialColumnCount(4)}
              className={`py-1.5 px-2.5 rounded-lg transition-all cursor-pointer ${
                trialColumnCount === 4 ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
              }`}
            >
              تراز ۴ ستونی
            </button>
            <button
              onClick={() => setTrialColumnCount(6)}
              className={`py-1.5 px-2.5 rounded-lg transition-all cursor-pointer ${
                trialColumnCount === 6 ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
              }`}
            >
              تراز ۶ ستونی (با ابتدای دوره)
            </button>
          </div>
        )}

        {/* Date Filter */}
        <div className="flex items-center gap-2 text-xs">
          {activeStatement !== 'balance_sheet' && (
            <>
              <span className="font-bold text-slate-600">از تاریخ:</span>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs outline-none"
              />
            </>
          )}
          <span className="font-bold text-slate-600">
            {activeStatement === 'balance_sheet' ? 'تا تاریخ (تراز در تاریخ):' : 'تا تاریخ:'}
          </span>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs outline-none"
          />
        </div>
      </div>

      {/* ===================== PRINTABLE REPORT CANVAS ===================== */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden" ref={printRef}>
        {/* Printable Official Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-lg font-black text-slate-900">
              {settings?.restaurantName || 'سامانه حسابداری آرکا'}
            </h1>
            <p className="text-xs text-slate-600 mt-1 font-bold">
              {activeStatement === 'balance_sheet' ? 'ترازنامه مالی پایان دوره (Balance Sheet)' :
               activeStatement === 'trial_balance' ? `تراز آزمایشی ${trialColumnCount} ستونی حساب‌ها (Trial Balance)` :
               'صورت سود و زیان تفصیلی (Income Statement)'}
            </p>
          </div>

          <div className="text-left text-xs font-mono text-slate-600 space-y-1">
            <div>تاریخ گزارش: <strong className="text-slate-900">{new Date().toLocaleDateString('fa-IR')}</strong></div>
            <div>واحد پول: <strong className="text-slate-900">تومان</strong></div>
          </div>
        </div>

        {/* ---------------- 1. BALANCE SHEET VIEW ---------------- */}
        {activeStatement === 'balance_sheet' && balanceSheetData && (
          <div className="p-6 space-y-6">
            {/* Balance verification banner */}
            <div className={`p-4 rounded-2xl flex items-center justify-between border ${
              balanceSheetData.isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <div className="flex items-center gap-2">
                {balanceSheetData.isBalanced ? (
                  <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                )}
                <span className="font-bold text-xs">
                  {balanceSheetData.isBalanced 
                    ? 'ترازنامه کاملاً متعادل است: مجموع دارایی‌ها برابر است با مجموع بدهی‌ها و حقوق صاحبان سهام.'
                    : 'اختلاف در موازنه ترازنامه وجود دارد!'}
                </span>
              </div>
              <div className="font-mono text-xs font-black">
                {formatCurrency(balanceSheetData.totalAssets)} تومان
              </div>
            </div>

            {/* Classic 2-Column Balance Sheet */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Right Column: Assets (دارایی‌ها) */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-100 p-3 text-xs font-black text-slate-800 border-b border-slate-200 flex justify-between">
                  <span>دارایی‌ها (ASSETS)</span>
                  <span>مبلغ (تومان)</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {/* Current Assets Header */}
                  <div className="bg-slate-50/80 p-2.5 font-bold text-slate-700">
                    ۱. دارایی‌های جاری:
                  </div>
                  {balanceSheetData.currentAssets.map((acc: any) => (
                    <div key={acc.code} className="p-2.5 flex justify-between pr-6 hover:bg-slate-50">
                      <span className="text-slate-700">{acc.name}</span>
                      <span className="font-mono font-bold text-slate-900">{formatCurrency(acc.amount)}</span>
                    </div>
                  ))}
                  <div className="p-2.5 bg-slate-50 font-bold text-slate-800 flex justify-between pr-4">
                    <span>جمع دارایی‌های جاری:</span>
                    <span className="font-mono text-blue-700">{formatCurrency(balanceSheetData.totalCurrentAssets)}</span>
                  </div>

                  {/* Non-Current Assets Header */}
                  <div className="bg-slate-50/80 p-2.5 font-bold text-slate-700">
                    ۲. دارایی‌های غیرجاری (ثابت):
                  </div>
                  {balanceSheetData.nonCurrentAssets.length === 0 ? (
                    <div className="p-2.5 text-slate-400 pr-6">موردی ثبت نشده است.</div>
                  ) : (
                    balanceSheetData.nonCurrentAssets.map((acc: any) => (
                      <div key={acc.code} className="p-2.5 flex justify-between pr-6 hover:bg-slate-50">
                        <span className="text-slate-700">{acc.name}</span>
                        <span className="font-mono font-bold text-slate-900">{formatCurrency(acc.amount)}</span>
                      </div>
                    ))
                  )}
                  <div className="p-2.5 bg-slate-50 font-bold text-slate-800 flex justify-between pr-4">
                    <span>جمع دارایی‌های غیرجاری:</span>
                    <span className="font-mono text-blue-700">{formatCurrency(balanceSheetData.totalNonCurrentAssets)}</span>
                  </div>
                </div>

                {/* Total Assets Footer */}
                <div className="bg-slate-900 text-white p-3 text-xs font-black flex justify-between border-t border-slate-300">
                  <span>مجموع کل دارایی‌ها:</span>
                  <span className="font-mono text-sm">{formatCurrency(balanceSheetData.totalAssets)} تومان</span>
                </div>
              </div>

              {/* Left Column: Liabilities & Equity (بدهی‌ها و حقوق صاحبان سهام) */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-100 p-3 text-xs font-black text-slate-800 border-b border-slate-200 flex justify-between">
                  <span>بدهی‌ها و سرمایه (LIABILITIES & EQUITY)</span>
                  <span>مبلغ (تومان)</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {/* Liabilities Header */}
                  <div className="bg-slate-50/80 p-2.5 font-bold text-slate-700">
                    ۱. بدهی‌های جاری:
                  </div>
                  {balanceSheetData.currentLiabilities.map((acc: any) => (
                    <div key={acc.code} className="p-2.5 flex justify-between pr-6 hover:bg-slate-50">
                      <span className="text-slate-700">{acc.name}</span>
                      <span className="font-mono font-bold text-slate-900">{formatCurrency(acc.amount)}</span>
                    </div>
                  ))}
                  <div className="p-2.5 bg-slate-50 font-bold text-slate-800 flex justify-between pr-4">
                    <span>جمع بدهی‌های جاری:</span>
                    <span className="font-mono text-rose-700">{formatCurrency(balanceSheetData.totalCurrentLiabilities)}</span>
                  </div>

                  {/* Equity Header */}
                  <div className="bg-slate-50/80 p-2.5 font-bold text-slate-700">
                    ۲. حقوق صاحبان سهام و سرمایه:
                  </div>
                  {balanceSheetData.equityItems.map((acc: any) => (
                    <div key={acc.code} className="p-2.5 flex justify-between pr-6 hover:bg-slate-50">
                      <span className="text-slate-700">{acc.name}</span>
                      <span className="font-mono font-bold text-slate-900">{formatCurrency(acc.amount)}</span>
                    </div>
                  ))}
                  <div className="p-2.5 flex justify-between pr-6 hover:bg-slate-50 bg-emerald-50/40">
                    <span className="text-slate-800 font-bold">سود (زیان) خالص دوره مالی:</span>
                    <span className={`font-mono font-black ${
                      balanceSheetData.currentPeriodProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {formatCurrency(balanceSheetData.currentPeriodProfit)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 font-bold text-slate-800 flex justify-between pr-4">
                    <span>جمع حقوق صاحبان سهام:</span>
                    <span className="font-mono text-emerald-700">{formatCurrency(balanceSheetData.totalEquity)}</span>
                  </div>
                </div>

                {/* Total Liabilities & Equity Footer */}
                <div className="bg-slate-900 text-white p-3 text-xs font-black flex justify-between border-t border-slate-300">
                  <span>مجموع کل بدهی‌ها و سرمایه:</span>
                  <span className="font-mono text-sm">{formatCurrency(balanceSheetData.totalLiabilitiesAndEquity)} تومان</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- 2. TRIAL BALANCE VIEW ---------------- */}
        {activeStatement === 'trial_balance' && trialBalanceData && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 w-24 font-mono">کد حساب</th>
                  <th className="py-3 px-4 min-w-[200px]">عنوان سرفصل حسابداری</th>
                  {trialColumnCount === 6 && (
                    <>
                      <th className="py-3 px-3 w-32 text-left font-mono">گردش بدهکار ابتدا</th>
                      <th className="py-3 px-3 w-32 text-left font-mono">گردش بستانکار ابتدا</th>
                    </>
                  )}
                  <th className="py-3 px-3 w-32 text-left font-mono">گردش بدهکار دوره</th>
                  <th className="py-3 px-3 w-32 text-left font-mono">گردش بستانکار دوره</th>
                  <th className="py-3 px-3 w-32 text-left font-mono">مانده بدهکار پایان</th>
                  <th className="py-3 px-3 w-32 text-left font-mono">مانده بستانکار پایان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {trialBalanceData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={trialColumnCount === 6 ? 8 : 6} className="py-12 text-center text-slate-400">
                      هیچ گردشی برای تراز آزمایشی در این بازه یافت نشد.
                    </td>
                  </tr>
                ) : (
                  trialBalanceData.rows.map((r: TrialBalanceRow) => (
                    <tr key={r.code} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{r.code}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">{r.name}</td>
                      {trialColumnCount === 6 && (
                        <>
                          <td className="py-2.5 px-3 text-left font-mono text-slate-600">{r.openingDebit ? formatCurrency(r.openingDebit) : '۰'}</td>
                          <td className="py-2.5 px-3 text-left font-mono text-slate-600">{r.openingCredit ? formatCurrency(r.openingCredit) : '۰'}</td>
                        </>
                      )}
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-rose-700">{r.periodDebit ? formatCurrency(r.periodDebit) : '۰'}</td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700">{r.periodCredit ? formatCurrency(r.periodCredit) : '۰'}</td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-rose-800">{r.closingDebit ? formatCurrency(r.closingDebit) : '۰'}</td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-800">{r.closingCredit ? formatCurrency(r.closingCredit) : '۰'}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={2} className="py-3 px-4 text-center">جمع کل تراز آزمایشی:</td>
                  {trialColumnCount === 6 && (
                    <>
                      <td className="py-3 px-3 text-left font-mono">{formatCurrency(trialBalanceData.totalOpeningDebit)}</td>
                      <td className="py-3 px-3 text-left font-mono">{formatCurrency(trialBalanceData.totalOpeningCredit)}</td>
                    </>
                  )}
                  <td className="py-3 px-3 text-left font-mono text-rose-800">{formatCurrency(trialBalanceData.totalPeriodDebit)}</td>
                  <td className="py-3 px-3 text-left font-mono text-emerald-800">{formatCurrency(trialBalanceData.totalPeriodCredit)}</td>
                  <td className="py-3 px-3 text-left font-mono text-rose-900">{formatCurrency(trialBalanceData.totalClosingDebit)}</td>
                  <td className="py-3 px-3 text-left font-mono text-emerald-900">{formatCurrency(trialBalanceData.totalClosingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ---------------- 3. PROFIT & LOSS VIEW ---------------- */}
        {activeStatement === 'profit_loss' && profitAndLossData && (
          <div className="p-6 max-w-3xl mx-auto space-y-4">
            <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">
              {/* Sales Revenue Section */}
              <div className="bg-slate-50 p-3 font-bold text-slate-800 flex justify-between">
                <span>۱. درآمدهای عملیاتی و فروش</span>
                <span>مبلغ (تومان)</span>
              </div>
              <div className="p-3 flex justify-between pr-6">
                <span className="text-slate-700">فروش ناخالص غذا و سفارشات:</span>
                <span className="font-mono font-bold text-slate-900">{formatCurrency(profitAndLossData.grossSales)}</span>
              </div>
              <div className="p-3 flex justify-between pr-6 text-rose-600">
                <span>کسر می‌شود: تخفیفات اعطایی به مشتریان:</span>
                <span className="font-mono font-bold">({formatCurrency(profitAndLossData.salesDiscounts)})</span>
              </div>
              <div className="p-3 bg-slate-50 font-bold text-slate-900 flex justify-between pr-4">
                <span>فروش خالص:</span>
                <span className="font-mono text-blue-700">{formatCurrency(profitAndLossData.netRevenue)}</span>
              </div>

              {/* COGS Section */}
              <div className="bg-slate-50 p-3 font-bold text-slate-800 flex justify-between">
                <span>۲. بهای تمام‌شده کالای فروش‌رفته (COGS)</span>
                <span></span>
              </div>
              <div className="p-3 flex justify-between pr-6">
                <span className="text-slate-700">مصرف مواد اولیه در تولید غذا:</span>
                <span className="font-mono text-slate-800">{formatCurrency(profitAndLossData.cogsDirectMaterials)}</span>
              </div>
              <div className="p-3 flex justify-between pr-6">
                <span className="text-slate-700">افت و ضایعات مواد غذایی:</span>
                <span className="font-mono text-slate-800">{formatCurrency(profitAndLossData.cogsWastage)}</span>
              </div>
              <div className="p-3 bg-slate-50 font-bold text-slate-900 flex justify-between pr-4">
                <span>جمع بهای تمام‌شده کالای فروش‌رفته:</span>
                <span className="font-mono text-rose-700">({formatCurrency(profitAndLossData.totalCogs)})</span>
              </div>

              {/* Gross Profit Highlight */}
              <div className="bg-blue-50/70 p-3.5 font-black text-blue-900 flex justify-between text-sm">
                <span>سود ناخالص (حاشیه سود ناخالص: {profitAndLossData.grossMarginPercent.toFixed(1)}٪):</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.grossProfit)} تومان</span>
              </div>

              {/* Operating Expenses Section */}
              <div className="bg-slate-50 p-3 font-bold text-slate-800 flex justify-between">
                <span>۳. هزینه‌های عمومی، اداری و تشکیلاتی (OpEx)</span>
                <span></span>
              </div>
              <div className="p-2.5 flex justify-between pr-6">
                <span className="text-slate-700">حقوق و دستمزد پرسنل:</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.salariesExpense)}</span>
              </div>
              <div className="p-2.5 flex justify-between pr-6">
                <span className="text-slate-700">اجاره محل کسب:</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.rentExpense)}</span>
              </div>
              <div className="p-2.5 flex justify-between pr-6">
                <span className="text-slate-700">قبوض آب، برق، گاز و اینترنت:</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.utilitiesExpense)}</span>
              </div>
              <div className="p-2.5 flex justify-between pr-6">
                <span className="text-slate-700">تبلیغات و بازاریابی:</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.marketingExpense)}</span>
              </div>
              <div className="p-2.5 flex justify-between pr-6">
                <span className="text-slate-700">کرایه حمل و پیک:</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.deliveryExpense)}</span>
              </div>
              <div className="p-2.5 flex justify-between pr-6">
                <span className="text-slate-700">سایر هزینه‌های جاری:</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.otherOperatingExpenses)}</span>
              </div>
              <div className="p-3 bg-slate-50 font-bold text-slate-900 flex justify-between pr-4">
                <span>جمع هزینه‌های عملیاتی:</span>
                <span className="font-mono text-rose-700">({formatCurrency(profitAndLossData.totalOperatingExpenses)})</span>
              </div>

              {/* Operating Profit */}
              <div className="bg-indigo-50/70 p-3 font-bold text-indigo-900 flex justify-between">
                <span>سود عملیاتی (Operating Profit):</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.operatingProfit)}</span>
              </div>

              {/* Non-Operating Section */}
              <div className="p-2.5 flex justify-between pr-6">
                <span className="text-slate-700">خالص درآمدها و هزینه‌های غیرعملیاتی (بانکی):</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.netNonOperating)}</span>
              </div>

              {/* Net Profit Grand Total */}
              <div className="bg-emerald-600 text-white p-4 font-black flex justify-between text-base">
                <span>سود (زیان) خالص دوره مالی (Net Profit):</span>
                <span className="font-mono">{formatCurrency(profitAndLossData.netProfit)} تومان</span>
              </div>
            </div>
          </div>
        )}

        {/* Official Signatures for A4 Print */}
        <div className="p-6 grid grid-cols-3 gap-6 text-center text-xs font-bold text-slate-700 border-t border-slate-200 mt-4 bg-slate-50/30">
          <div className="border border-slate-200 rounded-xl p-3 h-20 flex flex-col justify-between bg-white">
            <span>تهیه‌کننده: امور حسابداری</span>
            <span className="text-[10px] text-slate-400">امضا و تاریخ</span>
          </div>
          <div className="border border-slate-200 rounded-xl p-3 h-20 flex flex-col justify-between bg-white">
            <span>مدیر امور مالی و بودجه</span>
            <span className="text-[10px] text-slate-400">امضا و تاریخ</span>
          </div>
          <div className="border border-slate-200 rounded-xl p-3 h-20 flex flex-col justify-between bg-white">
            <span>مدیریت ارشد مجموعه</span>
            <span className="text-[10px] text-slate-400">امضا و مهر رسمی</span>
          </div>
        </div>
      </div>
    </div>
  );
}
