import React, { useState, useMemo } from 'react';
import { db, Cheque, BankAccount, ChequeBook } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileText, Plus, Search, Filter, AlertTriangle, CheckCircle2,
  Clock, XCircle, ArrowUpRight, ArrowDownRight, Edit2, Trash2,
  Building2, Calendar, CornerUpLeft, Eye, BookOpen, Layers,
  Printer, Check, ShieldCheck, AlertCircle, Ban
} from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import { format, differenceInDays } from 'date-fns-jalali';
import { useAuth } from '../../context/AuthContext';
import { updateChequeStatus } from '../../lib/accountingServices';
import { triggerServerDbSync } from '../../lib/serverSync';
import ChequeModal from './ChequeModal';
import ChequeBookModal from './ChequeBookModal';
import TransferChequeModal from './TransferChequeModal';
import BounceChequeModal from './BounceChequeModal';

type MainChequeView = 'received' | 'paid' | 'chequebooks';

export default function ChequesTab() {
  const { can } = useAuth();
  const cheques = useLiveQuery(() => db.cheques.orderBy('dueDate').toArray()) || [];
  const chequeBooks = useLiveQuery(() => db.chequeBooks.toArray()) || [];
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];

  const [activeView, setActiveView] = useState<MainChequeView>('received');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isChequeModalOpen, setIsChequeModalOpen] = useState(false);
  const [editingCheque, setEditingCheque] = useState<Cheque | null>(null);
  const [chequeModalDefaultType, setChequeModalDefaultType] = useState<'received' | 'paid'>('received');
  const [chequeModalDefaultCbId, setChequeModalDefaultCbId] = useState<number | undefined>(undefined);

  const [isChequeBookModalOpen, setIsChequeBookModalOpen] = useState(false);
  const [editingChequeBook, setEditingChequeBook] = useState<ChequeBook | null>(null);

  // Quick Action modal for clearing cheque
  const [clearingCheque, setClearingCheque] = useState<Cheque | null>(null);
  const [clearTargetBankId, setClearTargetBankId] = useState<number | undefined>(undefined);
  const [isClearingSubmitting, setIsClearingSubmitting] = useState(false);

  // Leaves Viewer Modal for a ChequeBook
  const [viewingChequeBook, setViewingChequeBook] = useState<ChequeBook | null>(null);

  // Single Cheque Print Voucher Modal
  const [printingCheque, setPrintingCheque] = useState<Cheque | null>(null);

  // Transfer / Endorse Cheque Modal
  const [transferringCheque, setTransferringCheque] = useState<Cheque | null>(null);

  // Bounce Cheque Modal
  const [bouncingCheque, setBouncingCheque] = useState<Cheque | null>(null);

  // Filter cheques for received or paid
  const filteredCheques = useMemo(() => {
    if (activeView === 'chequebooks') return [];

    return cheques.filter(ch => {
      if (ch.type !== activeView) return false;
      if (statusFilter !== 'all' && ch.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (ch.chequeNumber || '').toLowerCase();
        const sayad = (ch.sayadNumber || '').toLowerCase();
        const bank = (ch.bankName || '').toLowerCase();
        const drawer = (ch.drawerName || '').toLowerCase();
        const rec = (ch.recipientName || '').toLowerCase();
        if (!num.includes(q) && !sayad.includes(q) && !bank.includes(q) && !drawer.includes(q) && !rec.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [cheques, activeView, statusFilter, searchQuery]);

  // KPIs
  const { 
    totalReceivedPending, 
    countReceivedPending, 
    totalPaidPending, 
    countPaidPending,
    totalClearedAll,
    countClearedAll,
    dueSoonCheques,
    totalChequeBooks,
    totalLeavesAll
  } = useMemo(() => {
    const now = new Date();
    const received = cheques.filter(c => c.type === 'received');
    const paid = cheques.filter(c => c.type === 'paid');

    const recPending = received.filter(c => c.status === 'pending');
    const paidPending = paid.filter(c => c.status === 'pending');
    const allCleared = cheques.filter(c => c.status === 'cleared');

    // Due within 5 days or overdue
    const dueSoon = [...recPending, ...paidPending].filter(c => {
      const diff = differenceInDays(new Date(c.dueDate), now);
      return diff <= 5;
    });

    const totalLeaves = chequeBooks.reduce((sum, cb) => sum + (cb.totalLeaves || 0), 0);

    return {
      totalReceivedPending: recPending.reduce((sum, c) => sum + (c.amount || 0), 0),
      countReceivedPending: recPending.length,
      totalPaidPending: paidPending.reduce((sum, c) => sum + (c.amount || 0), 0),
      countPaidPending: paidPending.length,
      totalClearedAll: allCleared.reduce((sum, c) => sum + (c.amount || 0), 0),
      countClearedAll: allCleared.length,
      dueSoonCheques: dueSoon,
      totalChequeBooks: chequeBooks.length,
      totalLeavesAll: totalLeaves
    };
  }, [cheques, chequeBooks]);

  const handleDeleteCheque = async (id: number, num: string) => {
    if (!confirm(`آیا از حذف چک شماره "${num}" اطمینان دارید؟`)) return;
    await db.cheques.delete(id);
    triggerServerDbSync(100);
  };

  const handleDeleteChequeBook = async (id: number, title: string) => {
    const hasIssuedCheques = cheques.some(c => c.chequeBookId === id);
    if (hasIssuedCheques) {
      if (!confirm(`برای دسته چک "${title}" چک‌هایی صادر شده است. آیا از حذف قطعی این دسته چک اطمینان دارید؟`)) return;
    } else {
      if (!confirm(`آیا از حذف دسته چک "${title}" اطمینان دارید؟`)) return;
    }
    await db.chequeBooks.delete(id);
    triggerServerDbSync(100);
  };

  const handleOpenClearModal = (ch: Cheque) => {
    setClearingCheque(ch);
    setClearTargetBankId(ch.bankAccountId || bankAccounts[0]?.id);
  };

  const handleConfirmClear = async () => {
    if (!clearingCheque?.id) return;
    try {
      setIsClearingSubmitting(true);
      await updateChequeStatus(clearingCheque.id, 'cleared', clearTargetBankId);
      setClearingCheque(null);
    } catch (err: any) {
      alert(err?.message || 'خطا در ثبت وصول چک.');
    } finally {
      setIsClearingSubmitting(false);
    }
  };

  const handleSimpleStatusChange = async (ch: Cheque, newStatus: Cheque['status']) => {
    if (!ch.id) return;
    try {
      await updateChequeStatus(ch.id, newStatus);
    } catch (err: any) {
      alert(err?.message || 'خطا در تغییر وضعیت چک.');
    }
  };

  // Helper for ChequeBook stats
  const getChequeBookStats = (cb: ChequeBook) => {
    const issuedList = cheques.filter(c => c.chequeBookId === cb.id || (c.type === 'paid' && c.bankName === cb.bankName && c.chequeNumber && Number(c.chequeNumber) >= cb.startSerial && Number(c.chequeNumber) <= cb.endSerial));
    const issuedCount = issuedList.length;
    const clearedCount = issuedList.filter(c => c.status === 'cleared').length;
    const bouncedCount = issuedList.filter(c => c.status === 'bounced').length;
    const remainingLeaves = Math.max(0, cb.totalLeaves - issuedCount);
    const percentUsed = cb.totalLeaves > 0 ? Math.round((issuedCount / cb.totalLeaves) * 100) : 0;

    return { issuedCount, clearedCount, bouncedCount, remainingLeaves, percentUsed, issuedList };
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top 3 Navigation Tabs */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex overflow-x-auto gap-2 p-1 bg-slate-100 rounded-2xl w-full sm:w-auto">
          <button
            onClick={() => { setActiveView('received'); setStatusFilter('all'); }}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeView === 'received'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ArrowDownRight size={16} />
            <span>چک‌های دریافتی از مشتریان (فروش)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeView === 'received' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {cheques.filter(c => c.type === 'received').length}
            </span>
          </button>

          <button
            onClick={() => { setActiveView('paid'); setStatusFilter('all'); }}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeView === 'paid'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ArrowUpRight size={16} />
            <span>چک‌های پرداختی و صادره (خرید/هزینه)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeView === 'paid' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {cheques.filter(c => c.type === 'paid').length}
            </span>
          </button>

          <button
            onClick={() => setActiveView('chequebooks')}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeView === 'chequebooks'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <BookOpen size={16} />
            <span>دفتر دسته‌چک‌ها (Chequebooks)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeView === 'chequebooks' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {chequeBooks.length}
            </span>
          </button>
        </div>

        {/* Quick Add Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {can('cheques_manage') && (
            <>
              {activeView === 'chequebooks' ? (
                <button
                  onClick={() => { setEditingChequeBook(null); setIsChequeBookModalOpen(true); }}
                  className="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-amber-600/20 cursor-pointer active:scale-95"
                >
                  <Plus size={16} />
                  <span>تعریف دسته‌چک جدید</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setEditingCheque(null);
                    setChequeModalDefaultType(activeView === 'paid' ? 'paid' : 'received');
                    setChequeModalDefaultCbId(undefined);
                    setIsChequeModalOpen(true);
                  }}
                  className="py-2.5 px-4 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95"
                >
                  <Plus size={16} />
                  <span>{activeView === 'received' ? 'ثبت چک دریافتی جدید' : 'صدور چک پرداختی جدید'}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Received Pending */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">چک‌های دریافتی نزد صندوق</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-amber-600">
            {formatCurrency(totalReceivedPending)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>در انتظار سررسید و وصول</span>
            <span className="font-bold font-mono bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg">
              {countReceivedPending} فقره
            </span>
          </div>
        </div>

        {/* KPI 2: Paid Pending */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">تعهدات چک‌های پرداختی</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-blue-600">
            {formatCurrency(totalPaidPending)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>صادره در دست طرف‌حساب‌ها</span>
            <span className="font-bold font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">
              {countPaidPending} فقره
            </span>
          </div>
        </div>

        {/* KPI 3: Cleared All */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">مجموع چک‌های وصول شده</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600">
            {formatCurrency(totalClearedAll)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>واریز/کسر قطعی از بانک</span>
            <span className="font-bold font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg">
              {countClearedAll} فقره
            </span>
          </div>
        </div>

        {/* KPI 4: Chequebooks & Leaves */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">دفتر دسته‌چک‌های بانکی</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <BookOpen size={16} />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-purple-700">
            {totalChequeBooks} <span className="text-xs font-normal text-slate-500">دسته‌چک فعال</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>مجموع برگه‌ها در سیستم:</span>
            <span className="font-bold font-mono bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg">
              {totalLeavesAll} برگ
            </span>
          </div>
        </div>
      </div>

      {/* Due Soon Alert */}
      {dueSoonCheques.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-amber-900 mb-1">
              هشدار سررسید چک‌های نزدیک ({dueSoonCheques.length} فقره چک تا ۵ روز آینده یا معوق)
            </h4>
            <div className="flex flex-wrap gap-2 text-xs">
              {dueSoonCheques.map(c => (
                <span key={c.id} className="bg-white px-3 py-1 rounded-xl border border-amber-300 font-medium text-amber-900 flex items-center gap-2 shadow-2xs">
                  <span className="font-bold font-mono">چک #{c.chequeNumber}</span>
                  <span className="text-slate-500">({c.bankName})</span>
                  <span className="font-bold font-mono text-amber-700">{formatCurrency(c.amount)}</span>
                  <span className="text-[10px] text-slate-400 font-mono" dir="ltr">{format(new Date(c.dueDate), 'yyyy/MM/dd')}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================== VIEW 1 & 2: CHEQUES TABLE (RECEIVED / PAID) ===================== */}
      {activeView !== 'chequebooks' && (
        <div className="space-y-4">
          {/* Filters & Search Toolbar */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            {/* Status filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'همه وضعیت‌ها' },
                { id: 'pending', label: '⏳ در جریان وصول' },
                { id: 'cleared', label: '✅ وصول شده' },
                { id: 'transferred', label: '↗️ واگذار شده (خرج شده)' },
                { id: 'bounced', label: '❌ برگشت خورده' },
                { id: 'returned', label: '↩️ عودت داده شده' },
                { id: 'cancelled', label: '🚫 باطل شده' },
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setStatusFilter(s.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === s.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="جستجو در شماره چک، صیاد، بانک یا شخص..."
                className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
              />
              <Search size={14} className="absolute right-2.5 top-2.5 text-slate-400" />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3.5 px-4 w-12 text-center">ردیف</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">شماره سریال / صیادی</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">بانک صادرکننده و شعبه</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">تاریخ صدور</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">تاریخ سررسید</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">
                      {activeView === 'received' ? 'صادرکننده (مشتری)' : 'در وجه (تأمین‌کننده)'}
                    </th>
                    <th className="py-3.5 px-4 whitespace-nowrap text-left">مبلغ چک (تومان)</th>
                    <th className="py-3.5 px-4 whitespace-nowrap text-center">وضعیت</th>
                    <th className="py-3.5 px-4 whitespace-nowrap text-center">عملیات حسابداری</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCheques.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        هیچ چکی در این دسته‌بندی یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    filteredCheques.map((ch, idx) => {
                      const now = new Date();
                      const dueDate = new Date(ch.dueDate);
                      const daysDiff = differenceInDays(dueDate, now);

                      let statusBadge = (
                        <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                          در جریان وصول
                        </span>
                      );
                      if (ch.status === 'cleared') {
                        statusBadge = (
                          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                            وصول شده
                          </span>
                        );
                      } else if (ch.status === 'transferred') {
                        statusBadge = (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-xl text-[10px] font-bold">
                              واگذار شده (خرج شده)
                            </span>
                            {ch.transferredTo && (
                              <span className="text-[10px] text-indigo-600 font-medium">به: {ch.transferredTo}</span>
                            )}
                          </div>
                        );
                      } else if (ch.status === 'bounced') {
                        statusBadge = (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-xl text-[10px] font-bold">
                              برگشت خورده
                            </span>
                            {ch.bounceReason && (
                              <span className="text-[10px] text-rose-600 font-medium max-w-[130px] truncate" title={ch.bounceReason}>
                                {ch.bounceReason}
                              </span>
                            )}
                          </div>
                        );
                      } else if (ch.status === 'returned') {
                        statusBadge = (
                          <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                            عودت داده شده
                          </span>
                        );
                      } else if (ch.status === 'cancelled') {
                        statusBadge = (
                          <span className="bg-neutral-200 text-neutral-600 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                            باطل شده
                          </span>
                        );
                      }

                      return (
                        <tr key={ch.id || idx} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 text-center text-slate-400 font-mono">{idx + 1}</td>
                          
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-800 text-sm">
                              {ch.chequeNumber}
                            </div>
                            {ch.sayadNumber && (
                              <div className="font-mono text-[10px] text-slate-400 font-bold" dir="ltr">
                                صیاد: {ch.sayadNumber}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-800">{ch.bankName}</div>
                            {ch.branch && <div className="text-[10px] text-slate-400">{ch.branch}</div>}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600" dir="ltr">
                            {format(new Date(ch.issueDate), 'yyyy/MM/dd')}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono text-[11px] font-bold text-slate-800" dir="ltr">
                              {format(dueDate, 'yyyy/MM/dd')}
                            </div>
                            {ch.status === 'pending' && (
                              <div className={`text-[10px] font-bold ${daysDiff < 0 ? 'text-rose-600' : daysDiff <= 3 ? 'text-amber-600' : 'text-slate-400'}`}>
                                {daysDiff < 0 ? `${Math.abs(daysDiff)} روز گذشته` : daysDiff === 0 ? 'امروز سررسید' : `${daysDiff} روز مانده`}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-800">
                              {activeView === 'received' ? ch.drawerName : (ch.recipientName || 'تأمین‌کننده')}
                            </div>
                            {ch.nationalCode && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                کد ملی: {ch.nationalCode}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-left font-mono font-bold text-slate-900 text-sm">
                            {formatCurrency(ch.amount)}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-center">
                            {statusBadge}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {ch.status === 'pending' && can('cheques_manage') && (
                                <button
                                  onClick={() => handleOpenClearModal(ch)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs cursor-pointer"
                                  title="وصول چک و واریز/کسر از حساب"
                                >
                                  {ch.type === 'received' ? 'وصول به بانک' : 'پاس شدن'}
                                </button>
                              )}

                              {/* خرج کردن چک دریافتی */}
                              {ch.type === 'received' && ch.status === 'pending' && can('cheques_manage') && (
                                <button
                                  onClick={() => setTransferringCheque(ch)}
                                  className="px-2.5 py-1 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-700 hover:to-indigo-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
                                  title="خرج کردن و واگذاری چک دریافتی به تأمین‌کننده یا شخص ثالث"
                                >
                                  <ArrowUpRight size={13} />
                                  <span>خرج چک</span>
                                </button>
                              )}

                              {/* اعلام برگشت چک */}
                              {(ch.status === 'pending' || ch.status === 'cleared') && can('cheques_manage') && (
                                <button
                                  onClick={() => setBouncingCheque(ch)}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="اعلام برگشت چک صیادی و ثبت گواهی عدم پرداخت"
                                >
                                  <XCircle size={15} />
                                </button>
                              )}

                              <button
                                onClick={() => setPrintingCheque(ch)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="چاپ رسید / برگه سند چک"
                              >
                                <Printer size={15} />
                              </button>

                              {can('cheques_manage') && (
                                <>
                                  <button
                                    onClick={() => { setEditingCheque(ch); setIsChequeModalOpen(true); }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                    title="ویرایش مشخصات چک"
                                  >
                                    <Edit2 size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCheque(ch.id!, ch.chequeNumber)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="حذف چک"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </>
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
        </div>
      )}

      {/* ===================== VIEW 3: CHEQUEBOOKS DIRECTORY ===================== */}
      {activeView === 'chequebooks' && (
        <div className="space-y-6">
          {chequeBooks.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
              <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                <BookOpen size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">هنوز دسته‌چکی تعریف نشده است</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
                برای مدیریت و صدور سیستماتیک چک‌های شرکت یا فروشگاه به تفکیک بانک و سریال برگه‌ها، اولین دسته چک را ثبت نمایید.
              </p>
              <button
                onClick={() => { setEditingChequeBook(null); setIsChequeBookModalOpen(true); }}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-amber-600/20 cursor-pointer"
              >
                تعریف اولین دسته چک
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {chequeBooks.map(cb => {
                const stats = getChequeBookStats(cb);
                return (
                  <div
                    key={cb.id}
                    className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                            <BookOpen size={22} />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{cb.title}</h4>
                            <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <Building2 size={13} className="text-slate-400" />
                              <span>{cb.bankName}</span>
                              {cb.accountNumber && (
                                <span className="font-mono text-[11px] text-slate-400" dir="ltr">
                                  ({cb.accountNumber})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          cb.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {cb.isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                      </div>

                      {/* Leaves Range & Series */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-2 mb-4 text-xs">
                        <div className="flex justify-between items-center text-slate-600">
                          <span>سری دسته چک:</span>
                          <span className="font-bold text-slate-800 font-mono">{cb.series}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>محدوده شماره برگه‌ها:</span>
                          <span className="font-mono font-bold text-amber-700" dir="ltr">
                            #{cb.startSerial} ... #{cb.endSerial}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>کل برگه‌ها:</span>
                          <span className="font-bold text-slate-800">{cb.totalLeaves} برگ</span>
                        </div>
                      </div>

                      {/* Usage Progress Bar */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-600">مصرف شده: {stats.issuedCount} برگ</span>
                          <span className="text-emerald-600">باقی‌مانده سفید: {stats.remainingLeaves} برگ</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                            style={{ width: `${stats.percentUsed}%` }}
                          />
                        </div>
                      </div>

                      {/* Leaves Status Counter */}
                      <div className="grid grid-cols-3 gap-2 text-center text-[11px] mb-4">
                        <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
                          <div className="font-bold text-emerald-700 font-mono text-sm">{stats.clearedCount}</div>
                          <div className="text-emerald-600">پاس شده</div>
                        </div>
                        <div className="p-2 bg-amber-50 rounded-xl border border-amber-100">
                          <div className="font-bold text-amber-700 font-mono text-sm">{stats.issuedCount - stats.clearedCount - stats.bouncedCount}</div>
                          <div className="text-amber-600">در جریان</div>
                        </div>
                        <div className="p-2 bg-rose-50 rounded-xl border border-rose-100">
                          <div className="font-bold text-rose-700 font-mono text-sm">{stats.bouncedCount}</div>
                          <div className="text-rose-600">برگشتی</div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2 pt-3 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setChequeModalDefaultType('paid');
                            setChequeModalDefaultCbId(cb.id);
                            setEditingCheque(null);
                            setIsChequeModalOpen(true);
                          }}
                          className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                        >
                          <Plus size={14} />
                          <span>صدور چک</span>
                        </button>
                        <button
                          onClick={() => setViewingChequeBook(cb)}
                          className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Eye size={14} />
                          <span>مشاهده برگه‌ها</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 text-slate-400">
                        <button
                          onClick={() => { setEditingChequeBook(cb); setIsChequeBookModalOpen(true); }}
                          className="text-xs hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Edit2 size={13} />
                          <span>ویرایش</span>
                        </button>
                        <span>•</span>
                        <button
                          onClick={() => handleDeleteChequeBook(cb.id!, cb.title)}
                          className="text-xs hover:text-rose-600 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Cheque Modal */}
      <ChequeModal
        isOpen={isChequeModalOpen}
        onClose={() => setIsChequeModalOpen(false)}
        cheque={editingCheque}
        defaultType={chequeModalDefaultType}
        defaultChequeBookId={chequeModalDefaultCbId}
      />

      {/* ChequeBook Modal */}
      <ChequeBookModal
        isOpen={isChequeBookModalOpen}
        onClose={() => setIsChequeBookModalOpen(false)}
        editingChequeBook={editingChequeBook}
      />

      {/* Clear Cheque Modal */}
      {clearingCheque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-800 mb-2">
              {clearingCheque.type === 'received' ? 'وصول چک دریافتی به حساب بانک' : 'پاس شدن و کسر چک از حساب بانک'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              مبلغ <span className="font-bold text-slate-800 font-mono">{formatCurrency(clearingCheque.amount)}</span> به شماره چک <span className="font-bold text-slate-800">{clearingCheque.chequeNumber}</span>
            </p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {clearingCheque.type === 'received' ? 'حساب بانکی مقصد واریز وجه:' : 'حساب بانکی مبدأ کسر وجه چک:'}
              </label>
              <select
                value={clearTargetBankId || ''}
                onChange={e => setClearTargetBankId(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} ({b.accountHolder}) - موجودی فعلی: {formatCurrency(b.balance)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setClearingCheque(null)}
                disabled={isClearingSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                disabled={isClearingSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                {isClearingSubmitting ? 'در حال ثبت...' : 'تأیید وصول و ثبت سند حسابداری'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ChequeBook Leaves Viewer Modal */}
      {viewingChequeBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setViewingChequeBook(null)}
              className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <XCircle size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <BookOpen size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{viewingChequeBook.title}</h3>
                <p className="text-xs text-slate-500">
                  {viewingChequeBook.bankName} - سری: {viewingChequeBook.series} (برگ #{viewingChequeBook.startSerial} تا #{viewingChequeBook.endSerial})
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 sticky top-0 text-slate-600 font-bold">
                  <tr>
                    <th className="py-2.5 px-3 text-center">شماره برگ</th>
                    <th className="py-2.5 px-3">وضعیت برگه</th>
                    <th className="py-2.5 px-3">در وجه / ذینفع</th>
                    <th className="py-2.5 px-3 text-left">مبلغ (تومان)</th>
                    <th className="py-2.5 px-3 text-center">تاریخ سررسید</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: viewingChequeBook.totalLeaves }, (_, i) => {
                    const leafSerial = viewingChequeBook.startSerial + i;
                    const issued = cheques.find(c => (c.chequeBookId === viewingChequeBook.id || c.bankName === viewingChequeBook.bankName) && Number(c.chequeNumber) === leafSerial);

                    let statusText = <span className="text-slate-400 font-medium">سفید (آماده صدور)</span>;
                    if (issued) {
                      if (issued.status === 'cleared') {
                        statusText = <span className="text-emerald-600 font-bold">✅ پاس شده</span>;
                      } else if (issued.status === 'bounced') {
                        statusText = <span className="text-rose-600 font-bold">❌ برگشتی</span>;
                      } else if (issued.status === 'cancelled') {
                        statusText = <span className="text-neutral-500 font-bold">🚫 باطل شده</span>;
                      } else {
                        statusText = <span className="text-amber-600 font-bold">⏳ صادر شده (در جریان)</span>;
                      }
                    }

                    return (
                      <tr key={leafSerial} className={issued ? 'bg-amber-50/30' : ''}>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">
                          #{leafSerial}
                        </td>
                        <td className="py-2 px-3">{statusText}</td>
                        <td className="py-2 px-3 font-medium text-slate-700">
                          {issued?.recipientName || '-'}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-slate-800">
                          {issued ? formatCurrency(issued.amount) : '-'}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-500" dir="ltr">
                          {issued ? format(new Date(issued.dueDate), 'yyyy/MM/dd') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewingChequeBook(null)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cheque Voucher Print Modal */}
      {printingCheque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200">
              <div className="flex items-center gap-2">
                <FileText className="text-amber-600" size={20} />
                <h3 className="font-bold text-slate-800 text-sm">رسید و سند رسمی چک صیادی</h3>
              </div>
              <button onClick={() => setPrintingCheque(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <XCircle size={18} />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-3 font-medium">
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">نوع چک:</span>
                <span className="font-bold text-slate-800">{printingCheque.type === 'received' ? 'چک صیادی دریافتی' : 'چک صیادی صادره/پرداختی'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">شماره سریال چک:</span>
                <span className="font-mono font-bold text-slate-900">{printingCheque.chequeNumber}</span>
              </div>
              {printingCheque.sayadNumber && (
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500">شناسه ۱۶ رقمی صیاد:</span>
                  <span className="font-mono font-bold text-amber-700" dir="ltr">{printingCheque.sayadNumber}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">بانک و شعبه:</span>
                <span className="font-bold text-slate-800">{printingCheque.bankName} {printingCheque.branch ? `(${printingCheque.branch})` : ''}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">مبلغ چک:</span>
                <span className="font-mono font-bold text-base text-emerald-600">{formatCurrency(printingCheque.amount)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">مبلغ به حروف:</span>
                <span className="font-bold text-slate-800">{numberToPersianWords(printingCheque.amount)} تومان</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">تاریخ سررسید:</span>
                <span className="font-mono font-bold text-slate-800" dir="ltr">{format(new Date(printingCheque.dueDate), 'yyyy/MM/dd')}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">صادرکننده / صاحب حساب:</span>
                <span className="font-bold text-slate-800">{printingCheque.drawerName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">در وجه / ذینفع:</span>
                <span className="font-bold text-slate-800">{printingCheque.recipientName || 'فروشگاه من'}</span>
              </div>
              {printingCheque.notes && (
                <div className="flex justify-between">
                  <span className="text-slate-500">بابت / توضیحات:</span>
                  <span className="text-slate-700">{printingCheque.notes}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPrintingCheque(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                بستن
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Printer size={15} />
                <span>چاپ رسید</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Cheque Modal */}
      <TransferChequeModal
        isOpen={!!transferringCheque}
        onClose={() => setTransferringCheque(null)}
        cheque={transferringCheque}
      />

      {/* Bounce Cheque Modal */}
      <BounceChequeModal
        isOpen={!!bouncingCheque}
        onClose={() => setBouncingCheque(null)}
        cheque={bouncingCheque}
      />
    </div>
  );
}
