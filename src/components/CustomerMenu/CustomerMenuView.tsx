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
          const newQty = c.quantity + delta;
          return newQty > 0 ? { ...c, quantity: newQty } : null;
        }
        return c;
      }).filter(Boolean) as CartItem[];
    });
  };

  const handleCallWaiter = async () => {
    if (isCallingWaiter) return;
    setIsCallingWaiter(true);
    const tableTitle = tableInfo?.title || `میز ${tableNum}`;
    await callWaiter(tableNum, tableTitle, 'مشتری از سر میز درخواست حضور گارسون داده است.');
    setIsCallingWaiter(false);
    setWaiterCalledSuccess(true);
    setTimeout(() => setWaiterCalledSuccess(false), 6000);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const tableTitle = tableInfo?.title || `میز ${tableNum}`;
      const orderItems = cart.map(c => ({
        menuItemId: c.menuItem.id || 0,
        name: c.menuItem.name,
        price: c.menuItem.price,
        quantity: c.quantity,
        note: c.note || ''
      }));

      const newOrder = await sendNetworkOrder({
        tempId: 'ORD-' + Date.now().toString().slice(-6),
        tableNumber: tableNum,
        tableTitle,
        customerName: orderCustomerName.trim() || undefined,
        customerPhone: orderCustomerPhone.trim() || undefined,
        source: 'customer_qr',
        items: orderItems,
        subtotal: cartTotal,
        notes: orderNotes.trim() || undefined,
        status: 'pending',
        createdAt: new Date()
      });

      setSubmittedOrder(newOrder);
      setCart([]);
      setIsCartOpen(false);
    } catch (err) {
      alert('خطا در ارسال سفارش. لطفا مجددا تلاش فرمایید.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans pb-24" dir="rtl">
      
      {/* Top Banner / Restaurant Branding */}
      <header className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white shadow-md relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
        
        <div className="max-w-3xl mx-auto px-4 py-5 relative z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {settings?.logoUrl ? (
                <img 
                  src={settings.logoUrl} 
                  alt="Logo" 
                  className="w-13 h-13 rounded-2xl bg-white p-1 object-contain shadow-md"
                />
              ) : (
                <div className="w-13 h-13 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center shadow-inner">
                  <UtensilsCrossed size={26} className="text-white" />
                </div>
              )}
              <div>
                <h1 className="text-lg font-black tracking-tight">{settings?.restaurantName || 'منوی دیجیتال رستوران'}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-xs">
                    {tableInfo?.title || `میز شماره ${tableNum}`}
                  </span>
                  {tableInfo?.section && (
                    <span className="text-[11px] text-blue-100">
                      ({tableInfo.section})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Call Waiter Button */}
            <button
              onClick={handleCallWaiter}
              disabled={isCallingWaiter || waiterCalledSuccess}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                waiterCalledSuccess
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs active:scale-95'
              }`}
              title="فراخوانی گارسون سر میز"
            >
              <BellRing size={16} className={waiterCalledSuccess ? 'animate-bounce' : ''} />
              <span>{waiterCalledSuccess ? 'گارسون مطلع شد' : 'درخواست گارسون'}</span>
            </button>
          </div>

          {/* Wi-Fi & Contact info pill */}
          {(settings?.wifiSsid || settings?.phone) && (
            <div className="mt-3.5 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between text-[11px] text-blue-100 gap-2">
              {settings?.wifiSsid && (
                <div className="flex items-center gap-1.5 bg-black/15 px-2.5 py-1 rounded-lg">
                  <Wifi size={13} className="text-amber-300" />
                  <span>وای‌فای: <strong className="text-white font-mono">{settings.wifiSsid}</strong></span>
                  {settings.wifiPassword && (
                    <span className="text-white/80 font-mono text-[10px]">({settings.wifiPassword})</span>
                  )}
                </div>
              )}
              {settings?.phone && (
                <div className="flex items-center gap-1 text-white/90">
                  <Phone size={12} />
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
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 text-xs font-bold shadow-xs animate-in fade-in duration-200">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>پیام شما با شماره میز ثبت شد؛ گارسون به زودی سر میز شما حاضر خواهد شد.</span>
          </div>
        )}

        {/* Submitted Order Status Banner */}
        {submittedOrder && (
          <div className="mb-5 p-4 rounded-2xl bg-blue-50 border border-blue-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-blue-600" />
                <span className="font-bold text-sm text-blue-900">سفارش شما با موفقیت ثبت شد</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-200 text-blue-800 font-bold">
                کد: {submittedOrder.tempId}
              </span>
            </div>
            <p className="text-xs text-blue-700 leading-relaxed">
              سفارش شما مستقیماً برای کامپیوتر صندوق و آشپزخانه ارسال گردید و در حال آماده‌سازی می‌باشد.
            </p>
            <div className="mt-3 pt-2 border-t border-blue-200 flex justify-between items-center text-xs font-bold text-blue-900">
              <span>مبلغ کل سفارش:</span>
              <span>{formatCurrency(submittedOrder.subtotal)}</span>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="جستجوی غذا، نوشیدنی، پیش‌غذا..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-10 py-3 text-xs md:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
          <Search size={18} className="absolute right-3.5 top-3.5 text-slate-400" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute left-3.5 top-3.5 text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
          <button
            onClick={() => setActiveCategoryId('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeCategoryId === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            همه غذاها ({menuItems.filter(i => i.isActive).length})
          </button>
          {categories.map(cat => {
            const count = menuItems.filter(i => i.categoryId === cat.id && i.isActive).length;
            if (count === 0) return null;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id!)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeCategoryId === cat.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Menu Items Grid */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-6">
            <UtensilsCrossed size={40} className="mx-auto text-slate-300 mb-3" />
            <h3 className="font-bold text-slate-700 text-sm mb-1">موردی یافت نشد</h3>
            <p className="text-xs text-slate-500">غذا یا نوشیدنی مورد نظر در این دسته‌بندی وجود ندارد.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredItems.map(item => {
              const inCart = cart.find(c => c.menuItem.id === item.id);

              return (
                <div 
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-3.5 flex gap-3 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  {/* Food Image */}
                  <div className="w-22 h-22 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-100">
                    {item.image ? (
                      <img 
                        src={item.image} 
                        alt={item.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <UtensilsCrossed size={28} className="text-slate-300" />
                    )}
                  </div>

                  {/* Food Info */}
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <h4 className="font-black text-sm text-slate-800 truncate mb-1">{item.name}</h4>
                      <p className="text-xs font-bold text-blue-600">
                        {formatCurrency(item.price)}
                      </p>
                    </div>

                    {/* Add / Qty Controls */}
                    <div className="mt-2 flex items-center justify-end">
                      {inCart ? (
                        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-1">
                          <button
                            onClick={() => updateQuantity(item.id!, -1)}
                            className="w-7 h-7 rounded-lg bg-white text-blue-600 shadow-xs flex items-center justify-center font-bold active:scale-95 cursor-pointer"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="font-bold text-xs text-blue-900 w-4 text-center">
                            {inCart.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id!, 1)}
                            className="w-7 h-7 rounded-lg bg-blue-600 text-white shadow-xs flex items-center justify-center font-bold active:scale-95 cursor-pointer"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
                        >
                          <Plus size={14} />
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

      {/* Floating Cart Bar (Bottom) */}
      {cart.length > 0 && (
        <div className="fixed bottom-3 inset-x-3 max-w-xl mx-auto z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between cursor-pointer active:scale-98 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                  <ShoppingBag size={20} className="text-white" />
                </div>
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 text-amber-950 font-black text-[11px] flex items-center justify-center">
                  {totalCartCount}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-300 block">سفارش {tableInfo?.title || `میز ${tableNum}`}</span>
                <span className="text-sm font-black text-white">{formatCurrency(cartTotal)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs font-bold bg-white/10 px-3 py-1.5 rounded-xl">
              <span>مشاهده و ثبت</span>
              <ArrowLeft size={16} />
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer / Modal */}
      {isCartOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsCartOpen(false)}
        >
          <div 
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag size={20} className="text-blue-600" />
                <h3 className="font-bold text-sm text-slate-800">
                  سبد سفارش {tableInfo?.title || `میز ${tableNum}`}
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1 max-h-[45vh]">
              {cart.map(item => (
                <div key={item.menuItem.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex-1 min-w-0 pr-2">
                    <h5 className="font-bold text-xs text-slate-800 truncate">{item.menuItem.name}</h5>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {formatCurrency(item.menuItem.price * item.quantity)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-0.5 shadow-xs">
                    <button
                      onClick={() => updateQuantity(item.menuItem.id!, -1)}
                      className="w-6 h-6 rounded bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-bold text-xs w-4 text-center text-slate-800">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.menuItem.id!, 1)}
                      className="w-6 h-6 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Customer Notes */}
              <div className="pt-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  توضیحات و یادداشت برای آشپزخانه (اختیاری):
                </label>
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="مثلاً: بدون پیاز، سس مخصوص جداگانه، نوشابه خنک..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Optional Name/Phone */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">نام شما (اختیاری)</label>
                  <input
                    type="text"
                    value={orderCustomerName}
                    onChange={e => setOrderCustomerName(e.target.value)}
                    placeholder="نام مشتری"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">شماره همراه (اختیاری)</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={orderCustomerPhone}
                    onChange={e => setOrderCustomerPhone(e.target.value)}
                    placeholder="0912..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-center font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Total and Submit Button */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between text-sm font-black text-slate-800">
                <span>مبلغ قابل پرداخت:</span>
                <span className="text-base text-blue-600">{formatCurrency(cartTotal)}</span>
              </div>

              <button
                onClick={handleSubmitOrder}
                disabled={isSubmitting || cart.length === 0}
                className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    <span>ارسال نهایی سفارش به صندوق و آشپزخانه</span>
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
