import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MenuItem, Category, AppSettings, RestaurantTable } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { 
  UtensilsCrossed, Search, Plus, Minus, ShoppingBag, 
  CheckCircle2, BellRing, Wifi, Phone, MapPin, 
  ArrowLeft, Clock, AlertCircle, ChevronRight, X
} from 'lucide-react';
import { sendNetworkOrder, callWaiter, fetchMenuFromNetwork } from '../../lib/networkSync';

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  note?: string;
}

export default function CustomerMenuView({ 
  tableNumber: initialTableNumber 
}: { 
  tableNumber?: number 
}) {
  // Read table from prop or URL
  const [tableNum, setTableNum] = useState<number>(() => {
    if (initialTableNumber) return initialTableNumber;
    const params = new URLSearchParams(window.location.search);
    const tbl = params.get('table');
    return tbl ? parseInt(tbl, 10) : 1;
  });

  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const localCategories = useLiveQuery(() => db.categories.toArray());
  const localMenuItems = useLiveQuery(() => db.menuItems.toArray());
  const tableInfo = useLiveQuery(() => db.restaurantTables.where('number').equals(tableNum).first(), [tableNum]);

  // Network fetched menu fallback (for smartphones connecting over LAN where Dexie is fresh)
  const [networkMenu, setNetworkMenu] = useState<{ categories: Category[]; menuItems: MenuItem[] } | null>(null);

  useEffect(() => {
    if ((!localCategories || localCategories.length === 0) || (!localMenuItems || localMenuItems.length === 0)) {
      fetchMenuFromNetwork().then(data => {
        if (data) setNetworkMenu(data);
      });
    }
  }, [localCategories, localMenuItems]);

  const categories = (localCategories && localCategories.length > 0) ? localCategories : (networkMenu?.categories || []);
  const menuItems = (localMenuItems && localMenuItems.length > 0) ? localMenuItems : (networkMenu?.menuItems || []);

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

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const orderPayload: Omit<import('../../lib/db').NetworkOrder, 'id'> = {
        tempId: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
        tableNumber: tableNum,
        tableTitle: tableInfo?.title || `میز ${tableNum}`,
        customerName: orderCustomerName.trim() || undefined,
        customerPhone: orderCustomerPhone.trim() || undefined,
        notes: orderNotes.trim() || undefined,
        items: cart.map(c => ({
          menuItemId: c.menuItem.id || 0,
          name: c.menuItem.name,
          price: c.menuItem.price,
          quantity: c.quantity,
          note: c.note
        })),
        subtotal: cartTotal,
        source: 'customer_qr',
        status: 'pending',
        createdAt: new Date()
      };

      const createdOrder = await sendNetworkOrder(orderPayload);
      if (createdOrder) {
        setSubmittedOrder(createdOrder);
        setCart([]);
        setIsCartOpen(false);
      } else {
        alert('خطا در ارسال سفارش به صندوق مرکزی. لطفا مجددا امتحان کنید.');
      }
    } catch (e) {
      console.error(e);
      alert('خطا در ارتباط با سرور رستوران.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col font-sans pb-24" dir="rtl">
      
      {/* Top Header Bar (Apple Translucent Header) */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-black/[0.06] shadow-2xs">
        <div className="max-w-3xl mx-auto px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            {/* Restaurant brand and Table info */}
            <div className="flex items-center gap-3">
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
              
              <div>
                <h1 className="font-bold text-sm md:text-base text-neutral-900 leading-tight">
                  {settings?.restaurantName || 'منوی دیجیتال رستوران آرکا'}
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#007AFF] bg-[#007AFF]/10 px-2.5 py-0.5 rounded-full font-mono">
                    <UtensilsCrossed size={11} />
                    <span>{tableInfo?.title || `میز شماره ${tableNum}`}</span>
                  </span>
                  {tableInfo?.section && (
                    <span className="text-[10px] text-neutral-400 font-medium">({tableInfo.section})</span>
                  )}
                </div>
              </div>
            </div>

            {/* Call Waiter Button */}
            <button
              onClick={handleCallWaiter}
              disabled={isCallingWaiter || waiterCalledSuccess}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                waiterCalledSuccess
                  ? 'bg-[#34C759] text-white'
                  : 'bg-black/[0.04] hover:bg-black/[0.08] text-neutral-800'
              }`}
              title="فراخوانی گارسون سر میز"
            >
              <BellRing size={14} className={waiterCalledSuccess ? 'animate-bounce' : ''} />
              <span>{waiterCalledSuccess ? 'گارسون مطلع شد' : 'درخواست گارسون'}</span>
            </button>
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
          <div className="mb-4 p-4 rounded-3xl bg-white border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-[#34C759]" />
                <span className="font-bold text-sm text-neutral-900">سفارش شما با موفقیت ثبت شد</span>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] font-bold font-mono">
                کد: {submittedOrder.tempId}
              </span>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed font-normal">
              سفارش شما مستقیماً برای کامپیوتر صندوق و آشپزخانه ارسال گردید و در حال آماده‌سازی می‌باشد.
            </p>
            <div className="mt-3 pt-2.5 border-t border-black/[0.04] flex justify-between items-center text-xs font-bold text-neutral-900 font-mono">
              <span>مبلغ کل سفارش:</span>
              <span className="text-[#007AFF]">{formatCurrency(submittedOrder.subtotal)}</span>
            </div>
          </div>
        )}

        {/* Search Bar (Spotlight Style) */}
        <div className="relative mb-3.5">
          <input
            type="text"
            placeholder="جستجوی غذا، نوشیدنی، پیش‌غذا..."
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

        {/* Categories Bar (Cupertino Chips) */}
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
            <p className="text-[11px] text-neutral-400">غذا یا نوشیدنی مورد نظر در این دسته‌بندی وجود ندارد.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredItems.map(item => {
              const inCart = cart.find(c => c.menuItem.id === item.id);

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
                      <h4 className="font-bold text-xs text-neutral-900 truncate mb-1">{item.name}</h4>
                      <p className="text-xs font-bold text-[#007AFF] font-mono">
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

      </main>

      {/* Floating Cart Bar (Bottom Apple Pill) */}
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
                <span className="text-[11px] text-neutral-300 block">{tableInfo?.title || `میز ${tableNum}`}</span>
                <span className="text-xs font-bold text-white font-mono">{formatCurrency(cartTotal)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs font-semibold bg-white/15 px-3 py-1.5 rounded-xl">
              <span>مشاهده و ثبت</span>
              <ArrowLeft size={14} />
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer / Modal (Apple Bottom Sheet) */}
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
                  سبد سفارش {tableInfo?.title || `میز ${tableNum}`}
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
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1 max-h-[45vh] scrollbar-none">
              {cart.map(item => (
                <div key={item.menuItem.id} className="flex items-center justify-between p-2.5 rounded-2xl bg-neutral-50/70 border border-black/[0.04]">
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

              {/* Customer Notes */}
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                  توضیحات و یادداشت برای آشپزخانه (اختیاری):
                </label>
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="بدون پیاز، سس مخصوص جداگانه، نوشابه خنک..."
                  rows={2}
                  className="w-full bg-black/[0.03] border border-black/[0.06] rounded-2xl p-2.5 text-xs text-neutral-900 focus:bg-white focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all resize-none"
                />
              </div>

              {/* Optional Name/Phone */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] font-semibold text-neutral-500 mb-1">نام شما (اختیاری)</label>
                  <input
                    type="text"
                    value={orderCustomerName}
                    onChange={e => setOrderCustomerName(e.target.value)}
                    placeholder="نام مشتری"
                    className="w-full bg-black/[0.03] border border-black/[0.06] rounded-xl px-2.5 py-1.5 text-xs text-neutral-900 focus:bg-white outline-none focus:border-[#007AFF]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-neutral-500 mb-1">شماره همراه (اختیاری)</label>
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
                    <span>ارسال نهایی سفارش به صندوق</span>
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
