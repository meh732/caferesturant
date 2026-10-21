import React, { useState, useEffect, useMemo } from 'react';
import { db, BankAccount, CashBox, Customer, generateNextSubscriptionCode } from '../../lib/db';
import { topUpCustomerWallet } from '../../lib/accountingServices';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, CreditCard, Wallet, FileText, ArrowLeftRight, Check,
  AlertCircle, CheckCircle2, DollarSign, Sparkles, Hash, Calendar,
  UserCheck, Search, PlusCircle, BookOpen, Phone, User
} from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

export interface POSPaymentData {
  method: 'card' | 'cash' | 'cheque' | 'mixed' | 'credit' | 'wallet';
  customerId?: number;
  customerPhone?: string;
  customerName?: string;
  customerSubscriptionCode?: string;
  customerBirthDate?: string;
  customerAddress?: string;
  walletAmount?: number;
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
  customerPhone?: string;
  customerName?: string;
  customerSubscriptionCode?: string;
  customerAddress?: string;
  onConfirm: (paymentData: POSPaymentData) => void;
}

export default function POSPaymentModal({
  isOpen,
  onClose,
  totalAmount,
  customerPhone: initialPhone,
  customerName: initialName,
  customerSubscriptionCode: initialSubCode,
  customerAddress: initialAddress,
  onConfirm,
}: POSPaymentModalProps) {
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.filter(c => c.isActive).toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const allOrders = useLiveQuery(() => db.orders.toArray()) || [];
  const allWalletTxs = useLiveQuery(() => db.customerWalletTransactions.toArray()) || [];

  const [method, setMethod] = useState<'card' | 'cash' | 'cheque' | 'mixed' | 'credit' | 'wallet'>('card');
  const [selectedBankId, setSelectedBankId] = useState<number | undefined>(undefined);
  const [selectedCashBoxId, setSelectedCashBoxId] = useState<number | undefined>(undefined);
  const [posTrackingCode, setPosTrackingCode] = useState('');

  // Customer selection state inside modal
  const [custPhone, setCustPhone] = useState(initialPhone || '');
  const [custName, setCustName] = useState(initialName || '');
  const [custSubCode, setCustSubCode] = useState(initialSubCode || '');
  const [custBirthDate, setCustBirthDate] = useState('');
  const [custAddress, setCustAddress] = useState(initialAddress || '');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);

  // Quick inline wallet top-up state
  const [showQuickTopUp, setShowQuickTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<number>(0);
  const [topUpMethod, setTopUpMethod] = useState<'card' | 'cash'>('card');
  const [isToppingUp, setIsToppingUp] = useState(false);

  // Cash denomination / received
  const [receivedCash, setReceivedCash] = useState<number>(totalAmount);

  // Mixed payment
  const [mixedCardAmount, setMixedCardAmount] = useState<number>(totalAmount);
  const [mixedCashAmount, setMixedCashAmount] = useState<number>(0);

  // Cheque fields
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeSayad, setChequeSayad] = useState('');
  const [chequeBankName, setChequeBankName] = useState('بانک ملی');
  const [chequeDrawer, setChequeDrawer] = useState(initialName || '');
  const [chequeDueDateObj, setChequeDueDateObj] = useState<DateObject>(new DateObject({ calendar: persian }).add(14, 'days'));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Find matched customer in database
  const matchedCustomer = useMemo(() => {
    const cleanPhone = custPhone.trim();
    const cleanSub = custSubCode.trim();
    if (cleanPhone) {
      const byPhone = customers.find(c => c.phone.trim() === cleanPhone);
      if (byPhone) return byPhone;
    }
    if (cleanSub) {
      const bySub = customers.find(c => c.subscriptionCode && c.subscriptionCode.trim() === cleanSub);
      if (bySub) return bySub;
    }
    return undefined;
  }, [customers, custPhone, custSubCode]);

  // Calculate customer's current credit (نسیه) debt
  const customerCreditDebt = useMemo(() => {
    if (!matchedCustomer) return 0;
    const creditOrdersTotal = allOrders
      .filter(o => o.status === 'paid' && o.paymentMethod === 'credit' && (
        o.customerId === matchedCustomer.id ||
        (o.customerPhone && o.customerPhone.trim() === matchedCustomer.phone.trim())
      ))
      .reduce((sum, o) => sum + (o.total || 0), 0);

    const creditSettledTotal = allWalletTxs
      .filter(t => t.type === 'credit_settlement' && (
        t.customerId === matchedCustomer.id ||
        (t.customerPhone && t.customerPhone.trim() === matchedCustomer.phone.trim())
      ))
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    return Math.max(0, creditOrdersTotal - creditSettledTotal);
  }, [matchedCustomer, allOrders, allWalletTxs]);

  const filteredCustomersForSearch = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 10);
    return customers.filter(c =>
      c.phone.includes(q) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.subscriptionCode && c.subscriptionCode.toLowerCase().includes(q))
    ).slice(0, 12);
  }, [customers, customerSearchQuery]);

  useEffect(() => {
    if (isOpen) {
      setMethod('card');
      setPosTrackingCode('');
      setReceivedCash(totalAmount);
      setMixedCardAmount(totalAmount);
      setMixedCashAmount(0);
      setChequeNumber('');
      setChequeSayad('');
      setChequeDrawer(initialName || '');
      setChequeDueDateObj(new DateObject({ calendar: persian }).add(14, 'days'));
      setErrorMsg(null);
      setShowQuickTopUp(false);

      setCustPhone(initialPhone || '');
      setCustName(initialName || '');
      setCustSubCode(initialSubCode || '');
      setCustAddress(initialAddress || '');

      if (!initialSubCode) {
        generateNextSubscriptionCode().then(code => {
          setCustSubCode(prev => prev || code);
        });
      }

      // Set default POS bank
      const defaultBank = bankAccounts.find(b => b.isDefaultPos) || bankAccounts[0];
      if (defaultBank?.id) setSelectedBankId(defaultBank.id);

      // Set default cash box
      const defaultCash = cashBoxes.find(c => c.isDefault) || cashBoxes[0];
      if (defaultCash?.id) setSelectedCashBoxId(defaultCash.id);
    }
  }, [isOpen, totalAmount, initialPhone, initialName, initialSubCode, initialAddress, bankAccounts.length, cashBoxes.length]);

  // Sync matchedCustomer details when phone/sub matches an existing member
  useEffect(() => {
    if (matchedCustomer) {
      setCustPhone(matchedCustomer.phone);
      if (matchedCustomer.name) setCustName(matchedCustomer.name);
      if (matchedCustomer.subscriptionCode) setCustSubCode(matchedCustomer.subscriptionCode);
      if (matchedCustomer.birthDate) setCustBirthDate(matchedCustomer.birthDate);
      if (matchedCustomer.address) setCustAddress(matchedCustomer.address);
    }
  }, [matchedCustomer?.id]);

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

  const handleSelectCustomer = (c: Customer) => {
    setCustPhone(c.phone);
    setCustName(c.name || '');
    setCustSubCode(c.subscriptionCode || '');
    setCustBirthDate(c.birthDate || '');
    setCustAddress(c.address || '');
    setShowCustomerList(false);
    setCustomerSearchQuery('');
    setErrorMsg(null);
  };

  const handleQuickWalletTopUp = async () => {
    if (!custPhone.trim()) {
      setErrorMsg('ابتدا شماره موبایل مشتری را وارد یا از لیست انتخاب کنید.');
      return;
    }
    if (topUpAmount <= 0) {
      setErrorMsg('مبلغ شارژ کیف پول باید بیشتر از صفر باشد.');
      return;
    }

    setIsToppingUp(true);
    setErrorMsg(null);
    try {
      let targetCustomerId = matchedCustomer?.id;
      if (!targetCustomerId) {
        const autoSub = custSubCode.trim() || await generateNextSubscriptionCode();
        targetCustomerId = await db.customers.add({
          phone: custPhone.trim(),
          name: custName.trim() || 'مشتری باشگاه',
          subscriptionCode: autoSub,
          birthDate: custBirthDate.trim() || undefined,
          address: custAddress.trim() || '',
          walletBalance: 0,
          tier: 'bronze',
          createdAt: new Date()
        }) as number;
      }

      await topUpCustomerWallet({
        customerId: targetCustomerId,
        amount: topUpAmount,
        paymentMethod: topUpMethod,
        bankAccountId: topUpMethod === 'card' ? selectedBankId : undefined,
        cashBoxId: topUpMethod === 'cash' ? selectedCashBoxId : undefined,
        description: `شارژ سریع کیف پول در صندوق فروش`
      });

      setShowQuickTopUp(false);
      setTopUpAmount(0);
    } catch (err: any) {
      setErrorMsg(err?.message || 'خطا در شارژ کیف پول.');
    } finally {
      setIsToppingUp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (method === 'wallet' || method === 'credit') {
      if (!custPhone.trim()) {
        setErrorMsg(`برای تسویه از طریق «${method === 'wallet' ? 'کیف پول' : 'نسیه به حساب مشتری'}»، وارد کردن شماره موبایل یا انتخاب مشتری از باشگاه الزامی است.`);
        return;
      }
    }

    if (method === 'wallet') {
      const currentBal = matchedCustomer?.walletBalance || 0;
      if (currentBal < totalAmount) {
        const shortage = totalAmount - currentBal;
        setErrorMsg(`موجودی کیف پول مشتری (${formatCurrency(currentBal)}) کمتر از مبلغ فاکتور است. کمبود: ${formatCurrency(shortage)}. می‌توانید با دکمه «شارژ فوری کیف پول» در همین پنجره کیف پول را شارژ کنید یا روش «نسیه» را انتخاب نمایید.`);
        setTopUpAmount(shortage);
        setShowQuickTopUp(true);
        return;
      }
    }

    const finalSubCode = custSubCode.trim() || await generateNextSubscriptionCode();

    const data: POSPaymentData = {
      method,
      customerId: matchedCustomer?.id,
      customerPhone: custPhone.trim() || undefined,
      customerName: custName.trim() || matchedCustomer?.name || undefined,
      customerSubscriptionCode: finalSubCode,
      customerBirthDate: custBirthDate.trim() || matchedCustomer?.birthDate || undefined,
      customerAddress: custAddress.trim() || matchedCustomer?.address || undefined,
      walletAmount: method === 'wallet' ? totalAmount : undefined,
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
      chequeDrawer: method === 'cheque' ? (chequeDrawer.trim() || custName || 'مشتری') : undefined,
      chequeDueDate: method === 'cheque' && chequeDueDateObj ? chequeDueDateObj.toDate() : undefined,
    };

    onConfirm(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl border border-slate-100 my-auto relative">
        <button
          onClick={onClose}
          className="absolute left-5 top-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        {/* Total Header */}
        <div className="text-center mb-4 pb-3.5 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-400 block mb-1">مبلغ قابل تسویه فاکتور فروش</span>
          <div className="text-3xl font-black font-mono text-[#007AFF]">
            {formatCurrency(totalAmount)}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">
            ({numberToPersianWords(totalAmount)} تومان)
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-start gap-2 animate-in fade-in">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Payment Methods Tabs (6 Methods including Wallet & Credit) */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-1.5 bg-slate-100 rounded-2xl mb-4">
          <button
            type="button"
            onClick={() => { setMethod('card'); setErrorMsg(null); }}
            className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'card' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard size={16} />
            <span>کارتخوان</span>
          </button>

          <button
            type="button"
            onClick={() => { setMethod('cash'); setErrorMsg(null); }}
            className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'cash' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign size={16} />
            <span>نقدی</span>
          </button>

          <button
            type="button"
            onClick={() => { setMethod('wallet'); setErrorMsg(null); }}
            className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'wallet' ? 'bg-white text-purple-600 shadow-sm ring-1 ring-purple-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet size={16} />
            <span>کیف پول مشتری</span>
          </button>

          <button
            type="button"
            onClick={() => { setMethod('credit'); setErrorMsg(null); }}
            className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'credit' ? 'bg-white text-rose-600 shadow-sm ring-1 ring-rose-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen size={16} />
            <span>نسیه (مشتری)</span>
          </button>

          <button
            type="button"
            onClick={() => { setMethod('mixed'); setErrorMsg(null); }}
            className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'mixed' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowLeftRight size={16} />
            <span>ترکیبی</span>
          </button>

          <button
            type="button"
            onClick={() => { setMethod('cheque'); setErrorMsg(null); }}
            className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              method === 'cheque' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={16} />
            <span>چک صیادی</span>
          </button>
        </div>

        {/* Customer Club Quick Banner / Selector (Always accessible, highlighted for Wallet & Credit) */}
        <div className={`mb-4 p-3.5 rounded-2xl border transition-all ${
          method === 'wallet'
            ? 'bg-purple-50/70 border-purple-200'
            : method === 'credit'
            ? 'bg-rose-50/70 border-rose-200'
            : 'bg-slate-50 border-slate-200/80'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <UserCheck size={15} className={method === 'wallet' ? 'text-purple-600' : method === 'credit' ? 'text-rose-600' : 'text-blue-600'} />
              <span className="text-xs font-bold text-slate-800">
                مشتری باشگاه / طرف‌حساب فاکتور {(method === 'wallet' || method === 'credit') && <span className="text-red-500">*</span>}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomerList(!showCustomerList)}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              <Search size={12} />
              <span>{showCustomerList ? 'بستن لیست اعضا' : 'انتخاب از باشگاه مشتریان'}</span>
            </button>
          </div>

          {/* Searchable Customer Club Dropdown */}
          {showCustomerList && (
            <div className="mb-3 p-2.5 bg-white rounded-xl border border-slate-200 shadow-md space-y-2 animate-in fade-in">
              <div className="relative">
                <Search size={14} className="absolute right-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={customerSearchQuery}
                  onChange={e => setCustomerSearchQuery(e.target.value)}
                  placeholder="جستجو با نام، شماره موبایل یا کد اشتراک..."
                  className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs outline-none focus:bg-white focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                {filteredCustomersForSearch.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full text-right py-2 px-2.5 hover:bg-blue-50/60 rounded-lg transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                        <span>{c.name || 'مشتری بدون نام'}</span>
                        {c.subscriptionCode && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[10px]">
                            کد: {c.subscriptionCode}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono" dir="ltr">{c.phone}</div>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] text-slate-400 block">موجودی کیف پول:</span>
                      <span className="font-mono font-bold text-xs text-purple-600">{formatCurrency(c.walletBalance || 0)}</span>
                    </div>
                  </button>
                ))}
                {filteredCustomersForSearch.length === 0 && (
                  <div className="py-3 text-center text-xs text-slate-400">عضوی با این مشخصات یافت نشد.</div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative">
              <input
                type="tel"
                dir="ltr"
                value={custPhone}
                onChange={e => setCustPhone(e.target.value)}
                placeholder="شماره موبایل (0912...)"
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-left outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <input
                type="text"
                value={custName}
                onChange={e => setCustName(e.target.value)}
                placeholder="نام و نام خانوادگی مشتری"
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs outline-none focus:border-blue-500"
              />
            </div>
            <div className="relative">
              <input
                type="text"
                dir="ltr"
                value={custSubCode}
                onChange={e => setCustSubCode(e.target.value)}
                placeholder="کد اشتراک اتوماتیک"
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-left outline-none focus:border-blue-500"
                title="کد اشتراک باشگاه مشتریان"
              />
            </div>
          </div>

          {/* Live Customer Wallet & Credit Summary */}
          {matchedCustomer ? (
            <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-slate-500 text-[11px] ml-1">موجودی کیف پول:</span>
                  <span className={`font-mono font-black ${
                    (matchedCustomer.walletBalance || 0) >= totalAmount ? 'text-emerald-600' : 'text-purple-600'
                  }`}>
                    {formatCurrency(matchedCustomer.walletBalance || 0)}
                  </span>
                </div>
                <div className="h-3 w-px bg-slate-300" />
                <div>
                  <span className="text-slate-500 text-[11px] ml-1">بدهی نسیه قبلی:</span>
                  <span className={`font-mono font-bold ${customerCreditDebt > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                    {formatCurrency(customerCreditDebt)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTopUpAmount(Math.max(0, totalAmount - (matchedCustomer.walletBalance || 0)) || 500000);
                  setShowQuickTopUp(!showQuickTopUp);
                }}
                className="text-[11px] font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                <PlusCircle size={12} />
                <span>شارژ فوری کیف پول</span>
              </button>
            </div>
          ) : custPhone.trim() ? (
            <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center justify-between">
              <span>عضو جدید باشگاه مشتریان (کد اشتراک اتوماتیک: <strong className="font-mono">{custSubCode}</strong>)</span>
              <button
                type="button"
                onClick={() => {
                  setTopUpAmount(totalAmount);
                  setShowQuickTopUp(!showQuickTopUp);
                }}
                className="text-[11px] font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <PlusCircle size={11} />
                <span>شارژ اولیه کیف پول</span>
              </button>
            </div>
          ) : null}

          {/* Quick Inline Wallet Top-Up Box */}
          {showQuickTopUp && (
            <div className="mt-3 p-3 bg-white rounded-xl border border-purple-200 shadow-xs space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900">شارژ درجا کیف پول مشتری</span>
                <button
                  type="button"
                  onClick={() => setShowQuickTopUp(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  بستن
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">مبلغ شارژ (تومان)</label>
                  <input
                    type="number"
                    dir="ltr"
                    value={topUpAmount || ''}
                    onChange={e => setTopUpAmount(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-purple-200 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">روش دریافت شارژ</label>
                  <select
                    value={topUpMethod}
                    onChange={e => setTopUpMethod(e.target.value as 'card' | 'cash')}
                    className="w-full px-2 py-1.5 rounded-lg border border-purple-200 text-xs bg-white"
                  >
                    <option value="card">کارتخوان / پوز</option>
                    <option value="cash">نقدی به صندوق</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={isToppingUp}
                    onClick={handleQuickWalletTopUp}
                    className="w-full py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isToppingUp ? 'در حال ثبت...' : 'ثبت شارژ کیف پول'}
                  </button>
                </div>
              </div>
            </div>
          )}
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
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-mono font-bold cursor-pointer"
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

          {/* 3. CUSTOMER WALLET PAYMENT DETAILS */}
          {method === 'wallet' && (
            <div className="p-4 rounded-2xl bg-purple-50/90 border border-purple-200 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900">کسر مستقیم از کیف پول باشگاه مشتریان</span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-200/70 text-purple-900 font-mono">
                  کد اشتراک: {custSubCode || '-'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-white border border-purple-100">
                  <span className="text-[10px] text-slate-500 block">موجودی فعلی کیف پول:</span>
                  <span className="text-sm font-black font-mono text-purple-700">
                    {formatCurrency(matchedCustomer?.walletBalance || 0)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-purple-100">
                  <span className="text-[10px] text-slate-500 block">مانده کیف پول پس از کسر فاکتور:</span>
                  <span className={`text-sm font-black font-mono ${
                    ((matchedCustomer?.walletBalance || 0) - totalAmount) >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {formatCurrency((matchedCustomer?.walletBalance || 0) - totalAmount)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-purple-800 leading-relaxed">
                با تایید این گزینه، مبلغ <strong>{formatCurrency(totalAmount)}</strong> از کیف پول <strong>{custName || custPhone || 'مشتری انتخاب‌شده'}</strong> کسر شده و در صورتحساب باشگاه مشتریان ثبت می‌گردد.
              </p>
            </div>
          )}

          {/* 4. CUSTOMER CREDIT (ON-ACCOUNT / نسیه) PAYMENT DETAILS */}
          {method === 'credit' && (
            <div className="p-4 rounded-2xl bg-rose-50/90 border border-rose-200 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-900">ثبت فاکتور نسیه (به حساب دفتری مشتری خاص)</span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-200/70 text-rose-900 font-mono">
                  کد اشتراک: {custSubCode || '-'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-white border border-rose-100">
                  <span className="text-[10px] text-slate-500 block">بدهی نسیه قبلی مشتری:</span>
                  <span className="text-sm font-black font-mono text-slate-700">
                    {formatCurrency(customerCreditDebt)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-rose-100">
                  <span className="text-[10px] text-slate-500 block">جمع بدهی پس از این فاکتور:</span>
                  <span className="text-sm font-black font-mono text-rose-600">
                    {formatCurrency(customerCreditDebt + totalAmount)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                این فاکتور بدون دریافت وجه نقد/کارت، در <strong>صورتحساب اختصاصی {custName || custPhone || 'مشتری'}</strong> و سرفصل حساب‌های دریافتنی (کد ۱۲۰۱) منظور خواهد شد.
              </p>
            </div>
          )}

          {/* 5. MIXED PAYMENT DETAILS */}
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

          {/* 6. CHEQUE PAYMENT DETAILS */}
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
              <span>
                {method === 'wallet'
                  ? 'کسر از کیف پول و چاپ فاکتور'
                  : method === 'credit'
                  ? 'ثبت نسیه به حساب مشتری و چاپ'
                  : 'تأیید پرداخت و چاپ فاکتور'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

