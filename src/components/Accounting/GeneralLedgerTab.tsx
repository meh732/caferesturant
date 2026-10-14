import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ChartOfAccount } from '../../lib/db';
import { getGeneralLedger, exportFinancialStatementToExcel } from '../../lib/accountingJournalService';
import { formatCurrency } from '../../lib/utils';
import { format } from 'date-fns';
import { 
  FileSpreadsheet, Printer, Search, Calendar, BookOpen, 
  ArrowLeftRight, CheckCircle, Filter, Download, Building2
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

export default function GeneralLedgerTab() {
  const accounts = useLiveQuery(() => db.chartOfAccounts.toArray(), []) || [];
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  const [selectedAccountCode, setSelectedAccountCode] = useState<string>('1002');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [ledgerData, setLedgerData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Print ref
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `دفتر_کل_${selectedAccountCode}`
  });

  // Load ledger on account or date change
  useEffect(() => {
    if (!selectedAccountCode) return;
    const fetchLedger = async () => {
      setIsLoading(true);
      try {
        const data = await getGeneralLedger({
          accountCode: selectedAccountCode,
          fromDate: fromDate ? new Date(fromDate) : undefined,
          toDate: toDate ? new Date(toDate) : undefined
        });
        setLedgerData(data);
      } catch (err) {
        console.error('Failed to load ledger', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLedger();
  }, [selectedAccountCode, fromDate, toDate]);

  // Excel Export
  const handleExportExcel = () => {
    if (!ledgerData) return;
    const headers = ['ردیف', 'شماره سند', 'تاریخ', 'شرح آرتیکل', 'بدهکار (تومان)', 'بستانکار (تومان)', 'مانده سطر (تومان)', 'تشخیص', 'طرف تفصیلی'];
    const rows = (ledgerData.articles || []).map((art: any, idx: number) => [
      idx + 1,
      art.entryNumber,
      format(art.date, 'yyyy/MM/dd'),
      art.description,
      art.debit || 0,
      art.credit || 0,
      art.runningBalance || 0,
      art.status === 'debtor' ? 'بد' : art.status === 'creditor' ? 'بس' : 'تسویه',
      art.detailName || '-'
    ]);

    exportFinancialStatementToExcel({
      reportTitle: `دفتر کل / معین حساب: ${ledgerData.account?.name || selectedAccountCode} (کد ${selectedAccountCode})`,
      headers,
      rows,
      fileName: `دفتر_معین_${selectedAccountCode}`,
      sheetName: 'دفتر کل'
    });
  };

  const selectedAccount = accounts.find(a => a.code === selectedAccountCode);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-700 text-white flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <BookOpen size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">دفتر کل و دفتر معین حساب‌ها (General & Subsidiary Ledger)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              مشاهده ریز گردش عملیات، تاریخچه آرتیکل‌ها و مانده متوالی به تفکیک هر سرفصل مالی
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
            <span>چاپ رسمی دفتر</span>
          </button>
        </div>
      </div>

      {/* Account Selector and Date Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Account Selector */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <span className="text-xs font-bold text-slate-700 whitespace-nowrap">انتخاب سرفصل:</span>
          <select
            value={selectedAccountCode}
            onChange={e => setSelectedAccountCode(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all cursor-pointer"
          >
            {accounts.map(acc => (
              <option key={acc.code} value={acc.code}>
                {acc.code} - {acc.name} ({acc.level === 'group' ? 'گروه' : acc.level === 'ledger' ? 'کل' : acc.level === 'subsidiary' ? 'معین' : 'تفصیلی'})
              </option>
            ))}
          </select>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-slate-600">از تاریخ:</span>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs outline-none"
          />
          <span className="font-bold text-slate-600 mr-2">تا تاریخ:</span>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs outline-none"
          />
        </div>
      </div>

      {/* Printable Ledger Area */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden" ref={printRef}>
        {/* Printable Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800">
                کد حساب: {selectedAccountCode}
              </span>
              <h3 className="font-black text-base text-slate-900">
                {selectedAccount?.name || 'دفتر حساب'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              ماهیت حساب: {selectedAccount?.nature === 'debtor' ? 'بدهکار' : selectedAccount?.nature === 'creditor' ? 'بستانکار' : 'دوگانه'}
              {settings?.restaurantName && ` • مجموعه: ${settings.restaurantName}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 text-left">
              <div className="text-[10px] text-slate-400 font-bold">مانده نهایی حساب</div>
              <div className="font-mono text-sm font-black text-slate-900">
                {ledgerData ? formatCurrency(Math.abs(ledgerData.closingBalance)) : '۰'} تومان
                <span className={`text-[10px] mr-1.5 px-1.5 py-0.2 rounded font-bold ${
                  (ledgerData?.closingBalance || 0) > 0 ? 'bg-rose-100 text-rose-800' : (ledgerData?.closingBalance || 0) < 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {(ledgerData?.closingBalance || 0) > 0 ? 'بدهکار' : (ledgerData?.closingBalance || 0) < 0 ? 'بستانکار' : 'تسویه'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-3 text-center w-12 font-mono">ردیف</th>
                <th className="py-3.5 px-3 w-28 text-center font-mono">شماره سند</th>
                <th className="py-3.5 px-3 w-28 whitespace-nowrap">تاریخ سند</th>
                <th className="py-3.5 px-4 min-w-[240px]">شرح آرتیکل سند حسابداری</th>
                <th className="py-3.5 px-3 w-32 text-left font-mono">بدهکار (تومان)</th>
                <th className="py-3.5 px-3 w-32 text-left font-mono">بستانکار (تومان)</th>
                <th className="py-3.5 px-3 w-36 text-left font-mono">مانده متوالی (تومان)</th>
                <th className="py-3.5 px-3 text-center w-20">تشخیص</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {/* Opening Balance Row */}
              {ledgerData && ledgerData.openingBalance !== 0 && (
                <tr className="bg-amber-50/50 font-bold text-slate-800">
                  <td className="py-3 px-3 text-center text-slate-400 font-mono">-</td>
                  <td className="py-3 px-3 text-center font-mono text-slate-400">-</td>
                  <td className="py-3 px-3 text-slate-500 font-mono">-</td>
                  <td className="py-3 px-4 text-amber-900">
                    مانده منقول از قبل (پیش از بازه گزارش انتخابی)
                  </td>
                  <td className="py-3 px-3 text-left font-mono text-rose-700">
                    {ledgerData.openingBalance > 0 ? formatCurrency(ledgerData.openingBalance) : '۰'}
                  </td>
                  <td className="py-3 px-3 text-left font-mono text-emerald-700">
                    {ledgerData.openingBalance < 0 ? formatCurrency(Math.abs(ledgerData.openingBalance)) : '۰'}
                  </td>
                  <td className="py-3 px-3 text-left font-mono font-bold text-amber-800">
                    {formatCurrency(Math.abs(ledgerData.openingBalance))}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      ledgerData.openingBalance > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {ledgerData.openingBalance > 0 ? 'بد' : 'بس'}
                    </span>
                  </td>
                </tr>
              )}

              {/* Articles Rows */}
              {!ledgerData || ledgerData.articles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    هیچ گردشی برای این سرفصل در بازه زمانی انتخابی ثبت نشده است.
                  </td>
                </tr>
              ) : (
                ledgerData.articles.map((art: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">#{art.entryNumber}</td>
                    <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap" dir="ltr">
                      {format(art.date, 'yyyy/MM/dd')}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800 leading-relaxed">
                      <div>{art.description}</div>
                      {art.detailName && (
                        <div className="text-[10px] text-blue-600 font-normal">
                          طرف تفصیلی: {art.detailName}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-left font-mono font-bold text-rose-700">
                      {art.debit ? formatCurrency(art.debit) : '۰'}
                    </td>
                    <td className="py-3 px-3 text-left font-mono font-bold text-emerald-700">
                      {art.credit ? formatCurrency(art.credit) : '۰'}
                    </td>
                    <td className="py-3 px-3 text-left font-mono font-black text-slate-900">
                      {formatCurrency(art.runningBalance)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        art.status === 'debtor' ? 'bg-rose-100 text-rose-800' : art.status === 'creditor' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {art.status === 'debtor' ? 'بد' : art.status === 'creditor' ? 'بس' : 'تسویه'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {ledgerData && (
              <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={4} className="py-3.5 px-4 text-center font-black">
                    جمع گردش دوره و مانده نهایی:
                  </td>
                  <td className="py-3.5 px-3 text-left font-mono text-rose-800 text-sm">
                    {formatCurrency(ledgerData.totalPeriodDebit)}
                  </td>
                  <td className="py-3.5 px-3 text-left font-mono text-emerald-800 text-sm">
                    {formatCurrency(ledgerData.totalPeriodCredit)}
                  </td>
                  <td className="py-3.5 px-3 text-left font-mono text-slate-950 text-sm font-black">
                    {formatCurrency(Math.abs(ledgerData.closingBalance))}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      ledgerData.closingBalance > 0 ? 'bg-rose-100 text-rose-800' : ledgerData.closingBalance < 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {ledgerData.closingBalance > 0 ? 'بدهکار' : ledgerData.closingBalance < 0 ? 'بستانکار' : 'تسویه'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
