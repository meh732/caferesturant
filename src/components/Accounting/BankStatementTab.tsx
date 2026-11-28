import React, { useState, useMemo, useRef } from 'react';
import { db, FinancialTransaction } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2, Calendar, Search, Printer,
  ArrowDownRight, ArrowUpRight, ArrowUpDown,
  FileSpreadsheet, Sparkles, Edit2, Trash2, X, Save, AlertCircle, Landmark
} from 'lucide-react';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import { reverseFinancialTransaction, updateFinancialTransaction } from '../../lib/accountingServices';
import { AppleSwitch } from '../Common/AppleSwitch';
import {
  format, startOfDay, endOfDay, subDays,
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

interface ComputedStatementRow {
  tx: FinancialTransaction;
  isCredit: boolean;
  isDebit: boolean;
  isInternalTransfer: boolean;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  accountLabel: string;
}

function toPersianDateObj(d: Date): DateObject {
  return new DateObject({ date: d, calendar: persian, locale: persian_fa });
}

export default function BankStatementTab({
  defaultAccountFilter = 'all',
  canEdit = true,
  canDelete = true,
}: BankStatementTabProps = {}) {
  const bankAccounts = useLiveQuery(() => db.bankAccounts.toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.toArray()) || [];
  const transactions = useLiveQuery(() => db.financialTransactions.orderBy('date').toArray()) || [];
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>(defaultAccountFilter); // 'all' | 'bank_X' | 'cashbox_X'
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');

  // Direct start & end Persian DatePickers (always accessible for any exact range)
  const [startDateObj, setStartDateObj] = useState<DateObject>(() => toPersianDateObj(startOfMonth(new Date())));
  const [endDateObj, setEndDateObj] = useState<DateObject>(() => toPersianDateObj(endOfMonth(new Date())));

  // Carried-forward / Opening balance toggle (default ON — matches official bank ledger)
  const [includeCarriedForward, setIncludeCarriedForward] = useState<boolean>(true);
  // Chronological order (asc = official bank statement from opening -> closing; desc = newest on top)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Edit transaction modal state
  const [editingTx, setEditingTx] = useState<FinancialTransaction | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDescription, setEditDescription] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editTrackingCode, setEditTrackingCode] = useState<string>('');
  const [editDateObj, setEditDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [editError, setEditError] = useState<string | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Apply quick preset and sync start/end date pickers immediately
  const handleSelectDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'today') {
      setStartDateObj(toPersianDateObj(startOfDay(now)));
      setEndDateObj(toPersianDateObj(endOfDay(now)));
    } else if (preset === 'yesterday') {
      const y = subDays(now, 1);
      setStartDateObj(toPersianDateObj(startOfDay(y)));
      setEndDateObj(toPersianDateObj(endOfDay(y)));
    } else if (preset === 'last_7_days') {
      setStartDateObj(toPersianDateObj(startOfDay(subDays(now, 6))));
      setEndDateObj(toPersianDateObj(endOfDay(now)));
    } else if (preset === 'this_month') {
      setStartDateObj(toPersianDateObj(startOfMonth(now)));
      setEndDateObj(toPersianDateObj(endOfMonth(now)));
    } else if (preset === 'last_month') {
      const prevMonth = subDays(startOfMonth(now), 5);
      setStartDateObj(toPersianDateObj(startOfMonth(prevMonth)));
      setEndDateObj(toPersianDateObj(endOfMonth(prevMonth)));
    }
  };

  const handleStartDateChange = (val: any) => {
    if (!val) return;
    setStartDateObj(val);
    setDatePreset('custom');
  };

  const handleEndDateChange = (val: any) => {
    if (!val) return;
    setEndDateObj(val);
    setDatePreset('custom');
  };

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

  // Compute active date interval safely (even if user picks start > end, normalize automatically)
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
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    }
    if (datePreset === 'this_month') {
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    if (datePreset === 'last_month') {
      const prevMonth = subDays(startOfMonth(now), 5);
      return { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) };
    }
    if (datePreset === 'custom' && startDateObj && endDateObj) {
      const s = startOfDay(startDateObj.toDate());
      const e = endOfDay(endDateObj.toDate());
      return s.getTime() <= e.getTime()
        ? { start: s, end: e }
        : { start: startOfDay(endDateObj.toDate()), end: endOfDay(startDateObj.toDate()) };
    }
    return null;
  }, [datePreset, startDateObj, endDateObj]);

  // Human-readable date range label for header, print, and CSV
  const activeDateRangeLabel = useMemo(() => {
    if (!activeDateInterval) return 'کل تاریخچه (از ابتدا تا امروز)';
    return `از ${format(activeDateInterval.start, 'yyyy/MM/dd')} تا ${format(activeDateInterval.end, 'yyyy/MM/dd')}`;
  }, [activeDateInterval]);

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

  // Pure helper: exact accounting effect of a transaction on the active account scope
  const getTxEffect = useMemo(() => {
    if (selectedAccountFilter !== 'all') {
      const [kind, idStr] = selectedAccountFilter.split('_');
      const targetId = Number(idStr);
      return (tx: FinancialTransaction) => {
        const amt = Number(tx.amount) || 0;
        const isCredit = tx.targetType === kind && tx.targetId === targetId;
        const isDebit = tx.sourceType === kind && tx.sourceId === targetId;
        if (isCredit && isDebit) {
          return { isCredit: false, isDebit: false, net: 0, isInternalTransfer: true };
        }
        const net = (isCredit ? amt : 0) - (isDebit ? amt : 0);
        return { isCredit, isDebit, net, isInternalTransfer: false };
      };
    }

    // Scope: all tracked bank accounts & cashboxes combined
    return (tx: FinancialTransaction) => {
      const amt = Number(tx.amount) || 0;
      const isTrackedSource = tx.sourceType === 'bank' || tx.sourceType === 'cashbox';
      const isTrackedTarget = tx.targetType === 'bank' || tx.targetType === 'cashbox';

      if (tx.type === 'transfer' && isTrackedSource && isTrackedTarget) {
        return { isCredit: false, isDebit: false, net: 0, isInternalTransfer: true };
      }

      const isCredit =
        isTrackedTarget ||
        (!isTrackedSource && ['income_sale', 'deposit_manual', 'cheque_deposit'].includes(tx.type));
      const isDebit =
        isTrackedSource ||
        (!isTrackedTarget && ['expense_purchase', 'withdrawal_manual', 'cheque_payment', 'salary_payment'].includes(tx.type));

      const net = (isCredit ? amt : 0) - (isDebit ? amt : 0);
      return { isCredit, isDebit, net, isInternalTransfer: false };
    };
  }, [selectedAccountFilter]);

  // Core ledger computation: exact Opening Balance + Prior Turnover + Chronological Running Balance
  const ledger = useMemo(() => {
    // 1. All transactions belonging to the selected account scope (sorted strictly chronologically ascending)
    const scopeTxs = transactions
      .filter(tx => {
        if (selectedAccountFilter !== 'all') {
          const [kind, idStr] = selectedAccountFilter.split('_');
          const targetId = Number(idStr);
          return (
            (tx.sourceType === kind && tx.sourceId === targetId) ||
            (tx.targetType === kind && tx.targetId === targetId)
          );
        }
        // In 'all' mode, include transactions affecting any bank or cashbox
        const touchesBankOrCash =
          tx.sourceType === 'bank' ||
          tx.sourceType === 'cashbox' ||
          tx.targetType === 'bank' ||
          tx.targetType === 'cashbox';
        return touchesBankOrCash;
      })
      .sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (diff !== 0) return diff;
        return (a.id || 0) - (b.id || 0);
      });

    // 2. Separate explicit Opening Balance rows from Operational rows
    const openingTxs = scopeTxs.filter(tx => tx.category === 'موجودی افتتاحیه');
    const operationalTxs = scopeTxs.filter(tx => tx.category !== 'موجودی افتتاحیه');

    // 3. Derive exact live balance of selected scope to guarantee ZERO drift even for edited/legacy accounts
    let actualCurrentBalance = 0;
    if (selectedAccountFilter !== 'all') {
      const [kind, idStr] = selectedAccountFilter.split('_');
      const id = Number(idStr);
      if (kind === 'bank') {
        actualCurrentBalance = Number(bankAccounts.find(b => b.id === id)?.balance || 0);
      } else {
        actualCurrentBalance = Number(cashBoxes.find(c => c.id === id)?.balance || 0);
      }
    } else {
      actualCurrentBalance =
        bankAccounts.reduce((s, b) => s + (Number(b.balance) || 0), 0) +
        cashBoxes.reduce((s, c) => s + (Number(c.balance) || 0), 0);
    }

    const netOfAllRecordedTxs = scopeTxs.reduce((sum, tx) => sum + getTxEffect(tx).net, 0);
    const implicitOpeningBalance = Math.round(actualCurrentBalance - netOfAllRecordedTxs);
    const explicitOpeningSum = openingTxs.reduce((sum, tx) => sum + getTxEffect(tx).net, 0);
    const totalOpeningBalance = Math.round(implicitOpeningBalance + explicitOpeningSum);

    // 4. Net of operational transactions strictly BEFORE activeDateInterval.start
    const priorOperationalNet = activeDateInterval
      ? Math.round(
          operationalTxs
            .filter(tx => new Date(tx.date).getTime() < activeDateInterval.start.getTime())
            .reduce((sum, tx) => sum + getTxEffect(tx).net, 0)
        )
      : 0;

    // Carried-forward balance entering the selected period
    const carriedForwardBalance = Math.round(totalOpeningBalance + priorOperationalNet);
    const startingBalance = includeCarriedForward ? carriedForwardBalance : 0;

    // 5. Filter operational transactions for the selected date range, type, and search
    const periodOperationalTxs = operationalTxs.filter(tx => {
      if (activeDateInterval) {
        const txDate = new Date(tx.date);
        if (!isWithinInterval(txDate, activeDateInterval)) return false;
      }

      if (selectedTypeFilter !== 'all' && tx.type !== selectedTypeFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const desc = (tx.description || '').toLowerCase();
        const code = (tx.trackingCode || '').toLowerCase();
        const num = (tx.transactionNumber || '').toLowerCase();
        const cat = (tx.category || '').toLowerCase();
        const src = (tx.sourceName || '').toLowerCase();
        const tgt = (tx.targetName || '').toLowerCase();
        if (!desc.includes(q) && !code.includes(q) && !num.includes(q) && !cat.includes(q) && !src.includes(q) && !tgt.includes(q)) {
          return false;
        }
      }

      return true;
    });

    // 6. Compute exact sequential running balance chronologically ascending
    let running = startingBalance;
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    const ascRows: ComputedStatementRow[] = periodOperationalTxs.map(tx => {
      const eff = getTxEffect(tx);
      const debitAmount = eff.isDebit ? Number(tx.amount) || 0 : 0;
      const creditAmount = eff.isCredit ? Number(tx.amount) || 0 : 0;

      totalDeposits += creditAmount;
      totalWithdrawals += debitAmount;
      running = Math.round(running + eff.net);

      let accountLabel = '-';
      if (selectedAccountFilter !== 'all') {
        accountLabel = eff.isCredit
          ? tx.targetName || tx.sourceName || '-'
          : tx.sourceName || tx.targetName || '-';
      } else if (tx.type === 'transfer' && tx.sourceName && tx.targetName) {
        accountLabel = `${tx.sourceName} ← ${tx.targetName}`;
      } else {
        accountLabel = tx.targetName || tx.sourceName || '-';
      }

      return {
        tx,
        isCredit: eff.isCredit,
        isDebit: eff.isDebit,
        isInternalTransfer: eff.isInternalTransfer,
        debitAmount,
        creditAmount,
        runningBalance: running,
        accountLabel,
      };
    });

    const displayRows = sortOrder === 'asc' ? ascRows : [...ascRows].reverse();
    const netChange = Math.round(totalDeposits - totalWithdrawals);
    const closingBalance = Math.round(startingBalance + netChange);

    // Editable single opening transaction (only when there is an exact 1-to-1 explicit opening row)
    const editableOpeningTx =
      openingTxs.length === 1 && implicitOpeningBalance === 0 && priorOperationalNet === 0
        ? openingTxs[0]
        : null;

    return {
      totalOpeningBalance,
      implicitOpeningBalance,
      explicitOpeningSum,
      priorOperationalNet,
      carriedForwardBalance,
      startingBalance,
      totalDeposits: Math.round(totalDeposits),
      totalWithdrawals: Math.round(totalWithdrawals),
      netChange,
      closingBalance,
      actualCurrentBalance,
      rows: displayRows,
      ascRows,
      editableOpeningTx,
    };
  }, [
    transactions,
    bankAccounts,
    cashBoxes,
    selectedAccountFilter,
    activeDateInterval,
    selectedTypeFilter,
    searchQuery,
    includeCarriedForward,
    sortOrder,
    getTxEffect,
  ]);

  const carriedRowTitle =
    ledger.priorOperationalNet !== 0 ? 'مانده منقول از دوره قبل' : 'موجودی افتتاحیه حساب';

  const carriedRowDescription = useMemo(() => {
    if (ledger.priorOperationalNet !== 0 && activeDateInterval) {
      return `مانده انتقالی تا قبل از ${format(activeDateInterval.start, 'yyyy/MM/dd')} (افتتاحیه: ${formatCurrency(ledger.totalOpeningBalance)} | گردش قبل از بازه: ${ledger.priorOperationalNet >= 0 ? '+' : ''}${formatCurrency(ledger.priorOperationalNet)})`;
    }
    return `موجودی افتتاحیه / مانده اول دوره (${selectedAccountLabel})`;
  }, [ledger.priorOperationalNet, ledger.totalOpeningBalance, activeDateInterval, selectedAccountLabel]);

  // Export to CSV (includes Opening/Carried-Forward row, computed running balances, and Closing summary)
  const handleExportCSV = () => {
    if (ledger.ascRows.length === 0 && !includeCarriedForward) {
      return;
    }

    const headers = [
      'ردیف',
      'تاریخ و ساعت',
      'شماره سند',
      'حساب/صندوق',
      'سرفصل',
      'شرح سند',
      `بدهکار / برداشت (${getCurrencyLabel()})`,
      `بستانکار / واریز (${getCurrencyLabel()})`,
      `مانده حساب (${getCurrencyLabel()})`,
      'کد پیگیری',
    ];

    const csvRows: (string | number)[][] = [];

    if (includeCarriedForward) {
      csvRows.push([
        0,
        activeDateInterval ? format(activeDateInterval.start, 'yyyy/MM/dd') : 'ابتدای دوره',
        'OPENING',
        `"${selectedAccountLabel.replace(/"/g, '""')}"`,
        carriedRowTitle,
        `"${carriedRowDescription.replace(/"/g, '""')}"`,
        0,
        0,
        ledger.carriedForwardBalance,
        '-',
      ]);
    }

    ledger.ascRows.forEach((row, idx) => {
      csvRows.push([
        idx + 1,
        format(new Date(row.tx.date), 'yyyy/MM/dd HH:mm'),
        row.tx.transactionNumber,
        `"${row.accountLabel.replace(/"/g, '""')}"`,
        `"${(row.tx.category || '').replace(/"/g, '""')}"`,
        `"${(row.tx.description || '').replace(/"/g, '""')}"`,
        row.debitAmount,
        row.creditAmount,
        row.runningBalance,
        row.tx.trackingCode || '',
      ]);
    });

    csvRows.push([
      '',
      '',
      'TOTAL',
      `"${selectedAccountLabel.replace(/"/g, '""')}"`,
      'جمع گردش و مانده پایان دوره',
      `"بازه گزارش: ${activeDateRangeLabel} | اعمال منقول از قبل: ${includeCarriedForward ? 'بله' : 'خیر'}"`,
      ledger.totalWithdrawals,
      ledger.totalDeposits,
      ledger.closingBalance,
      '',
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
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

  const renderCarriedForwardRow = () => (
    <tr className="bg-amber-50/70 border-b-2 border-amber-200/80 font-semibold">
      <td className="py-3 px-3 sm:px-4 text-center font-mono text-amber-700 font-black">۰</td>
      <td className="py-3 px-3 sm:px-4 whitespace-nowrap font-mono text-[11px] text-amber-800" dir="ltr">
        {activeDateInterval ? format(activeDateInterval.start, 'yyyy/MM/dd') : 'ابتدای دوره'}
      </td>
      <td className="py-3 px-3 sm:px-4 whitespace-nowrap font-mono font-bold text-amber-800">
        {ledger.editableOpeningTx?.transactionNumber || 'OPENING'}
      </td>
      <td className="py-3 px-3 sm:px-4 whitespace-nowrap font-bold text-slate-800">
        {selectedAccountLabel}
      </td>
      <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
        <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg text-[10px] font-black">
          {carriedRowTitle}
        </span>
      </td>
      <td className="py-3 px-3 sm:px-4 text-amber-950 font-medium leading-relaxed">
        {carriedRowDescription}
      </td>
      <td className="py-3 px-3 sm:px-4 whitespace-nowrap text-left font-mono text-slate-400">-</td>
      <td className="py-3 px-3 sm:px-4 whitespace-nowrap text-left font-mono text-slate-400">-</td>
      <td
        className={`py-3 px-3 sm:px-4 whitespace-nowrap text-left font-mono font-black ${
          ledger.carriedForwardBalance >= 0 ? 'text-amber-900' : 'text-rose-700'
        }`}
      >
        {formatCurrency(ledger.carriedForwardBalance)}
      </td>
      <td className="py-3 px-3 sm:px-4 whitespace-nowrap font-mono text-[11px] text-amber-700">
        {ledger.editableOpeningTx?.trackingCode || 'افتتاحیه'}
      </td>
      <td className="py-3 px-3 sm:px-4 text-center print:hidden">
        {ledger.editableOpeningTx && canEdit ? (
          <button
            type="button"
            onClick={() => handleOpenEditTx(ledger.editableOpeningTx!)}
            title="ویرایش سند موجودی افتتاحیه"
            className="p-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
          >
            <Edit2 size={14} />
          </button>
        ) : (
          <span className="text-[10px] text-amber-700/80 font-bold">سیستمی</span>
        )}
      </td>
    </tr>
  );

  return (
    <div className="space-y-5">
      {/* Printable official ledger wrapper */}
      <div className="hidden print:block mb-6 p-4 border-b-2 border-black" dir="rtl">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-bold">{settings?.restaurantName || 'فروشگاه و رستوران'}</h1>
            <p className="text-sm">صورتحساب رسمی گردش حساب‌های بانکی و صندوق ({getCurrencyLabel()})</p>
          </div>
          <div className="text-left text-xs font-mono space-y-0.5">
            <p>تاریخ چاپ: {format(new Date(), 'yyyy/MM/dd HH:mm')}</p>
            <p>محدوده حساب: {selectedAccountLabel}</p>
            <p>بازه گزارش: {activeDateRangeLabel}</p>
            <p>اعمال مانده منقول از قبل: {includeCarriedForward ? 'فعال' : 'غیرفعال (شروع از صفر)'}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 p-3 bg-gray-50 border border-gray-300 text-xs">
          <div>
            مانده ابتدای دوره:{' '}
            <strong className="font-mono">{formatCurrency(ledger.startingBalance)}</strong>
          </div>
          <div>
            جمع واریزی دوره:{' '}
            <strong className="font-mono">+{formatCurrency(ledger.totalDeposits)}</strong>
          </div>
          <div>
            جمع برداشت دوره:{' '}
            <strong className="font-mono">-{formatCurrency(ledger.totalWithdrawals)}</strong>
          </div>
          <div>
            مانده پایان دوره:{' '}
            <strong className="font-mono">{formatCurrency(ledger.closingBalance)}</strong>
          </div>
        </div>
      </div>

      {/* 4 Responsive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 print:hidden">
        {/* KPI 1: Opening / Carried-Forward Balance */}
        <div className={`rounded-3xl p-4 sm:p-5 border shadow-xs transition-all ${
          includeCarriedForward
            ? 'bg-amber-50/60 border-amber-200/90'
            : 'bg-slate-50/70 border-slate-200'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 text-amber-700 text-xs font-bold">
              <Landmark size={17} />
              <span>{carriedRowTitle}</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              includeCarriedForward
                ? 'bg-amber-200/70 text-amber-900'
                : 'bg-slate-200 text-slate-600'
            }`}>
              {includeCarriedForward ? 'اعمال شده' : 'اعمال نشده'}
            </span>
          </div>
          <div className={`text-lg sm:text-xl font-black font-mono ${
            includeCarriedForward
              ? ledger.carriedForwardBalance >= 0 ? 'text-amber-900' : 'text-rose-600'
              : 'text-slate-400'
          }`}>
            {formatCurrency(ledger.startingBalance)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
            {includeCarriedForward
              ? ledger.priorOperationalNet !== 0
                ? `افتتاحیه: ${formatCurrency(ledger.totalOpeningBalance)} • قبل از بازه: ${ledger.priorOperationalNet >= 0 ? '+' : ''}${formatCurrency(ledger.priorOperationalNet)}`
                : 'موجودی ابتدای دوره لحاظ‌شده در ستون مانده'
              : `مانده واقعی منقول: ${formatCurrency(ledger.carriedForwardBalance)} (موقتاً غیرفعال)`}
          </p>
        </div>

        {/* KPI 2: Period Deposits */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold mb-1">
            <ArrowDownRight size={17} />
            <span>کل واریزی‌ها / بستانکار دوره</span>
          </div>
          <div className="text-lg sm:text-xl font-black font-mono text-emerald-600">
            +{formatCurrency(ledger.totalDeposits)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            فروش، واریزهای دستی، وصول چک و بیعانه‌ها در بازه
          </p>
        </div>

        {/* KPI 3: Period Withdrawals */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-rose-600 text-xs font-bold mb-1">
            <ArrowUpRight size={17} />
            <span>کل برداشت‌ها / بدهکار دوره</span>
          </div>
          <div className="text-lg sm:text-xl font-black font-mono text-rose-600">
            -{formatCurrency(ledger.totalWithdrawals)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            خرید مواد اولیه، هزینه‌های جاری، حقوق و برداشت‌ها
          </p>
        </div>

        {/* KPI 4: Closing Balance + Period Net Change */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-indigo-200/80 shadow-xs">
          <div className="flex items-center gap-1.5 text-indigo-600 text-xs font-bold mb-1">
            <Sparkles size={17} />
            <span>{includeCarriedForward ? 'مانده پایان دوره' : 'خالص گردش دوره انتخابی'}</span>
          </div>
          <div className={`text-lg sm:text-xl font-black font-mono ${
            ledger.closingBalance >= 0 ? 'text-indigo-700' : 'text-rose-600'
          }`}>
            {formatCurrency(ledger.closingBalance)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            تغییر خالص دوره:{' '}
            <strong className={`font-mono ${ledger.netChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {ledger.netChange >= 0 ? '+' : ''}{formatCurrency(ledger.netChange)}
            </strong>
          </p>
        </div>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="text-blue-600 shrink-0" size={20} />
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">
                صورتحساب و ریز گردش مالی ({ledger.rows.length} تراکنش
                {includeCarriedForward ? ' + ردیف افتتاحیه/منقول' : ''})
              </h3>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">{activeDateRangeLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="تغییر ترتیب نمایش ردیف‌های صورتحساب"
            >
              <ArrowUpDown size={14} />
              <span>{sortOrder === 'asc' ? 'ترتیب: از قدیم به جدید' : 'ترتیب: جدیدترین بالا'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 border border-emerald-200 cursor-pointer"
            >
              <FileSpreadsheet size={15} />
              <span>خروجی اکسل (CSV)</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={15} />
              <span>چاپ صورتحساب</span>
            </button>
          </div>
        </div>

        {/* Filters row 1: Account, Type, Quick Date Preset, Search */}
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
            <label className="block text-[11px] font-bold text-slate-600 mb-1">بازه زمانی سریع</label>
            <select
              value={datePreset}
              onChange={e => handleSelectDatePreset(e.target.value as DatePreset)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium"
            >
              <option value="this_month">این ماه (جاری)</option>
              <option value="today">امروز</option>
              <option value="yesterday">دیروز</option>
              <option value="last_7_days">۷ روز اخیر</option>
              <option value="last_month">ماه گذشته</option>
              <option value="all">کل تاریخچه (همه)</option>
              <option value="custom">بازه تاریخ دلخواه (از / تا)</option>
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

        {/* Filters row 2: Direct From/To Date Pickers + Carried-Forward Balance Toggle */}
        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Always-visible Start Date -> End Date Pickers */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Calendar size={15} className="text-blue-600 shrink-0" />
              <span>بازه دقیق:</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">از تاریخ:</span>
              <DatePicker
                value={startDateObj}
                onChange={handleStartDateChange}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass={`w-32 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold text-center outline-none transition-colors ${
                  datePreset === 'custom'
                    ? 'border-blue-400 bg-blue-50/50 text-blue-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">تا تاریخ:</span>
              <DatePicker
                value={endDateObj}
                onChange={handleEndDateChange}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass={`w-32 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold text-center outline-none transition-colors ${
                  datePreset === 'custom'
                    ? 'border-blue-400 bg-blue-50/50 text-blue-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              />
            </div>

            {datePreset !== 'all' && (
              <button
                type="button"
                onClick={() => handleSelectDatePreset('all')}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                نمایش کل تاریخچه
              </button>
            )}
          </div>

          {/* Carried-Forward / Opening Balance Toggle */}
          <div className={`flex items-center justify-between sm:justify-end gap-3 px-3.5 py-2 rounded-2xl border transition-colors ${
            includeCarriedForward
              ? 'bg-amber-50/70 border-amber-200'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="text-right">
              <span className="block text-xs font-bold text-slate-800">
                اعمال مانده منقول از قبل (افتتاحیه)
              </span>
              <span className="block text-[10px] text-slate-500">
                {includeCarriedForward
                  ? 'افتتاحیه و گردش قبل از بازه در مانده لحاظ می‌شود'
                  : 'محاسبه فقط بر اساس گردش همین بازه (شروع مانده از صفر)'}
              </span>
            </div>
            <AppleSwitch
              checked={includeCarriedForward}
              onChange={setIncludeCarriedForward}
            />
          </div>
        </div>
      </div>

      {/* Transactions Ledger Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden" ref={printAreaRef}>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3.5 px-3 sm:px-4 w-12 text-center">ردیف</th>
                <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap">تاریخ و زمان</th>
                <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap">شماره سند</th>
                <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap">حساب / صندوق</th>
                <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap">سرفصل</th>
                <th className="py-3.5 px-3 sm:px-4 min-w-[210px]">شرح سند</th>
                <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap text-left text-rose-600">بدهکار (برداشت)</th>
                <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap text-left text-emerald-600">بستانکار (واریز)</th>
                <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap text-left">مانده حساب</th>
                <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap">کد پیگیری</th>
                <th className="py-3.5 px-3 sm:px-4 w-24 text-center print:hidden">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Row 0 at top when ascending (standard official bank statement) */}
              {includeCarriedForward && sortOrder === 'asc' && renderCarriedForwardRow()}

              {ledger.rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400">
                    {includeCarriedForward
                      ? 'در بازه زمانی انتخابی تراکنش جدیدی ثبت نشده است؛ مانده افتتاحیه / منقول از قبل در ردیف بالا نمایش داده شده است.'
                      : 'هیچ تراکنشی مطابق با فیلترهای انتخابی یافت نشد.'}
                  </td>
                </tr>
              ) : (
                ledger.rows.map((row, idx) => {
                  const { tx, isCredit, isDebit, isInternalTransfer, debitAmount, creditAmount, runningBalance, accountLabel } = row;
                  const rowNum = sortOrder === 'asc' ? idx + 1 : ledger.rows.length - idx;

                  return (
                    <tr key={tx.id || idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3 sm:px-4 text-center text-slate-400 font-mono">{rowNum}</td>
                      <td className="py-3 px-3 sm:px-4 whitespace-nowrap font-mono text-slate-600 text-[11px]" dir="ltr">
                        {format(new Date(tx.date), 'yyyy/MM/dd HH:mm')}
                      </td>
                      <td className="py-3 px-3 sm:px-4 whitespace-nowrap font-mono font-bold text-slate-700">
                        {tx.transactionNumber}
                      </td>
                      <td className="py-3 px-3 sm:px-4 whitespace-nowrap font-medium text-slate-800">
                        {accountLabel}
                      </td>
                      <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-bold">
                          {tx.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:px-4 text-slate-700 font-medium leading-relaxed">
                        {tx.description}
                        {isInternalTransfer && (
                          <span className="mr-1.5 inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                            جابه‌جایی داخلی ({formatCurrency(tx.amount)})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 sm:px-4 whitespace-nowrap text-left font-mono font-bold text-rose-600">
                        {isDebit && debitAmount > 0 ? formatCurrency(debitAmount) : '-'}
                      </td>
                      <td className="py-3 px-3 sm:px-4 whitespace-nowrap text-left font-mono font-bold text-emerald-600">
                        {isCredit && creditAmount > 0 ? formatCurrency(creditAmount) : '-'}
                      </td>
                      <td
                        className={`py-3 px-3 sm:px-4 whitespace-nowrap text-left font-mono font-bold ${
                          runningBalance >= 0 ? 'text-slate-800' : 'text-rose-600'
                        }`}
                      >
                        {formatCurrency(runningBalance)}
                      </td>
                      <td className="py-3 px-3 sm:px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                        {tx.trackingCode || '-'}
                      </td>
                      <td className="py-3 px-3 sm:px-4 text-center print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditTx(tx)}
                              title="ویرایش تراکنش مالی"
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
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

              {/* Row 0 at bottom when descending (newest first) */}
              {includeCarriedForward && sortOrder === 'desc' && renderCarriedForwardRow()}
            </tbody>

            {/* Official Ledger Summary Footer */}
            <tfoot>
              <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-black text-slate-900">
                <td colSpan={6} className="py-3.5 px-4 text-xs">
                  جمع گردش دوره ({activeDateRangeLabel}) —{' '}
                  <span className="text-slate-600 font-bold">
                    {includeCarriedForward ? 'با احتساب مانده منقول از قبل' : 'بدون مانده منقول از قبل'}
                  </span>
                </td>
                <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap text-left font-mono text-rose-700">
                  {formatCurrency(ledger.totalWithdrawals)}
                </td>
                <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap text-left font-mono text-emerald-700">
                  {formatCurrency(ledger.totalDeposits)}
                </td>
                <td
                  className={`py-3.5 px-3 sm:px-4 whitespace-nowrap text-left font-mono ${
                    ledger.closingBalance >= 0 ? 'text-indigo-700' : 'text-rose-700'
                  }`}
                >
                  {formatCurrency(ledger.closingBalance)}
                </td>
                <td colSpan={2} className="py-3.5 px-3 sm:px-4 text-center text-[11px] font-bold text-slate-500">
                  مانده پایان دوره
                </td>
              </tr>
            </tfoot>
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
                type="button"
                onClick={() => setEditingTx(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
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
                <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ تراکنش ({getCurrencyLabel()}) *</label>
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
