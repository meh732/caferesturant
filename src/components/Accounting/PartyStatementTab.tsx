import React, { useState, useMemo, useRef } from 'react';
import { 
  db, Customer, Expense, Order, Cheque, FinancialTransaction, BankAccount, CashBox 
} from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Users, User, Building, Phone, MapPin, Calendar, Search, Filter, 
  Printer, Download, ArrowUpRight, ArrowDownRight, CheckCircle2, 
  AlertTriangle, Clock, RefreshCw, FileText, ShoppingBag, ShoppingCart, 
  CreditCard, Wallet, Banknote, ShieldCheck, Plus, Eye, X, Check,
  ChevronDown, ExternalLink, ArrowRightLeft, FileSpreadsheet
} from 'lucide-react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import { 
  format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, isWithinInterval 
} from 'date-fns-jalali';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";
import { recordPartySettlement } from '../../lib/accountingServices';

type DatePreset = 'all' | 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'last_90_days' | 'this_year' | 'custom';
type PartyTypeFilter = 'all' | 'customers' | 'suppliers' | 'has_balance';

export interface StatementItem {
  id: string;
  date: Date;
  refNumber: string;
  type: 
    | 'sale_order'
    | 'purchase_expense'
    | 'cash_receipt'
    | 'bank_receipt'
    | 'cash_payment'
    | 'bank_payment'
    | 'cheque_received'
    | 'cheque_paid'
    | 'cheque_transferred'
    | 'cheque_bounced';
  typeLabel: string;
  description: string;
  debit: number;   // بدهکار (افزایش بدهی شخص به ما / کاهش طلب شخص از ما)
  credit: number;  // بستانکار (کاهش بدهی شخص به ما / افزایش طلب شخص از ما)
  runningBalance: number;
  balanceStatus: 'debtor' | 'creditor' | 'settled';
  originalData?: any;
}

export interface PartyInfo {
  key: string; // unique normalized identifier
  name: string;
  phone?: string;
  address?: string;
  role: 'customer' | 'supplier' | 'both';
  customerRecord?: Customer;
}

