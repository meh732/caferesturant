import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Customer, Order, CustomerWalletTransaction, generateNextSubscriptionCode } from '../../lib/db';
import { topUpCustomerWallet, settleCustomerCreditDebt } from '../../lib/accountingServices';
import { sendCustomerWalletStatusToBot } from '../../lib/botBackupService';
import { triggerServerDbSync } from '../../lib/serverSync';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import { format as formatJalali } from 'date-fns-jalali';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { 
  Users, Search, Phone, Plus, Edit2, Trash2, MapPin, Hash, X, Save, 
  UserPlus, Wallet, FileText, QrCode, Send, Copy, Check, Sparkles, 
  Calendar, Award, CreditCard, DollarSign, ExternalLink, Download, 
  Printer, RefreshCw, AlertCircle, CheckCircle2, BookOpen, Gift, Crown
} from 'lucide-react';

const TIER_CONFIG: Record<NonNullable<Customer['tier']>, { label: string; badgeClass: string }> = {
  bronze: { label: 'برنزی', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  silver: { label: 'نقره‌ای', badgeClass: 'bg-slate-200 text-slate-800 border-slate-300' },
  gold: { label: 'طلایی', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  vip: { label: 'VIP ویژه', badgeClass: 'bg-purple-100 text-purple-800 border-purple-300' },
};

export default function CustomersScreen() {
  const customersList = useLiveQuery(() => db.customers.toArray()) || [];
  const orders = useLiveQuery(() => db.orders.toArray()) || [];
  const walletTransactions = useLiveQuery(() => db.customerWalletTransactions.toArray()) || [];
  const bankAccounts = useLiveQuery(() => db.bankAccounts.filter(b => b.isActive).toArray()) || [];
  const cashBoxes = useLiveQuery(() => db.cashBoxes.filter(c => c.isActive).toArray()) || [];
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'has_wallet' | 'has_debt' | 'vip' | 'birthdays'>('all');

  // Add/Edit Customer Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);

  // Customer Statement, Wallet & Portal Modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [statementTab, setStatementTab] = useState<'statement' | 'wallet' | 'credit' | 'portal'>('statement');

  // Wallet Top-Up form states
  const [topUpAmount, setTopUpAmount] = useState<number>(500000);
  const [topUpMethod, setTopUpMethod] = useState<'card' | 'cash'>('card');
  const [topUpBankId, setTopUpBankId] = useState<number | undefined>(undefined);
  const [topUpCashId, setTopUpCashId] = useState<number | undefined>(undefined);
  const [topUpTracking, setTopUpTracking] = useState('');
  const [topUpNote, setTopUpNote] = useState('');
  const [isProcessingWallet, setIsProcessingWallet] = useState(false);

  // Credit Settlement form states
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleMethod, setSettleMethod] = useState<'card' | 'cash' | 'wallet'>('card');
  const [settleTracking, setSettleTracking] = useState('');
  const [settleNote, setSettleNote] = useState('');

  // Portal QR & Bot states
  const [portalQrDataUrl, setPortalQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [botStatusMsg, setBotStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSendingBot, setIsSendingBot] = useState(false);

  // General Store Customer Club QR State (for counter/tables)
  const [isGeneralQrModalOpen, setIsGeneralQrModalOpen] = useState(false);
  const [generalQrDataUrl, setGeneralQrDataUrl] = useState('');

  useEffect(() => {
    if (isGeneralQrModalOpen) {
      const lanIp = localStorage.getItem('arka_lan_ip');
      const port = settings?.localServerPort || window.location.port || '3000';
      let baseOrigin = window.location.origin;
      if (lanIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        baseOrigin = `${window.location.protocol}//${lanIp}:${port}`;
      }
      const generalUrl = `${baseOrigin}/?mode=wallet`;
      QRCode.toDataURL(generalUrl, { width: 280, margin: 1 }).then(setGeneralQrDataUrl).catch(() => setGeneralQrDataUrl(''));
    }
  }, [isGeneralQrModalOpen, settings?.localServerPort]);

  useEffect(() => {
    const defBank = bankAccounts.find(b => b.isDefaultPos) || bankAccounts[0];
    if (defBank?.id && !topUpBankId) setTopUpBankId(defBank.id);
    const defCash = cashBoxes.find(c => c.isDefault) || cashBoxes[0];
    if (defCash?.id && !topUpCashId) setTopUpCashId(defCash.id);
  }, [bankAccounts.length, cashBoxes.length]);

  // Current Jalali month (e.g., "07" for Mehr) to detect birthdays this month
  const currentJalaliMonth = useMemo(() => {
    try {
      return formatJalali(new Date(), 'MM');
    } catch {
      return '';
    }
  }, []);

  // Compute aggregated stats for each customer (orders, credit debt, wallet history)
  const customerStatsMap = useMemo(() => {
    const map = new Map<number, {
      totalSpent: number;
      orderCount: number;
      creditPurchases: number;
      creditSettled: number;
      creditDebt: number;
      lastOrderDate?: Date;
      customerOrders: Order[];
      customerWalletTxs: CustomerWalletTransaction[];
    }>();

    customersList.forEach(c => {
      if (!c.id) return;
      map.set(c.id, {
        totalSpent: 0,
        orderCount: 0,
        creditPurchases: 0,
        creditSettled: 0,
        creditDebt: 0,
        customerOrders: [],
        customerWalletTxs: [],
      });
    });

    // Map by phone as well for legacy orders without customerId
    const phoneToId = new Map<string, number>();
    customersList.forEach(c => {
      if (c.id && c.phone) phoneToId.set(c.phone.trim(), c.id);
    });

    orders.forEach(order => {
      if (order.status === 'cancelled') return;
      const cid = order.customerId || (order.customerPhone ? phoneToId.get(order.customerPhone.trim()) : undefined);
      if (!cid || !map.has(cid)) return;
      const st = map.get(cid)!;
      st.totalSpent += (order.total || 0);
      st.orderCount += 1;
      if (order.paymentMethod === 'credit') {
        st.creditPurchases += (order.total || 0);
      }
      if (!st.lastOrderDate || new Date(order.createdAt) > new Date(st.lastOrderDate)) {
        st.lastOrderDate = new Date(order.createdAt);
      }
      st.customerOrders.push(order);
    });

    walletTransactions.forEach(wtx => {
      const cid = wtx.customerId || (wtx.customerPhone ? phoneToId.get(wtx.customerPhone.trim()) : undefined);
      if (!cid || !map.has(cid)) return;
      const st = map.get(cid)!;
      if (wtx.type === 'credit_settlement') {
        st.creditSettled += (wtx.amount || 0);
      }
      st.customerWalletTxs.push(wtx);
    });

    map.forEach(st => {
      st.creditDebt = Math.max(0, st.creditPurchases - st.creditSettled);
      st.customerOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      st.customerWalletTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    return map;
  }, [customersList, orders, walletTransactions]);

  const processedCustomers = useMemo(() => {
    return customersList.map(customer => {
      const st = (customer.id && customerStatsMap.get(customer.id)) || {
        totalSpent: 0,
        orderCount: 0,
        creditPurchases: 0,
        creditSettled: 0,
        creditDebt: 0,
        lastOrderDate: undefined,
        customerOrders: [],
        customerWalletTxs: [],
      };
      const birthMonth = customer.birthDate ? customer.birthDate.split('/')[1] : '';
      const isBirthdayMonth = Boolean(birthMonth && birthMonth === currentJalaliMonth);

      return {
        ...customer,
        walletBalance: customer.walletBalance || 0,
        totalSpent: st.totalSpent,
        orderCount: st.orderCount,
        creditDebt: st.creditDebt,
        lastOrderDate: st.lastOrderDate,
        customerOrders: st.customerOrders,
        customerWalletTxs: st.customerWalletTxs,
        isBirthdayMonth,
      };
    }).filter(c => {
      if (activeFilter === 'has_wallet' && (c.walletBalance || 0) <= 0) return false;
      if (activeFilter === 'has_debt' && c.creditDebt <= 0) return false;
      if (activeFilter === 'vip' && c.tier !== 'vip' && c.tier !== 'gold') return false;
      if (activeFilter === 'birthdays' && !c.isBirthdayMonth) return false;

      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        c.phone.includes(query) ||
        (c.name && c.name.toLowerCase().includes(query)) ||
        (c.subscriptionCode && c.subscriptionCode.toLowerCase().includes(query)) ||
        (c.birthDate && c.birthDate.includes(query)) ||
        (c.address && c.address.toLowerCase().includes(query))
      );
    }).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [customersList, customerStatsMap, searchQuery, activeFilter, currentJalaliMonth]);

  // Selected customer for Statement/Wallet Modal
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return processedCustomers.find(c => c.id === selectedCustomerId) || null;
  }, [processedCustomers, selectedCustomerId]);

  // Build personal customer wallet & order portal URL
  const getCustomerPortalUrl = (c: Customer) => {
    const lanIp = localStorage.getItem('arka_lan_ip');
    const port = settings?.localServerPort || window.location.port || '3000';
    let baseOrigin = window.location.origin;
    if (lanIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      baseOrigin = `${window.location.protocol}//${lanIp}:${port}`;
    }
    const subParam = encodeURIComponent(c.subscriptionCode || '');
    const phoneParam = encodeURIComponent(c.phone || '');
    return `${baseOrigin}/?mode=wallet&sub=${subParam}&phone=${phoneParam}`;
  };

  useEffect(() => {
    if (selectedCustomer) {
      const url = getCustomerPortalUrl(selectedCustomer);
      setSettleAmount(selectedCustomer.creditDebt || 0);
      QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setPortalQrDataUrl).catch(() => setPortalQrDataUrl(''));
    } else {
      setPortalQrDataUrl('');
    }
  }, [selectedCustomer?.id, selectedCustomer?.subscriptionCode, selectedCustomer?.phone, selectedCustomer?.creditDebt]);

  // Overall Club KPIs
  const clubKpis = useMemo(() => {
    let totalWallet = 0;
    let totalCreditDebt = 0;
    let totalClubSales = 0;
    let birthdayCount = 0;

    processedCustomers.forEach(c => {
      totalWallet += (c.walletBalance || 0);
      totalCreditDebt += (c.creditDebt || 0);
      totalClubSales += (c.totalSpent || 0);
      if (c.isBirthdayMonth) birthdayCount++;
    });

    return {
      totalMembers: customersList.length,
      totalWallet,
      totalCreditDebt,
      totalClubSales,
      birthdayCount,
    };
  }, [customersList.length, processedCustomers]);

  const handleOpenAddModal = async () => {
    const nextCode = await generateNextSubscriptionCode();
    setEditingCustomer({
      phone: '',
      name: '',
      subscriptionCode: nextCode,
      birthDate: '',
      address: '',
      walletBalance: 0,
      cashbackPercent: 0,
      tier: 'bronze',
      telegramChatId: '',
      baleChatId: '',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (customer: Customer) => {
    const subCode = customer.subscriptionCode || await generateNextSubscriptionCode();
    setEditingCustomer({
      ...customer,
      subscriptionCode: subCode,
    });
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer?.phone?.trim()) {
      alert('لطفاً شماره موبایل مشتری را وارد کنید.');
      return;
    }

    const phone = editingCustomer.phone.trim();
    const name = editingCustomer.name?.trim() || '';
    const subscriptionCode = editingCustomer.subscriptionCode?.trim() || await generateNextSubscriptionCode();
    const birthDate = editingCustomer.birthDate?.trim() || undefined;
    const address = editingCustomer.address?.trim() || '';
    const tier = editingCustomer.tier || 'bronze';
    const cashbackPercent = Number(editingCustomer.cashbackPercent) || 0;
    const telegramChatId = editingCustomer.telegramChatId?.trim() || undefined;
    const baleChatId = editingCustomer.baleChatId?.trim() || undefined;
    const notes = editingCustomer.notes?.trim() || undefined;

    const existing = await db.customers.where('phone').equals(phone).first();
    if (existing && existing.id !== editingCustomer.id) {
      alert('این شماره موبایل قبلاً در باشگاه مشتریان ثبت شده است.');
      return;
    }

    if (editingCustomer.id) {
      await db.customers.update(editingCustomer.id, {
        phone,
        name,
        subscriptionCode,
        birthDate,
        address,
        tier,
        cashbackPercent,
        telegramChatId,
        baleChatId,
        notes,
      });
    } else {
      const initialWallet = Number(editingCustomer.walletBalance) || 0;
      const newId = await db.customers.add({
        phone,
        name,
        subscriptionCode,
        birthDate,
        address,
        walletBalance: 0,
        loyaltyPoints: 0,
        tier,
        cashbackPercent,
        telegramChatId,
        baleChatId,
        notes,
        createdAt: new Date(),
      }) as number;

      if (initialWallet > 0 && newId) {
        try {
          await topUpCustomerWallet({
            customerId: newId,
            amount: initialWallet,
            paymentMethod: 'card',
            bankAccountId: topUpBankId,
            description: 'شارژ اولیه کیف پول هنگام عضویت در باشگاه مشتریان',
          });
        } catch {
          await db.customers.update(newId, { walletBalance: initialWallet });
        }
      }
    }

    triggerServerDbSync(100);
    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const handleAssignMissingSubscriptionCodes = async () => {
    const missing = customersList.filter(c => !c.subscriptionCode || !c.subscriptionCode.trim());
    if (missing.length === 0) {
      alert('تمامی اعضای باشگاه مشتریان دارای کد اشتراک هستند.');
      return;
    }
    let nextCodeNum = parseInt(await generateNextSubscriptionCode(), 10) || 1001;
    for (const c of missing) {
      if (c.id) {
        await db.customers.update(c.id, { subscriptionCode: String(nextCodeNum) });
        nextCodeNum++;
      }
    }
    triggerServerDbSync(100);
  };

  const handleDeleteCustomer = async (id: number) => {
    if (window.confirm('آیا از حذف این عضو باشگاه مشتریان اطمینان دارید؟')) {
      await db.customers.delete(id);
      triggerServerDbSync(100);
    }
  };

  const handleToggleMandatoryPhone = async () => {
    if (!settings?.id) return;
    await db.settings.update(settings.id, {
      requireCustomerPhone: !settings.requireCustomerPhone,
    });
    triggerServerDbSync(100);
  };

  const handleWalletTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer?.id) return;
    if (topUpAmount <= 0) {
      alert('مبلغ شارژ کیف پول باید بیشتر از صفر باشد.');
      return;
    }

    setIsProcessingWallet(true);
    try {
      await topUpCustomerWallet({
        customerId: selectedCustomer.id,
        amount: topUpAmount,
        paymentMethod: topUpMethod,
        bankAccountId: topUpMethod === 'card' ? topUpBankId : undefined,
        cashBoxId: topUpMethod === 'cash' ? topUpCashId : undefined,
        trackingCode: topUpTracking,
        description: topUpNote || `شارژ کیف پول مشتری (${selectedCustomer.name || selectedCustomer.phone})`,
      });
      setTopUpTracking('');
      setTopUpNote('');
      setStatementTab('statement');
    } catch (err: any) {
      alert(err?.message || 'خطا در ثبت شارژ کیف پول.');
    } finally {
      setIsProcessingWallet(false);
    }
  };

  const handleCreditSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer?.id) return;
    if (settleAmount <= 0) {
      alert('مبلغ تسویه باید بیشتر از صفر باشد.');
      return;
    }

    setIsProcessingWallet(true);
    try {
      await settleCustomerCreditDebt({
        customerId: selectedCustomer.id,
        amount: settleAmount,
        paymentMethod: settleMethod,
        bankAccountId: settleMethod === 'card' ? topUpBankId : undefined,
        cashBoxId: settleMethod === 'cash' ? topUpCashId : undefined,
        trackingCode: settleTracking,
        description: settleNote || `تسویه حساب نسیه مشتری (${selectedCustomer.name || selectedCustomer.phone})`,
      });
      setSettleTracking('');
      setSettleNote('');
      setStatementTab('statement');
    } catch (err: any) {
      alert(err?.message || 'خطا در تسویه بدهی نسیه.');
    } finally {
      setIsProcessingWallet(false);
    }
  };

  const handleSendToBot = async (c: typeof processedCustomers[0]) => {
    setIsSendingBot(true);
    setBotStatusMsg(null);
    try {
      const portalUrl = getCustomerPortalUrl(c);
      const recent = [
        ...c.customerWalletTxs.map(t => ({
          date: new Date(t.date),
          description: t.description,
          amount: t.amount,
        })),
        ...c.customerOrders.map(o => ({
          date: new Date(o.createdAt),
          description: `فاکتور فروش #${o.invoiceNumber}`,
          amount: o.total,
        })),
      ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);

      const res = await sendCustomerWalletStatusToBot({
        customer: c,
        creditDebt: c.creditDebt,
        totalSpent: c.totalSpent,
        orderCount: c.orderCount,
        portalUrl,
        recentTransactions: recent,
      });

      if (res.success) {
        setBotStatusMsg({
          type: 'success',
          text: `صورتحساب، موجودی کیف پول و لینک اختصاصی با موفقیت به ${res.sentCount} مقصد در تلگرام/بله ارسال شد.`,
        });
      } else {
        setBotStatusMsg({
          type: 'error',
          text: res.errors.join(' | ') || 'ارسال به بات ناموفق بود. تنظیمات توکن بات را بررسی کنید.',
        });
      }
    } catch (err: any) {
      setBotStatusMsg({
        type: 'error',
        text: err?.message || 'خطا در ارسال به بات.',
      });
    } finally {
      setIsSendingBot(false);
    }
  };

  const handleExportCustomersExcel = () => {
    const rows = processedCustomers.map((c, idx) => [
      idx + 1,
      c.subscriptionCode || '-',
      c.name || 'بدون نام',
      c.phone,
      c.birthDate || '-',
      TIER_CONFIG[c.tier || 'bronze']?.label || 'برنزی',
      c.walletBalance || 0,
      c.creditDebt || 0,
      c.orderCount || 0,
      c.totalSpent || 0,
      c.loyaltyPoints || 0,
      c.address || '-',
    ]);

    const wsData = [
      ['گزارش جامع اعضای باشگاه مشتریان، کیف پول و صورتحساب نسیه'],
      [`تاریخ گزارش: ${formatJalali(new Date(), 'yyyy/MM/dd - HH:mm')}`],
      [],
      ['ردیف', 'کد اشتراک', 'نام مشتری', 'شماره موبایل', 'تاریخ تولد', 'سطح عضویت', `موجودی کیف پول (${getCurrencyLabel()})`, `مانده بدهی نسیه (${getCurrencyLabel()})`, 'تعداد فاکتور', `جمع کل خرید (${getCurrencyLabel()})`, 'امتیاز وفاداری', 'آدرس'],
      ...rows,
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(wb, ws, 'باشگاه مشتریان');
    XLSX.writeFile(wb, `Customer_Club_${formatJalali(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const handleExportSingleStatementExcel = (c: typeof processedCustomers[0]) => {
    const ledgerRows: any[][] = [];
    c.customerOrders.forEach(o => {
      const pmLabel =
        o.paymentMethod === 'wallet' ? 'کسر از کیف پول' :
        o.paymentMethod === 'credit' ? 'نسیه (به حساب مشتری)' :
        o.paymentMethod === 'cash' ? 'نقدی' :
        o.paymentMethod === 'cheque' ? 'چک صیادی' : 'کارتخوان';
      ledgerRows.push([
        formatJalali(new Date(o.createdAt), 'yyyy/MM/dd HH:mm'),
        `فاکتور فروش #${o.invoiceNumber}`,
        pmLabel,
        o.items.map(i => `${i.name} (${i.quantity})`).join('، '),
        o.total,
      ]);
    });

    c.customerWalletTxs.forEach(w => {
      if (w.type === 'topup' || w.type === 'credit_settlement' || w.type === 'cashback') {
        ledgerRows.push([
          formatJalali(new Date(w.date), 'yyyy/MM/dd HH:mm'),
          w.type === 'topup' ? 'شارژ کیف پول' : w.type === 'credit_settlement' ? 'تسویه بدهی نسیه' : 'پاداش کش‌بک',
          w.paymentMethod === 'card' ? 'کارتخوان' : w.paymentMethod === 'cash' ? 'نقدی' : 'کیف پول',
          w.description,
          w.amount,
        ]);
      }
    });

    const wsData = [
      [`صورتحساب اختصاصی عضو باشگاه مشتریان: ${c.name || c.phone} (کد اشتراک: ${c.subscriptionCode || '-'})`],
      [`شماره موبایل: ${c.phone} | تاریخ تولد: ${c.birthDate || '-'} | موجودی کیف پول: ${formatCurrency(c.walletBalance || 0)} | بدهی نسیه: ${formatCurrency(c.creditDebt)}`],
      [],
      ['تاریخ و ساعت', 'نوع عملیات / سند', 'روش تسویه', 'شرح اقلام / توضیحات', `مبلغ (${getCurrencyLabel()})`],
      ...ledgerRows,
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(wb, ws, 'صورتحساب مشتری');
    XLSX.writeFile(wb, `Statement_${c.subscriptionCode || c.phone}.xlsx`);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F5F5F7] font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-5">
        
        {/* Header Section */}
        <div className="bg-white/90 backdrop-blur-xl p-5 sm:p-6 rounded-3xl border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center shadow-md shrink-0">
              <Users size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
                  باشگاه مشتریان، کیف پول و صورتحساب
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#007AFF]/10 text-[#007AFF]">
                  نسخه استاندارد سازمانی
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-500 font-normal mt-0.5">
                مدیریت کد اشتراک اتوماتیک، شماره موبایل و تاریخ تولد، شارژ کیف پول، فروش نسیه، لینک اختصاصی مشتری و اتصال به بات تلگرام و بله
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Mandatory Phone Toggle */}
            <button
              type="button"
              onClick={handleToggleMandatoryPhone}
              className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border ${
                settings?.requireCustomerPhone
                  ? 'bg-red-50 text-red-700 border-red-200 shadow-2xs'
                  : 'bg-neutral-100 text-neutral-700 border-black/[0.06] hover:bg-neutral-200/70'
              }`}
              title="تعیین اجباری یا اختیاری بودن دریافت شماره موبایل مشتری موقع ثبت فاکتور در صندوق"
            >
              <span className={`w-2.5 h-2.5 rounded-full ${settings?.requireCustomerPhone ? 'bg-red-500 animate-pulse' : 'bg-neutral-400'}`} />
              <span>دریافت موبایل در فاکتور: {settings?.requireCustomerPhone ? 'اجباری فعال' : 'اختیاری'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsGeneralQrModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2.5 rounded-2xl font-semibold flex items-center gap-1.5 transition-all text-xs cursor-pointer shadow-xs"
              title="نمایش و چاپ کیوآرکد عمومی ورود و عضویت مشتریان در باشگاه"
            >
              <QrCode size={15} />
              <span>QR عمومی باشگاه</span>
            </button>

            <button
              type="button"
              onClick={handleExportCustomersExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 rounded-2xl font-semibold flex items-center gap-1.5 transition-all text-xs cursor-pointer shadow-xs"
            >
              <Download size={15} />
              <span>خروجی اکسل باشگاه</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="bg-[#007AFF] hover:bg-[#0062cc] active:scale-[0.98] text-white px-4 py-2.5 rounded-2xl font-semibold flex items-center gap-2 transition-all shrink-0 text-xs shadow-[0_2px_8px_rgba(0,122,255,0.25)] cursor-pointer"
            >
              <UserPlus size={16} />
              <span>عضو جدید باشگاه</span>
            </button>
          </div>
        </div>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="bg-white p-4 rounded-3xl border border-black/[0.06] shadow-2xs flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Users size={22} />
            </div>
            <div>
              <span className="text-[11px] text-neutral-500 font-medium block">کل اعضای باشگاه</span>
              <span className="text-base font-black text-neutral-900 font-mono">{clubKpis.totalMembers} مشترک</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-purple-200/80 shadow-2xs flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Wallet size={22} />
            </div>
            <div>
              <span className="text-[11px] text-neutral-500 font-medium block">مجموع اعتبار کیف پول‌ها</span>
              <span className="text-sm sm:text-base font-black text-purple-700 font-mono">{formatCurrency(clubKpis.totalWallet)}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-rose-200/80 shadow-2xs flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <BookOpen size={22} />
            </div>
            <div>
              <span className="text-[11px] text-neutral-500 font-medium block">مطالبات نسیه مشتریان</span>
              <span className="text-sm sm:text-base font-black text-rose-600 font-mono">{formatCurrency(clubKpis.totalCreditDebt)}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-emerald-200/80 shadow-2xs flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <DollarSign size={22} />
            </div>
            <div>
              <span className="text-[11px] text-neutral-500 font-medium block">کل خرید اعضای باشگاه</span>
              <span className="text-sm sm:text-base font-black text-emerald-600 font-mono">{formatCurrency(clubKpis.totalClubSales)}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-amber-200/80 shadow-2xs flex items-center gap-3 col-span-2 lg:col-span-1">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Gift size={22} />
            </div>
            <div>
              <span className="text-[11px] text-neutral-500 font-medium block">متولدین این ماه</span>
              <span className="text-base font-black text-amber-700 font-mono">{clubKpis.birthdayCount} نفر</span>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-3xl border border-black/[0.06] shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: `همه اعضا (${customersList.length})` },
              { id: 'has_wallet', label: 'دارای موجودی کیف پول' },
              { id: 'has_debt', label: 'بدهکاران نسیه (صورتحساب باز)' },
              { id: 'vip', label: 'مشتریان طلایی و VIP' },
              { id: 'birthdays', label: `متولدین این ماه (${clubKpis.birthdayCount})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeFilter === tab.id
                    ? 'bg-[#007AFF] text-white shadow-xs'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input 
                type="text"
                placeholder="جستجو با نام، شماره موبایل، کد اشتراک، تاریخ تولد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-3.5 py-2 bg-neutral-100 border border-black/[0.06] rounded-xl outline-none focus:bg-white focus:border-[#007AFF] text-right text-xs text-neutral-900"
              />
            </div>

            {customersList.some(c => !c.subscriptionCode) && (
              <button
                type="button"
                onClick={handleAssignMissingSubscriptionCodes}
                className="px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                title="تخصیص خودکار کد اشتراک به مشترکینی که کد ندارند"
              >
                <Hash size={14} />
                <span>تخصیص کد اشتراک خودکار</span>
              </button>
            )}
          </div>
        </div>

        {/* Customer Club Table */}
        <div className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-black/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right whitespace-nowrap text-xs">
              <thead className="bg-neutral-50/90 border-b border-black/[0.06] font-bold text-neutral-600">
                <tr>
                  <th className="py-3.5 px-4 text-right">مشخصات مشترک و سطح</th>
                  <th className="py-3.5 px-3 text-center">کد اشتراک</th>
                  <th className="py-3.5 px-3 text-center">شماره موبایل / تولد</th>
                  <th className="py-3.5 px-4 text-right">موجودی کیف پول</th>
                  <th className="py-3.5 px-4 text-right">مانده صورتحساب نسیه</th>
                  <th className="py-3.5 px-3 text-center">سابقه خرید و امتیاز</th>
                  <th className="py-3.5 px-4 text-center">کیف پول، صورتحساب و بات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {processedCustomers.map((customer) => {
                  const tierInfo = TIER_CONFIG[customer.tier || 'bronze'] || TIER_CONFIG.bronze;
                  return (
                    <tr key={customer.id} className="hover:bg-blue-50/30 transition-colors">
                      {/* Name & Tier */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#007AFF]/15 to-purple-500/15 text-[#007AFF] flex items-center justify-center font-black text-xs shrink-0 border border-[#007AFF]/20">
                            {customer.name ? customer.name[0] : <Phone size={15} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-neutral-900 text-xs">{customer.name || 'مشتری بدون نام'}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tierInfo.badgeClass}`}>
                                {tierInfo.label}
                              </span>
                              {customer.isBirthdayMonth && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 text-pink-700 flex items-center gap-0.5" title="متولد این ماه">
                                  <Gift size={10} />
                                  <span>تولد</span>
                                </span>
                              )}
                            </div>
                            {customer.address && (
                              <div className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5 truncate max-w-[200px]" title={customer.address}>
                                <MapPin size={11} className="shrink-0" />
                                <span className="truncate">{customer.address}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Auto Subscription Code */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-amber-50 text-amber-800 border border-amber-200/80 font-mono">
                          <Hash size={12} />
                          {customer.subscriptionCode || 'بدون کد'}
                        </span>
                      </td>

                      {/* Mobile & Optional Birth Date */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="font-mono font-bold text-neutral-800 text-xs" dir="ltr">{customer.phone}</div>
                        {customer.birthDate ? (
                          <div className="text-[10px] text-neutral-500 font-mono mt-0.5 flex items-center justify-center gap-1">
                            <Calendar size={10} className="text-neutral-400" />
                            <span>تولد: {customer.birthDate}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-neutral-300">تولد: ثبت نشده</span>
                        )}
                      </td>

                      {/* Wallet Balance */}
                      <td className="py-3.5 px-4">
                        <div className={`font-mono font-black text-xs ${(customer.walletBalance || 0) > 0 ? 'text-purple-700' : 'text-neutral-400'}`}>
                          {formatCurrency(customer.walletBalance || 0)}
                        </div>
                        {(customer.cashbackPercent || 0) > 0 && (
                          <span className="text-[10px] text-purple-600 font-medium block">
                            کش‌بک خرید: {customer.cashbackPercent}%
                          </span>
                        )}
                      </td>

                      {/* Credit / On-Account Debt */}
                      <td className="py-3.5 px-4">
                        {customer.creditDebt > 0 ? (
                          <div>
                            <span className="font-mono font-black text-xs text-rose-600 block">
                              {formatCurrency(customer.creditDebt)} بدهکار
                            </span>
                            <span className="text-[10px] text-rose-500">نسیه تسویه‌نشده</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                            <CheckCircle2 size={12} />
                            <span>تسویه کامل</span>
                          </span>
                        )}
                      </td>

                      {/* Total Orders & Points */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="font-bold text-neutral-800 font-mono text-xs">
                          {formatCurrency(customer.totalSpent)}
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-0.5">
                          {customer.orderCount} فاکتور | ⭐ {customer.loyaltyPoints || 0} امتیاز
                        </div>
                      </td>

                      {/* Club Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedCustomerId(customer.id!);
                              setStatementTab('statement');
                              setBotStatusMsg(null);
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF] text-[#007AFF] hover:text-white font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer"
                            title="مشاهده صورتحساب جامع، فاکتورها و کیف پول"
                          >
                            <FileText size={13} />
                            <span>صورتحساب و کیف پول</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedCustomerId(customer.id!);
                              setStatementTab('wallet');
                              setBotStatusMsg(null);
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer"
                            title="شارژ فوری کیف پول مشتری"
                          >
                            <Wallet size={13} />
                            <span>شارژ</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedCustomerId(customer.id!);
                              setStatementTab('portal');
                              setBotStatusMsg(null);
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                            title="مشاهده کارت دیجیتال عضویت، کیوآرکد و لینک اختصاصی مشتری"
                          >
                            <QrCode size={13} />
                            <span>کارت و QR</span>
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(customer)}
                            className="p-1.5 text-neutral-500 hover:text-[#007AFF] hover:bg-[#007AFF]/10 rounded-xl transition-all cursor-pointer"
                            title="ویرایش مشخصات مشترک"
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            onClick={() => customer.id && handleDeleteCustomer(customer.id)}
                            className="p-1.5 text-neutral-400 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-xl transition-all cursor-pointer"
                            title="حذف مشتری"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {processedCustomers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-neutral-400">
                      <div className="w-14 h-14 rounded-3xl bg-black/[0.03] flex items-center justify-center mx-auto mb-3 text-neutral-300">
                        <Users size={28} />
                      </div>
                      <p className="text-sm font-medium text-neutral-500">مشترکی با این مشخصات در باشگاه مشتریان یافت نشد.</p>
                      <button
                        onClick={handleOpenAddModal}
                        className="mt-2.5 text-[#007AFF] hover:text-[#0062cc] font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>ثبت عضو جدید در باشگاه مشتریان</span>
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* =====================================================================
          MODAL 1: ADD / EDIT CUSTOMER CLUB MEMBER
      ===================================================================== */}
      {isModalOpen && editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-black/[0.08] flex flex-col gap-4 my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-neutral-900">
                    {editingCustomer.id ? 'ویرایش پرونده عضو باشگاه مشتریان' : 'تعریف عضو جدید در باشگاه مشتریان'}
                  </h2>
                  <p className="text-[11px] text-neutral-500">کد اشتراک به صورت اتوماتیک تخصیص داده می‌شود و تاریخ تولد اختیاری است</p>
                </div>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); setEditingCustomer(null); }}
                className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-xl hover:bg-black/[0.04] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Mobile Phone (Mandatory) */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  شماره موبایل مشتری <span className="text-red-500">*</span>
                </label>
                <input 
                  type="tel"
                  placeholder="09123456789"
                  value={editingCustomer.phone || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-[#007AFF] outline-none text-left font-mono text-xs font-bold"
                  dir="ltr"
                  autoFocus
                />
              </div>

              {/* Automatic Subscription Code */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-neutral-700">کد اشتراک اتوماتیک</label>
                  <button
                    type="button"
                    onClick={async () => {
                      const code = await generateNextSubscriptionCode();
                      setEditingCustomer(prev => prev ? { ...prev, subscriptionCode: code } : prev);
                    }}
                    className="text-[10px] text-[#007AFF] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <RefreshCw size={10} />
                    <span>تولید کد جدید</span>
                  </button>
                </div>
                <input 
                  type="text"
                  placeholder="مثال: 1001"
                  value={editingCustomer.subscriptionCode || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, subscriptionCode: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-amber-50/60 border border-amber-200 focus:bg-white focus:border-[#007AFF] outline-none text-left font-mono text-xs font-bold text-amber-900"
                  dir="ltr"
                />
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">نام و نام خانوادگی</label>
                <input 
                  type="text"
                  placeholder="مثال: علی محمدی"
                  value={editingCustomer.name || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-[#007AFF] outline-none text-right text-xs"
                />
              </div>

              {/* Optional Jalali Birth Date */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-neutral-700">تاریخ تولد (اختیاری)</label>
                  {editingCustomer.birthDate && (
                    <button
                      type="button"
                      onClick={() => setEditingCustomer({ ...editingCustomer, birthDate: '' })}
                      className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                    >
                      پاک کردن
                    </button>
                  )}
                </div>
                <DatePicker
                  value={editingCustomer.birthDate || ''}
                  onChange={(dateObj: DateObject | null) => {
                    setEditingCustomer({
                      ...editingCustomer,
                      birthDate: dateObj ? dateObj.format('YYYY/MM/DD') : '',
                    });
                  }}
                  calendar={persian}
                  locale={persian_fa}
                  placeholder="انتخاب تاریخ تولد شمسی (اختیاری)"
                  calendarPosition="bottom-right"
                  containerClassName="w-full"
                  inputClass="w-full px-3.5 py-2 rounded-xl bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-[#007AFF] outline-none text-center font-mono text-xs cursor-pointer"
                />
              </div>

              {/* Membership Tier */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">سطح عضویت باشگاه</label>
                <select
                  value={editingCustomer.tier || 'bronze'}
                  onChange={e => setEditingCustomer({ ...editingCustomer, tier: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-xs font-medium outline-none focus:border-[#007AFF]"
                >
                  <option value="bronze">برنزی (عادی)</option>
                  <option value="silver">نقره‌ای</option>
                  <option value="gold">طلایی</option>
                  <option value="vip">VIP ویژه</option>
                </select>
              </div>

              {/* Cashback Percentage */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">درصد پاداش کش‌بک به کیف پول (%)</label>
                <input 
                  type="number"
                  min={0}
                  max={50}
                  dir="ltr"
                  placeholder="0"
                  value={editingCustomer.cashbackPercent ?? 0}
                  onChange={e => setEditingCustomer({ ...editingCustomer, cashbackPercent: Number(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 rounded-xl bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-[#007AFF] outline-none text-left font-mono text-xs"
                />
              </div>

              {/* Initial Wallet Charge (Only when creating new customer) */}
              {!editingCustomer.id && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-purple-800 mb-1">شارژ اولیه کیف پول هنگام ثبت‌نام ({getCurrencyLabel()} - اختیاری)</label>
                  <input 
                    type="number"
                    dir="ltr"
                    placeholder="0"
                    value={editingCustomer.walletBalance || ''}
                    onChange={e => setEditingCustomer({ ...editingCustomer, walletBalance: Number(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2 rounded-xl bg-purple-50/60 border border-purple-200 focus:bg-white focus:border-purple-500 outline-none text-left font-mono text-xs font-bold text-purple-900"
                  />
                </div>
              )}

              {/* Telegram & Bale Chat IDs for Bot Integration */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-600 mb-1">چت‌آیدی تلگرام مشتری (جهت بات - اختیاری)</label>
                <input 
                  type="text"
                  dir="ltr"
                  placeholder="مثال: 123456789"
                  value={editingCustomer.telegramChatId || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, telegramChatId: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-600 mb-1">چت‌آیدی بله مشتری (جهت بات - اختیاری)</label>
                <input 
                  type="text"
                  dir="ltr"
                  placeholder="مثال: 987654321"
                  value={editingCustomer.baleChatId || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, baleChatId: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs font-mono"
                />
              </div>

              {/* Delivery Address */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-neutral-700 mb-1">آدرس کامل جهت سفارش‌های بیرون‌بر (اختیاری)</label>
                <textarea 
                  placeholder="خیابان، کوچه، پلاک، واحد..."
                  value={editingCustomer.address || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-[#007AFF] outline-none text-right text-xs h-16 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-3 border-t border-black/[0.06]">
              <button
                onClick={() => { setIsModalOpen(false); setEditingCustomer(null); }}
                className="px-4 py-2 rounded-xl text-neutral-600 hover:bg-neutral-100 font-semibold text-xs cursor-pointer"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveCustomer}
                className="px-5 py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white font-bold flex items-center gap-1.5 text-xs shadow-md cursor-pointer"
              >
                <Save size={15} />
                <span>ذخیره در باشگاه مشتریان</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: CUSTOMER ACCOUNT STATEMENT, WALLET, CREDIT & PORTAL LINK
      ===================================================================== */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-xs animate-in fade-in overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-black/[0.08] overflow-hidden my-auto">
            
            {/* Modal Header */}
            <div className="p-5 bg-neutral-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#007AFF] text-white flex items-center justify-center font-black text-base shrink-0">
                  {selectedCustomer.name ? selectedCustomer.name[0] : <Users size={22} />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold">{selectedCustomer.name || 'مشتری باشگاه'}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-400 text-neutral-950">
                      کد اشتراک: {selectedCustomer.subscriptionCode || '-'}
                    </span>
                    <span className="text-xs font-mono text-neutral-300" dir="ltr">{selectedCustomer.phone}</span>
                    {selectedCustomer.birthDate && (
                      <span className="text-[11px] text-neutral-300">🎂 متولد: {selectedCustomer.birthDate}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-1.5 text-xs">
                    <div>
                      <span className="text-neutral-400 ml-1">موجودی کیف پول:</span>
                      <span className="font-mono font-black text-emerald-400">{formatCurrency(selectedCustomer.walletBalance || 0)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 ml-1">بدهی نسیه (صورتحساب):</span>
                      <span className={`font-mono font-black ${selectedCustomer.creditDebt > 0 ? 'text-rose-400' : 'text-neutral-300'}`}>
                        {formatCurrency(selectedCustomer.creditDebt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-400 ml-1">کل خرید:</span>
                      <span className="font-mono font-bold text-blue-300">{formatCurrency(selectedCustomer.totalSpent)} ({selectedCustomer.orderCount} فاکتور)</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedCustomerId(null)}
                className="self-end sm:self-center p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sub-navigation Tabs */}
            <div className="px-5 pt-3 bg-neutral-100 border-b border-black/[0.06] flex items-center gap-2 overflow-x-auto">
              {[
                { id: 'statement', label: 'صورتحساب جامع و فاکتورها', icon: FileText },
                { id: 'wallet', label: 'شارژ کیف پول مشتری', icon: Wallet },
                { id: 'credit', label: `تسویه حساب نسیه (${formatCurrency(selectedCustomer.creditDebt)})`, icon: BookOpen },
                { id: 'portal', label: 'لینک اختصاصی مشتری و اتصال بات', icon: QrCode },
              ].map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setStatementTab(t.id as any)}
                    className={`px-4 py-2.5 rounded-t-2xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer border-b-2 ${
                      statementTab === t.id
                        ? 'bg-white text-[#007AFF] border-[#007AFF] shadow-2xs'
                        : 'text-neutral-600 border-transparent hover:text-neutral-900'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              
              {/* TAB 1: ACCOUNT STATEMENT & INVOICES */}
              {statementTab === 'statement' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-neutral-800">
                      ریز گردش صورتحساب مشتری (فاکتورهای خرید، شارژ کیف پول، خرید نسیه و تسویه‌ها)
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExportSingleStatementExcel(selectedCustomer)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download size={14} />
                        <span>خروجی اکسل صورتحساب</span>
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer size={14} />
                        <span>چاپ صورتحساب</span>
                      </button>
                    </div>
                  </div>

                  {/* Wallet & Credit Ledger Table */}
                  {selectedCustomer.customerWalletTxs.length > 0 && (
                    <div className="border border-purple-200 rounded-2xl overflow-hidden bg-purple-50/20">
                      <div className="bg-purple-100/70 px-4 py-2 text-xs font-bold text-purple-900">
                        گردش کیف پول و حساب دفتری (نسیه)
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-white border-b border-purple-100 text-neutral-500">
                            <tr>
                              <th className="py-2 px-3">تاریخ</th>
                              <th className="py-2 px-3">نوع تراکنش</th>
                              <th className="py-2 px-3">شرح</th>
                              <th className="py-2 px-3">مبلغ</th>
                              <th className="py-2 px-3">مانده کیف پول</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-purple-100 bg-white">
                            {selectedCustomer.customerWalletTxs.map(tx => (
                              <tr key={tx.id}>
                                <td className="py-2 px-3 font-mono text-[11px] text-neutral-500">
                                  {formatJalali(new Date(tx.date), 'yyyy/MM/dd HH:mm')}
                                </td>
                                <td className="py-2 px-3 font-bold">
                                  {tx.type === 'topup' && <span className="text-emerald-600">➕ شارژ کیف پول</span>}
                                  {tx.type === 'purchase_deduction' && <span className="text-purple-600">➖ خرید از کیف پول</span>}
                                  {tx.type === 'credit_purchase' && <span className="text-rose-600">📕 خرید نسیه</span>}
                                  {tx.type === 'credit_settlement' && <span className="text-blue-600">✅ تسویه نسیه</span>}
                                  {tx.type === 'cashback' && <span className="text-amber-600">🎁 پاداش کش‌بک</span>}
                                </td>
                                <td className="py-2 px-3 text-neutral-700">{tx.description}</td>
                                <td className="py-2 px-3 font-mono font-bold">{formatCurrency(tx.amount)}</td>
                                <td className="py-2 px-3 font-mono text-purple-700 font-bold">{formatCurrency(tx.walletBalanceAfter)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Customer Invoices Table */}
                  <div className="border border-black/[0.08] rounded-2xl overflow-hidden">
                    <div className="bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-800">
                      لیست فاکتورهای خرید مشتری ({selectedCustomer.customerOrders.length} فاکتور)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-neutral-50 border-b border-black/[0.06] text-neutral-500">
                          <tr>
                            <th className="py-2.5 px-3">شماره فاکتور</th>
                            <th className="py-2.5 px-3">تاریخ و ساعت</th>
                            <th className="py-2.5 px-3">اقلام سفارش</th>
                            <th className="py-2.5 px-3">نحوه تسویه</th>
                            <th className="py-2.5 px-3">مبلغ کل</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.04]">
                          {selectedCustomer.customerOrders.map(ord => (
                            <tr key={ord.id} className="hover:bg-neutral-50">
                              <td className="py-2.5 px-3 font-mono font-bold text-[#007AFF]">#{ord.invoiceNumber}</td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-500">
                                {formatJalali(new Date(ord.createdAt), 'yyyy/MM/dd - HH:mm')}
                              </td>
                              <td className="py-2.5 px-3 text-neutral-700 max-w-xs truncate">
                                {ord.items.map(i => `${i.name} (${i.quantity})`).join('، ')}
                              </td>
                              <td className="py-2.5 px-3">
                                {ord.paymentMethod === 'wallet' && (
                                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold text-[10px]">کیف پول باشگاه</span>
                                )}
                                {ord.paymentMethod === 'credit' && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">نسیه (حساب مشتری)</span>
                                )}
                                {ord.paymentMethod === 'card' && (
                                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">کارتخوان</span>
                                )}
                                {ord.paymentMethod === 'cash' && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">نقدی</span>
                                )}
                                {ord.paymentMethod === 'mixed' && (
                                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold text-[10px]">ترکیبی</span>
                                )}
                                {ord.paymentMethod === 'cheque' && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">چک صیادی</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-black text-neutral-900">
                                {formatCurrency(ord.total)}
                              </td>
                            </tr>
                          ))}
                          {selectedCustomer.customerOrders.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-neutral-400">
                                هنوز فاکتور خریدی برای این مشتری ثبت نشده است.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TOP UP CUSTOMER WALLET */}
              {statementTab === 'wallet' && (
                <form onSubmit={handleWalletTopUpSubmit} className="max-w-lg mx-auto space-y-4 py-2">
                  <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-purple-700 block">موجودی فعلی کیف پول مشتری:</span>
                      <span className="text-xl font-black font-mono text-purple-900">
                        {formatCurrency(selectedCustomer.walletBalance || 0)}
                      </span>
                    </div>
                    <Wallet size={28} className="text-purple-600" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5">مبلغ افزایش اعتبار / شارژ کیف پول ({getCurrencyLabel()})</label>
                    <input
                      type="number"
                      dir="ltr"
                      value={topUpAmount || ''}
                      onChange={e => setTopUpAmount(Number(e.target.value) || 0)}
                      className="w-full px-4 py-2.5 rounded-2xl border border-neutral-300 text-base font-mono font-black text-center outline-none focus:border-purple-600"
                      required
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[200000, 500000, 1000000, 2000000, 5000000]
                        .map(p => (settings?.currencyUnit === 'rial' ? p * 10 : p))
                        .map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setTopUpAmount(preset)}
                            className="px-3 py-1 rounded-xl bg-purple-100/70 hover:bg-purple-200 text-purple-900 text-xs font-mono font-bold cursor-pointer"
                          >
                            {formatCurrency(preset)}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">روش دریافت وجه شارژ</label>
                      <select
                        value={topUpMethod}
                        onChange={e => setTopUpMethod(e.target.value as 'card' | 'cash')}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs font-bold"
                      >
                        <option value="card">کارتخوان / واریز بانکی</option>
                        <option value="cash">نقدی به صندوق</option>
                      </select>
                    </div>

                    {topUpMethod === 'card' ? (
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 mb-1">حساب بانکی مقصد</label>
                        <select
                          value={topUpBankId || ''}
                          onChange={e => setTopUpBankId(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                        >
                          {bankAccounts.map(b => (
                            <option key={b.id} value={b.id}>{b.bankName}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 mb-1">صندوق نقدی مقصد</label>
                        <select
                          value={topUpCashId || ''}
                          onChange={e => setTopUpCashId(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                        >
                          {cashBoxes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">کد پیگیری (اختیاری)</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={topUpTracking}
                        onChange={e => setTopUpTracking(e.target.value)}
                        placeholder="شماره فیش یا ارجاع"
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">توضیحات</label>
                      <input
                        type="text"
                        value={topUpNote}
                        onChange={e => setTopUpNote(e.target.value)}
                        placeholder="شارژ کیف پول باشگاه"
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessingWallet}
                    className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-lg cursor-pointer disabled:opacity-50"
                  >
                    {isProcessingWallet ? 'در حال ثبت سند مالی...' : `تأیید و شارژ کیف پول به مبلغ ${formatCurrency(topUpAmount)}`}
                  </button>
                </form>
              )}

              {/* TAB 3: SETTLE CUSTOMER CREDIT (نسیه) */}
              {statementTab === 'credit' && (
                <form onSubmit={handleCreditSettleSubmit} className="max-w-lg mx-auto space-y-4 py-2">
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-rose-700 block">مانده بدهی نسیه فعلی مشتری:</span>
                      <span className="text-xl font-black font-mono text-rose-600">
                        {formatCurrency(selectedCustomer.creditDebt)}
                      </span>
                    </div>
                    <BookOpen size={28} className="text-rose-600" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5">مبلغ دریافتی جهت تسویه نسیه (تومان)</label>
                    <input
                      type="number"
                      dir="ltr"
                      value={settleAmount || ''}
                      onChange={e => setSettleAmount(Number(e.target.value) || 0)}
                      className="w-full px-4 py-2.5 rounded-2xl border border-neutral-300 text-base font-mono font-black text-center outline-none focus:border-rose-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">روش تسویه بدهی نسیه</label>
                    <select
                      value={settleMethod}
                      onChange={e => setSettleMethod(e.target.value as 'card' | 'cash' | 'wallet')}
                      className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 text-xs font-bold"
                    >
                      <option value="card">دریافت با کارتخوان / واریز بانکی</option>
                      <option value="cash">دریافت وجه نقد به صندوق</option>
                      <option value="wallet">کسر از موجودی کیف پول مشتری ({formatCurrency(selectedCustomer.walletBalance || 0)})</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessingWallet || settleAmount <= 0}
                    className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg cursor-pointer disabled:opacity-50"
                  >
                    {isProcessingWallet ? 'در حال ثبت...' : `ثبت تسویه حساب نسیه (${formatCurrency(settleAmount)})`}
                  </button>
                </form>
              )}

              {/* TAB 4: PERSONAL WALLET LINK, DIGITAL VIP CARD & BOT DISPATCH */}
              {statementTab === 'portal' && (
                <div className="space-y-6 py-2">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* Visual Luxury Digital Membership Card */}
                    <div className="lg:col-span-7">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                          <CreditCard size={15} className="text-[#007AFF]" />
                          <span>کارت دیجیتال عضویت باشگاه مشتریان (قابل اسکن و چاپ)</span>
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${TIER_CONFIG[selectedCustomer.tier || 'bronze']?.badgeClass || ''}`}>
                          سطح: {TIER_CONFIG[selectedCustomer.tier || 'bronze']?.label || 'برنزی'}
                        </span>
                      </div>

                      {/* Card Preview Container */}
                      <div className={`p-6 rounded-3xl relative overflow-hidden shadow-2xl transition-all border ${
                        selectedCustomer.tier === 'vip'
                          ? 'bg-gradient-to-br from-neutral-950 via-purple-950 to-neutral-900 text-white border-purple-500/40 shadow-purple-950/30'
                          : selectedCustomer.tier === 'gold'
                          ? 'bg-gradient-to-br from-amber-950 via-yellow-900 to-stone-900 text-white border-amber-400/50 shadow-amber-950/30'
                          : selectedCustomer.tier === 'silver'
                          ? 'bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900 text-white border-slate-400/40 shadow-slate-900/30'
                          : 'bg-gradient-to-br from-stone-900 via-amber-950 to-neutral-900 text-white border-amber-600/30 shadow-stone-900/30'
                      }`}>
                        {/* Decorative Background Glows */}
                        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

                        {/* Top Row: Store Name & VIP Crown */}
                        <div className="flex items-center justify-between mb-5 relative z-10">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/15">
                              <Crown size={16} className={selectedCustomer.tier === 'vip' ? 'text-purple-300' : selectedCustomer.tier === 'gold' ? 'text-yellow-400' : 'text-slate-200'} />
                            </div>
                            <div>
                              <div className="text-xs font-black tracking-tight">{settings?.restaurantName || 'باشگاه مشتریان آرکا'}</div>
                              <div className="text-[9px] text-white/60 font-mono">CLUB MEMBERSHIP CARD</div>
                            </div>
                          </div>
                          
                          <div className="text-left font-mono">
                            <span className="text-[10px] text-white/70 block">کد اشتراک اختصاصی</span>
                            <span className="text-base font-black text-amber-300 tracking-wider">
                              #{selectedCustomer.subscriptionCode || '1001'}
                            </span>
                          </div>
                        </div>

                        {/* Middle Row: Name, Chip & Embedded QR */}
                        <div className="flex items-center justify-between gap-4 my-4 relative z-10">
                          <div className="space-y-1">
                            <div className="text-[10px] text-white/60">نام مشترک</div>
                            <h4 className="text-lg font-black text-white tracking-tight">{selectedCustomer.name || 'مشتری گرامی'}</h4>
                            <div className="text-xs font-mono text-white/80" dir="ltr">{selectedCustomer.phone}</div>
                          </div>

                          {portalQrDataUrl && (
                            <div className="bg-white p-1.5 rounded-2xl shadow-lg shrink-0 border border-white/20">
                              <img src={portalQrDataUrl} alt="QR Code" className="w-20 h-20 rounded-xl" />
                            </div>
                          )}
                        </div>

                        {/* Bottom Row: Wallet Balance & Cashback Perk */}
                        <div className="mt-5 pt-3.5 border-t border-white/10 flex items-center justify-between relative z-10 text-xs">
                          <div>
                            <span className="text-[10px] text-white/70 block">موجودی کیف پول</span>
                            <span className="text-base font-black text-emerald-400 font-mono">
                              {formatCurrency(selectedCustomer.walletBalance || 0)}
                            </span>
                          </div>
                          <div className="text-left">
                            <span className="text-[10px] text-white/70 block">پاداش کش‌بک خرید</span>
                            <span className="text-xs font-bold text-amber-300 font-mono">
                              {selectedCustomer.cashbackPercent ? `${selectedCustomer.cashbackPercent}٪ نقدی` : 'عضویت فعال'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Print and Quick Action Buttons */}
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="flex-1 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Printer size={14} />
                          <span>چاپ کارت مشتری</span>
                        </button>
                        <a
                          href={getCustomerPortalUrl(selectedCustomer)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm text-center"
                        >
                          <ExternalLink size={14} />
                          <span>ورود به پرتال مشتری</span>
                        </a>
                      </div>
                    </div>

                    {/* Right Side: Link Sharing, Bot Dispatch & Tiers Explanation */}
                    <div className="lg:col-span-5 space-y-4">
                      <div className="bg-neutral-50 p-4 rounded-3xl border border-black/[0.06] space-y-3">
                        <label className="block text-xs font-bold text-neutral-800">لینک مستقیم کارت و کیف پول مشتری:</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            dir="ltr"
                            value={getCustomerPortalUrl(selectedCustomer)}
                            className="flex-1 px-3 py-2 rounded-xl bg-white border border-neutral-300 text-xs font-mono text-neutral-800 outline-none select-all"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(getCustomerPortalUrl(selectedCustomer));
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 3000);
                            }}
                            className="px-3 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
                          >
                            {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                            <span>{copiedLink ? 'کپی شد' : 'کپی'}</span>
                          </button>
                        </div>
                        <p className="text-[11px] text-neutral-500 leading-relaxed">
                          این لینک را می‌توانید از طریق پیامک یا واتساپ برای مشتری ارسال کنید. مشتری بدون نیاز به پسورد وارد صفحه کارت اختصاصی و کیف پول خود می‌شود.
                        </p>
                      </div>

                      {/* Bot Dispatch Button */}
                      <button
                        type="button"
                        disabled={isSendingBot}
                        onClick={() => handleSendToBot(selectedCustomer)}
                        className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                      >
                        <Send size={15} />
                        <span>{isSendingBot ? 'در حال ارسال به بات...' : 'ارسال مشخصات کارت و موجودی به تلگرام و بله'}</span>
                      </button>

                      {botStatusMsg && (
                        <div className={`p-3 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
                          botStatusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {botStatusMsg.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                          <span>{botStatusMsg.text}</span>
                        </div>
                      )}

                      {/* How scanning at POS works */}
                      <div className="p-3.5 bg-blue-50/70 border border-blue-200/70 rounded-2xl text-[11px] text-blue-900 space-y-1.5 leading-relaxed">
                        <div className="font-bold flex items-center gap-1 text-blue-950">
                          <Sparkles size={13} className="text-[#007AFF]" />
                          <span>نحوه پرداخت با کارت یا اسکن کیوآرکد:</span>
                        </div>
                        <p>
                          مشتری در صندوق یا روی میز، این QR کد یا کد اشتراک <strong className="font-mono text-blue-950">#{selectedCustomer.subscriptionCode}</strong> را نشان می‌دهد. صندوق‌دار با ثبت آن، موجودی کیف پول و سطح تخفیف مشتری را می‌بیند و با دکمه <strong>«پرداخت از کیف پول»</strong> فاکتور تسویه می‌شود.
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* General Customer Club QR Modal (For Front Counter & Tables) */}
      {isGeneralQrModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-black/[0.08] shadow-2xl relative space-y-4 text-center">
            <button
              onClick={() => setIsGeneralQrModalOpen(false)}
              className="absolute top-4 left-4 p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-black/[0.05] transition-all cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
              <QrCode size={24} />
            </div>

            <div>
              <h3 className="text-base font-bold text-neutral-900 tracking-tight">
                کیوآرکد عمومی ورود و عضویت در باشگاه مشتریان
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                این کیوآرکد را روی استند صندوق یا روی میزها قرار دهید تا مشتریان بتوانند کارت هوشمند و کیف پول خود را ببینند
              </p>
            </div>

            {generalQrDataUrl ? (
              <div className="p-4 bg-neutral-50 rounded-2xl border border-black/[0.06] inline-block shadow-inner">
                <img src={generalQrDataUrl} alt="Store Club QR" className="w-56 h-56 mx-auto rounded-xl bg-white p-2 shadow-sm" />
              </div>
            ) : (
              <div className="w-56 h-56 mx-auto flex items-center justify-center text-neutral-400">
                در حال تولید QR...
              </div>
            )}

            <div className="bg-blue-50/70 p-3 rounded-2xl border border-blue-200/60 text-xs text-blue-900 leading-relaxed text-right">
              <strong>نحوه کارکرد برای مشتری:</strong>
              <p className="text-[11px] text-blue-800 mt-0.5">
                مشتری با دوربین گوشی این QR را اسکن می‌کند، شماره موبایل خود را می‌زند و کارت عضویت اختصاصی، موجودی کیف پول و سفارش آنلاین برای او باز می‌شود.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer size={15} />
                <span>چاپ جهت قرار دادن روی صندوق/میز</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const port = settings?.localServerPort || window.location.port || '3000';
                  const base = `${window.location.protocol}//${window.location.hostname}:${port}/?mode=wallet`;
                  navigator.clipboard.writeText(base);
                  alert('لینک عمومی پرتال باشگاه مشتریان کپی شد.');
                }}
                className="px-4 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold cursor-pointer"
              >
                کپی لینک
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

