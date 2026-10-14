import React, { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, JournalEntry, JournalEntryLine, ChartOfAccount } from '../../lib/db';
import { 
  createManualJournalEntry, deleteJournalEntry, syncHistoricalJournalEntries, 
  validateJournalLines, exportFinancialStatementToExcel 
} from '../../lib/accountingJournalService';
import { formatCurrency } from '../../lib/utils';
import { format } from 'date-fns';
import { 
  BookOpen, Plus, Search, Trash2, Printer, FileSpreadsheet, 
  CheckCircle, AlertTriangle, X, RefreshCw, Eye, ShieldCheck, 
  Calendar, Layers, FileText
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

export default function JournalEntriesTab() {
  const entries = useLiveQuery(() => db.journalEntries.orderBy('entryNumber').reverse().toArray(), []) || [];
  const accounts = useLiveQuery(() => db.chartOfAccounts.toArray(), []) || [];
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntryForView, setSelectedEntryForView] = useState<JournalEntry | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // New Journal Entry Modal State
  const [isNewEntryModalOpen, setIsNewEntryModalOpen] = useState(false);
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [entryDescription, setEntryDescription] = useState('');
  const [entryLines, setEntryLines] = useState<JournalEntryLine[]>([
    { id: '1', accountCode: '', accountName: '', debit: 0, credit: 0, description: '' },
    { id: '2', accountCode: '', accountName: '', debit: 0, credit: 0, description: '' },
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Print voucher ref
  const voucherPrintRef = useRef<HTMLDivElement>(null);
  const handlePrintVoucher = useReactToPrint({
    contentRef: voucherPrintRef,
    documentTitle: `سند_حسابداری_${selectedEntryForView?.entryNumber || 'سند'}`
  });

  // Calculate live totals for new entry modal
  const modalTotalDebit = useMemo(() => {
    return entryLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  }, [entryLines]);

  const modalTotalCredit = useMemo(() => {
    return entryLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  }, [entryLines]);

  const modalDifference = Math.round(modalTotalDebit - modalTotalCredit);
  const isModalBalanced = Math.abs(modalDifference) === 0 && modalTotalDebit > 0;

  // Add line to new entry
  const handleAddLine = () => {
    setEntryLines(prev => [
      ...prev,
      { id: String(Date.now()), accountCode: '', accountName: '', debit: 0, credit: 0, description: '' }
    ]);
  };

  // Remove line from new entry
  const handleRemoveLine = (idx: number) => {
    if (entryLines.length <= 2) {
      alert('سند حسابداری باید حداقل دارای ۲ آرتیکل باشد.');
      return;
    }
    setEntryLines(prev => prev.filter((_, i) => i !== idx));
  };

  // Update line field
  const handleLineChange = (idx: number, field: keyof JournalEntryLine, val: any) => {
    setEntryLines(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };

      // If user selected accountCode, auto-populate accountName
      if (field === 'accountCode') {
        const found = accounts.find(a => a.code === val);
        if (found) {
          copy[idx].accountName = found.name;
        }
      }
      return copy;
    });
  };

  // Open New Entry modal
  const handleOpenNewEntryModal = () => {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setEntryDescription('');
    setEntryLines([
      { id: '1', accountCode: '', accountName: '', debit: 0, credit: 0, description: '' },
      { id: '2', accountCode: '', accountName: '', debit: 0, credit: 0, description: '' },
    ]);
    setFormError(null);
    setIsNewEntryModalOpen(true);
  };

  // Submit New Entry
  const handleSubmitNewEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!entryDescription.trim()) {
      setFormError('لطفاً شرح کلی سند حسابداری را وارد نمایید.');
      return;
    }

    const validation = validateJournalLines(entryLines);
    if (!validation.isValid) {
      setFormError(validation.error || 'سند نامتوازن است.');
      return;
    }

    try {
      setIsSubmitting(true);
      await createManualJournalEntry({
        date: new Date(entryDate),
        description: entryDescription.trim(),
        lines: entryLines
      });
      setIsNewEntryModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'خطا در ثبت سند حسابداری');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete entry
  const handleDeleteEntry = async (id: number, num: number) => {
    if (!window.confirm(`آیا از حذف سند حسابداری شماره ${num} اطمینان دارید؟`)) {
      return;
    }
    await deleteJournalEntry(id);
    if (selectedEntryForView?.id === id) {
      setSelectedEntryForView(null);
    }
  };

  // Sync historical
  const handleSyncHistorical = async () => {
    try {
      setIsSyncing(true);
      setSyncNotice(null);
      const res = await syncHistoricalJournalEntries();
      setSyncNotice(`${res.generatedCount} سند حسابداری از روی فاکتورها، هزینه‌ها و چک‌ها با موفقیت صادر و همگام‌سازی شد.`);
    } catch (err: any) {
      setSyncNotice(`خطا در همگام‌سازی: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Excel export of all journal entries
  const handleExportExcel = () => {
    const headers = ['شماره سند', 'تاریخ سند', 'کد حساب', 'نام سرفصل حساب', 'شرح آرتیکل', 'بدهکار (تومان)', 'بستانکار (تومان)', 'تفصیلی / شخص'];
    const rows: (string | number)[][] = [];

    entries.forEach(e => {
      e.lines.forEach(l => {
        rows.push([
          e.entryNumber,
          new Date(e.date).toLocaleDateString('fa-IR'),
          l.accountCode,
          l.accountName,
          l.description || e.description,
          l.debit || 0,
          l.credit || 0,
          l.detailName || '-'
        ]);
      });
    });

    exportFinancialStatementToExcel({
      reportTitle: 'دفتر روزنامه و ریز اسناد دوبل حسابداری',
      headers,
      rows,
      fileName: 'دفتر_روزنامه_آرکا',
      sheetName: 'دفتر روزنامه'
    });
  };

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = String(e.entryNumber).includes(q);
        const descMatch = e.description.toLowerCase().includes(q);
        const lineMatch = e.lines.some(l => 
          l.accountName.toLowerCase().includes(q) || 
          l.accountCode.includes(q) || 
          (l.description && l.description.toLowerCase().includes(q))
        );
        if (!numMatch && !descMatch && !lineMatch) return false;
      }
      return true;
    });
  }, [entries, searchQuery]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-700 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BookOpen size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">اسناد حسابداری دوبل و دفتر روزنامه (General Journal)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ثبت اسناد دوبل متوازن، تفکیک آرتیکل‌های بدهکار و بستانکار و صدور خودکار از عملیات فروش و خرید
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSyncHistorical}
            disabled={isSyncing}
            className="py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="صدور خودکار سند برای کلیه فاکتورها و چک‌های بدون سند"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin text-blue-600' : ''} />
            <span>همگام‌سازی اسناد</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="py-2.5 px-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-emerald-200"
          >
            <FileSpreadsheet size={15} />
            <span>اکسل دفتر روزنامه</span>
          </button>

          <button
            onClick={handleOpenNewEntryModal}
            className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <Plus size={16} />
            <span>ثبت سند دستی جدید</span>
          </button>
        </div>
      </div>

      {syncNotice && (
        <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-blue-600 shrink-0" />
            <span>{syncNotice}</span>
          </div>
          <button onClick={() => setSyncNotice(null)} className="text-blue-400 hover:text-blue-700 p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجو بر اساس شماره سند، شرح آرتیکل یا کد حساب..."
            className="w-full pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all"
          />
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {filteredEntries.length} سند حسابداری
        </span>
      </div>

      {/* Journal Entries Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 w-24 text-center font-mono">شماره سند</th>
                <th className="py-3.5 px-4 w-28 whitespace-nowrap">تاریخ سند</th>
                <th className="py-3.5 px-4 min-w-[260px]">شرح کلی سند حسابداری</th>
                <th className="py-3.5 px-4 w-28 text-center">نوع منبع</th>
                <th className="py-3.5 px-4 w-36 text-left font-mono">مبلغ بدهکار (تومان)</th>
                <th className="py-3.5 px-4 w-36 text-left font-mono">مبلغ بستانکار (تومان)</th>
                <th className="py-3.5 px-4 w-24 text-center">تراز</th>
                <th className="py-3.5 px-4 w-28 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    هیچ سند حسابداری در این بخش ثبت نشده است.
                  </td>
                </tr>
              ) : (
                filteredEntries.map(entry => {
                  const isBalanced = Math.abs(entry.totalDebit - entry.totalCredit) < 1;

                  const refBadge = 
                    entry.referenceType === 'pos' ? 'فروش صندوق' :
                    entry.referenceType === 'expense' ? 'هزینه و خرید' :
                    entry.referenceType === 'cheque' ? 'گردش چک' :
                    entry.referenceType === 'payroll' ? 'حقوق و دستمزد' : 'سند دستی';

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                        #{entry.entryNumber}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap" dir="ltr">
                        {format(new Date(entry.date), 'yyyy/MM/dd')}
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-800 leading-relaxed">
                        <div>{entry.description}</div>
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                          {entry.lines.length} آرتیکل دوبل • ثبت‌شده توسط: {entry.createdBy || 'سیستم'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-bold">
                          {refBadge}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-left font-mono font-bold text-rose-700">
                        {formatCurrency(entry.totalDebit)}
                      </td>

                      <td className="py-3 px-4 text-left font-mono font-bold text-emerald-700">
                        {formatCurrency(entry.totalCredit)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isBalanced ? (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-bold flex items-center justify-center gap-1">
                            <CheckCircle size={11} />
                            <span>تراز</span>
                          </span>
                        ) : (
                          <span className="text-[10px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md font-bold flex items-center justify-center gap-1">
                            <AlertTriangle size={11} />
                            <span>نامتوازن</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedEntryForView(entry)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="مشاهده آرتیکل‌ها و چاپ سند"
                          >
                            <Eye size={15} />
                          </button>

                          {entry.referenceType === 'manual' && (
                            <button
                              onClick={() => handleDeleteEntry(entry.id!, entry.entryNumber)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف سند دستی"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================== VIEW & PRINT VOUCHER MODAL ===================== */}
      {selectedEntryForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in" dir="rtl">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 overflow-hidden space-y-4 max-h-[92vh] flex flex-col animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                <span>سند حسابداری شماره #{selectedEntryForView.entryNumber}</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintVoucher()}
                  className="py-1.5 px-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Printer size={14} />
                  <span>چاپ سند</span>
                </button>
                <button 
                  onClick={() => setSelectedEntryForView(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Printable Voucher Content */}
            <div className="overflow-y-auto flex-1 pr-1" ref={voucherPrintRef}>
              <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white print:border-none print:p-0">
                {/* Official Letterhead */}
                <div className="flex justify-between items-center border-b pb-3 border-slate-200">
                  <div>
                    <h2 className="text-base font-black text-slate-900">{settings?.restaurantName || 'سامانه حسابداری آرکا'}</h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">سند حسابداری رسمی (Journal Voucher)</p>
                  </div>
                  <div className="text-left text-xs font-mono space-y-1">
                    <div>شماره سند: <strong className="text-slate-900">#{selectedEntryForView.entryNumber}</strong></div>
                    <div>تاریخ سند: <strong className="text-slate-900">{new Date(selectedEntryForView.date).toLocaleDateString('fa-IR')}</strong></div>
                  </div>
                </div>

                {/* Description */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs">
                  <span className="font-bold text-slate-700">شرح سند: </span>
                  <span className="text-slate-800 font-medium">{selectedEntryForView.description}</span>
                </div>

                {/* Lines Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">ردیف</th>
                        <th className="py-2.5 px-3 w-24 font-mono">کد حساب</th>
                        <th className="py-2.5 px-3 min-w-[140px]">عنوان حساب</th>
                        <th className="py-2.5 px-3 min-w-[180px]">شرح آرتیکل</th>
                        <th className="py-2.5 px-3 w-32 text-left font-mono">بدهکار (تومان)</th>
                        <th className="py-2.5 px-3 w-32 text-left font-mono">بستانکار (تومان)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {selectedEntryForView.lines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{line.accountCode}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {line.accountName}
                            {line.detailName && (
                              <span className="block text-[10px] text-blue-600 font-normal">
                                تفصیلی: {line.detailName}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{line.description || selectedEntryForView.description}</td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-rose-700">
                            {line.debit ? formatCurrency(line.debit) : '۰'}
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700">
                            {line.credit ? formatCurrency(line.credit) : '۰'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 text-center font-bold">جمع کل سند:</td>
                        <td className="py-2.5 px-3 text-left font-mono text-rose-700">{formatCurrency(selectedEntryForView.totalDebit)}</td>
                        <td className="py-2.5 px-3 text-left font-mono text-emerald-700">{formatCurrency(selectedEntryForView.totalCredit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs font-bold text-slate-700 border-t border-slate-200">
                  <div className="border border-slate-200 rounded-xl p-3 h-20 flex flex-col justify-between">
                    <span>تنظیم‌کننده: {selectedEntryForView.createdBy || 'حسابدار'}</span>
                    <span className="text-[10px] text-slate-400">امضا و تاریخ</span>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3 h-20 flex flex-col justify-between">
                    <span>مدیر امور مالی</span>
                    <span className="text-[10px] text-slate-400">امضا و تاریخ</span>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3 h-20 flex flex-col justify-between">
                    <span>مدیر عامل / مدیریت</span>
                    <span className="text-[10px] text-slate-400">امضا و مهر</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== NEW MANUAL JOURNAL ENTRY MODAL ===================== */}
      {isNewEntryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in" dir="rtl">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 overflow-hidden space-y-4 max-h-[94vh] flex flex-col animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <BookOpen size={18} className="text-blue-600" />
                <span>ثبت سند حسابداری دستی (Journal Voucher)</span>
              </h3>
              <button 
                onClick={() => setIsNewEntryModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 shrink-0">
                <AlertTriangle size={15} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitNewEntry} className="flex-1 flex flex-col overflow-hidden space-y-4">
              {/* Header Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاریخ سند:</label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={e => setEntryDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold text-slate-800 outline-none"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">شرح کلی سند:</label>
                  <input
                    type="text"
                    value={entryDescription}
                    onChange={e => setEntryDescription(e.target.value)}
                    placeholder="مثلاً واریز سرمایه اولیه موسسین به حساب بانک سامان..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 outline-none"
                    required
                  />
                </div>
              </div>

              {/* Lines Table */}
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-2 w-10 text-center">#</th>
                      <th className="py-2.5 px-2 w-48">حساب حسابداری</th>
                      <th className="py-2.5 px-2 min-w-[160px]">شرح آرتیکل سطر</th>
                      <th className="py-2.5 px-2 w-32 text-left">بدهکار (تومان)</th>
                      <th className="py-2.5 px-2 w-32 text-left">بستانکار (تومان)</th>
                      <th className="py-2.5 px-2 w-10 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entryLines.map((line, idx) => (
                      <tr key={line.id || idx} className="hover:bg-slate-50">
                        <td className="py-2 px-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <select
                            value={line.accountCode}
                            onChange={e => handleLineChange(idx, 'accountCode', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 outline-none"
                            required
                          >
                            <option value="">-- انتخاب حساب --</option>
                            {accounts.map(a => (
                              <option key={a.code} value={a.code}>
                                {a.code} - {a.name} ({a.nature === 'debtor' ? 'بدهکار' : a.nature === 'creditor' ? 'بستانکار' : 'دوگانه'})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={line.description || ''}
                            onChange={e => handleLineChange(idx, 'description', e.target.value)}
                            placeholder="شرح آرتیکل (اختیاری)"
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min="0"
                            value={line.debit || ''}
                            onChange={e => handleLineChange(idx, 'debit', Number(e.target.value) || 0)}
                            placeholder="۰"
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-rose-700 text-left outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min="0"
                            value={line.credit || ''}
                            onChange={e => handleLineChange(idx, 'credit', Number(e.target.value) || 0)}
                            placeholder="۰"
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-emerald-700 text-left outline-none"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                          >
                            <X size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add line button */}
              <div className="flex justify-between items-center shrink-0">
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>افزودن سطر آرتیکل جدید</span>
                </button>

                {/* Balance validation badge */}
                <div className="flex items-center gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">جمع بدهکار: </span>
                    <strong className="font-mono text-rose-700">{formatCurrency(modalTotalDebit)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">جمع بستانکار: </span>
                    <strong className="font-mono text-emerald-700">{formatCurrency(modalTotalCredit)}</strong>
                  </div>
                  <div>
                    {isModalBalanced ? (
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                        <CheckCircle size={14} />
                        <span>سند کاملاً تراز است</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-xl bg-rose-100 text-rose-800 font-bold flex items-center gap-1">
                        <AlertTriangle size={14} />
                        <span>اختلاف: {formatCurrency(Math.abs(modalDifference))} تومان</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-100 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewEntryModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={!isModalBalanced || isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSubmitting ? 'در حال ثبت سند...' : 'ثبت قطعی سند حسابداری'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
