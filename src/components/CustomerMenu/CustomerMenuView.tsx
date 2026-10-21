import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  MenuItem,
  Category,
  Customer,
  Order,
  CustomerWalletTransaction,
  getMenuItemIngredients
} from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import {
  UtensilsCrossed, Search, Plus, Minus, ShoppingBag,
  CheckCircle2, BellRing, Wifi, Phone,
  ArrowLeft, X, Wallet, Crown, FileText, CreditCard,
  Hash, Gift, ArrowUpRight, ArrowDownLeft, RefreshCw, Sparkles, UserCheck
} from 'lucide-react';
import { sendNetworkOrder, callWaiter, fetchMenuFromNetwork } from '../../lib/networkSync';
import { format } from 'date-fns-jalali';

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  note?: string;
}

const TIER_INFO: Record<string, { label: string; badgeClass: string }> = {
  bronze: { label: 'عضو عادی (برنزی)', badgeClass: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  silver: { label: 'عضو نقره‌ای', badgeClass: 'bg-slate-500/15 text-slate-700 border-slate-500/30' },
  gold: { label: 'عضو طلایی', badgeClass: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30' },
  vip: { label: 'مشترک ویژه VIP', badgeClass: 'bg-purple-500/15 text-purple-700 border-purple-500/30' },
};

export default function CustomerMenuView({
  tableNumber: initialTableNumber,
  initialViewMode
}: {
  tableNumber?: number;
  initialViewMode?: 'menu' | 'wallet';
}) {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialSub = urlParams.get('sub') || '';
  const initialPhone = urlParams.get('phone') || '';

  // Read table from prop or URL
  const [tableNum] = useState<number>(() => {
    if (initialTableNumber) return initialTableNumber;
    const tbl = urlParams.get('table');
    return tbl ? parseInt(tbl, 10) : 1;
  });

  const [viewMode, setViewMode] = useState<'menu' | 'wallet'>(
    initialViewMode || (urlParams.get('mode') === 'wallet' || initialSub ? 'wallet' : 'menu')
  );
  const [walletTab, setWalletTab] = useState<'statement' | 'topup' | 'invoices'>('statement');

  // Customer Club Lookup State
  const [lookupInput, setLookupInput] = useState(initialSub || initialPhone || '');
  const [networkCustomerData, setNetworkCustomerData] = useState<{
    customer: Customer | null;
    orders: Order[];
    walletTransactions: CustomerWalletTransaction[];
  } | null>(null);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);

  // Top-up / Payment Request State
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [topupTrackingCode, setTopupTrackingCode] = useState<string>('');
  const [topupNote, setTopupNote] = useState<string>('');
  const [topupSubmitted, setTopupSubmitted] = useState<boolean>(false);
  const [isSubmittingTopup, setIsSubmittingTopup] = useState<boolean>(false);

  // Checkout Payment Method in Cart
  const [selectedOrderPayment, setSelectedOrderPayment] = useState<'pos' | 'wallet' | 'credit'>('pos');

  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const localCategories = useLiveQuery(() => db.categories.toArray());
  const localMenuItems = useLiveQuery(() => db.menuItems.toArray());
  const localRecipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const tableInfo = useLiveQuery(() => db.restaurantTables.where('number').equals(tableNum).first(), [tableNum]);

  // Live query for local customer if present in IndexedDB
  const localCustomer = useLiveQuery(async () => {
    const q = lookupInput.trim();
    if (!q) return null;
    const all = await db.customers.toArray();
    return all.find(c => c.subscriptionCode === q || c.phone === q) || null;
  }, [lookupInput]);

  const localCustomerOrders = useLiveQuery(async () => {
    if (!localCustomer) return [];
    const allOrders = await db.orders.toArray();
    return allOrders
      .filter(
        o =>
          o.customerId === localCustomer.id ||
          (localCustomer.phone && o.customerPhone === localCustomer.phone) ||
          (localCustomer.subscriptionCode && o.customerSubscriptionCode === localCustomer.subscriptionCode)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [localCustomer]);

  const localWalletTransactions = useLiveQuery(async () => {
    if (!localCustomer?.id) return [];
    const txns = await db.customerWalletTransactions
      .where('customerId')
      .equals(localCustomer.id)
      .toArray();
    return txns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [localCustomer]);

  // Fetch customer data from network server API as fallback / live sync
  const fetchCustomerPortalFromServer = async (queryStr: string) => {
    const q = queryStr.trim();
    if (!q) return;
    setIsLoadingCustomer(true);
    try {
      const res = await fetch(`/api/network/customer-portal?q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.customer) {
          setNetworkCustomerData({
            customer: data.customer,
            orders: data.orders || [],
            walletTransactions: data.walletTransactions || []
          });
        }
      }
    } catch {
      // Offline or local mode
    } finally {
      setIsLoadingCustomer(false);
    }
  };

  useEffect(() => {
    if (lookupInput.trim()) {
      fetchCustomerPortalFromServer(lookupInput);
    }
  }, []);

  const activeCustomer = localCustomer || networkCustomerData?.customer || null;
  const activeCustomerOrders =
    localCustomerOrders && localCustomerOrders.length > 0
      ? localCustomerOrders
      : networkCustomerData?.orders || [];
  const activeWalletTxns =
    localWalletTransactions && localWalletTransactions.length > 0
      ? localWalletTransactions
      : networkCustomerData?.walletTransactions || [];

  // Auto-fill order customer fields when customer is loaded
  useEffect(() => {
    if (activeCustomer) {
      setOrderCustomerName(activeCustomer.name || '');
      setOrderCustomerPhone(activeCustomer.phone || '');
      if ((activeCustomer.walletBalance || 0) > 0) {
        setSelectedOrderPayment('wallet');
      }
    }
  }, [activeCustomer?.id, activeCustomer?.phone]);

  // Network fetched menu fallback (for smartphones connecting over LAN where Dexie is fresh)
  const [networkMenu, setNetworkMenu] = useState<{ categories: Category[]; menuItems: MenuItem[]; recipes?: any[] } | null>(null);

  useEffect(() => {
    if ((!localCategories || localCategories.length === 0) || (!localMenuItems || localMenuItems.length === 0)) {
      fetchMenuFromNetwork().then(data => {
        if (data) setNetworkMenu(data);
      });
    }
  }, [localCategories, localMenuItems]);

  const rawCategories = (localCategories && localCategories.length > 0) ? localCategories : (networkMenu?.categories || []);
  const rawMenuItems = (localMenuItems && localMenuItems.length > 0) ? localMenuItems : (networkMenu?.menuItems || []);

  const categories = useMemo(() => {
    return [...rawCategories].sort((a, b) => {
      const orderA = a.order !== undefined && a.order !== null ? a.order : (a.id || 0);
      const orderB = b.order !== undefined && b.order !== null ? b.order : (b.id || 0);
      return orderA - orderB;
    });
  }, [rawCategories]);

  const menuItems = useMemo(() => {
    return [...rawMenuItems].sort((a, b) => {
      const orderA = a.order !== undefined && a.order !== null ? a.order : (a.id || 0);
      const orderB = b.order !== undefined && b.order !== null ? b.order : (b.id || 0);
      return orderA - orderB;
    });
  }, [rawMenuItems]);

  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderCustomerName, setOrderCustomerName] = useState('');
  const [orderCustomerPhone, setOrderCustomerPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<any | null>(null);
  const [waiterCalledSuccess, setWaiterCalledSuccess] = useState(false);
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);

  // Filter items
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      if (!item.isActive) return false;
      if (activeCategoryId !== 'all' && item.categoryId !== activeCategoryId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return item.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [menuItems, activeCategoryId, searchQuery]);

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.menuItem.price * item.quantity), 0);
  }, [cart]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.menuItem.id === item.id);
      if (idx > -1) {
        const copy = [...prev];
        copy[idx].quantity += 1;
        return copy;
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: number, delta: number) => {
    setCart(prev => {
      return prev.map(c => {
        if (c.menuItem.id === itemId) {
          const nextQty = c.quantity + delta;
          return { ...c, quantity: nextQty };
        }
        return c;
      }).filter(c => c.quantity > 0);
    });
  };

  const handleCallWaiter = async () => {
    if (isCallingWaiter) return;
    setIsCallingWaiter(true);
    try {
      const ok = await callWaiter(tableNum, tableInfo?.title || `میز ${tableNum}`);
      if (ok) {
        setWaiterCalledSuccess(true);
        setTimeout(() => setWaiterCalledSuccess(false), 5000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCallingWaiter(false);
    }
  };

  const handleSubmitTopupRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(topupAmount);
    if (!activeCustomer || !numericAmount || numericAmount <= 0 || isSubmittingTopup) return;

    setIsSubmittingTopup(true);
    try {
      const payload: Omit<import('../../lib/db').NetworkOrder, 'id'> = {
        tempId: 'TOPUP-' + Math.floor(1000 + Math.random() * 9000),
        tableNumber: tableNum || 0,
        tableTitle: `شارژ کیف پول (${activeCustomer.name})`,
        customerName: activeCustomer.name,
        customerPhone: activeCustomer.phone,
        customerSubscriptionCode: activeCustomer.subscriptionCode,
        requestType: 'wallet_topup',
        topupAmount: numericAmount,
        trackingCode: topupTrackingCode.trim() || undefined,
        notes: topupNote.trim() || `درخواست شارژ کیف پول / ثبت پرداخت به مبلغ ${formatCurrency(numericAmount)}`,
        items: [
          {
            menuItemId: 0,
            name: `شارژ کیف پول مشترک کد ${activeCustomer.subscriptionCode}`,
            price: numericAmount,
            quantity: 1,
            note: topupTrackingCode ? `کد پیگیری: ${topupTrackingCode}` : undefined
          }
        ],
        subtotal: numericAmount,
        source: 'customer_wallet',
        status: 'pending',
        createdAt: new Date()
      };

      await sendNetworkOrder(payload);

      // Also notify central customer-portal endpoint
      try {
        await fetch('/api/network/customer-portal/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'wallet_topup',
            customerId: activeCustomer.id,
            subscriptionCode: activeCustomer.subscriptionCode,
            phone: activeCustomer.phone,
            name: activeCustomer.name,
            amount: numericAmount,
            trackingCode: topupTrackingCode.trim(),
            note: topupNote.trim()
          })
        });
      } catch {}

      setTopupSubmitted(true);
      setTopupAmount('');
      setTopupTrackingCode('');
      setTopupNote('');
      setTimeout(() => setTopupSubmitted(false), 6000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingTopup(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const paymentLabel =
        selectedOrderPayment === 'wallet'
          ? 'پرداخت از کیف پول باشگاه'
          : selectedOrderPayment === 'credit'
          ? 'ثبت به حساب مشترک (نسیه)'
          : 'پرداخت در صندوق';

      const combinedNotes = [
        orderNotes.trim(),
        activeCustomer ? `مشترک کد ${activeCustomer.subscriptionCode} (${paymentLabel})` : ''
      ]
        .filter(Boolean)
        .join(' | ');

      const orderPayload: Omit<import('../../lib/db').NetworkOrder, 'id'> = {
        tempId: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
        tableNumber: tableNum,
        tableTitle: activeCustomer && !urlParams.get('table')
          ? `سفارش مشترک #${activeCustomer.subscriptionCode}`
          : (tableInfo?.title || `میز ${tableNum}`),
        customerName: (orderCustomerName.trim() || activeCustomer?.name) || undefined,
        customerPhone: (orderCustomerPhone.trim() || activeCustomer?.phone) || undefined,
        customerSubscriptionCode: activeCustomer?.subscriptionCode || undefined,
        paymentMethod: selectedOrderPayment,
        requestType: 'order',
        notes: combinedNotes || undefined,
        items: cart.map(c => ({
          menuItemId: c.menuItem.id || 0,
          name: c.menuItem.name,
          price: c.menuItem.price,
          quantity: c.quantity,
          note: c.note
        })),
        subtotal: cartTotal,
        source: activeCustomer ? 'customer_wallet' : 'customer_qr',
        status: 'pending',
        createdAt: new Date()
      };

      const createdOrder = await sendNetworkOrder(orderPayload);
      if (createdOrder) {
        setSubmittedOrder(createdOrder);
        setCart([]);
        setIsCartOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col font-sans pb-24" dir="rtl">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-black/[0.06] shadow-2xs">
        <div className="max-w-3xl mx-auto px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            {/* Restaurant brand and Table/Club info */}
            <div className="flex items-center gap-3 min-w-0">
              {settings?.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt="Logo"
                  className="w-11 h-11 rounded-2xl object-cover border border-black/[0.06] shadow-2xs shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  {settings?.restaurantName ? settings.restaurantName[0] : 'آ'}
                </div>
              )}

              <div className="min-w-0">
                <h1 className="font-bold text-sm md:text-base text-neutral-900 leading-tight truncate">
                  {settings?.restaurantName || 'باشگاه مشتریان و منوی دیجیتال'}
                </h1>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {urlParams.get('table') && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#007AFF] bg-[#007AFF]/10 px-2.5 py-0.5 rounded-full font-mono">
                      <UtensilsCrossed size={11} />
                      <span>{tableInfo?.title || `میز شماره ${tableNum}`}</span>
                    </span>
                  )}
                  {activeCustomer && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                      <Crown size={11} />
                      <span>{activeCustomer.name} (#{activeCustomer.subscriptionCode})</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Mode Switcher & Call Waiter */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center bg-black/[0.05] p-1 rounded-xl border border-black/[0.05]">
                <button
                  onClick={() => setViewMode('wallet')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'wallet'
                      ? 'bg-white text-[#007AFF] shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <Wallet size={14} />
                  <span>کیف پول و صورتحساب</span>
                </button>
                <button
                  onClick={() => setViewMode('menu')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'menu'
                      ? 'bg-white text-[#007AFF] shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <UtensilsCrossed size={14} />
                  <span>سفارش خرید</span>
                </button>
              </div>

              {urlParams.get('table') && (
                <button
                  onClick={handleCallWaiter}
                  disabled={isCallingWaiter || waiterCalledSuccess}
                  className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                    waiterCalledSuccess
                      ? 'bg-[#34C759] text-white'
                      : 'bg-black/[0.04] hover:bg-black/[0.08] text-neutral-800'
                  }`}
                  title="فراخوانی گارسون سر میز"
                >
                  <BellRing size={14} className={waiterCalledSuccess ? 'animate-bounce' : ''} />
                  <span className="hidden sm:inline">{waiterCalledSuccess ? 'گارسون مطلع شد' : 'گارسون'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Wi-Fi & Contact info pill */}
          {(settings?.wifiSsid || settings?.phone) && (
            <div className="mt-2.5 pt-2.5 border-t border-black/[0.04] flex flex-wrap items-center justify-between text-[11px] text-neutral-500 gap-2">
              {settings?.wifiSsid && (
                <div className="flex items-center gap-1.5 bg-black/[0.03] px-2 py-0.5 rounded-lg border border-black/[0.04]">
                  <Wifi size={12} className="text-[#007AFF]" />
                  <span>وای‌فای: <strong className="text-neutral-800 font-mono">{settings.wifiSsid}</strong></span>
                  {settings.wifiPassword && (
                    <span className="text-neutral-500 font-mono text-[10px]">({settings.wifiPassword})</span>
                  )}
                </div>
              )}
              {settings?.phone && (
                <div className="flex items-center gap-1 text-neutral-600">
                  <Phone size={11} />
                  <span dir="ltr" className="font-mono">{settings.phone}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto w-full px-4 pt-4 flex-1">
        {/* Waiter call notification toast */}
        {waiterCalledSuccess && (
          <div className="mb-4 p-3 rounded-2xl bg-[#34C759]/10 border border-[#34C759]/20 text-[#34C759] flex items-center gap-2.5 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>پیام شما با شماره میز ثبت شد؛ گارسون به زودی سر میز شما حاضر خواهد شد.</span>
          </div>
        )}

        {/* Submitted Order Status Banner */}
        {submittedOrder && (
          <div className="mb-4 p-4 rounded-3xl bg-white border border-emerald-500/30 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-[#34C759]" />
                <span className="font-bold text-sm text-neutral-900">سفارش خرید شما با موفقیت ثبت شد</span>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] font-bold font-mono">
                کد: {submittedOrder.tempId}
              </span>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed font-normal">
              درخواست خرید شما مستقیماً برای صندوق ارسال گردید و در حال آماده‌سازی می‌باشد.
            </p>
            <div className="mt-3 pt-2.5 border-t border-black/[0.04] flex justify-between items-center text-xs font-bold text-neutral-900 font-mono">
              <span>مبلغ کل سفارش:</span>
              <span className="text-[#007AFF]">{formatCurrency(submittedOrder.subtotal)}</span>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* VIEW 1: CUSTOMER CLUB WALLET & STATEMENT PORTAL                   */}
        {/* ================================================================= */}
        {viewMode === 'wallet' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Customer Lookup / Login Card */}
            <div className="bg-white rounded-3xl border border-black/[0.06] p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center">
                    <Crown size={18} />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-neutral-900">پرتال اختصاصی باشگاه مشتریان و کیف پول</h2>
                    <p className="text-[11px] text-neutral-500">مشاهده آنی موجودی کیف پول، صورتحساب فاکتورها، شارژ آنلاین و ثبت سفارش</p>
                  </div>
                </div>
                {activeCustomer && (
                  <button
                    onClick={() => fetchCustomerPortalFromServer(lookupInput)}
                    className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-all cursor-pointer"
                    title="بروزرسانی اطلاعات"
                  >
                    <RefreshCw size={15} className={isLoadingCustomer ? 'animate-spin' : ''} />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    dir="ltr"
                    value={lookupInput}
                    onChange={e => setLookupInput(e.target.value)}
                    placeholder="شماره موبایل (0912...) یا کد اشتراک (مثلاً 1001)"
                    className="w-full bg-neutral-50 border border-black/[0.08] rounded-2xl px-3.5 py-2.5 text-xs font-mono text-center text-neutral-900 focus:bg-white focus:outline-none focus:border-[#007AFF]"
                  />
                </div>
                <button
                  onClick={() => fetchCustomerPortalFromServer(lookupInput)}
                  className="px-4 py-2.5 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-2xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                >
                  <Search size={14} />
                  <span>مشاهده حساب</span>
                </button>
              </div>
            </div>

            {!activeCustomer ? (
              <div className="bg-white rounded-3xl border border-black/[0.06] p-8 text-center shadow-2xs">
                <Wallet size={40} className="mx-auto text-neutral-300 mb-3" />
                <h3 className="font-bold text-sm text-neutral-800 mb-1">کد اشتراک یا شماره موبایل خود را وارد کنید</h3>
                <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
                  با وارد کردن کد اشتراک یا شماره موبایل ثبت‌شده در باشگاه مشتریان، موجودی کیف پول، ریز فاکتورها و امکان ثبت سفارش آنلاین برای شما نمایش داده می‌شود.
                </p>
              </div>
            ) : (
              <>
                {/* Customer Digital Wallet Card */}
                <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 shadow-xl relative overflow-hidden">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-black text-white">{activeCustomer.name}</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/15 text-amber-300 border border-white/10">
                          {TIER_INFO[activeCustomer.tier || 'bronze']?.label || 'عضو باشگاه'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-300 font-mono">
                        <span>کد اشتراک: #{activeCustomer.subscriptionCode}</span>
                        <span>•</span>
                        <span dir="ltr">{activeCustomer.phone}</span>
                      </div>
                    </div>

                    <div className="text-left bg-white/10 px-3 py-1.5 rounded-2xl border border-white/10">
                      <span className="text-[10px] text-slate-300 block">امتیاز وفاداری</span>
                      <span className="text-sm font-black text-amber-400 font-mono">
                        {(activeCustomer.loyaltyPoints || 0).toLocaleString('fa-IR')} امتیاز
                      </span>
                    </div>
                  </div>

                  {/* Balances Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
                      <div className="flex items-center justify-between text-xs text-emerald-300 mb-1">
                        <span>موجودی کیف پول</span>
                        <Wallet size={15} />
                      </div>
                      <p className="text-lg font-black text-white font-mono">
                        {formatCurrency(activeCustomer.walletBalance || 0)}
                      </p>
                      <span className="text-[10px] text-emerald-300/80">قابل خرید و تسویه آنی</span>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
                      <div className="flex items-center justify-between text-xs text-rose-300 mb-1">
                        <span>وضعیت حساب دفتری (نسیه)</span>
                        <CreditCard size={15} />
                      </div>
                      <p className="text-lg font-black text-white font-mono">
                        {(activeCustomer.balance || 0) < 0
                          ? `${formatCurrency(Math.abs(activeCustomer.balance))} بدهکار`
                          : (activeCustomer.balance || 0) > 0
                          ? `${formatCurrency(activeCustomer.balance)} بستانکار`
                          : 'تسویه (۰ تومان)'}
                      </p>
                      <span className="text-[10px] text-slate-300">صورتحساب نسیه مشتری</span>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
                      <div className="flex items-center justify-between text-xs text-amber-300 mb-1">
                        <span>پاداش کش‌بک کیف پول</span>
                        <Gift size={15} />
                      </div>
                      <p className="text-lg font-black text-white font-mono">
                        {activeCustomer.cashbackPercent || 0}%
                      </p>
                      <span className="text-[10px] text-slate-300">تعداد خرید: {activeCustomer.OrderCount || 0} فاکتور</span>
                    </div>
                  </div>

                  {/* Quick CTA Buttons inside Card */}
                  <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap gap-2">
                    <button
                      onClick={() => setWalletTab('topup')}
                      className="flex-1 py-2.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <Plus size={15} />
                      <span>شارژ کیف پول / ثبت پرداخت</span>
                    </button>
                    <button
                      onClick={() => setViewMode('menu')}
                      className="flex-1 py-2.5 px-3 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <ShoppingBag size={15} />
                      <span>ثبت درخواست خرید آنلاین</span>
                    </button>
                  </div>
                </div>

                {/* Sub-tabs for Statement / Invoices / Top-up */}
                <div className="flex bg-white p-1 rounded-2xl border border-black/[0.06] shadow-2xs">
                  <button
                    onClick={() => setWalletTab('statement')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      walletTab === 'statement'
                        ? 'bg-[#007AFF] text-white shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    گردش کیف پول ({activeWalletTxns.length})
                  </button>
                  <button
                    onClick={() => setWalletTab('invoices')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      walletTab === 'invoices'
                        ? 'bg-[#007AFF] text-white shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    صورتحساب فاکتورها ({activeCustomerOrders.length})
                  </button>
                  <button
                    onClick={() => setWalletTab('topup')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      walletTab === 'topup'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    شارژ و پرداخت
                  </button>
                </div>

                {/* TAB 1: Wallet & Account Transactions */}
                {walletTab === 'statement' && (
                  <div className="bg-white rounded-3xl border border-black/[0.06] p-4 shadow-2xs space-y-2.5">
                    <h4 className="font-bold text-xs text-neutral-800 mb-2 flex items-center gap-1.5">
                      <Wallet size={15} className="text-[#007AFF]" />
                      <span>ریز گردش کیف پول و تسویه‌های مشترک</span>
                    </h4>
                    {activeWalletTxns.length === 0 ? (
                      <div className="text-center py-8 text-xs text-neutral-400">
                        هنوز تراکنشی در کیف پول شما ثبت نشده است.
                      </div>
                    ) : (
                      activeWalletTxns.map((tx, idx) => {
                        const isPositive = tx.type === 'topup' || tx.type === 'cashback' || tx.type === 'refund';
                        return (
                          <div
                            key={tx.id || idx}
                            className="p-3 rounded-2xl bg-neutral-50 border border-black/[0.04] flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                  isPositive
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : 'bg-rose-500/10 text-rose-600'
                                }`}
                              >
                                {isPositive ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-xs text-neutral-900 truncate">{tx.description}</p>
                                <span className="text-[10px] text-neutral-400 font-mono">
                                  {format(new Date(tx.createdAt), 'yyyy/MM/dd - HH:mm')}
                                </span>
                              </div>
                            </div>
                            <div className="text-left shrink-0 font-mono">
                              <span
                                className={`text-xs font-black block ${
                                  isPositive ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                              >
                                {isPositive ? '+' : '-'}
                                {formatCurrency(tx.amount)}
                              </span>
                              <span className="text-[10px] text-neutral-400">
                                مانده: {formatCurrency(tx.balanceAfter)}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* TAB 2: Customer Invoices */}
                {walletTab === 'invoices' && (
                  <div className="bg-white rounded-3xl border border-black/[0.06] p-4 shadow-2xs space-y-3">
                    <h4 className="font-bold text-xs text-neutral-800 mb-2 flex items-center gap-1.5">
                      <FileText size={15} className="text-[#007AFF]" />
                      <span>صورتحساب کامل فاکتورهای خرید</span>
                    </h4>
                    {activeCustomerOrders.length === 0 ? (
                      <div className="text-center py-8 text-xs text-neutral-400">
                        هنوز فاکتوری برای شما ثبت نشده است.
                      </div>
                    ) : (
                      activeCustomerOrders.map(order => (
                        <div
                          key={order.id}
                          className="p-3.5 rounded-2xl bg-neutral-50 border border-black/[0.05] space-y-2"
                        >
                          <div className="flex items-center justify-between border-b border-black/[0.05] pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-neutral-900 font-mono">
                                فاکتور #{order.orderNumber}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] font-semibold">
                                {order.paymentMethod === 'wallet'
                                  ? 'کیف پول'
                                  : order.paymentMethod === 'credit'
                                  ? 'نسیه (بدهکار)'
                                  : order.paymentMethod === 'card'
                                  ? 'کارتخوان'
                                  : order.paymentMethod === 'cash'
                                  ? 'نقدی'
                                  : 'ترکیبی'}
                              </span>
                            </div>
                            <span className="text-[11px] text-neutral-500 font-mono">
                              {format(new Date(order.createdAt), 'yyyy/MM/dd - HH:mm')}
                            </span>
                          </div>

                          <div className="space-y-1">
                            {order.items.map((item, i) => (
                              <div key={i} className="flex justify-between text-xs text-neutral-700">
                                <span>
                                  {item.name} × {item.quantity}
                                </span>
                                <span className="font-mono">{formatCurrency(item.price * item.quantity)}</span>
                              </div>
                            ))}
                          </div>

                          <div className="pt-2 border-t border-black/[0.05] flex justify-between items-center text-xs font-bold text-neutral-900">
                            <span>مبلغ نهایی فاکتور:</span>
                            <span className="text-[#007AFF] font-mono">{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB 3: Wallet Top-Up / Payment Request */}
                {walletTab === 'topup' && (
                  <div className="bg-white rounded-3xl border border-black/[0.06] p-4 shadow-2xs">
                    <h4 className="font-bold text-sm text-neutral-900 mb-1 flex items-center gap-1.5">
                      <Sparkles size={16} className="text-emerald-600" />
                      <span>درخواست شارژ کیف پول / ثبت واریزی</span>
                    </h4>
                    <p className="text-xs text-neutral-500 mb-4">
                      مبلغ مورد نظر برای شارژ کیف پول یا تسویه حساب را وارد نمایید تا در صندوق و باشگاه مشتریان ثبت و تایید شود.
                    </p>

                    {topupSubmitted && (
                      <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <span>درخواست شارژ / پرداخت شما با موفقیت برای صندوق و ربات باشگاه ارسال شد.</span>
                      </div>
                    )}

                    <form onSubmit={handleSubmitTopupRequest} className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                          مبلغ شارژ یا پرداخت (تومان) *
                        </label>
                        <input
                          type="number"
                          required
                          min={1000}
                          dir="ltr"
                          value={topupAmount}
                          onChange={e => setTopupAmount(e.target.value)}
                          placeholder="مثلاً 500000"
                          className="w-full bg-neutral-50 border border-black/[0.08] rounded-2xl px-3.5 py-2.5 text-sm font-mono font-bold text-center text-neutral-900 focus:bg-white focus:border-emerald-500 outline-none"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {[100000, 200000, 500000, 1000000, 2000000].map(preset => (
                            <button
                              type="button"
                              key={preset}
                              onClick={() => setTopupAmount(String(preset))}
                              className="px-2.5 py-1 rounded-xl bg-neutral-100 hover:bg-emerald-50 hover:text-emerald-700 text-[11px] font-mono font-semibold text-neutral-700 transition-all cursor-pointer"
                            >
                              +{preset.toLocaleString('fa-IR')}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 mb-1">
                          شماره پیگیری واریز / فیش بانکی (اختیاری)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={topupTrackingCode}
                          onChange={e => setTopupTrackingCode(e.target.value)}
                          placeholder="کد پیگیری کارت به کارت یا فیش"
                          className="w-full bg-neutral-50 border border-black/[0.08] rounded-2xl px-3.5 py-2 text-xs font-mono text-center text-neutral-900 focus:bg-white focus:border-emerald-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 mb-1">
                          توضیحات (اختیاری)
                        </label>
                        <input
                          type="text"
                          value={topupNote}
                          onChange={e => setTopupNote(e.target.value)}
                          placeholder="توضیحات جهت اطلاع صندوق..."
                          className="w-full bg-neutral-50 border border-black/[0.08] rounded-2xl px-3.5 py-2 text-xs text-neutral-900 focus:bg-white focus:border-emerald-500 outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmittingTopup || !topupAmount}
                        className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={16} />
                        <span>ثبت و ارسال درخواست شارژ کیف پول</span>
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* VIEW 2: DIGITAL MENU & ONLINE ORDERING                            */}
        {/* ================================================================= */}
        {viewMode === 'menu' && (
          <>
            {/* Active Customer Wallet Banner on Menu */}
            {activeCustomer && (
              <div className="mb-3.5 p-3 rounded-2xl bg-gradient-to-r from-indigo-950 to-slate-900 text-white flex items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <UserCheck size={16} className="text-emerald-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-xs font-bold">{activeCustomer.name}</span>
                    <span className="text-[11px] text-slate-300 mr-2 font-mono">
                      (موجودی کیف پول: {formatCurrency(activeCustomer.walletBalance || 0)})
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setViewMode('wallet')}
                  className="px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  مشاهده کیف پول
                </button>
              </div>
            )}

            {/* Search Bar */}
            <div className="relative mb-3.5">
              <input
                type="text"
                placeholder="جستجوی کالا، غذا، نوشیدنی..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-black/[0.06] rounded-2xl pl-9 pr-9 py-2.5 text-xs text-neutral-900 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all shadow-[0_1px_4px_rgba(0,0,0,0.02)]"
              />
              <Search size={16} className="absolute right-3 top-3 text-neutral-400" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-3 text-neutral-400 hover:text-neutral-600 active:scale-90"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Categories Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3.5 scrollbar-none">
              <button
                onClick={() => setActiveCategoryId('all')}
                className={`px-3.5 py-1.5 rounded-full text-xs transition-all duration-150 whitespace-nowrap cursor-pointer active:scale-95 ${
                  activeCategoryId === 'all'
                    ? 'bg-[#007AFF] text-white font-semibold shadow-[0_2px_8px_rgba(0,122,255,0.25)]'
                    : 'bg-white border border-black/[0.06] text-neutral-600 hover:bg-neutral-100 font-medium'
                }`}
              >
                همه ({menuItems.filter(i => i.isActive).length})
              </button>
              {categories.map(cat => {
                const count = menuItems.filter(i => i.categoryId === cat.id && i.isActive).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategoryId(cat.id!)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all duration-150 whitespace-nowrap cursor-pointer active:scale-95 ${
                      activeCategoryId === cat.id
                        ? 'bg-[#007AFF] text-white font-semibold shadow-[0_2px_8px_rgba(0,122,255,0.25)]'
                        : 'bg-white border border-black/[0.06] text-neutral-600 hover:bg-neutral-100 font-medium'
                    }`}
                  >
                    {cat.name} ({count})
                  </button>
                );
              })}
            </div>

            {/* Menu Items Grid */}
            {filteredItems.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-black/[0.06] p-6 shadow-2xs">
                <UtensilsCrossed size={36} className="mx-auto text-neutral-300 mb-2" />
                <h3 className="font-semibold text-neutral-800 text-xs mb-1">موردی یافت نشد</h3>
                <p className="text-[11px] text-neutral-400">محصول مورد نظر در این دسته‌بندی وجود ندارد.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {filteredItems.map(item => {
                  const inCart = cart.find(c => c.menuItem.id === item.id);
                  const itemRecipe =
                    localRecipes.find(r => r.menuItemId === item.id) ||
                    (networkMenu?.recipes || []).find(r => r.menuItemId === item.id);
                  const ingredientsText = getMenuItemIngredients(item, itemRecipe);

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-3xl border border-black/[0.06] p-3.5 flex gap-3 shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] transition-all duration-200 relative overflow-hidden"
                    >
                      {/* Food Image */}
                      <div className="w-20 h-20 rounded-2xl bg-neutral-100 overflow-hidden shrink-0 flex items-center justify-center border border-black/[0.04]">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <UtensilsCrossed size={24} className="text-neutral-300" />
                        )}
                      </div>

                      {/* Food Info */}
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <h4 className="font-bold text-xs text-neutral-900 truncate">{item.name}</h4>
                          {ingredientsText && (
                            <p
                              className="text-[11px] text-neutral-600 line-clamp-2 mt-1 leading-relaxed font-normal bg-black/[0.02] p-1.5 rounded-xl border border-black/[0.03]"
                              title={ingredientsText}
                            >
                              <span className="text-neutral-400 font-medium">مواد تشکیل‌دهنده: </span>
                              <span className="text-neutral-700">{ingredientsText}</span>
                            </p>
                          )}
                          <p className="text-xs font-bold text-[#007AFF] font-mono mt-1.5">
                            {formatCurrency(item.price)}
                          </p>
                        </div>

                        {/* Add / Qty Controls */}
                        <div className="mt-2 flex items-center justify-end">
                          {inCart ? (
                            <div className="flex items-center gap-1.5 bg-black/[0.03] border border-black/[0.06] rounded-xl p-0.5">
                              <button
                                onClick={() => updateQuantity(item.id!, -1)}
                                className="w-6 h-6 rounded-lg bg-white text-neutral-800 shadow-2xs flex items-center justify-center font-bold active:scale-90 cursor-pointer"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="font-bold text-xs text-neutral-900 w-4 text-center font-mono">
                                {inCart.quantity}
                              </span>
                              <button
                                onClick={() => updateQuantity(item.id!, 1)}
                                className="w-6 h-6 rounded-lg bg-[#007AFF] text-white shadow-2xs flex items-center justify-center font-bold active:scale-90 cursor-pointer"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all cursor-pointer"
                            >
                              <Plus size={13} />
                              <span>افزودن</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 inset-x-4 max-w-lg mx-auto z-40 animate-in fade-in slide-in-from-bottom-2">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-neutral-900/95 backdrop-blur-xl hover:bg-neutral-900 text-white p-3 rounded-2xl shadow-2xl border border-white/10 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-[#007AFF] flex items-center justify-center shadow-xs">
                  <ShoppingBag size={18} className="text-white" />
                </div>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FF9500] text-neutral-950 font-bold text-[10px] flex items-center justify-center font-mono">
                  {totalCartCount}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-neutral-300 block">
                  {activeCustomer ? `مشترک: ${activeCustomer.name}` : tableInfo?.title || `میز ${tableNum}`}
                </span>
                <span className="text-xs font-bold text-white font-mono">{formatCurrency(cartTotal)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs font-semibold bg-white/15 px-3 py-1.5 rounded-xl">
              <span>تکمیل و ثبت خرید</span>
              <ArrowLeft size={14} />
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer / Modal */}
      {isCartOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
          onClick={() => setIsCartOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white/95 backdrop-blur-2xl rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl border border-black/[0.08] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-black/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag size={18} className="text-[#007AFF]" />
                <h3 className="font-bold text-sm text-neutral-900">
                  سبد درخواست خرید {activeCustomer ? `(${activeCustomer.name})` : tableInfo?.title || `میز ${tableNum}`}
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-xl hover:bg-black/[0.04] transition-all cursor-pointer active:scale-90"
              >
                <X size={17} />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1 max-h-[50vh] scrollbar-none">
              {cart.map(item => (
                <div
                  key={item.menuItem.id}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-neutral-50/70 border border-black/[0.04]"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <h5 className="font-semibold text-xs text-neutral-900 truncate">{item.menuItem.name}</h5>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {formatCurrency(item.menuItem.price * item.quantity)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-white border border-black/[0.06] rounded-xl p-0.5 shadow-2xs">
                    <button
                      onClick={() => updateQuantity(item.menuItem.id!, -1)}
                      className="w-6 h-6 rounded-lg bg-black/[0.04] text-neutral-700 flex items-center justify-center font-bold text-xs cursor-pointer active:scale-90"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="font-bold text-xs w-4 text-center text-neutral-800 font-mono">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.menuItem.id!, 1)}
                      className="w-6 h-6 rounded-lg bg-[#007AFF] text-white flex items-center justify-center font-bold text-xs cursor-pointer active:scale-90"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Payment Method Choice for Club Members */}
              {activeCustomer && (
                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1.5">
                    روش تسویه سفارش در باشگاه مشتریان:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderPayment('wallet')}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        selectedOrderPayment === 'wallet'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold'
                          : 'bg-neutral-50 border-black/[0.06] text-neutral-600'
                      }`}
                    >
                      <Wallet size={14} className="mx-auto mb-0.5 text-emerald-600" />
                      <span className="text-[11px] block">کیف پول</span>
                      <span className="text-[9px] font-mono opacity-80 block">
                        {formatCurrency(activeCustomer.walletBalance || 0)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedOrderPayment('credit')}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        selectedOrderPayment === 'credit'
                          ? 'bg-amber-50 border-amber-500 text-amber-800 font-bold'
                          : 'bg-neutral-50 border-black/[0.06] text-neutral-600'
                      }`}
                    >
                      <CreditCard size={14} className="mx-auto mb-0.5 text-amber-600" />
                      <span className="text-[11px] block">ثبت به حساب (نسیه)</span>
                      <span className="text-[9px] opacity-80 block">کد #{activeCustomer.subscriptionCode}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedOrderPayment('pos')}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        selectedOrderPayment === 'pos'
                          ? 'bg-blue-50 border-blue-500 text-blue-800 font-bold'
                          : 'bg-neutral-50 border-black/[0.06] text-neutral-600'
                      }`}
                    >
                      <Hash size={14} className="mx-auto mb-0.5 text-blue-600" />
                      <span className="text-[11px] block">پرداخت در صندوق</span>
                      <span className="text-[9px] opacity-80 block">کارت یا نقد</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Customer Notes */}
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                  توضیحات و یادداشت سفارش (اختیاری):
                </label>
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="توضیحات، آدرس یا یادداشت..."
                  rows={2}
                  className="w-full bg-black/[0.03] border border-black/[0.06] rounded-2xl p-2.5 text-xs text-neutral-900 focus:bg-white focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all resize-none"
                />
              </div>

              {/* Name/Phone */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] font-semibold text-neutral-500 mb-1">نام شما</label>
                  <input
                    type="text"
                    value={orderCustomerName}
                    onChange={e => setOrderCustomerName(e.target.value)}
                    placeholder="نام مشتری"
                    className="w-full bg-black/[0.03] border border-black/[0.06] rounded-xl px-2.5 py-1.5 text-xs text-neutral-900 focus:bg-white outline-none focus:border-[#007AFF]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-neutral-500 mb-1">شماره موبایل</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={orderCustomerPhone}
                    onChange={e => setOrderCustomerPhone(e.target.value)}
                    placeholder="0912..."
                    className="w-full bg-black/[0.03] border border-black/[0.06] rounded-xl px-2.5 py-1.5 text-xs text-center font-mono focus:bg-white outline-none focus:border-[#007AFF]"
                  />
                </div>
              </div>
            </div>

            {/* Total and Submit Button */}
            <div className="p-4 border-t border-black/[0.04] bg-neutral-50/60 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-900">
                <span>مبلغ قابل پرداخت:</span>
                <span className="text-base text-[#007AFF] font-mono">{formatCurrency(cartTotal)}</span>
              </div>

              <button
                onClick={handleSubmitOrder}
                disabled={isSubmitting || cart.length === 0}
                className="w-full py-3.5 rounded-2xl bg-[#007AFF] hover:bg-[#0062cc] active:scale-[0.98] text-white font-semibold text-xs shadow-[0_4px_16px_rgba(0,122,255,0.25)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>ارسال نهایی درخواست خرید به صندوق</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
