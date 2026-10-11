import React, { useState, useEffect } from 'react';
import { db, BankAccount, CashBox } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, CreditCard, Wallet, FileText, ArrowLeftRight, Check,
  AlertCircle, CheckCircle2, DollarSign, Sparkles, Hash, Calendar
} from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

export interface POSPaymentData {
  method: 'card' | 'cash' | 'cheque' | 'mixed' | 'credit';
  bankAccountId?: number;
  bankAccountName?: string;
  cashBoxId?: number;
  cashBoxName?: string;
  cardAmount?: number;
  cashAmount?: number;
  posTrackingCode?: string;
  chequeNumber?: string;
  chequeDueDate?: Date;
  chequeSayad?: string;
  chequeBankName?: string;
  chequeDrawer?: string;
}

interface POSPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  customerName?: string;
  onConfirm: (paymentData: POSPaymentData) => void;
}

export default function POSPaymentModal({
  isOpen,
  onClose,
  totalAmount,
  customerName,
  onConfirm,
}: POSPaymentModalProps) {
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.filter(c => c.isActive).toArray()) || [];

  const [method, setMethod] = useState<'card' | 'cash' | 'cheque' | 'mixed' | 'credit'>('card');
  const [selectedBankId, setSelectedBankId] = useState<number | undefined>(undefined);
  const [selectedCashBoxId, setSelectedCashBoxId] = useState<number | undefined>(undefined);
  const [posTrackingCode, setPosTrackingCode] = useState('');

  // Cash denomination / received
  const [receivedCash, setReceivedCash] = useState<number>(totalAmount);

  // Mixed payment
  const [mixedCardAmount, setMixedCardAmount] = useState<number>(totalAmount);
  const [mixedCashAmount, setMixedCashAmount] = useState<number>(0);

  // Cheque fields
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeSayad, setChequeSayad] = useState('');
  const [chequeBankName, setChequeBankName] = useState('بانک ملی');
  const [chequeDrawer, setChequeDrawer] = useState(customerName || '');
  const [chequeDueDateObj, setChequeDueDateObj] = useState<DateObject>(new DateObject({ calendar: persian }).add(14, 'days'));

  useEffect(() => {
    if (isOpen) {
      setMethod('card');
      setPosTrackingCode('');
      setReceivedCash(totalAmount);
      setMixedCardAmount(totalAmount);
      setMixedCashAmount(0);
      setChequeNumber('');
      setChequeSayad('');
      setChequeDrawer(customerName || '');
      setChequeDueDateObj(new DateObject({ calendar: persian }).add(14, 'days'));

      // Set default POS bank
      const defaultBank = bankAccounts.find(b => b.isDefaultPos) || bankAccounts[0];
      if (defaultBank?.id) setSelectedBankId(defaultBank.id);

      // Set default cash box
      const defaultCash = cashBoxes.find(c => c.isDefault) || cashBoxes[0];
      if (defaultCash?.id) setSelectedCashBoxId(defaultCash.id);
    }
  }, [isOpen, totalAmount, customerName, bankAccounts.length, cashBoxes.length]);

  if (!isOpen) return null;

  const selectedBank = bankAccounts.find(b => b.id === selectedBankId);
  const selectedCashBox = cashBoxes.find(c => c.id === selectedCashBoxId);

  // Handle mixed payment change
  const handleMixedCardChange = (cardVal: number) => {
    const validCard = Math.max(0, Math.min(totalAmount, cardVal));
    setMixedCardAmount(validCard);
    setMixedCashAmount(totalAmount - validCard);
  };

  const changeReturnAmount = Math.max(0, (receivedCash || 0) - totalAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: POSPaymentData = {
      method,
      bankAccountId: (method === 'card' || method === 'mixed') ? selectedBankId : undefined,
      bankAccountName: selectedBank?.bankName,
      cashBoxId: (method === 'cash' || method === 'mixed') ? selectedCashBoxId : undefined,
      cashBoxName: selectedCashBox?.name,
      cardAmount: method === 'card' ? totalAmount : (method === 'mixed' ? mixedCardAmount : undefined),
      cashAmount: method === 'cash' ? totalAmount : (method === 'mixed' ? mixedCashAmount : undefined),
      posTrackingCode: posTrackingCode.trim() || undefined,
      chequeNumber: method === 'cheque' ? chequeNumber.trim() : undefined,
      chequeSayad: method === 'cheque' ? chequeSayad.trim() : undefined,
      chequeBankName: method === 'cheque' ? chequeBankName : undefined,
      chequeDrawer: method === 'cheque' ? (chequeDrawer.trim() || customerName || 'مشتری') : undefined,
      chequeDueDate: method === 'cheque' && chequeDueDateObj ? chequeDueDateObj.toDate() : undefined,
    };

    onConfirm(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Total Header */}
        <div className="text-center mb-6 pb-4 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-400 block mb-1">مبلغ قابل تسویه فاکتور فروش</span>
          <div className="text-3xl font-black font-mono text-[#007AFF]">
            {formatCurrency(totalAmount)}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">
            ({numberToPersianWords(totalAmount)} تومان)
          </div>
        </div>

        {/* Payment Methods Tabs */}
        <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-2xl mb-5">
          <button
            type="button"
            onClick={() => setMethod('card')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'card' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard size={17} />
            <span>کارتخوان / پوز</span>
          </button>

          <button
            type="button"
            onClick={() => setMethod('cash')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'cash' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet size={17} />
            <span>نقدی</span>
          </button>

          <button
            type="button"
            onClick={() => setMethod('mixed')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'mixed' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowLeftRight size={17} />
            <span>ترکیبی (کارت+نقد)</span>
          </button>

          <button
            type="button"
            onClick={() => setMethod('cheque')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'cheque' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={17} />
            <span>چک صیادی</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. CARD PAYMENT DETAILS */}
          {method === 'card' && (
            <div className="space-y-3 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  دستگاه کارتخوان / حساب بانکی مقصد
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {bankAccounts.map(b => (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBankId(b.id)}
                      className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                        selectedBankId === b.id
                          ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <CreditCard size={18} className={selectedBankId === b.id ? 'text-blue-600' : 'text-slate-400'} />
                        <div>
                          <div className="font-bold text-xs text-slate-800">{b.bankName}</div>
                          <div className="text-[10px] text-slate-500">{b.accountHolder}</div>
                        </div>
                      </div>
                      {selectedBankId === b.id && <CheckCircle2 size={16} className="text-blue-600" />}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  شماره پیگیری دستگاه پوز (اختیاری)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={posTrackingCode}
                    onChange={e => setPosTrackingCode(e.target.value)}
                    placeholder="کد ۶ رقمی روی فیش کارتخوان"
                    className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs font-mono"
                    dir="ltr"
                    autoFocus
                  />
                  <Hash size={14} className="absolute right-2.5 top-2.5 text-slate-400" />
                </div>
              </div>
            </div>
          )}

          {/* 2. CASH PAYMENT DETAILS */}
          {method === 'cash' && (
            <div className="space-y-3 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">صندوق نقدی مقصد</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cashBoxes.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCashBoxId(c.id)}
                      className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                        selectedCashBoxId === c.id
                          ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Wallet size={18} className={selectedCashBoxId === c.id ? 'text-emerald-600' : 'text-slate-400'} />
                        <div>
                          <div className="font-bold text-xs text-slate-800">{c.name}</div>
                          <div className="text-[10px] text-slate-500">مسئول: {c.cashierName}</div>
                        </div>
                      </div>
                      {selectedCashBoxId === c.id && <CheckCircle2 size={16} className="text-emerald-600" />}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  مبلغ دریافتی از مشتری (تومان)
                </label>
                <input
                  type="number"
                  value={receivedCash || ''}
                  onChange={e => setReceivedCash(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold font-mono"
                  dir="ltr"
                  autoFocus
                />
              </div>

              {/* Quick cash shortcut buttons */}
              <div className="flex flex-wrap gap-1.5">
                {[totalAmount, Math.ceil(totalAmount / 100000) * 100000, Math.ceil(totalAmount / 500000) * 500000, 1000000].filter((v, i, a) => v >= totalAmount && a.indexOf(v) === i).map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setReceivedCash(val)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-mono font-bold"
                  >
                    {formatCurrency(val)}
                  </button>
                ))}
              </div>

              {changeReturnAmount > 0 && (
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800">مبلغ بازگشتی به مشتری (باقی‌مانده):</span>
                  <span className="text-sm font-black font-mono text-emerald-700">{formatCurrency(changeReturnAmount)}</span>
                </div>
              )}
            </div>
          )}

          {/* 3. MIXED PAYMENT DETAILS */}
          {method === 'mixed' && (
            <div className="space-y-3 animate-in fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-blue-800 mb-1">سهم کارتخوان (تومان)</label>
                  <input
                    type="number"
                    value={mixedCardAmount || ''}
                    onChange={e => handleMixedCardChange(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-blue-200 bg-white font-mono font-bold text-xs"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-emerald-800 mb-1">سهم نقدی (تومان)</label>
                  <input
                    type="number"
                    value={mixedCashAmount || ''}
                    readOnly
                    className="w-full px-3 py-2 rounded-xl border border-emerald-200 bg-slate-100 font-mono font-bold text-xs text-slate-600"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">کارتخوان:</label>
                  <select
                    value={selectedBankId || ''}
                    onChange={e => setSelectedBankId(Number(e.target.value))}
                    className="w-full px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                  >
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.bankName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">صندوق نقدی:</label>
                  <select
                    value={selectedCashBoxId || ''}
                    onChange={e => setSelectedCashBoxId(Number(e.target.value))}
                    className="w-full px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                  >
                    {cashBoxes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 4. CHEQUE PAYMENT DETAILS */}
          {method === 'cheque' && (
            <div className="space-y-2.5 p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200 animate-in fade-in">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">شماره سریال چک *</label>
                  <input
                    type="text"
                    value={chequeNumber}
                    onChange={e => setChequeNumber(e.target.value)}
                    placeholder="مثال: 812903"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white text-xs font-mono font-bold"
                    dir="ltr"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">شناسه صیادی (۱۶ رقم)</label>
                  <input
                    type="text"
                    value={chequeSayad}
                    onChange={e => setChequeSayad(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    placeholder="شناسه ۱۶ رقمی"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white text-xs font-mono"
                    dir="ltr"
                    maxLength={16}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">صادرکننده چک</label>
                  <input
                    type="text"
                    value={chequeDrawer}
                    onChange={e => setChequeDrawer(e.target.value)}
                    placeholder="نام صاحب حساب"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">تاریخ سررسید چک *</label>
                  <DatePicker
                    value={chequeDueDateObj}
                    onChange={setChequeDueDateObj as any}
                    calendar={persian}
                    locale={persian_fa}
                    calendarPosition="bottom-right"
                    inputClass="w-full px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white text-xs font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Confirm Button */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-2xl text-xs font-bold text-white bg-[#007AFF] hover:bg-[#0062cc] transition-all flex items-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95 cursor-pointer"
            >
              <Check size={16} />
              <span>تأیید پرداخت و چاپ فاکتور</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