export default function PartyStatementTab() {
  // Live queries
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const orders = useLiveQuery(() => db.orders.toArray()) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const cheques = useLiveQuery(() => db.cheques.toArray()) || [];
  const transactions = useLiveQuery(() => db.financialTransactions.toArray()) || [];
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.filter(c => c.isActive).toArray()) || [];
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  // Filter states
  const [selectedPartyKey, setSelectedPartyKey] = useState<string>('');
  const [partyTypeFilter, setPartyTypeFilter] = useState<PartyTypeFilter>('all');
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('all');
  const [tableSearch, setTableSearch] = useState<string>('');

  const [customRange, setCustomRange] = useState<[DateObject, DateObject]>([
    new DateObject({ calendar: persian }).subtract(30, "days"),
    new DateObject({ calendar: persian })
  ]);

  // Quick Settlement Modal state
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementDirection, setSettlementDirection] = useState<'receipt' | 'payment'>('receipt');
  const [settlementAmount, setSettlementAmount] = useState<number | ''>('');
  const [settlementMethod, setSettlementMethod] = useState<'card' | 'cash'>('card');
  const [settlementBankId, setSettlementBankId] = useState<number | undefined>(undefined);
  const [settlementCashId, setSettlementCashId] = useState<number | undefined>(undefined);
  const [settlementTracking, setSettlementTracking] = useState('');
  const [settlementDesc, setSettlementDesc] = useState('');
  const [settlementDateObj, setSettlementDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [settlementSubmitting, setSettlementSubmitting] = useState(false);
  const [settlementError, setSettlementError] = useState<string | null>(null);

  // Detail Modal
  const [viewingDetailItem, setViewingDetailItem] = useState<StatementItem | null>(null);

  // Printable container ref
  const printAreaRef = useRef<HTMLDivElement>(null);

  // 1. Compile Unique Parties Directory
  const allParties = useMemo<PartyInfo[]>(() => {
    const map = new Map<string, PartyInfo>();

    // From customers
    customers.forEach(c => {
      const name = c.name?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      map.set(key, {
        key,
        name,
        phone: c.phone,
        address: c.address,
        role: 'customer',
        customerRecord: c
      });
    });

    // From orders
    orders.forEach(o => {
      const name = o.customerName?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (map.has(key)) {
        const item = map.get(key)!;
        if (!item.phone && o.customerPhone) item.phone = o.customerPhone;
        if (!item.address && o.customerAddress) item.address = o.customerAddress;
      } else {
        map.set(key, {
          key,
          name,
          phone: o.customerPhone,
          address: o.customerAddress,
          role: 'customer'
        });
      }
    });

    // From expenses (suppliers & vendors)
    expenses.forEach(e => {
      const name = e.supplierOrPerson?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (map.has(key)) {
        const item = map.get(key)!;
        item.role = 'both';
      } else {
        map.set(key, {
          key,
          name,
          role: 'supplier'
        });
      }
    });

    // From cheques (drawers & recipients & transferredTo)
    cheques.forEach(ch => {
      if (ch.drawerName?.trim()) {
        const key = ch.drawerName.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { key, name: ch.drawerName.trim(), role: 'customer' });
        }
      }
      if (ch.recipientName?.trim()) {
        const key = ch.recipientName.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { key, name: ch.recipientName.trim(), role: 'supplier' });
        }
      }
      if (ch.transferredTo?.trim()) {
        const key = ch.transferredTo.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { key, name: ch.transferredTo.trim(), role: 'supplier' });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [customers, orders, expenses, cheques]);

  // Set default selected party on first load
  React.useEffect(() => {
    if (!selectedPartyKey && allParties.length > 0) {
      setSelectedPartyKey(allParties[0].key);
    }
  }, [allParties, selectedPartyKey]);

  // Selected party object
  const selectedParty = useMemo(() => {
    return allParties.find(p => p.key === selectedPartyKey) || null;
  }, [allParties, selectedPartyKey]);

  // 2. Active date range interval
  const activeDateInterval = useMemo(() => {
    const now = new Date();
    if (datePreset === 'all') return null;
    if (datePreset === 'today') {
      return { start: startOfDay(now), end: endOfDay(now) };
    }
    if (datePreset === 'last_7_days') {
      return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
    }
    if (datePreset === 'this_month') {
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    if (datePreset === 'last_month') {
      const prev = subDays(startOfMonth(now), 5);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    if (datePreset === 'last_90_days') {
      return { start: startOfDay(subDays(now, 90)), end: endOfDay(now) };
    }
    if (datePreset === 'this_year') {
      return { start: startOfDay(subDays(now, 365)), end: endOfDay(now) };
    }
    if (datePreset === 'custom' && customRange && customRange[0] && customRange[1]) {
      return {
        start: startOfDay(customRange[0].toDate()),
        end: endOfDay(customRange[1].toDate())
      };
    }
    return null;
  }, [datePreset, customRange]);

  // 3. Compile Raw Ledger Records for Selected Party
  const rawLedgerItems = useMemo<StatementItem[]>(() => {
    if (!selectedParty) return [];

    const targetKey = selectedParty.key;
    const items: StatementItem[] = [];

    // Helper to check name match
    const isParty = (name?: string) => {
      if (!name) return false;
      return name.trim().toLowerCase() === targetKey;
    };

    // A. Sales Orders (فاکتورهای فروش به مشتری)
    orders.forEach(o => {
      if (!isParty(o.customerName)) return;
      if (o.status === 'cancelled') return;

      const orderTotal = o.total || 0;
      const orderDate = new Date(o.createdAt);
      const itemsCount = o.items ? o.items.reduce((s, it) => s + (it.quantity || 1), 0) : 0;
      const itemsBrief = o.items ? o.items.map(it => `${it.name} (${it.quantity})`).slice(0, 3).join('، ') : '';

      // 1. Invoice entry: Debit = Total
      items.push({
        id: `order_${o.id}`,
        date: orderDate,
        refNumber: `فاکتور #${o.invoiceNumber}`,
        type: 'sale_order',
        typeLabel: 'فاکتور فروش',
        description: `فاکتور سفارش ${o.tableNumber ? `میز ${o.tableNumber}` : 'بیرون‌بر'} (${itemsCount} قلم کالا: ${itemsBrief})`,
        debit: orderTotal,
        credit: 0,
        runningBalance: 0,
        balanceStatus: 'settled',
        originalData: o
      });

      // 2. If paid at the same time:
      // If paymentMethod is cash/card/mixed, customer immediately settled part or full amount
      if (o.paymentMethod === 'card' && orderTotal > 0) {
        items.push({
          id: `order_pay_card_${o.id}`,
          date: new Date(orderDate.getTime() + 1000),
          refNumber: o.posTrackingCode ? `پیگیری ${o.posTrackingCode}` : `تسویه فاکتور #${o.invoiceNumber}`,
          type: 'bank_receipt',
          typeLabel: 'دریافت کارتخوان/بانک',
          description: `تسویه کارتخوان فاکتور فروش #${o.invoiceNumber}${o.bankAccountName ? ` (${o.bankAccountName})` : ''}`,
          debit: 0,
          credit: orderTotal,
          runningBalance: 0,
          balanceStatus: 'settled',
          originalData: o
        });
      } else if (o.paymentMethod === 'cash' && orderTotal > 0) {
        items.push({
          id: `order_pay_cash_${o.id}`,
          date: new Date(orderDate.getTime() + 1000),
          refNumber: `رسید نقدی #${o.invoiceNumber}`,
          type: 'cash_receipt',
          typeLabel: 'دریافت نقدی',
          description: `پرداخت نقدی وجه فاکتور فروش #${o.invoiceNumber}${o.cashBoxName ? ` (${o.cashBoxName})` : ''}`,
          debit: 0,
          credit: orderTotal,
          runningBalance: 0,
          balanceStatus: 'settled',
          originalData: o
        });
      } else if (o.paymentMethod === 'mixed') {
        if ((o.cardAmount || 0) > 0) {
          items.push({
            id: `order_pay_mixed_card_${o.id}`,
            date: new Date(orderDate.getTime() + 1000),
            refNumber: o.posTrackingCode || `کارت #${o.invoiceNumber}`,
            type: 'bank_receipt',
            typeLabel: 'دریافت کارتخوان',
            description: `بخش واریز کارت فاکتور #${o.invoiceNumber}`,
            debit: 0,
            credit: o.cardAmount || 0,
            runningBalance: 0,
            balanceStatus: 'settled',
            originalData: o
          });
        }
        if ((o.cashAmount || 0) > 0) {
          items.push({
            id: `order_pay_mixed_cash_${o.id}`,
            date: new Date(orderDate.getTime() + 1500),
            refNumber: `نقد #${o.invoiceNumber}`,
            type: 'cash_receipt',
            typeLabel: 'دریافت نقدی',
            description: `بخش دریافت نقدی فاکتور #${o.invoiceNumber}`,
            debit: 0,
            credit: o.cashAmount || 0,
            runningBalance: 0,
            balanceStatus: 'settled',
            originalData: o
          });
        }
      }
    });

    // B. Purchases & Expenses (فاکتورهای خرید مواد اولیه از تأمین‌کننده)
    expenses.forEach(e => {
      if (!isParty(e.supplierOrPerson)) return;

      const expAmount = e.amount || 0;
      const expDate = new Date(e.date);

      // 1. Purchase invoice entry: Credit = Amount (تأمین‌کننده بستانکار می‌شود)
      items.push({
        id: `expense_${e.id}`,
        date: expDate,
        refNumber: e.invoiceNumber ? `فاکتور خرید ${e.invoiceNumber}` : `سند خرید #${e.id}`,
        type: 'purchase_expense',
        typeLabel: 'فاکتور خرید / هزینه',
        description: `خرید ${e.title} (${e.category}) ${e.quantity ? `به مقدار ${e.quantity} ${e.unit || 'واحد'}` : ''}`,
        debit: 0,
        credit: expAmount,
        runningBalance: 0,
        balanceStatus: 'settled',
        originalData: e
      });

      // 2. If paid:
      if (e.status === 'paid' && expAmount > 0) {
        if (e.paymentMethod === 'card') {
          items.push({
            id: `expense_pay_card_${e.id}`,
            date: new Date(expDate.getTime() + 1000),
            refNumber: `واریز بانکی #${e.id}`,
            type: 'bank_payment',
            typeLabel: 'پرداخت بانکی',
            description: `واریز به حساب ${e.supplierOrPerson} بابت فاکتور ${e.title}${e.bankAccountName ? ` از ${e.bankAccountName}` : ''}`,
            debit: expAmount,
            credit: 0,
            runningBalance: 0,
            balanceStatus: 'settled',
            originalData: e
          });
        } else if (e.paymentMethod === 'cash') {
          items.push({
            id: `expense_pay_cash_${e.id}`,
            date: new Date(expDate.getTime() + 1000),
            refNumber: `پرداخت نقد #${e.id}`,
            type: 'cash_payment',
            typeLabel: 'پرداخت نقدی',
            description: `پرداخت نقدی به ${e.supplierOrPerson} بابت فاکتور ${e.title}${e.cashBoxName ? ` از ${e.cashBoxName}` : ''}`,
            debit: expAmount,
            credit: 0,
            runningBalance: 0,
            balanceStatus: 'settled',
            originalData: e
          });
        }
      }
    });

    // C. Cheques (چک‌های دریافتی، پرداختی، واگذار شده، برگشتی)
    cheques.forEach(ch => {
      const isDrawer = isParty(ch.drawerName);
      const isRecipient = isParty(ch.recipientName);
      const isTransferredTo = isParty(ch.transferredTo);

      if (!isDrawer && !isRecipient && !isTransferredTo) return;

      const chDate = new Date(ch.issueDate || ch.dueDate);

      // Case C1: Cheque received from customer
      if (isDrawer && ch.type === 'received') {
        // Receipt of cheque reduces customer debt: Credit
        items.push({
          id: `cheque_rec_${ch.id}`,
          date: chDate,
          refNumber: `چک #${ch.chequeNumber}`,
          type: 'cheque_received',
          typeLabel: 'دریافت چک صیادی',
          description: `دریافت چک صیادی شماره ${ch.chequeNumber} بانک ${ch.bankName} (سررسید: ${new Date(ch.dueDate).toLocaleDateString('fa-IR')})`,
          debit: 0,
          credit: ch.amount,
          runningBalance: 0,
          balanceStatus: 'settled',
          originalData: ch
        });

        // If bounced: customer becomes debtor again: Debit
        if (ch.status === 'bounced') {
          items.push({
            id: `cheque_bounce_${ch.id}`,
            date: new Date(ch.bounceDate || ch.dueDate),
            refNumber: ch.certificateNumber ? `گواهی عدم پرداخت ${ch.certificateNumber}` : `برگشت چک #${ch.chequeNumber}`,
            type: 'cheque_bounced',
            typeLabel: 'برگشت چک',
            description: `برگشت خوردن چک شماره ${ch.chequeNumber} (${ch.bounceReason || 'کسری موجودی'}) - بدهکار شدن مجدد طرف‌حساب`,
            debit: ch.amount,
            credit: 0,
            runningBalance: 0,
            balanceStatus: 'settled',
            originalData: ch
          });
        }
      }

      // Case C2: Cheque issued to supplier
      if (isRecipient && ch.type === 'paid') {
        // Issuing cheque to supplier settles debt: Debit
        items.push({
          id: `cheque_paid_${ch.id}`,
          date: chDate,
          refNumber: `چک صادره #${ch.chequeNumber}`,
          type: 'cheque_paid',
          typeLabel: 'صدور چک پرداختی',
          description: `صدور چک شماره ${ch.chequeNumber} بانک ${ch.bankName} در وجه ${ch.recipientName} (سررسید: ${new Date(ch.dueDate).toLocaleDateString('fa-IR')})`,
          debit: ch.amount,
          credit: 0,
          runningBalance: 0,
          balanceStatus: 'settled',
          originalData: ch
        });
      }

      // Case C3: Cheque transferred/endorsed to supplier (خرج کردن چک به نام این تأمین‌کننده)
      if (isTransferredTo && ch.status === 'transferred') {
        items.push({
          id: `cheque_transfer_${ch.id}`,
          date: new Date(ch.transferredDate || ch.issueDate),
          refNumber: `خرج چک #${ch.chequeNumber}`,
          type: 'cheque_transferred',
          typeLabel: 'خرج چک دریافتی',
          description: `واگذاری و خرج چک دریافتی شماره ${ch.chequeNumber} (${ch.bankName} صادرکننده: ${ch.drawerName}) به نام ${ch.transferredTo}`,
          debit: ch.amount,
          credit: 0,
          runningBalance: 0,
          balanceStatus: 'settled',
          originalData: ch
        });
      }
    });

    // D. Direct Financial Transactions (دریافت یا پرداخت وجه طرف‌حساب)
    transactions.forEach(tx => {
      const isSrc = isParty(tx.sourceName);
      const isTgt = isParty(tx.targetName);
      if (!isSrc && !isTgt) return;
      if (tx.type === 'cheque_deposit' || tx.type === 'cheque_payment') return; // already counted in orders/cheques

      if (tx.type === 'party_settlement') {
        const txDate = new Date(tx.date);
        if (isSrc) {
          // Party paid us (Receipt from party): Credit
          items.push({
            id: `tx_settle_${tx.id}`,
            date: txDate,
            refNumber: tx.trackingCode || tx.transactionNumber,
            type: 'bank_receipt',
            typeLabel: 'دریافت وجه',
            description: tx.description || `دریافت وجه از طرف‌حساب به حساب ${tx.targetName}`,
            debit: 0,
            credit: tx.amount,
            runningBalance: 0,
            balanceStatus: 'settled',
            originalData: tx
          });
        } else if (isTgt) {
          // We paid party (Payment to party): Debit
          items.push({
            id: `tx_settle_${tx.id}`,
            date: txDate,
            refNumber: tx.trackingCode || tx.transactionNumber,
            type: 'bank_payment',
            typeLabel: 'پرداخت وجه',
            description: tx.description || `پرداخت وجه به طرف‌حساب از ${tx.sourceName}`,
            debit: tx.amount,
            credit: 0,
            runningBalance: 0,
            balanceStatus: 'settled',
            originalData: tx
          });
        }
      }
    });

    // Sort chronologically ascending for correct running balance calculation
    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [selectedParty, orders, expenses, cheques, transactions]);

  // 4. Calculate Opening Balance, Filtered Items, and Running Balances
  const { openingBalance, statementRows, totalDebitInPeriod, totalCreditInPeriod, closingBalance } = useMemo(() => {
    let opening = 0;
    const periodRows: StatementItem[] = [];

    rawLedgerItems.forEach(item => {
      if (activeDateInterval && item.date < activeDateInterval.start) {
        // Prior to period: accumulate to opening balance
        opening += (item.debit - item.credit);
      } else if (!activeDateInterval || (item.date >= activeDateInterval.start && item.date <= activeDateInterval.end)) {
        // Within period
        periodRows.push({ ...item });
      }
    });

    // Apply document type filter and text search on period rows
    let filteredPeriodRows = periodRows.filter(row => {
      if (docTypeFilter !== 'all' && row.type !== docTypeFilter) return false;
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase().trim();
        const ref = (row.refNumber || '').toLowerCase();
        const desc = (row.description || '').toLowerCase();
        const typeL = (row.typeLabel || '').toLowerCase();
        if (!ref.includes(q) && !desc.includes(q) && !typeL.includes(q)) return false;
      }
      return true;
    });

    // Compute running balance row by row starting from opening balance
    let curBal = opening;
    let sumDebit = 0;
    let sumCredit = 0;

    const computedRows = filteredPeriodRows.map(row => {
      curBal += (row.debit - row.credit);
      sumDebit += row.debit;
      sumCredit += row.credit;

      const status: 'debtor' | 'creditor' | 'settled' = 
        curBal > 0 ? 'debtor' : curBal < 0 ? 'creditor' : 'settled';

      return {
        ...row,
        runningBalance: curBal,
        balanceStatus: status
      };
    });

    return {
      openingBalance: opening,
      statementRows: computedRows,
      totalDebitInPeriod: sumDebit,
      totalCreditInPeriod: sumCredit,
      closingBalance: curBal
    };
  }, [rawLedgerItems, activeDateInterval, docTypeFilter, tableSearch]);

  // Handle Quick Settlement submit
  const handleQuickSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;
    const amt = Number(settlementAmount);
    if (!amt || amt <= 0) {
      setSettlementError('مبلغ باید بیشتر از صفر باشد.');
      return;
    }

    try {
      setSettlementSubmitting(true);
      setSettlementError(null);

      await recordPartySettlement({
        direction: settlementDirection,
        partyName: selectedParty.name,
        amount: amt,
        paymentMethod: settlementMethod,
        bankAccountId: settlementMethod === 'card' ? settlementBankId : undefined,
        cashBoxId: settlementMethod === 'cash' ? settlementCashId : undefined,
        date: settlementDateObj ? settlementDateObj.toDate() : new Date(),
        trackingCode: settlementTracking.trim() || undefined,
        description: settlementDesc.trim() || undefined
      });

      setIsSettlementModalOpen(false);
      setSettlementAmount('');
      setSettlementTracking('');
      setSettlementDesc('');
    } catch (err: any) {
      console.error(err);
      setSettlementError(err?.message || 'خطا در ثبت تسویه طرف‌حساب.');
    } finally {
      setSettlementSubmitting(false);
    }
  };

  // Export to Excel / CSV
  const handleExportCSV = () => {
    if (!selectedParty) return;

    let csv = '\uFEFF'; // UTF-8 BOM
    csv += `صورتحساب مالی و معین طرف‌حساب: ${selectedParty.name}\n`;
    csv += `تاریخ گزارش: ${new Date().toLocaleDateString('fa-IR')} | بازه زمانی: ${datePreset}\n\n`;
    csv += 'ردیف,تاریخ,شماره سند/پیگیری,نوع سند,شرح آرتیکل,بدهکار (تومان),بستانکار (تومان),مانده لحظه‌ای (تومان),تشخیص\n';

    if (openingBalance !== 0) {
      csv += `-,نقل از قبل,-,مانده ابتدای دوره,مانده منتقل‌شده از قبل,0,0,${Math.abs(openingBalance)},${openingBalance > 0 ? 'بدهکار' : 'بستانکار'}\n`;
    }

    statementRows.forEach((row, idx) => {
      const dateStr = format(row.date, 'yyyy/MM/dd');
      const cleanDesc = `"${(row.description || '').replace(/"/g, '""')}"`;
      const cleanRef = `"${(row.refNumber || '').replace(/"/g, '""')}"`;
      const statusStr = row.balanceStatus === 'debtor' ? 'بدهکار' : row.balanceStatus === 'creditor' ? 'بستانکار' : 'تسویه';
      csv += `${idx + 1},${dateStr},${cleanRef},${row.typeLabel},${cleanDesc},${row.debit},${row.credit},${Math.abs(row.runningBalance)},${statusStr}\n`;
    });

    csv += `\nجمع کل در دوره,-,-,-,-,${totalDebitInPeriod},${totalCreditInPeriod},${Math.abs(closingBalance)},${closingBalance > 0 ? 'بدهکار نهایی' : closingBalance < 0 ? 'بستانکار نهایی' : 'تسویه کامل'}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `صورتحساب_${selectedParty.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filtered party list for the selector
  const filteredPartiesList = useMemo(() => {
    return allParties.filter(p => {
      if (partyTypeFilter === 'customers' && p.role === 'supplier') return false;
      if (partyTypeFilter === 'suppliers' && p.role === 'customer') return false;
      if (partySearchQuery.trim()) {
        const q = partySearchQuery.toLowerCase().trim();
        const n = p.name.toLowerCase();
        const ph = (p.phone || '').toLowerCase();
        if (!n.includes(q) && !ph.includes(q)) return false;
      }
      return true;
    });
  }, [allParties, partyTypeFilter, partySearchQuery]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* ===================== TOP HEADER & SELECTOR ===================== */}
      <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">صورتحساب و معین اشخاص (خرید و فروش)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                دفتر معین تفصیلی مشتریان و تأمین‌کنندگان، گردش فاکتورها، چک‌ها و تسویه‌ها با تراز لحظه‌ای
              </p>
            </div>
          </div>
        </div>

        {/* Global Toolbar buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end">
          {selectedParty && (
            <>
              <button
                onClick={() => {
                  setSettlementDirection(closingBalance > 0 ? 'receipt' : 'payment');
                  setSettlementAmount(closingBalance !== 0 ? Math.abs(closingBalance) : '');
                  setIsSettlementModalOpen(true);
                }}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer active:scale-95"
              >
                <Plus size={16} />
                <span>ثبت دریافت / پرداخت وجه</span>
              </button>

              <button
                onClick={handleExportCSV}
                className="py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="دانلود خروجی اکسل و CSV"
              >
                <FileSpreadsheet size={16} />
                <span>خروجی اکسل</span>
              </button>

              <button
                onClick={() => window.print()}
                className="py-2.5 px-3.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                title="چاپ رسمی صورتحساب حسابداری"
              >
                <Printer size={16} />
                <span>چاپ استاندارد</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===================== PARTY SELECTOR & PROFILE ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Col 1: Party Directory Selector (Search & Pick) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Users size={16} className="text-blue-600" />
                <span>انتخاب طرف‌حساب</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {filteredPartiesList.length} شخص
              </span>
            </div>

            {/* Quick Filter tabs */}
            <div className="flex gap-1 mb-3 bg-slate-100 p-1 rounded-xl text-[11px]">
              {[
                { id: 'all', label: 'همه' },
                { id: 'customers', label: 'خریداران' },
                { id: 'suppliers', label: 'تأمین‌کنندگان' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setPartyTypeFilter(t.id as any)}
                  className={`flex-1 py-1 text-center font-bold rounded-lg transition-all cursor-pointer ${
                    partyTypeFilter === t.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative mb-3">
              <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={partySearchQuery}
                onChange={e => setPartySearchQuery(e.target.value)}
                placeholder="جستجوی نام یا تلفن شخص..."
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs outline-none"
              />
            </div>

            {/* Parties Scroll List */}
            <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5 divide-y divide-slate-50">
              {filteredPartiesList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  شخصی با این مشخصات یافت نشد.
                </div>
              ) : (
                filteredPartiesList.map(p => {
                  const isSelected = p.key === selectedPartyKey;
                  return (
                    <button
                      key={p.key}
                      onClick={() => setSelectedPartyKey(p.key)}
                      className={`w-full text-right p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between ${
                        isSelected 
                          ? 'bg-blue-50 border border-blue-200 text-blue-900' 
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-xs">{p.name}</div>
                          {p.phone && <div className="text-[10px] text-slate-400 font-mono" dir="ltr">{p.phone}</div>}
                        </div>
                      </div>

                      <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                        p.role === 'customer' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : p.role === 'supplier' 
                          ? 'bg-amber-50 text-amber-700' 
                          : 'bg-indigo-50 text-indigo-700'
                      }`}>
                        {p.role === 'customer' ? 'مشتری' : p.role === 'supplier' ? 'تأمین‌کننده' : 'دوطرفه'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Col 2 & 3: Selected Party Profile & Running Balance Card */}
        {selectedParty ? (
          <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white text-xl font-bold shadow-inner">
                    {selectedParty.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold">{selectedParty.name}</h3>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-white/20 text-white backdrop-blur-xs">
                        {selectedParty.role === 'customer' ? 'خریدار / مشتری' : selectedParty.role === 'supplier' ? 'فروشنده / تأمین‌کننده' : 'مشتری و تأمین‌کننده'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-1">
                      {selectedParty.phone && (
                        <span className="flex items-center gap-1 font-mono" dir="ltr">
                          <Phone size={13} className="text-slate-400" />
                          <span>{selectedParty.phone}</span>
                        </span>
                      )}
                      {selectedParty.address && (
                        <span className="flex items-center gap-1">
                          <MapPin size={13} className="text-slate-400" />
                          <span>{selectedParty.address}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Final Balance Badge */}
                <div className="text-left bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/15">
                  <div className="text-[11px] text-slate-300 mb-0.5">وضعیت نهایی حساب (معین):</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-mono font-bold" dir="ltr">
                      {formatCurrency(Math.abs(closingBalance))}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                      closingBalance > 0 
                        ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40' 
                        : closingBalance < 0 
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' 
                        : 'bg-slate-500/30 text-slate-300'
                    }`}>
                      {closingBalance > 0 ? 'بدهکار به ما' : closingBalance < 0 ? 'بستانکار از ما (طلبکار)' : 'تسویه کامل'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-300 font-bold mt-1 text-right">
                    {numberToPersianWords(Math.abs(closingBalance))} تومان
                  </div>
                </div>
              </div>

              {/* 3 Metrics Mini Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10 text-xs">
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <span className="text-slate-400 text-[11px] block">گردش بدهکار در دوره:</span>
                  <span className="text-sm font-mono font-bold text-amber-300">
                    {formatCurrency(totalDebitInPeriod)}
                  </span>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <span className="text-slate-400 text-[11px] block">گردش بستانکار در دوره:</span>
                  <span className="text-sm font-mono font-bold text-emerald-300">
                    {formatCurrency(totalCreditInPeriod)}
                  </span>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <span className="text-slate-400 text-[11px] block">تعداد اسناد و تراکنش‌ها:</span>
                  <span className="text-sm font-mono font-bold text-white">
                    {statementRows.length} سطر ثبتی
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 bg-slate-50 rounded-3xl p-8 border border-slate-200 text-center flex flex-col items-center justify-center text-slate-400 text-xs">
            <Users size={32} className="mb-2 text-slate-300" />
            <span>لطفاً یک طرف‌حساب را از ستون کناری انتخاب کنید تا صورتحساب تفصیلی نمایش داده شود.</span>
          </div>
        )}
      </div>

      {/* ===================== FILTERS & INTERVAL TOOLBAR ===================== */}
      {selectedParty && (
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'کل دوره' },
              { id: 'today', label: 'امروز' },
              { id: 'last_7_days', label: '۷ روز اخیر' },
              { id: 'this_month', label: 'ماه جاری' },
              { id: 'last_month', label: 'ماه گذشته' },
              { id: 'last_90_days', label: 'فصل جاری' },
              { id: 'this_year', label: 'سال جاری' },
              { id: 'custom', label: 'بازه دلخواه' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setDatePreset(p.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  datePreset === p.id 
                    ? 'bg-slate-900 text-white shadow-xs' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Range Picker */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-bold">بازه شمسی:</span>
              <DatePicker
                range
                value={customRange}
                onChange={setCustomRange as any}
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-right"
                inputClass="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:bg-white outline-none"
              />
            </div>
          )}

          {/* Document Type Selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={docTypeFilter}
              onChange={e => setDocTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">همه انواع اسناد</option>
              <option value="sale_order">فاکتورهای فروش</option>
              <option value="purchase_expense">فاکتورهای خرید</option>
              <option value="bank_receipt">دریافتی‌های کارتخوان/بانک</option>
              <option value="cash_receipt">دریافتی‌های نقدی</option>
              <option value="bank_payment">پرداختی‌های بانکی</option>
              <option value="cash_payment">پرداختی‌های نقدی</option>
              <option value="cheque_received">چک‌های دریافتی</option>
              <option value="cheque_paid">چک‌های پرداختی</option>
              <option value="cheque_transferred">چک‌های خرج شده</option>
              <option value="cheque_bounced">چک‌های برگشتی</option>
            </select>

            {/* Table Search */}
            <div className="relative flex-1 sm:w-48">
              <input
                type="text"
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="جستجو در شرح سند یا شماره..."
                className="w-full pr-7 pl-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs outline-none"
              />
              <Search size={13} className="absolute right-2.5 top-2.5 text-slate-400" />
            </div>
          </div>
        </div>
      )}

      {/* ===================== STANDARD ACCOUNTING LEDGER TABLE ===================== */}
      {selectedParty && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" ref={printAreaRef}>
          {/* Printable Header (Visible on print or normal header) */}
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800">
                  صورتحساب رسمی تفصیلی
                </span>
                <h3 className="font-bold text-base text-slate-800">
                  گردش حساب: {selectedParty.name}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                از تاریخ: {activeDateInterval ? format(activeDateInterval.start, 'yyyy/MM/dd') : 'ابتدای دوره'} تا تاریخ: {activeDateInterval ? format(activeDateInterval.end, 'yyyy/MM/dd') : 'امروز'}
              </p>
            </div>

            <div className="text-left text-xs space-y-1">
              <div>
                <span className="text-slate-400">تاریخ چاپ: </span>
                <span className="font-mono font-bold text-slate-700" dir="ltr">{format(new Date(), 'yyyy/MM/dd HH:mm')}</span>
              </div>
              {settings?.restaurantName && (
                <div>
                  <span className="text-slate-400">مجموعه: </span>
                  <span className="font-bold text-slate-700">{settings.restaurantName}</span>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-3 text-center w-12">ردیف</th>
                  <th className="py-3.5 px-3 w-28">تاریخ سند</th>
                  <th className="py-3.5 px-3 w-36">شماره سند / پیگیری</th>
                  <th className="py-3.5 px-3 w-32">نوع عملیات</th>
                  <th className="py-3.5 px-4 min-w-[240px]">شرح آرتیکل حسابداری</th>
                  <th className="py-3.5 px-3 text-left w-32 font-mono">بدهکار (تومان)</th>
                  <th className="py-3.5 px-3 text-left w-32 font-mono">بستانکار (تومان)</th>
                  <th className="py-3.5 px-3 text-left w-36 font-mono">مانده سطر (تومان)</th>
                  <th className="py-3.5 px-3 text-center w-20">تشخیص</th>
                  <th className="py-3.5 px-2 text-center w-12 no-print">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* 1. Opening Balance Row */}
                {openingBalance !== 0 && (
                  <tr className="bg-amber-50/50 font-bold text-slate-800">
                    <td className="py-3 px-3 text-center text-slate-400">-</td>
                    <td className="py-3 px-3 text-slate-500 font-mono">نقل از قبل</td>
                    <td className="py-3 px-3 text-slate-500 font-mono">-</td>
                    <td className="py-3 px-3">
                      <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md text-[10px]">
                        مانده ابتدای دوره
                      </span>
                    </td>
                    <td className="py-3 px-4 text-amber-900">
                      مانده منتقل‌شده از قبل (پیش از بازه گزارش انتخابی)
                    </td>
                    <td className="py-3 px-3 text-left font-mono">
                      {openingBalance > 0 ? formatCurrency(openingBalance) : '۰'}
                    </td>
                    <td className="py-3 px-3 text-left font-mono">
                      {openingBalance < 0 ? formatCurrency(Math.abs(openingBalance)) : '۰'}
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-amber-800">
                      {formatCurrency(Math.abs(openingBalance))}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        openingBalance > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {openingBalance > 0 ? 'بد' : 'بس'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center no-print">-</td>
                  </tr>
                )}

                {/* 2. Statement Period Rows */}
                {statementRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      تراکنشی در این بازه زمانی برای طرف‌حساب ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  statementRows.map((row, idx) => {
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 text-center font-mono text-slate-400">
                          {idx + 1}
                        </td>

                        <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap" dir="ltr">
                          {format(row.date, 'yyyy/MM/dd')}
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {row.refNumber}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            row.type === 'sale_order' 
                              ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                              : row.type === 'purchase_expense' 
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : row.type === 'bank_receipt' || row.type === 'cash_receipt'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : row.type === 'bank_payment' || row.type === 'cash_payment'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : row.type === 'cheque_bounced'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}>
                            {row.typeLabel}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-slate-700 font-medium leading-relaxed">
                          {row.description}
                        </td>

                        <td className="py-3 px-3 text-left font-mono font-bold text-slate-900 whitespace-nowrap">
                          {row.debit > 0 ? formatCurrency(row.debit) : '۰'}
                        </td>

                        <td className="py-3 px-3 text-left font-mono font-bold text-slate-900 whitespace-nowrap">
                          {row.credit > 0 ? formatCurrency(row.credit) : '۰'}
                        </td>

                        <td className="py-3 px-3 text-left font-mono font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(Math.abs(row.runningBalance))}
                        </td>

                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            row.balanceStatus === 'debtor'
                              ? 'bg-rose-100 text-rose-800'
                              : row.balanceStatus === 'creditor'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {row.balanceStatus === 'debtor' ? 'بد' : row.balanceStatus === 'creditor' ? 'بس' : '---'}
                          </span>
                        </td>

                        <td className="py-3 px-2 text-center no-print">
                          <button
                            onClick={() => setViewingDetailItem(row)}
                            className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="مشاهده جزئیات سند"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* 3. Totals & Closing Balance Footer */}
              <tfoot className="bg-slate-100 text-slate-800 font-bold border-t-2 border-slate-300">
                <tr>
                  <td colSpan={5} className="py-3 px-4 text-left font-bold text-xs">
                    مجموع گردش دوره انتخابی:
                  </td>
                  <td className="py-3 px-3 text-left font-mono text-sm text-amber-900 whitespace-nowrap">
                    {formatCurrency(totalDebitInPeriod)}
                  </td>
                  <td className="py-3 px-3 text-left font-mono text-sm text-emerald-900 whitespace-nowrap">
                    {formatCurrency(totalCreditInPeriod)}
                  </td>
                  <td className="py-3 px-3 text-left font-mono text-sm text-slate-900 whitespace-nowrap">
                    {formatCurrency(Math.abs(closingBalance))}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      closingBalance > 0 ? 'bg-rose-200 text-rose-900' : closingBalance < 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {closingBalance > 0 ? 'بد (بدهکار)' : closingBalance < 0 ? 'بس (طلبکار)' : 'تسویه'}
                    </span>
                  </td>
                  <td className="no-print"></td>
                </tr>

                {/* Final Written Balance */}
                <tr className="bg-slate-200/60 text-slate-900">
                  <td colSpan={10} className="py-3 px-4 text-xs font-bold flex items-center justify-between">
                    <div>
                      <span>مانده نهایی حساب جهت تسویه: </span>
                      <span className="text-blue-900 font-extrabold mr-1">
                        {numberToPersianWords(Math.abs(closingBalance))} تومان
                      </span>
                      <span className="text-slate-500 mr-2">
                        ({closingBalance > 0 ? 'شخص به فروشگاه بدهکار است' : closingBalance < 0 ? 'شخص از فروشگاه طلبکار است' : 'حساب کاملاً تسویه و صفر است'})
                      </span>
                    </div>

                    <div className="font-mono text-sm font-bold" dir="ltr">
                      {formatCurrency(Math.abs(closingBalance))} T
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Official Signatures Box (Official Print Requirements) */}
          <div className="p-8 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-xs text-slate-600 bg-slate-50/30">
            <div className="border border-slate-200 rounded-2xl p-6 bg-white space-y-8">
              <span className="font-bold text-slate-800 block">مهر و امضای امور مالی و حسابداری مجموعه</span>
              <div className="text-[11px] text-slate-400">تأیید صحت ارقام و مانده دفتری</div>
            </div>
            <div className="border border-slate-200 rounded-2xl p-6 bg-white space-y-8">
              <span className="font-bold text-slate-800 block">مهر و امضای طرف‌حساب ({selectedParty.name})</span>
              <div className="text-[11px] text-slate-400">تأییدیه نهایی مانده جهت حسابرسی و تسویه حساب</div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== QUICK SETTLEMENT MODAL ===================== */}
      {isSettlementModalOpen && selectedParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative">
            <button
              onClick={() => setIsSettlementModalOpen(false)}
              className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <ArrowRightLeft size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">ثبت تسویه مالی طرف‌حساب</h3>
                <p className="text-xs text-slate-500">
                  ثبت سند دریافت یا پرداخت وجه برای {selectedParty.name}
                </p>
              </div>
            </div>

            {settlementError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{settlementError}</span>
              </div>
            )}

            <form onSubmit={handleQuickSettlementSubmit} className="space-y-4 text-xs">
              {/* Direction: Receipt vs Payment */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">جهت تراکنش</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSettlementDirection('receipt')}
                    className={`py-2.5 rounded-xl font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      settlementDirection === 'receipt'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowDownRight size={16} className="text-emerald-600" />
                    <span>دریافت وجه از طرف‌حساب</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettlementDirection('payment')}
                    className={`py-2.5 rounded-xl font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      settlementDirection === 'payment'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowUpRight size={16} className="text-rose-600" />
                    <span>پرداخت وجه به طرف‌حساب</span>
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  مبلغ تسویه (تومان) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={settlementAmount}
                  onChange={e => setSettlementAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="مبلغ به تومان..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                  required
                />
                {Number(settlementAmount) > 0 && (
                  <div className="text-[11px] text-emerald-700 font-bold mt-1 text-left">
                    {numberToPersianWords(Number(settlementAmount))} تومان
                  </div>
                )}
              </div>

              {/* Method: Card/Bank vs Cash */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">روش پرداخت/دریافت</label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setSettlementMethod('card')}
                    className={`py-2 rounded-xl font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      settlementMethod === 'card'
                        ? 'bg-blue-50 border-blue-500 text-blue-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <CreditCard size={15} />
                    <span>واریز / کارتخوان بانک</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettlementMethod('cash')}
                    className={`py-2 rounded-xl font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      settlementMethod === 'cash'
                        ? 'bg-amber-50 border-amber-500 text-amber-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <Banknote size={15} />
                    <span>صندوق نقدی</span>
                  </button>
                </div>

                {settlementMethod === 'card' ? (
                  <select
                    value={settlementBankId || ''}
                    onChange={e => setSettlementBankId(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                    required
                  >
                    <option value="">-- انتخاب حساب بانکی --</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} - موجودی: {formatCurrency(b.balance)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={settlementCashId || ''}
                    onChange={e => setSettlementCashId(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                    required
                  >
                    <option value="">-- انتخاب صندوق نقدی --</option>
                    {cashBoxes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} - موجودی: {formatCurrency(c.balance)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Date & Tracking */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">تاریخ ثبت سند</label>
                  <DatePicker
                    value={settlementDateObj}
                    onChange={setSettlementDateObj as any}
                    calendar={persian}
                    locale={persian_fa}
                    calendarPosition="bottom-right"
                    inputClass="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">شماره پیگیری / فیش</label>
                  <input
                    type="text"
                    value={settlementTracking}
                    onChange={e => setSettlementTracking(e.target.value)}
                    placeholder="کد ارجاع یا پیگیری..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">بابت / توضیحات</label>
                <input
                  type="text"
                  value={settlementDesc}
                  onChange={e => setSettlementDesc(e.target.value)}
                  placeholder="مثلا: تسویه مانده حساب فاکتور..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSettlementModalOpen(false)}
                  disabled={settlementSubmitting}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={settlementSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check size={16} />
                  <span>{settlementSubmitting ? 'در حال ثبت...' : 'ثبت سند مالی'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== DETAIL VIEW MODAL ===================== */}
      {viewingDetailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 my-auto relative">
            <button
              onClick={() => setViewingDetailItem(null)}
              className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileText size={18} className="text-blue-600" />
              <span>جزئیات آرتیکل حسابداری</span>
            </h3>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-5">
              <div className="flex justify-between">
                <span className="text-slate-500">شماره سند / پیگیری:</span>
                <span className="font-mono font-bold text-slate-900">{viewingDetailItem.refNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تاریخ:</span>
                <span className="font-mono font-bold text-slate-800" dir="ltr">{format(viewingDetailItem.date, 'yyyy/MM/dd HH:mm')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">نوع سند:</span>
                <span className="font-bold text-slate-800">{viewingDetailItem.typeLabel}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200/60 pt-2">
                <span className="text-slate-500">مبلغ بدهکار:</span>
                <span className="font-mono font-bold text-amber-700">{formatCurrency(viewingDetailItem.debit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">مبلغ بستانکار:</span>
                <span className="font-mono font-bold text-emerald-700">{formatCurrency(viewingDetailItem.credit)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200/60 pt-2">
                <span className="text-slate-500">مانده لحظه‌ای بعد از ثبت:</span>
                <span className="font-mono font-bold text-slate-900">{formatCurrency(Math.abs(viewingDetailItem.runningBalance))}</span>
              </div>
              <div className="border-t border-slate-200/60 pt-2">
                <span className="text-slate-500 block mb-1">شرح کامل:</span>
                <p className="text-slate-800 font-medium leading-relaxed">{viewingDetailItem.description}</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setViewingDetailItem(null)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
