import React, { useState, useMemo } from 'react';
import { db, Cheque, BankAccount } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileText, Plus, Search, Filter, AlertTriangle, CheckCircle2,
  Clock, XCircle, ArrowUpRight, ArrowDownRight, Edit2, Trash2,
  Building2, Calendar, CornerUpLeft, Eye
} from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import { format, differenceInDays } from 'date-fns-jalali';
import { useAuth } from '../../context/AuthContext';
import { updateChequeStatus } from '../../lib/accountingServices';
import { triggerServerDbSync } from '../../lib/serverSync';
import ChequeModal from './ChequeModal';

export default function ChequesTab() {
  const { can } = useAuth();
  const cheques = useLiveQuery(() => db.cheques.orderBy('dueDate').toArray()) || [];
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];

  const [activeType, setActiveType] = useState<'received' | 'paid'>('received');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isChequeModalOpen, setIsChequeModalOpen] = useState(false);
  const [editingCheque, setEditingCheque] = useState<Cheque | null>(null);

  // Quick Action modal for clearing cheque
  const [clearingCheque, setClearingCheque] = useState<Cheque | null>(null);
  const [clearTargetBankId, setClearTargetBankId] = useState<number | undefined>(undefined);
  const [isClearingSubmitting, setIsClearingSubmitting] = useState(false);

  // Filter cheques
  const filteredCheques = useMemo(() => {
    return cheques.filter(ch => {
      if (ch.type !== activeType) return false;
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
  }, [cheques, activeType, statusFilter, searchQuery]);

  // KPIs
  const { totalPending, countPending, totalCleared, countCleared, dueSoonCheques } = useMemo(() => {
    const typeCheques = cheques.filter(c => c.type === activeType);
    const now = new Date();

    const pending = typeCheques.filter(c => c.status === 'pending');
    const cleared = typeCheques.filter(c => c.status === 'cleared');

    // Due within 5 days or overdue
    const dueSoon = pending.filter(c => {
      const diff = differenceInDays(new Date(c.dueDate), now);
      return diff <= 5;
    });

    return {
      totalPending: pending.reduce((sum, c) => sum + (c.amount || 0), 0),
      countPending: pending.length,
      totalCleared: cleared.reduce((sum, c) => sum + (c.amount || 0), 0),
      countCleared: cleared.length,
      dueSoonCheques: dueSoon,
    };
  }, [cheques, activeType]);

  const handleDeleteCheque = async (id: number, num: string) => {
    if (!confirm(`آیا از حذف چک شماره "${num}" اطمینان دارید؟`)) return;
    await db.cheques.delete(id);
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

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Toggle between Received & Paid */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 mb-2">نوع چک‌های انتخابی</div>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                onClick={() => setActiveType('received')}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeType === 'received'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                چک‌های دریافتی (فروش)
              </button>
              <button
                onClick={() => setActiveType('paid')}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeType === 'paid'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                چک‌های پرداختی (خرید)
              </button>
            </div>
          </div>

          {can('cheques_manage') && (
            <button
              onClick={() => { setEditingCheque(null); setIsChequeModalOpen(true); }}
              className="mt-4 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              <Plus size={15} />
              <span>{activeType === 'received' ? 'ثبت چک دریافتی جدید' : 'ثبت چک پرداختی جدید'}</span>
            </button>
          )}
        </div>

        {/* Pending KPI */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-amber-600 text-xs font-bold mb-1">
            <Clock size={16} />
            <span>چک‌های در جریان وصول ({countPending} فقره)</span>
          </div>
          <div className="text-xl font-bold font-mono text-amber-600">
            {formatCurrency(totalPending)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {activeType === 'received' 
              ? 'چک‌های نزد صندوق در انتظار رسیدن تاریخ سررسید'
              : 'چک‌های صادره نزد تأمین‌کنندگان در انتظار وصول از بانک'}
          </p>
        </div>

        {/* Cleared KPI */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold mb-1">
            <CheckCircle2 size={16} />
            <span>چک‌های پاس / وصول شده ({countCleared} فقره)</span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600">
            {formatCurrency(totalCleared)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            چک‌هایی که وجه آن‌ها با موفقیت به حساب بانکی واریز یا کسر شده است
          </p>
        </div>
      </div>

      {/* Due Soon Alert */}
      {dueSoonCheques.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-amber-900 mb-1">
              هشدار سررسید چک‌ها ({dueSoonCheques.length} چک سررسید نزدیک یا گذشته)
            </h4>
            <div className="flex flex-wrap gap-2 text-xs">
              {dueSoonCheques.map(c => (
                <span key={c.id} className="bg-white px-2.5 py-1 rounded-xl border border-amber-300 font-medium text-amber-800">
                  چک {c.chequeNumber} ({c.bankName}) - مبلغ: {formatCurrency(c.amount)} - تاریخ: {format(new Date(c.dueDate), 'yyyy/MM/dd')}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter toolbar */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'همه چک‌ها' },
            { id: 'pending', label: 'در جریان وصول' },
            { id: 'cleared', label: 'وصول شده' },
            { id: 'bounced', label: 'برگشتی' },
            { id: 'returned', label: 'عودت داده شده' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === s.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجو بر اساس شماره چک، صیاد یا صادرکننده..."
            className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
          />
          <Search size={14} className="absolute right-2.5 top-2.5 text-slate-400" />
        </div>
      </div>

      {/* Cheques Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3.5 px-4 w-12 text-center">ردیف</th>
                <th className="py-3.5 px-4 whitespace-nowrap">شماره سریال / صیاد</th>
                <th className="py-3.5 px-4 whitespace-nowrap">بانک و شعبه</th>
                <th className="py-3.5 px-4 whitespace-nowrap">تاریخ صدور</th>
                <th className="py-3.5 px-4 whitespace-nowrap">تاریخ سررسید</th>
                <th className="py-3.5 px-4 whitespace-nowrap">{activeType === 'received' ? 'صادرکننده (مشتری)' : 'در وجه (تأمین‌کننده)'}</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-left">مبلغ چک (تومان)</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-center">وضعیت</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-center">عملیات</th>
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
                  } else if (ch.status === 'bounced') {
                    statusBadge = (
                      <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                        برگشت خورده
                      </span>
                    );
                  } else if (ch.status === 'returned') {
                    statusBadge = (
                      <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                        عودت داده شده
                      </span>
                    );
                  }

                  return (
                    <tr key={ch.id || idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-800">{ch.chequeNumber}</div>
                        {ch.sayadNumber && (
                          <div className="font-mono text-[10px] text-slate-400" dir="ltr">{ch.sayadNumber}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{ch.bankName}</div>
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
                            {daysDiff < 0 ? `${Math.abs(daysDiff)} روز گذشته` : daysDiff === 0 ? 'امروز' : `${daysDiff} روز مانده`}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800">
                        {activeType === 'received' ? ch.drawerName : (ch.recipientName || '-')}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-left font-mono font-bold text-slate-800 text-sm">
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
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs"
                              title="وصول چک"
                            >
                              وصول چک
                            </button>
                          )}

                          {ch.status === 'pending' && can('cheques_manage') && (
                            <button
                              onClick={() => handleSimpleStatusChange(ch, 'bounced')}
                              className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                              title="اعلام برگشت چک"
                            >
                              <XCircle size={15} />
                            </button>
                          )}

                          {can('cheques_manage') && (
                            <>
                              <button
                                onClick={() => { setEditingCheque(ch); setIsChequeModalOpen(true); }}
                                className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="ویرایش"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                onClick={() => handleDeleteCheque(ch.id!, ch.chequeNumber)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="حذف"
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

      {/* Cheque Modal */}
      <ChequeModal
        isOpen={isChequeModalOpen}
        onClose={() => setIsChequeModalOpen(false)}
        cheque={editingCheque}
        defaultType={activeType}
      />

      {/* Clear Cheque Modal */}
      {clearingCheque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-800 mb-2">
              وصول چک شماره {clearingCheque.chequeNumber}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              مبلغ {formatCurrency(clearingCheque.amount)} به حساب بانکی مقصد واریز خواهد شد.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {clearingCheque.type === 'received' ? 'حساب بانکی مقصد واریز' : 'حساب بانکی مبدأ کسر وجه'}
              </label>
              <select
                value={clearTargetBankId || ''}
                onChange={e => setClearTargetBankId(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold"
              >
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} ({b.accountHolder}) - موجودی: {formatCurrency(b.balance)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setClearingCheque(null)}
                disabled={isClearingSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                disabled={isClearingSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
              >
                {isClearingSubmitting ? 'در حال وصول...' : 'تأیید وصول و افزایش موجودی'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
