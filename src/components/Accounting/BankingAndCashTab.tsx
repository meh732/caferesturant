import React, { useState } from 'react';
import { db, BankAccount, CashBox } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Building2, Wallet, Plus, ArrowLeftRight, CreditCard, 
  ArrowDownRight, ArrowUpRight, Edit2, Trash2, CheckCircle2,
  Copy, Check, ShieldCheck, Sparkles, Layers
} from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { triggerServerDbSync } from '../../lib/serverSync';
import BankAccountModal from './BankAccountModal';
import CashBoxModal from './CashBoxModal';
import TransferFundsModal from './TransferFundsModal';
import ManualTransactionModal from './ManualTransactionModal';
import { FileText } from 'lucide-react';

interface BankingAndCashTabProps {
  onNavigateToStatement?: (accountId?: string) => void;
}

export default function BankingAndCashTab({ onNavigateToStatement }: BankingAndCashTabProps = {}) {
  const { can } = useAuth();
  const bankAccounts = useLiveQuery(() => db.bankAccounts.toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.toArray()) || [];
  const chequeBooks = useLiveQuery(() => db.chequeBooks.toArray()) || [];

  // Modals state
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);

  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [editingCash, setEditingCash] = useState<CashBox | null>(null);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferDefaultSourceType, setTransferDefaultSourceType] = useState<'bank' | 'cashbox'>('cashbox');
  const [transferDefaultSourceId, setTransferDefaultSourceId] = useState<number | undefined>(undefined);

  const [isManualTxModalOpen, setIsManualTxModalOpen] = useState(false);
  const [manualAction, setManualAction] = useState<'deposit' | 'withdrawal'>('deposit');
  const [manualAccountType, setManualAccountType] = useState<'bank' | 'cashbox'>('bank');
  const [manualAccountId, setManualAccountId] = useState<number | undefined>(undefined);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Calculate totals
  const totalBankBalance = bankAccounts
    .filter(b => b.isActive)
    .reduce((sum, b) => sum + (b.balance || 0), 0);

  const totalCashBalance = cashBoxes
    .filter(c => c.isActive)
    .reduce((sum, c) => sum + (c.balance || 0), 0);

  const totalLiquidAssets = totalBankBalance + totalCashBalance;

  const handleDeleteBank = async (id: number, bankName: string) => {
    if (!confirm(`آیا از حذف حساب بانکی "${bankName}" اطمینان دارید؟`)) return;
    await db.bankAccounts.delete(id);
    triggerServerDbSync(100);
  };

  const handleDeleteCash = async (id: number, cashName: string) => {
    if (!confirm(`آیا از حذف صندوق "${cashName}" اطمینان دارید؟`)) return;
    await db.cashBoxes.delete(id);
    triggerServerDbSync(100);
  };

  return (
    <div className="space-y-6">
      {/* Top Total Capital KPI Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -left-10 -bottom-10 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -right-10 -top-10 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold mb-2">
              <Sparkles size={16} />
              <span>موجودی زنده نقدینگی و خزانه‌داری</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white mb-2">
              {formatCurrency(totalLiquidAssets)}
            </h2>
            <p className="text-xs text-slate-400">
              مجموع دارایی‌های جاری در حساب‌های بانکی و صندوق‌های نقدی فروشگاه
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 shrink-0">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <div className="flex items-center gap-2 text-blue-300 text-xs font-bold mb-1">
                <Building2 size={16} />
                <span>موجودی بانک‌ها ({bankAccounts.filter(b => b.isActive).length})</span>
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {formatCurrency(totalBankBalance)}
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold mb-1">
                <Wallet size={16} />
                <span>موجودی صندوق‌ها ({cashBoxes.filter(c => c.isActive).length})</span>
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {formatCurrency(totalCashBalance)}
              </div>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="relative z-10 flex flex-wrap items-center gap-2.5 pt-6 mt-6 border-t border-white/10">
          {can('banking_manage') && (
            <>
              <button
                onClick={() => { setEditingBank(null); setIsBankModalOpen(true); }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-600/30 cursor-pointer active:scale-95"
              >
                <Plus size={15} />
                <span>تعریف حساب بانکی جدید</span>
              </button>

              <button
                onClick={() => { setEditingCash(null); setIsCashModalOpen(true); }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-95"
              >
                <Plus size={15} />
                <span>تعریف صندوق نقدی جدید</span>
              </button>

              <button
                onClick={() => {
                  setTransferDefaultSourceType('cashbox');
                  setTransferDefaultSourceId(undefined);
                  setIsTransferModalOpen(true);
                }}
                className="px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all border border-white/15 cursor-pointer active:scale-95"
              >
                <ArrowLeftRight size={15} />
                <span>انتقال وجه بین حساب‌ها</span>
              </button>

              <button
                onClick={() => {
                  setManualAction('deposit');
                  setManualAccountType('bank');
                  setManualAccountId(undefined);
                  setIsManualTxModalOpen(true);
                }}
                className="px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all border border-white/15 cursor-pointer active:scale-95"
              >
                <ArrowDownRight size={15} />
                <span>واریز دستی</span>
              </button>

              <button
                onClick={() => {
                  setManualAction('withdrawal');
                  setManualAccountType('bank');
                  setManualAccountId(undefined);
                  setIsManualTxModalOpen(true);
                }}
                className="px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all border border-white/15 cursor-pointer active:scale-95"
              >
                <ArrowUpRight size={15} />
                <span>برداشت دستی</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Section 1: Bank Accounts Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="text-blue-600" size={20} />
            <h3 className="font-bold text-slate-800 text-base">حساب‌های بانکی و دستگاه‌های کارتخوان پوز</h3>
            <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {bankAccounts.length} حساب
            </span>
          </div>
        </div>

        {bankAccounts.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200">
            <Building2 className="mx-auto text-slate-300 mb-2" size={40} />
            <p className="text-sm font-bold text-slate-600">هنوز هیچ حساب بانکی تعریف نشده است.</p>
            <button
              onClick={() => { setEditingBank(null); setIsBankModalOpen(true); }}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2"
            >
              <Plus size={15} />
              <span>تعریف اولین حساب بانکی</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {bankAccounts.map(b => (
              <div 
                key={b.id}
                className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between"
              >
                {b.isDefaultPos && (
                  <div className="absolute top-0 left-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-br-2xl flex items-center gap-1 shadow-sm">
                    <CheckCircle2 size={12} />
                    <span>پوز پیش‌فرض صندوق</span>
                  </div>
                )}

                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                        <CreditCard size={22} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{b.bankName}</h4>
                        <p className="text-xs text-slate-500">{b.accountHolder} {b.branchName ? `(${b.branchName})` : ''}</p>
                      </div>
                    </div>

                    {can('banking_manage') && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingBank(b); setIsBankModalOpen(true); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="ویرایش"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteBank(b.id!, b.bankName)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="حذف"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card Number display */}
                  {b.cardNumber && (
                    <div className="mb-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">شماره کارت:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-800" dir="ltr">{b.cardNumber}</span>
                        <button
                          onClick={() => copyToClipboard(b.cardNumber!, `card-${b.id}`)}
                          className="text-slate-400 hover:text-blue-600"
                          title="کپی شماره کارت"
                        >
                          {copiedId === `card-${b.id}` ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Account / Shaba */}
                  <div className="text-[11px] text-slate-600 space-y-1 mb-4">
                    {b.accountNumber && (
                      <div className="flex justify-between">
                        <span>شماره حساب:</span>
                        <span className="font-mono font-bold" dir="ltr">{b.accountNumber}</span>
                      </div>
                    )}
                    {b.shabaNumber && (
                      <div className="flex justify-between items-center">
                        <span>شماره شبا:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[10px]" dir="ltr">{b.shabaNumber}</span>
                          <button
                            onClick={() => copyToClipboard(b.shabaNumber!, `shaba-${b.id}`)}
                            className="text-slate-400 hover:text-blue-600"
                          >
                            {copiedId === `shaba-${b.id}` ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Balance footer */}
                <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">موجودی لحظه‌ای:</span>
                    <span className="text-base font-bold font-mono text-blue-600">
                      {formatCurrency(b.balance)}
                    </span>
                  </div>
                  {onNavigateToStatement && (
                    <button
                      onClick={() => onNavigateToStatement(`bank_${b.id}`)}
                      className="w-full py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileText size={13} />
                      <span>مشاهده ریز صورتحساب این بانک</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Cash Desks Cards */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="text-emerald-600" size={20} />
            <h3 className="font-bold text-slate-800 text-base">صندوق‌های نقدی فروشگاه</h3>
            <span className="bg-emerald-100 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {cashBoxes.length} صندوق
            </span>
          </div>
        </div>

        {cashBoxes.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200">
            <Wallet className="mx-auto text-slate-300 mb-2" size={40} />
            <p className="text-sm font-bold text-slate-600">هنوز هیچ صندوق نقدی تعریف نشده است.</p>
            <button
              onClick={() => { setEditingCash(null); setIsCashModalOpen(true); }}
              className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2"
            >
              <Plus size={15} />
              <span>تعریف اولین صندوق</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {cashBoxes.map(c => (
              <div 
                key={c.id}
                className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between"
              >
                {c.isDefault && (
                  <div className="absolute top-0 left-0 bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-br-2xl flex items-center gap-1 shadow-sm">
                    <CheckCircle2 size={12} />
                    <span>صندوق نقدی پیش‌فرض</span>
                  </div>
                )}

                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                        <Wallet size={22} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{c.name}</h4>
                        <p className="text-xs text-slate-500">مسئول: {c.cashierName}</p>
                      </div>
                    </div>

                    {can('banking_manage') && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingCash(c); setIsCashModalOpen(true); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          title="ویرایش"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteCash(c.id!, c.name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="حذف"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {c.notes && (
                    <p className="text-xs text-slate-500 mb-3 bg-slate-50 p-2 rounded-xl">
                      {c.notes}
                    </p>
                  )}
                </div>

                {/* Balance footer */}
                <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">موجودی نقدی صندوق:</span>
                    <span className="text-base font-bold font-mono text-emerald-600">
                      {formatCurrency(c.balance)}
                    </span>
                  </div>
                  {onNavigateToStatement && (
                    <button
                      onClick={() => onNavigateToStatement(`cashbox_${c.id}`)}
                      className="w-full py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileText size={13} />
                      <span>مشاهده ریز صورتحساب این صندوق</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <BankAccountModal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        account={editingBank}
      />

      <CashBoxModal
        isOpen={isCashModalOpen}
        onClose={() => setIsCashModalOpen(false)}
        cashBox={editingCash}
      />

      <TransferFundsModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        defaultSourceType={transferDefaultSourceType}
        defaultSourceId={transferDefaultSourceId}
      />

      <ManualTransactionModal
        isOpen={isManualTxModalOpen}
        onClose={() => setIsManualTxModalOpen(false)}
        defaultAction={manualAction}
        defaultAccountType={manualAccountType}
        defaultAccountId={manualAccountId}
      />
    </div>
  );
}
