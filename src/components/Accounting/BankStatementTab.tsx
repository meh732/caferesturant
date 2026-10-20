import React, { useState, useMemo, useRef } from 'react';
import { db, BankAccount, CashBox, FinancialTransaction } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Building2, Wallet, Calendar, Search, Filter, Printer, Download,
  ArrowDownRight, ArrowUpRight, ArrowLeftRight, CheckCircle2,
  FileSpreadsheet, Sparkles, RefreshCw, Edit2, Trash2, X, Save, AlertCircle
} from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { reverseFinancialTransaction, updateFinancialTransaction } from '../../lib/accountingServices';
import { 
  format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, isWithinInterval 
} from 'date-fns-jalali';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

type DatePreset = 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'last_month' | 'all' | 'custom';

interface BankStatementTabProps {
  defaultAccountFilter?: string;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function BankStatementTab({
  defaultAccountFilter = 'all',
  canEdit = true,
  canDelete = true,
}: BankStatementTabProps = {}) {
  const bankAccounts = useLiveQuery(() => db.bankAccounts.toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.toArray()) || [];
  const transactions = useLiveQuery(() => db.financialTransactions.orderBy('date').reverse().toArray()) || [];
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>(defaultAccountFilter); // 'all' | 'bank_X' | 'cashbox_X'
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');

  // Edit transaction modal state
  const [editingTx, setEditingTx] = useState<FinancialTransaction | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDescription, setEditDescription] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editTrackingCode, setEditTrackingCode] = useState<string>('');
  const [editDateObj, setEditDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [editError, setEditError] = useState<string | null>(null);

  const [customRange, setCustomRange] = useState<[DateObject, DateObject]>([
    new DateObject({ calendar: persian }).subtract(30, "days"),
    new DateObject({ calendar: persian })
  ]);

  const printAreaRef = useRef<HTMLDivElement>(null);

  const handleOpenEditTx = (tx: FinancialTransaction) => {
    setEditingTx(tx);
    setEditAmount(tx.amount || 0);
    setEditDescription(tx.description || '');
    setEditCategory(tx.category || '');
    setEditTrackingCode(tx.trackingCode || '');
    setEditDateObj(new DateObject({ date: new Date(tx.date), calendar: persian }));
    setEditError(null);
  };

  const handleSaveEditTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx?.id) return;
    setEditError(null);
    if (!editAmount || editAmount <= 0) {
      setEditError('لطفاً مبلغ معتبر وارد نمایید.');
      return;
    }
    try {
      await updateFinancialTransaction(editingTx.id, {
        amount: Number(editAmount),
        date: editDateObj ? editDateObj.toDate() : new Date(editingTx.date),
        description: editDescription,
        category: editCategory,
        trackingCode: editTrackingCode,
      });
      setEditingTx(null);
    } catch (err: any) {
      setEditError(err?.message || 'خطا در ویرایش سند مالی');
    }
  };

  const handleDeleteTx = async (tx: FinancialTransaction) => {
    if (!tx.id) return;
    if (!window.confirm(`آیا از حذف سند مالی «${tx.transactionNumber}» به مبلغ ${formatCurrency(tx.amount)} و اصلاح مانده حساب اطمینان دارید؟`)) {
      return;
    }
    await reverseFinancialTransaction(tx.id);
  };

  // Compute active date interval
  const activeDateInterval = useMemo(() => {
    const now = new Date();
    if (datePreset === 'all') return null;
    if (datePreset === 'today') {
      return { start: startOfDay(now), end: endOfDay(now) };
    }
    if (datePreset === 'yesterday') {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    if (datePreset === 'last_7_days') {
      return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
    }
    if (datePreset === 'this_month') {
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    if (datePreset === 'last_month') {
      const prevMonth = subDays(startOfMonth(now), 5);
      return { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) };
    }
    if (datePreset === 'custom') {
      if (customRange && customRange[0] && customRange[1]) {
        return {
          start: startOfDay(customRange[0].toDate()),
          end: endOfDay(customRange[1].toDate())
        };
      }
    }
    return null;
  }, [datePreset, customRange]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // 1. Date filter
      if (activeDateInterval) {
        const txDate = new Date(tx.date);
        if (!isWithinInterval(txDate, activeDateInterval)) return false;
      }

      // 2. Account filter
      if (selectedAccountFilter !== 'all') {
        const [kind, idStr] = selectedAccountFilter.split('_');
        const targetId = Number(idStr);
        const matchesSource = tx.sourceType === kind && tx.sourceId === targetId;
        const matchesTarget = tx.targetType === kind && tx.targetId === targetId;
        if (!matchesSource && !matchesTarget) return false;
      }

      // 3. Type filter
      if (selectedTypeFilter !== 'all') {
        if (tx.type !== selectedTypeFilter) return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const desc = (tx.description || '').toLowerCase();
        const code = (tx.trackingCode || '').toLowerCase();
        const num = (tx.transactionNumber || '').toLowerCase();
        const cat = (tx.category || '').toLowerCase();
        if (!desc.includes(q) && !code.includes(q) && !num.includes(q) && !cat.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, activeDateInterval, selectedAccountFilter, selectedTypeFilter, searchQuery]);

  // Metrics: Deposits (ورودی / بستانکار) vs Withdrawals (خروجی / بدهکار)
  const { totalDeposits, totalWithdrawals, netChange } = useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;

    filteredTransactions.forEach(tx => {
      // If a specific account is selected:
      if (selectedAccountFilter !== 'all') {
        const [kind, idStr] = selectedAccountFilter.split('_');
        const targetId = Number(idStr);

        if (tx.targetType === kind && tx.targetId === targetId) {
          deposits += tx.amount;
        } else if (tx.sourceType === kind && tx.sourceId === targetId) {
          withdrawals += tx.amount;
        } else if (tx.targetType) {
          deposits += tx.amount;
        }
      } else {
        // All accounts
        if (['income_sale', 'deposit_manual', 'cheque_deposit'].includes(tx.type)) {
          deposits += tx.amount;
        } else if (['expense_purchase', 'withdrawal_manual', 'cheque_payment', 'salary_payment'].includes(tx.type)) {
          withdrawals += tx.amount;
        } else if (tx.type === 'transfer') {
          // Internal transfers cancel out when viewing all accounts
        }
      }
    });

    return {
      totalDeposits: deposits,
      totalWithdrawals: withdrawals,
      netChange: deposits - withdrawals,
    };
  }, [filteredTransactions, selectedAccountFilter]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert('تراکنشی جهت خروجی یافت نشد.');
      return;
    }

    const headers = ['ردیف', 'تاریخ و ساعت', 'شماره سند', 'حساب/صندوق', 'نوع تراکنش', 'شرح', 'بدهکار (برداشت)', 'بستانکار (واریز)', 'کد پیگیری'];
    const rows = filteredTransactions.map((tx, idx) => {
      const isCredit = ['income_sale', 'deposit_manual', 'cheque_deposit'].includes(tx.type) || tx.targetType;
      const isDebit = ['expense_purchase', 'withdrawal_manual', 'cheque_payment', 'salary_payment'].includes(tx.type) || tx.sourceType;
      const acc = tx.targetName || tx.sourceName || '-';

      return [
        idx + 1,
        format(new Date(tx.date), 'yyyy/MM/dd HH:mm'),
        tx.transactionNumber,
        acc,
        tx.category,
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        isDebit ? tx.amount : 0,
        isCredit ? tx.amount : 0,
        tx.trackingCode || ''
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `صورتحساب_بانکی_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Print Statement
  const handlePrint = () => {
    window.print();
  };

  // Selected account label
  const selectedAccountLabel = useMemo(() => {
    if (selectedAccountFilter === 'all') return 'کلیه حساب‌ها و صندوق‌ها';
    const [kind, idStr] = selectedAccountFilter.split('_');
    if (kind === 'bank') {
      const b = bankAccounts.find(x => x.id === Number(idStr));
      return b ? `${b.bankName} (${b.accountHolder})` : 'حساب بانکی';
    } else {
      const c = cashBoxes.find(x => x.id === Number(idStr));
      return c ? `${c.name} (${c.cashierName})` : 'صندوق نقدی';
    }
  }, [selectedAccountFilter, bankAccounts, cashBoxes]);

  return (
    <div className="space-y-6">
      {/* Printable official ledger wrapper */}
      <div className="hidden print:block mb-6 p-4 border-b-2 border-black" dir="rtl">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-bold">{settings?.restaurantName || 'فروشگاه و رستوران'}</h1>
            <p className="text-sm">صورتحساب رسمی گردش حساب‌های بانکی و صندوق</p>
          </div>
          <div className="text-left text-xs font-mono">
            <p>تاریخ چاپ: {format(new Date(), 'yyyy/MM/dd HH:mm')}</p>
            <p>محدوده حساب: {selectedAccountLabel}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 border border-gray-300 text-xs">
          <div>جمع کل واریزی‌ها: <strong className="font-mono">{formatCurrency(totalDeposits)}</strong></div>
          <div>جمع کل برداشت‌ها: <strong className="font-mono">{formatCurrency(totalWithdrawals)}</strong></div>
          <div>تغییر خالص دوره: <strong className="font-mono">{formatCurrency(netChange)}</strong></div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold mb-1">
            <ArrowDownRight size={18} />
            <span>کل واریزی‌ها / بستانکار (ورود به حساب)</span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600">
            +{formatCurrency(totalDeposits)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            فروش، واریزهای دستی، وصول چک و بیعانه‌ها
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-rose-600 text-xs font-bold mb-1">
            <ArrowUpRight size={18} />
            <span>کل برداشت‌ها / بدهکار (خروج از حساب)</span>
          </div>
          <div className="text-xl font-bold font-mono text-rose-600">
            -{formatCurrency(totalWithdrawals)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            خرید مواد اولیه، هزینه‌های جاری، حقوق و برداشت‌ها
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold mb-1">
            <Sparkles size={18} />
            <span>تغییر خالص دوره مالی</span>
          </div>
          <div className={`text-xl font-bold font-mono ${netChange >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
            {netChange >= 0 ? '+' : ''}{formatCurrency(netChange)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            تراز خالص نقدینگی در بازه زمانی انتخابی
          </p>
        </div>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="text-blue-600" size={20} />
            <h3 className="font-bold text-slate-800 text-sm sm:text-base">
              صورتحساب و ریز گردش مالی ({filteredTransactions.length} تراکنش)
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 border border-emerald-200 cursor-pointer"
            >
              <FileSpreadsheet size={15} />
              <span>خروجی اکسل (CSV)</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={15} />
              <span>چاپ صورتحساب</span>
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Account selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">انتخاب حساب یا صندوق</label>
            <select
              value={selectedAccountFilter}
              onChange={e => setSelectedAccountFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold"
            >
              <option value="all">🏦 همه حساب‌ها و صندوق‌ها</option>
              <optgroup label="حساب‌های بانکی">
                {bankAccounts.map(b => (
                  <option key={`bank_${b.id}`} value={`bank_${b.id}`}>
                    {b.bankName} - {b.accountHolder} ({formatCurrency(b.balance)})
                  </option>
                ))}
              </optgroup>
              <optgroup label="صندوق‌های نقدی">
                {cashBoxes.map(c => (
                  <option key={`cashbox_${c.id}`} value={`cashbox_${c.id}`}>
                    {c.name} ({formatCurrency(c.balance)})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Type filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع سند مالی</label>
            <select
              value={selectedTypeFilter}
              onChange={e => setSelectedTypeFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
            >
              <option value="all">همه اسناد و تراکنش‌ها</option>
              <option value="income_sale">درآمد فروش صندوق (POS/نقدی)</option>
              <option value="expense_purchase">خرید مواد اولیه و هزینه‌ها</option>
              <option value="transfer">انتقال بین حساب‌ها و صندوق‌ها</option>
              <option value="cheque_deposit">وصول چک‌های صیادی</option>
              <option value="cheque_payment">پاس شدن چک‌های پرداختی</option>
              <option value="deposit_manual">واریز دستی متفرقه</option>
              <option value="withdrawal_manual">برداشت دستی متفرقه</option>
              <option value="salary_payment">پرداخت حقوق پرسنل</option>
            </select>
          </div>

          {/* Date Presets */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">بازه زمانی</label>
            <select
              value={datePreset}
              onChange={e => setDatePreset(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium"
            >
              <option value="this_month">این ماه (جاری)</option>
              <option value="today">امروز</option>
              <option value="yesterday">دیروز</option>
              <option value="last_7_days">۷ روز اخیر</option>
              <option value="last_month">ماه گذشته</option>
              <option value="all">کل تاریخچه (همه)</option>
              <option value="custom">بازه سفارشی...</option>
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">جستجو در شرح یا کد پیگیری</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="جستجو..."
                className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
              />
              <Search size={14} className="absolute right-2.5 top-2.5 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Custom date range picker if selected */}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-600">انتخاب بازه تاریخ:</span>
            <DatePicker
              value={customRange}
              onChange={setCustomRange as any}
              range
              calendar={persian}
              locale={persian_fa}
              calendarPosition="bottom-right"
              inputClass="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold"
            />
          </div>
        )}
      </div>

      {/* Transactions Ledger Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden" ref={printAreaRef}>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3.5 px-4 w-12 text-center">ردیف</th>
                <th className="py-3.5 px-4 whitespace-nowrap">تاریخ و زمان</th>
                <th className="py-3.5 px-4 whitespace-nowrap">شماره سند</th>
                <th className="py-3.5 px-4 whitespace-nowrap">حساب / صندوق</th>
                <th className="py-3.5 px-4 whitespace-nowrap">سرفصل</th>
                <th className="py-3.5 px-4 min-w-[200px]">شرح سند</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-left text-rose-600">بدهکار (برداشت)</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-left text-emerald-600">بستانکار (واریز)</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-left">مانده حساب</th>
                <th className="py-3.5 px-4 whitespace-nowrap">کد پیگیری</th>
                <th className="py-3.5 px-4 w-24 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    هیچ تراکنشی مطابق با فیلترهای انتخابی یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx, idx) => {
                  const isCredit = ['income_sale', 'deposit_manual', 'cheque_deposit'].includes(tx.type) || (tx.targetType && (!selectedAccountFilter.includes('source')));
                  const isDebit = ['expense_purchase', 'withdrawal_manual', 'cheque_payment', 'salary_payment'].includes(tx.type) || (tx.sourceType && (!selectedAccountFilter.includes('target')));

                  const accountName = tx.targetName || tx.sourceName || '-';

                  return (
                    <tr key={tx.id || idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600 text-[11px]" dir="ltr">
                        {format(new Date(tx.date), 'yyyy/MM/dd HH:mm')}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-slate-700">
                        {tx.transactionNumber}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800">
                        {accountName}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-bold">
                          {tx.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium leading-relaxed">
                        {tx.description}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-left font-mono font-bold text-rose-600">
                        {isDebit ? formatCurrency(tx.amount) : '-'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-left font-mono font-bold text-emerald-600">
                        {isCredit ? formatCurrency(tx.amount) : '-'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-left font-mono font-bold text-slate-800">
                        {tx.balanceAfter !== undefined ? formatCurrency(tx.balanceAfter) : '-'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                        {tx.trackingCode || '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEditTx(tx)}
                              title="ویرایش تراکنش مالی"
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteTx(tx)}
                              title="حذف تراکنش و اصلاح مانده حساب"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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

      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-800">
                ویرایش تراکنش مالی #{editingTx.transactionNumber}
              </h3>
              <button
                onClick={() => setEditingTx(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditTx} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ تراکنش (تومان) *</label>
                <input
                  type="number"
                  value={editAmount || ''}
                  onChange={e => setEditAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono font-bold text-sm outline-none"
                  dir="ltr"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سرفصل</label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاریخ</label>
                  <DatePicker
                    value={editDateObj}
                    onChange={(d: any) => d && setEditDateObj(d)}
                    calendar={persian}
                    locale={persian_fa}
                    calendarPosition="bottom-right"
                    inputClass="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">کد پیگیری / شماره سند</label>
                <input
                  type="text"
                  value={editTrackingCode}
                  onChange={e => setEditTrackingCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-mono outline-none"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شرح سند *</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Save size={15} />
                  <span>ذخیره تغییرات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
