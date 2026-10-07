import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MenuItem, Category, RestaurantTable, OrderItem, ensureDefaultTables } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { 
  Tablet, UtensilsCrossed, Search, Plus, Minus, Trash2, 
  Send, CheckCircle2, RefreshCw, Wifi, AlertTriangle, 
  ArrowRight, X, Clock, Bell, LogOut, Check, ShoppingBag,
  User, CheckCircle, HelpCircle
} from 'lucide-react';
import { sendNetworkOrder, fetchMenuFromNetwork, getNetworkInfo, playNewOrderChime } from '../../lib/networkSync';
import { useAuth } from '../../context/AuthContext';

export default function WaiterTabletScreen({ 
  onBackToPos 
}: { 
  onBackToPos?: () => void 
}) {
  const { currentUser, logout } = useAuth();
  const tables = useLiveQuery(() => db.restaurantTables.toArray());
  const localCategories = useLiveQuery(() => db.categories.toArray());
  const localMenuItems = useLiveQuery(() => db.menuItems.toArray());
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  // Network fallback for categories/items if tablet is fresh client
  const [networkMenu, setNetworkMenu] = useState<{ categories: Category[]; menuItems: MenuItem[] } | null>(null);
  const [networkConnected, setNetworkConnected] = useState(true);
  const [isRefreshingMenu, setIsRefreshingMenu] = useState(false);

  // Auto seed tables if empty
  useEffect(() => {
    ensureDefaultTables();
  }, []);

  useEffect(() => {
    if ((!localCategories || localCategories.length === 0) || (!localMenuItems || localMenuItems.length === 0)) {
      fetchMenuFromNetwork().then(data => {
        if (data) setNetworkMenu(data);
      });
    }
  }, [localCategories, localMenuItems]);

  // Check network health periodically
  useEffect(() => {
    const checkNet = () => {
      getNetworkInfo()
        .then(() => setNetworkConnected(true))
        .catch(() => setNetworkConnected(false));
    };
    checkNet();
    const interval = setInterval(checkNet, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRefreshMenu = async () => {
    setIsRefreshingMenu(true);
    try {
      const data = await fetchMenuFromNetwork();
      if (data) setNetworkMenu(data);
    } catch (err) {
      console.error('Menu refresh error', err);
    } finally {
      setTimeout(() => setIsRefreshingMenu(false), 500);
    }
  };

  const categories = (localCategories && localCategories.length > 0) ? localCategories : (networkMenu?.categories || []);
  const menuItems = (localMenuItems && localMenuItems.length > 0) ? localMenuItems : (networkMenu?.menuItems || []);

  // UI state
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [activeTabSection, setActiveTabSection] = useState<'all' | string>('all');
  const [orderItems, setOrderItems] = useState<(OrderItem & { note?: string })[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [waiterName, setWaiterName] = useState(currentUser?.name || 'گارسون ۱');
  const [isEditingWaiterName, setIsEditingWaiterName] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  // Update waiter name if currentUser changes
  useEffect(() => {
    if (currentUser?.name) {
      setWaiterName(currentUser.name);
    }
  }, [currentUser?.name]);

  // Group sections
  const sections = useMemo(() => {
    if (!tables) return [];
    const set = new Set<string>();
    tables.forEach(t => {
      if (t.section) set.add(t.section);
    });
    return Array.from(set);
  }, [tables]);

  // Filtered tables with search & section
  const filteredTables = useMemo(() => {
    if (!tables) return [];
    let list = tables;
    if (activeTabSection !== 'all') {
      list = list.filter(t => t.section === activeTabSection);
    }
    if (tableSearchQuery.trim()) {
      const q = tableSearchQuery.trim().toLowerCase();
      list = list.filter(t => 
        t.title.toLowerCase().includes(q) || 
        String(t.number).includes(q) || 
        (t.section && t.section.toLowerCase().includes(q))
      );
    }
    return list;
  }, [tables, activeTabSection, tableSearchQuery]);

  // Table summary counts
  const tableCounts = useMemo(() => {
    if (!tables) return { total: 0, empty: 0, occupied: 0, needsWaiter: 0 };
    return {
      total: tables.length,
      empty: tables.filter(t => t.status === 'empty' || !t.status).length,
      occupied: tables.filter(t => t.status === 'occupied').length,
      needsWaiter: tables.filter(t => t.status === 'needs_waiter').length
    };
  }, [tables]);

  const filteredMenuItems = useMemo(() => {
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

  const subtotal = useMemo(() => {
    return orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }, [orderItems]);

  const totalQuantity = useMemo(() => {
    return orderItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [orderItems]);

  const handleSelectTable = (table: RestaurantTable) => {
    if (orderItems.length > 0 && selectedTable && selectedTable.number !== table.number) {
      if (!confirm(`شما برای ${selectedTable.title} اقلام انتخاب کرده‌اید. آیا مایلید به ${table.title} تغییر دهید؟`)) {
        return;
      }
    }
    setSelectedTable(table);
    setOrderItems([]);
    setOrderNotes('');
    setSubmitSuccess(false);
  };

  const handleAddItem = (item: MenuItem) => {
    setOrderItems(prev => {
      const idx = prev.findIndex(i => i.menuItemId === item.id);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx].quantity += 1;
        return updated;
      }
      return [...prev, {
        menuItemId: item.id!,
        name: item.name,
        price: item.price,
        quantity: 1,
        note: ''
      }];
    });
  };

  const handleUpdateQuantity = (menuItemId: number, delta: number) => {
    setOrderItems(prev => {
      return prev.map(item => {
        if (item.menuItemId === menuItemId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as (OrderItem & { note?: string })[];
    });
  };

  const handleSetItemNote = (menuItemId: number, note: string) => {
    setOrderItems(prev => prev.map(item => {
      if (item.menuItemId === menuItemId) {
        return { ...item, note };
      }
      return item;
    }));
  };

  const handleSendOrder = async () => {
    if (!selectedTable || orderItems.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await sendNetworkOrder({
        tempId: 'TAB-' + Date.now().toString().slice(-6),
        tableNumber: selectedTable.number,
        tableTitle: selectedTable.title,
        waiterName,
        source: 'waiter_tablet',
        items: orderItems,
        subtotal,
        notes: orderNotes.trim() || undefined,
        status: 'pending',
        createdAt: new Date()
      });

      // Play soft confirmation chime
      playNewOrderChime();

      // Update table status to occupied
      if (selectedTable.id) {
        await db.restaurantTables.update(selectedTable.id, { status: 'occupied' });
      }

      setSubmitSuccess(true);
      setOrderItems([]);
      setOrderNotes('');
      setIsCartModalOpen(false);

      setTimeout(() => {
        setSubmitSuccess(false);
        setSelectedTable(null); // return to table selection
      }, 2000);

    } catch (err) {
      alert('خطا در ارسال سفارش به کامپیوتر مرکزی.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen max-w-full bg-slate-900 text-slate-100 flex flex-col font-sans overflow-hidden select-none" dir="rtl">
      
      {/* Top Header */}
      <header className="bg-slate-850 border-b border-slate-750 px-3.5 py-2.5 flex items-center justify-between shrink-0 shadow-md z-20">
        <div className="flex items-center gap-2.5 sm:gap-3">
          {onBackToPos && (
            <button
              onClick={onBackToPos}
              className="p-2 rounded-xl bg-slate-750 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="بازگشت به صندوق مرکزی"
            >
              <ArrowRight size={18} />
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Tablet size={18} />
            </div>
            <div>
              <h2 className="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                <span>سفارش‌گیر تبلت آرکا</span>
              </h2>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <User size={10} className="text-slate-400" />
                  {isEditingWaiterName ? (
                    <input
                      type="text"
                      value={waiterName}
                      onChange={e => setWaiterName(e.target.value)}
                      onBlur={() => setIsEditingWaiterName(false)}
                      onKeyDown={e => e.key === 'Enter' && setIsEditingWaiterName(false)}
                      autoFocus
                      className="bg-slate-900 border border-blue-500 rounded px-1.5 py-0 text-[10px] text-white w-20"
                    />
                  ) : (
                    <button 
                      onClick={() => setIsEditingWaiterName(true)}
                      className="hover:underline font-bold text-slate-200 cursor-pointer"
                      title="لمس برای ویرایش نام گارسون"
                    >
                      {waiterName}
                    </button>
                  )}
                </span>
                <span>•</span>
                <span className={`inline-flex items-center gap-1 ${networkConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${networkConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                  <span className="hidden sm:inline">{networkConnected ? 'متصل به صندوق مرکزی' : 'ارتباط محلی'}</span>
                  <span className="sm:hidden">{networkConnected ? 'آنلاین' : 'آفلاین'}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2">
          {/* Refresh Menu button */}
          <button
            onClick={handleRefreshMenu}
            disabled={isRefreshingMenu}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700 text-[11px] flex items-center gap-1"
            title="به‌روزرسانی منو از صندوق مرکزی"
          >
            <RefreshCw size={14} className={isRefreshingMenu ? 'animate-spin text-blue-400' : ''} />
            <span className="hidden md:inline">به‌روزرسانی منو</span>
          </button>

          {/* Table badge if selected */}
          {selectedTable ? (
            <div className="flex items-center gap-1.5">
              <span className="px-2.5 py-1.5 rounded-xl bg-blue-600 text-white font-black text-xs shadow-xs">
                {selectedTable.title}
              </span>
              <button
                onClick={() => setSelectedTable(null)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
              >
                تغییر میز
              </button>
            </div>
          ) : (
            <span className="text-[11px] font-bold text-slate-400 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-750 hidden sm:inline">
              انتخاب میز برای سفارش
            </span>
          )}

          {/* User Logout / Switch Account */}
          <button
            onClick={() => {
              if (confirm('آیا می‌خواهید از حساب کاربری تبلت خارج شوید؟')) {
                logout();
              }
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 text-slate-400 transition-colors cursor-pointer border border-slate-700"
            title="خروج از حساب / تغییر کاربر"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      {!selectedTable ? (
        /* STEP 1: TABLE SELECTION VIEW */
        <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-y-auto max-w-6xl mx-auto w-full">
          
          {/* Header & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="font-black text-sm sm:text-base text-white">انتخاب شماره میز جهت ثبت سفارش</h3>
              <p className="text-[11px] text-slate-400">میز مهمان را انتخاب کنید تا منوی سفارش‌گیری باز شود.</p>
            </div>

            {/* Quick Status Badges */}
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                {tableCounts.empty} خالی
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                {tableCounts.occupied} مشغول
              </span>
              {tableCounts.needsWaiter > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-500 text-white font-black animate-pulse flex items-center gap-1">
                  <Bell size={11} />
                  {tableCounts.needsWaiter} فراخوان!
                </span>
              )}
            </div>
          </div>

          {/* Search Table & Section Tabs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-4">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="جستجوی میز (شماره یا عنوان)..."
                value={tableSearchQuery}
                onChange={e => setTableSearchQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-750 rounded-xl pl-8 pr-9 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
              {tableSearchQuery && (
                <button onClick={() => setTableSearchQuery('')} className="absolute left-2.5 top-2.5 text-slate-400">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Section tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setActiveTabSection('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                  activeTabSection === 'all'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-750'
                }`}
              >
                همه بخش‌ها ({tables?.length || 0})
              </button>
              {sections.map(sec => (
                <button
                  key={sec}
                  onClick={() => setActiveTabSection(sec)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    activeTabSection === sec
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-750'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>
          </div>

          {/* Tables Grid */}
          {(!tables || tables.length === 0) ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-850/50 rounded-3xl border border-slate-800 my-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 text-blue-400 flex items-center justify-center mb-3">
                <Tablet size={28} />
              </div>
              <h3 className="font-bold text-sm text-white mb-1">هنوز میزی تعریف نشده است</h3>
              <p className="text-xs text-slate-400 max-w-sm mb-4">
                برای شروع سریع کار با تبلت، می‌توانید میزهای پیش‌فرض را ایجاد کنید.
              </p>
              <button
                onClick={async () => { await ensureDefaultTables(); }}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/20 cursor-pointer transition-all"
              >
                ایجاد خودکار میزهای پیش‌فرض
              </button>
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              میزی با این مشخصات یافت نشد.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredTables.map(tbl => {
                const isOccupied = tbl.status === 'occupied';
                const needsWaiter = tbl.status === 'needs_waiter';
                const isReserved = tbl.status === 'reserved';

                let statusBg = 'bg-slate-800/90 border-slate-750 hover:border-blue-500/80 hover:bg-slate-800 text-slate-200';
                let statusText = 'خالی';
                let badgeBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

                if (needsWaiter) {
                  statusBg = 'bg-rose-950/40 border-rose-500 text-rose-100 animate-pulse';
                  statusText = 'درخواست گارسون!';
                  badgeBg = 'bg-rose-500 text-white font-bold';
                } else if (isOccupied) {
                  statusBg = 'bg-amber-950/25 border-amber-600/50 text-amber-100 hover:border-amber-500';
                  statusText = 'مشغول';
                  badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                } else if (isReserved) {
                  statusBg = 'bg-indigo-950/25 border-indigo-600/50 text-indigo-100';
                  statusText = 'رزرو';
                  badgeBg = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
                }

                return (
                  <button
                    key={tbl.id || tbl.number}
                    onClick={() => handleSelectTable(tbl)}
                    className={`p-3.5 rounded-2xl border-2 flex flex-col justify-between items-center text-center transition-all cursor-pointer shadow-md active:scale-95 min-h-[135px] ${statusBg}`}
                  >
                    <div className="w-full flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{tbl.section || 'سالن'}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeBg}`}>
                        {statusText}
                      </span>
                    </div>

                    <div className="my-2">
                      <span className="text-xl font-black block tracking-tight">{tbl.title}</span>
                      <span className="text-[11px] text-slate-400 mt-0.5 block">ظرفیت: {tbl.capacity} نفر</span>
                    </div>

                    <div className="w-full text-center py-1 rounded-xl bg-white/5 text-[10px] font-bold text-blue-400 hover:text-white">
                      {isOccupied ? 'سفارش تکمیلی' : 'ثبت سفارش جدید'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* STEP 2: TABLE ORDERING SCREEN (TOUCH MENU + CART) */
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          
          {/* Main Column: Food Menu & Categories */}
          <div className="flex-1 flex flex-col overflow-hidden p-3 border-l border-slate-800">
            
            {/* Search and Category Chips */}
            <div className="space-y-2 mb-2.5 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  placeholder="جستجوی سریع غذا و نوشیدنی..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-750 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute left-3 top-2.5 text-slate-400">
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Horizontal Category Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                <button
                  onClick={() => setActiveCategoryId('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeCategoryId === 'all'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-750'
                  }`}
                >
                  همه ({menuItems.length})
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategoryId(cat.id!)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      activeCategoryId === cat.id
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-750'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items Touch Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pb-20 md:pb-2">
              {filteredMenuItems.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-500 text-xs">
                  کالایی در این دسته‌بندی یافت نشد.
                </div>
              ) : (
                filteredMenuItems.map(item => {
                  const inOrder = orderItems.find(i => i.menuItemId === item.id);

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleAddItem(item)}
                      className={`p-3 rounded-2xl border flex flex-col justify-between text-right transition-all cursor-pointer active:scale-95 shadow-xs relative overflow-hidden ${
                        inOrder 
                          ? 'bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/40' 
                          : 'bg-slate-800/90 border-slate-750 hover:border-slate-650 hover:bg-slate-800'
                      }`}
                    >
                      {inOrder && (
                        <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-md">
                          {inOrder.quantity}
                        </span>
                      )}

                      <div className="mb-2">
                        <span className="font-bold text-xs text-white block line-clamp-2 leading-tight">
                          {item.name}
                        </span>
                      </div>

                      <div className="w-full flex items-center justify-between pt-1 border-t border-slate-700/50">
                        <span className="text-xs font-bold text-blue-400 font-mono">
                          {formatCurrency(item.price)}
                        </span>
                        <span className="p-1 rounded-lg bg-white/5 text-slate-300">
                          <Plus size={13} />
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

          </div>

          {/* Desktop / Landscape Tablet Sidebar: Order Summary Cart */}
          <aside className="hidden md:flex md:w-80 lg:w-96 bg-slate-850 flex-col justify-between p-3 border-r border-slate-800 shrink-0">
            
            {/* Header info */}
            <div className="pb-3 border-b border-slate-700/80 flex items-center justify-between">
              <div>
                <span className="font-black text-sm text-white block">اقلام سفارش {selectedTable.title}</span>
                <span className="text-[11px] text-slate-400">{orderItems.length} ردیف کالا ({totalQuantity} عدد)</span>
              </div>

              {orderItems.length > 0 && (
                <button
                  onClick={() => setOrderItems([])}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                  title="پاک کردن همه"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {/* Success alert */}
            {submitSuccess && (
              <div className="my-2 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                <span>سفارش با موفقیت به کامپیوتر صندوق ارسال شد.</span>
              </div>
            )}

            {/* Items list */}
            <div className="flex-1 overflow-y-auto py-2 space-y-2">
              {orderItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-8 text-slate-500">
                  <UtensilsCrossed size={32} className="mb-2 opacity-40" />
                  <span className="text-xs">غذایی هنوز انتخاب نشده است.</span>
                  <span className="text-[11px] text-slate-600 mt-1">با لمس کارت‌های منو، اقلام به این لیست اضافه می‌شوند.</span>
                </div>
              ) : (
                orderItems.map(item => (
                  <div key={item.menuItemId} className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/70 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white truncate max-w-[170px]">{item.name}</span>
                      <span className="text-xs font-bold text-blue-400 font-mono">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {/* Qty controls */}
                      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                        <button
                          onClick={() => handleUpdateQuantity(item.menuItemId, -1)}
                          className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold text-xs cursor-pointer"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="font-bold text-xs w-5 text-center text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(item.menuItemId, 1)}
                          className="w-6 h-6 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-xs cursor-pointer"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* Item note prompt */}
                      <input
                        type="text"
                        placeholder="توضیح غذا..."
                        value={item.note || ''}
                        onChange={e => handleSetItemNote(item.menuItemId, e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-slate-300 flex-1 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-700/80 space-y-2.5">
              {/* Overall notes */}
              <input
                type="text"
                placeholder="توضیحات کلی سفارش (اختیاری)..."
                value={orderNotes}
                onChange={e => setOrderNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {/* Subtotal */}
              <div className="flex items-center justify-between text-sm font-bold text-slate-300">
                <span>مجموع سفارش:</span>
                <span className="text-base text-blue-400 font-black">{formatCurrency(subtotal)}</span>
              </div>

              {/* Send Order Button */}
              <button
                onClick={handleSendOrder}
                disabled={isSubmitting || orderItems.length === 0}
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-black text-xs sm:text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Send size={16} />
                    <span>ارسال سفارش به صندوق و آشپزخانه ({totalQuantity} عدد)</span>
                  </>
                )}
              </button>
            </div>

          </aside>

          {/* Mobile / Small Portrait Tablet Floating Bottom Bar */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 z-30 flex items-center justify-between gap-3 shadow-2xl">
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-400">
                {orderItems.length > 0 ? `${totalQuantity} کالا برای ${selectedTable.title}` : selectedTable.title}
              </span>
              <span className="text-sm font-black text-blue-400 font-mono">
                {formatCurrency(subtotal)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedTable(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700"
              >
                تغییر میز
              </button>
              <button
                onClick={() => setIsCartModalOpen(true)}
                disabled={orderItems.length === 0}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white text-xs font-black shadow-lg shadow-blue-500/25 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <ShoppingBag size={15} />
                <span>سبد ({totalQuantity})</span>
              </button>
            </div>
          </div>

          {/* Mobile Cart Modal / Sheet */}
          {isCartModalOpen && (
            <div className="md:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end animate-in fade-in">
              <div className="bg-slate-850 rounded-t-3xl border-t border-slate-750 p-4 max-h-[85vh] flex flex-col shadow-2xl">
                
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-750">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-white">سبد سفارش {selectedTable.title}</span>
                    <span className="text-[11px] text-slate-400">({totalQuantity} عدد)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {orderItems.length > 0 && (
                      <button
                        onClick={() => setOrderItems([])}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"
                        title="پاک کردن سبد"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => setIsCartModalOpen(false)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto py-3 space-y-2 max-h-[45vh]">
                  {orderItems.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      سبد خرید خالی است.
                    </div>
                  ) : (
                    orderItems.map(item => (
                      <div key={item.menuItemId} className="p-2.5 rounded-xl bg-slate-800 border border-slate-750 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-white">{item.name}</span>
                          <span className="text-xs font-bold text-blue-400 font-mono">
                            {formatCurrency(item.price * item.quantity)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                            <button
                              onClick={() => handleUpdateQuantity(item.menuItemId, -1)}
                              className="w-7 h-7 rounded bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="font-bold text-xs w-6 text-center text-white">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => handleUpdateQuantity(item.menuItemId, 1)}
                              className="w-7 h-7 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-xs"
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          <input
                            type="text"
                            placeholder="توضیح غذا..."
                            value={item.note || ''}
                            onChange={e => handleSetItemNote(item.menuItemId, e.target.value)}
                            className="bg-slate-900 border border-slate-750 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 flex-1 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Bottom Order Details & Send */}
                <div className="pt-3 border-t border-slate-750 space-y-2.5">
                  <input
                    type="text"
                    placeholder="توضیحات کلی سفارش (اختیاری)..."
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />

                  <div className="flex items-center justify-between text-sm font-bold text-slate-300">
                    <span>مجموع سفارش:</span>
                    <span className="text-base text-blue-400 font-black">{formatCurrency(subtotal)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setIsCartModalOpen(false)}
                      className="py-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs border border-slate-700 cursor-pointer"
                    >
                      افزودن غذای بیشتر
                    </button>
                    <button
                      onClick={handleSendOrder}
                      disabled={isSubmitting || orderItems.length === 0}
                      className="py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-black text-xs shadow-lg shadow-blue-500/25 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>ارسال سفارش ({totalQuantity})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
