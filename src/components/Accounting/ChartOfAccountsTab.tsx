import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ChartOfAccount, AccountLevel, AccountNature } from '../../lib/db';
import { 
  addAccount, updateAccount, deleteAccount, getChartOfAccountsWithBalances 
} from '../../lib/accountingJournalService';
import { 
  Layers, Plus, Search, Edit2, Trash2, Check, X, 
  Folder, FolderOpen, FileText, ChevronRight, ChevronDown, 
  AlertCircle, ShieldCheck, Tag, Info
} from 'lucide-react';

export default function ChartOfAccountsTab() {
  const accounts = useLiveQuery(() => db.chartOfAccounts.toArray(), []) || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | AccountLevel>('all');
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set(['1', '2', '3', '4', '5', '6', '7', '8']));

  // Modal State for Add / Edit Account
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);

  // Form Fields
  const [formLevel, setFormLevel] = useState<AccountLevel>('subsidiary');
  const [formParentCode, setFormParentCode] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formNature, setFormNature] = useState<AccountNature>('debtor');
  const [formDescription, setFormDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toggle tree expansion
  const toggleExpand = (code: string) => {
    setExpandedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Open modal for new account
  const handleOpenAddModal = (parent?: ChartOfAccount) => {
    setEditingAccount(null);
    setErrorMessage(null);

    if (parent) {
      setFormParentCode(parent.code);
      if (parent.level === 'group') {
        setFormLevel('ledger');
        setFormCode(`${parent.code}0`);
      } else if (parent.level === 'ledger') {
        setFormLevel('subsidiary');
        setFormCode(`${parent.code}01`);
      } else {
        setFormLevel('detail');
        setFormCode(`${parent.code}01`);
      }
      setFormNature(parent.nature);
    } else {
      setFormParentCode('');
      setFormLevel('subsidiary');
      setFormCode('');
      setFormNature('debtor');
    }

    setFormName('');
    setFormDescription('');
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEditModal = (acc: ChartOfAccount) => {
    setEditingAccount(acc);
    setErrorMessage(null);
    setFormLevel(acc.level);
    setFormParentCode(acc.parentCode || '');
    setFormCode(acc.code);
    setFormName(acc.name);
    setFormNature(acc.nature);
    setFormDescription(acc.description || '');
    setIsModalOpen(true);
  };

  // Submit Add / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formCode.trim()) {
      setErrorMessage('لطفاً کد حساب را وارد نمایید.');
      return;
    }
    if (!formName.trim()) {
      setErrorMessage('لطفاً نام حساب را وارد نمایید.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingAccount && editingAccount.id) {
        await updateAccount(editingAccount.id, {
          name: formName.trim(),
          nature: formNature,
          description: formDescription.trim() || undefined
        });
      } else {
        await addAccount({
          code: formCode.trim(),
          name: formName.trim(),
          level: formLevel,
          parentCode: formParentCode.trim() || undefined,
          nature: formNature,
          description: formDescription.trim() || undefined
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'خطا در ذخیره‌سازی حساب');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Account
  const handleDelete = async (acc: ChartOfAccount) => {
    if (!acc.id) return;
    if (!window.confirm(`آیا از حذف حساب «${acc.name}» (کد ${acc.code}) اطمینان دارید؟`)) {
      return;
    }

    try {
      await deleteAccount(acc.id);
    } catch (err: any) {
      alert(err.message || 'امکان حذف این حساب وجود ندارد.');
    }
  };

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (levelFilter !== 'all' && acc.level !== levelFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const codeMatch = acc.code.toLowerCase().includes(q);
        const nameMatch = acc.name.toLowerCase().includes(q);
        if (!codeMatch && !nameMatch) return false;
      }
      return true;
    });
  }, [accounts, levelFilter, searchQuery]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Layers size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">کدینگ استاندارد ۴ سطحی حساب‌ها (Chart of Accounts)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              مدیریت ساختار درختی گروه، کل، معین و تفصیلی با اتصال هوشمند به اسناد حسابداری
            </p>
          </div>
        </div>

        <button
          onClick={() => handleOpenAddModal()}
          className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
        >
          <Plus size={16} />
          <span>تعریف سرفصل حساب جدید</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجوی نام یا کد حساب..."
            className="w-full pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all"
          />
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
          {[
            { id: 'all', label: 'همه سطوح' },
            { id: 'group', label: 'گروه‌ها' },
            { id: 'ledger', label: 'حساب‌های کل' },
            { id: 'subsidiary', label: 'حساب‌های معین' },
            { id: 'detail', label: 'حساب‌های تفصیلی' },
          ].map(lvl => (
            <button
              key={lvl.id}
              onClick={() => setLevelFilter(lvl.id as any)}
              className={`py-1.5 px-3 rounded-lg transition-all cursor-pointer ${
                levelFilter === lvl.id ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              {lvl.label}
            </button>
          ))}
        </div>

        {/* Count summary */}
        <span className="text-xs text-slate-400 font-mono">
          {filteredAccounts.length} حساب
        </span>
      </div>

      {/* Accounts List / Hierarchy Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 w-32 font-mono">کد سرفصل</th>
                <th className="py-3.5 px-4 min-w-[240px]">عنوان حساب</th>
                <th className="py-3.5 px-4 w-28 text-center">سطح حساب</th>
                <th className="py-3.5 px-4 w-28 text-center">ماهیت</th>
                <th className="py-3.5 px-4 w-24 text-center">وضعیت</th>
                <th className="py-3.5 px-4 w-36 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    حسابی با این مشخصات یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map(acc => {
                  const isGroup = acc.level === 'group';
                  const isLedger = acc.level === 'ledger';
                  const isSub = acc.level === 'subsidiary';

                  const indentClass = isGroup 
                    ? 'font-black text-slate-900 text-sm' 
                    : isLedger 
                    ? 'pr-6 font-bold text-slate-800' 
                    : isSub 
                    ? 'pr-12 text-slate-700 font-semibold' 
                    : 'pr-18 text-slate-600';

                  const natureBadge = (
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      acc.nature === 'debtor' 
                        ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                        : acc.nature === 'creditor' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}>
                      {acc.nature === 'debtor' ? 'بدهکار' : acc.nature === 'creditor' ? 'بستانکار' : 'دوگانه'}
                    </span>
                  );

                  const levelLabel = 
                    acc.level === 'group' ? 'گروه (۱)' : 
                    acc.level === 'ledger' ? 'کل (۲)' : 
                    acc.level === 'subsidiary' ? 'معین (۴)' : 'تفصیلی (۶)';

                  return (
                    <tr 
                      key={acc.code} 
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isGroup ? 'bg-slate-50/40 border-t border-slate-200' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {acc.code}
                      </td>

                      <td className={`py-3 px-4 flex items-center gap-2 ${indentClass}`}>
                        {isGroup ? (
                          <Folder className="text-amber-500 shrink-0" size={16} />
                        ) : isLedger ? (
                          <FolderOpen className="text-blue-500 shrink-0" size={15} />
                        ) : (
                          <FileText className="text-slate-400 shrink-0" size={14} />
                        )}
                        <span>{acc.name}</span>
                        {acc.description && (
                          <span className="text-[10px] text-slate-400 mr-2 font-normal truncate max-w-[200px]">
                            ({acc.description})
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono font-bold">
                          {levelLabel}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {natureBadge}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                          فعال
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Add child button */}
                          {acc.level !== 'detail' && (
                            <button
                              onClick={() => handleOpenAddModal(acc)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title={`افزودن زیرمجموعه برای ${acc.name}`}
                            >
                              <Plus size={14} />
                            </button>
                          )}

                          {/* Edit button */}
                          <button
                            onClick={() => handleOpenEditModal(acc)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="ویرایش سرفصل"
                          >
                            <Edit2 size={13} />
                          </button>

                          {/* Delete button */}
                          {!acc.isSystem && (
                            <button
                              onClick={() => handleDelete(acc)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف سرفصل"
                            >
                              <Trash2 size={13} />
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

      {/* ===================== ADD / EDIT ACCOUNT MODAL ===================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 overflow-hidden space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Layers size={18} className="text-blue-600" />
                <span>{editingAccount ? 'ویرایش سرفصل حساب' : 'تعریف سرفصل حساب جدید'}</span>
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Level selector (only for new accounts) */}
              {!editingAccount && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سطح حساب:</label>
                  <select
                    value={formLevel}
                    onChange={e => setFormLevel(e.target.value as AccountLevel)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 outline-none"
                  >
                    <option value="group">گروه (۱ رقمی - اصلی)</option>
                    <option value="ledger">کل (۲ رقمی)</option>
                    <option value="subsidiary">معین (۴ رقمی)</option>
                    <option value="detail">تفصیلی (۶ رقمی)</option>
                  </select>
                </div>
              )}

              {/* Parent Account */}
              {!editingAccount && formLevel !== 'group' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">کد سرفصل والد:</label>
                  <input
                    type="text"
                    value={formParentCode}
                    onChange={e => setFormParentCode(e.target.value)}
                    placeholder="مثلاً 1 یا 10 یا 1001"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold text-slate-800 outline-none"
                  />
                </div>
              )}

              {/* Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">کد حساب (یکتا):</label>
                <input
                  type="text"
                  disabled={!!editingAccount}
                  value={formCode}
                  onChange={e => setFormCode(e.target.value)}
                  placeholder="مثلاً 1004"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 text-xs font-mono font-bold text-slate-800 outline-none"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان حساب:</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="مثلاً بانک تجارت شعبه مرکزی"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 outline-none"
                />
              </div>

              {/* Nature */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ماهیت حساب:</label>
                <div className="flex gap-2">
                  {[
                    { id: 'debtor', label: 'بدهکار' },
                    { id: 'creditor', label: 'بستانکار' },
                    { id: 'both', label: 'دوگانه' },
                  ].map(nat => (
                    <button
                      key={nat.id}
                      type="button"
                      onClick={() => setFormNature(nat.id as any)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        formNature === nat.id 
                          ? 'bg-blue-600 text-white shadow-xs' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {nat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات تکمیلی (اختیاری):</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="توضیحات مربوط به موارد کاربرد این سرفصل"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'در حال ثبت...' : editingAccount ? 'ذخیره تغییرات' : 'ثبت حساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
