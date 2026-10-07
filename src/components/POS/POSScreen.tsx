import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MenuItem, Order, OrderItem, Customer, RestaurantTable, NetworkOrder, deductProductionStockForOrder } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { Search, Plus, Minus, X, Printer, CreditCard, Receipt as ReceiptIcon, Edit3, Percent, DollarSign, Check, ArrowLeft, ArrowRight, UtensilsCrossed, BellRing, Tablet } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { Receipt } from './Receipt';
import { updateNetworkOrderStatus } from '../../lib/networkSync';
import { useAuth } from '../../context/AuthContext';
import { Lock } from 'lucide-react';

interface OpenTab {
  id: string; // temp id for UI
  title: string;
  customerPhone: string;
  customerName?: string;
  customerSubscriptionCode?: string;
  customerAddress?: string;
  tableNumber?: number;
  tableTitle?: string;
  waiterName?: string;
  items: OrderItem[];
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  taxEnabled: boolean;
}

export default function POSScreen() {
  const { can } = useAuth();
  const categories = useLiveQuery(() => db.categories.toArray());
  const allMenuItems = useLiveQuery(() => db.menuItems.toArray());
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const tables = useLiveQuery(() => db.restaurantTables.toArray());
  const pendingNetworkOrders = useLiveQuery(() => db.networkOrders.where('status').equals('pending').reverse().toArray());

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([
    { id: '1', title: 'سفارش 1', customerPhone: '', customerName: '', customerSubscriptionCode: '', customerAddress: '', items: [], discountType: 'none', discountValue: 0, taxEnabled: false }
  ]);
  const [activeTabId, setActiveTabId] = useState('1');

  // Customer Autocomplete & Details
  const [matchingCustomers, setMatchingCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Mobile cart view toggle
  const [showCartOnMobile, setShowCartOnMobile] = useState(false);

  // Inline Price Editing
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');

  // For Printing
  const receiptRef = useRef<HTMLDivElement>(null);
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);

  const activeTab = openTabs.find(t => t.id === activeTabId) || openTabs[0];
  
  const activeTabSubtotal = activeTab?.items.reduce((acc, item) => acc + (item.price * item.quantity), 0) || 0;
  
  let discountAmount = 0;
  if (activeTab.discountType === 'percent') {
    discountAmount = (activeTabSubtotal * activeTab.discountValue) / 100;
  } else if (activeTab.discountType === 'amount') {
    discountAmount = activeTab.discountValue;
  }

  const taxableAmount = Math.max(0, activeTabSubtotal - discountAmount);
  let taxAmount = 0;
  if (activeTab.taxEnabled && settings?.taxPercentage) {
    taxAmount = (taxableAmount * settings.taxPercentage) / 100;
  }

  const activeTabTotal = Math.max(0, activeTabSubtotal - discountAmount + taxAmount);

  // Sync settings when loaded
  useEffect(() => {
    if (settings && openTabs.length === 1 && openTabs[0].items.length === 0 && !openTabs[0].taxEnabled && settings.taxEnabled) {
      setOpenTabs([{ ...openTabs[0], taxEnabled: settings.taxEnabled }]);
    }
  }, [settings]);

  useEffect(() => {
    if (categories?.length && !activeCategoryId) {
      setActiveCategoryId(categories[0].id!);
    }
  }, [categories]);

  useEffect(() => {
    const query = activeTab?.customerPhone || '';
    if (query.trim().length >= 2) {
      const timer = setTimeout(() => {
        db.customers
          .filter(c => c.phone.includes(query) || c.subscriptionCode.includes(query))
          .toArray()
          .then(res => {
            setMatchingCustomers(res);
          });
      }, 250);
      return () => clearTimeout(timer);
    } else {
      setMatchingCustomers([]);
      setShowCustomerDropdown(false);
    }
  }, [activeTab?.customerPhone]);

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: 'Receipt',
    onAfterPrint: () => setOrderToPrint(null),
    pageStyle: `
      @page {
        size: 80mm auto;
        margin: 2mm 3mm 2mm 3mm;
      }
      @media print {
        * {
          box-sizing: border-box !important;
        }
        html, body {
          width: 100% !important;
          max-width: 70mm !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .receipt-print-wrapper {
          width: 100% !important;
          max-width: 66mm !important;
          margin: 0 auto !important;
          padding: 1mm 1.5mm !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }
      }
    `
  });

  // Automatically trigger print when orderToPrint state updates
  useEffect(() => {
    if (orderToPrint && settings) {
      handlePrint();
    }
  }, [orderToPrint, handlePrint, settings]);

  const displayedMenuItems = useMemo(() => {
    return allMenuItems?.filter(item => {
      if (!item.isActive) return false;
      if (searchQuery) {
        return item.name.includes(searchQuery);
      }
      return item.categoryId === activeCategoryId;
    }) || [];
  }, [allMenuItems, searchQuery, activeCategoryId]);

  const handleNewTab = () => {
    const newId = Date.now().toString();
    setOpenTabs([...openTabs, { 
      id: newId, 
      title: `سفارش ${openTabs.length + 1}`, 
      customerPhone: '', 
      customerName: '', 
      customerSubscriptionCode: '', 
      customerAddress: '', 
      items: [],
      discountType: 'none',
      discountValue: 0,
      taxEnabled: settings?.taxEnabled ?? false
    }]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (openTabs.length === 1) {
      setOpenTabs([{ 
        id: Date.now().toString(), 
        title: 'سفارش 1', 
        customerPhone: '', 
        customerName: '', 
        customerSubscriptionCode: '', 
        customerAddress: '', 
        items: [],
        discountType: 'none',
        discountValue: 0,
        taxEnabled: settings?.taxEnabled ?? false
      }]);
      return;
    }
    const newTabs = openTabs.filter(t => t.id !== id);
    setOpenTabs(newTabs);
    if (activeTabId === id) setActiveTabId(newTabs[0].id);
  };

  const updateActiveTab = (updates: Partial<OpenTab>) => {
    setOpenTabs(openTabs.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };

  const handleAddItem = (menuItem: MenuItem) => {
    const existingItem = activeTab.items.find(i => i.menuItemId === menuItem.id);
    if (existingItem) {
      updateActiveTab({
        items: activeTab.items.map(i => 
          i.menuItemId === menuItem.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      });
    } else {
      updateActiveTab({
        items: [...activeTab.items, { 
          menuItemId: menuItem.id!, 
          name: menuItem.name, 
          price: menuItem.price, 
          quantity: 1 
        }]
      });
    }
  };

  const handleAdjustQuantity = (menuItemId: number, delta: number) => {
    updateActiveTab({
      items: activeTab.items.map(i => {
        if (i.menuItemId === menuItemId) {
          const newQ = i.quantity + delta;
          return newQ > 0 ? { ...i, quantity: newQ } : i;
        }
        return i;
      }).filter(i => i.quantity > 0)
    });
  };

  const handleStartPriceEdit = (item: OrderItem) => {
    setEditingPriceId(item.menuItemId);
    setTempPrice(item.price.toString());
  };

  const handleSavePrice = (menuItemId: number) => {
    const newPrice = Number(tempPrice);
    if (!isNaN(newPrice) && newPrice >= 0) {
      updateActiveTab({
        items: activeTab.items.map(i => i.menuItemId === menuItemId ? { ...i, price: newPrice } : i)
      });
    }
    setEditingPriceId(null);
  };

  const handleRemoveItem = (menuItemId: number) => {
    updateActiveTab({
      items: activeTab.items.filter(i => i.menuItemId !== menuItemId)
    });
  };

  const handleCheckout = async () => {
    if (activeTab.items.length === 0) return;

    if (settings?.requireCustomerPhone && !activeTab.customerPhone.trim()) {
      alert('لطفا شماره موبایل مشتری را وارد کنید.');
      return;
    }

    try {
      const phone = activeTab.customerPhone.trim();
      const name = activeTab.customerName?.trim() || '';
      const subscriptionCode = activeTab.customerSubscriptionCode?.trim() || '';
      const address = activeTab.customerAddress?.trim() || '';

      // Auto upsert customer details to database
      if (phone) {
        const existingCustomer = await db.customers.where('phone').equals(phone).first();
        if (existingCustomer) {
          await db.customers.update(existingCustomer.id!, {
            name: name || existingCustomer.name || '',
            subscriptionCode: subscriptionCode || existingCustomer.subscriptionCode || '',
            address: address || existingCustomer.address || ''
          });
        } else {
          await db.customers.add({
            phone,
            name,
            subscriptionCode,
            address,
            createdAt: new Date()
          });
        }
      }

      // Get Max Invoice Number
      const lastOrder = await db.orders.orderBy('invoiceNumber').last();
      const nextInvoiceNum = (lastOrder?.invoiceNumber || 1000) + 1;

      const newOrder: Order = {
        invoiceNumber: nextInvoiceNum,
        createdAt: new Date(),
        customerPhone: phone,
        customerName: name,
        customerSubscriptionCode: subscriptionCode,
        customerAddress: address,
        tableNumber: activeTab.tableNumber,
        tableTitle: activeTab.tableTitle,
        waiterName: activeTab.waiterName,
        orderType: activeTab.tableNumber ? 'dine_in' : (address ? 'delivery' : 'takeaway'),
        items: [...activeTab.items],
        subtotal: activeTabSubtotal,
        discountType: activeTab.discountType,
        discountValue: activeTab.discountValue,
        taxEnabled: activeTab.taxEnabled,
        taxPercentage: settings?.taxPercentage || 0,
        taxAmount: taxAmount,
        total: activeTabTotal,
        status: 'paid'
      };

      const orderId = await db.orders.add(newOrder);
      const savedOrder = { ...newOrder, id: orderId };

      // Deduct raw materials from kitchen/production warehouse & calculate exact COGS
      try {
        await deductProductionStockForOrder(savedOrder);
      } catch (stockErr) {
        console.error('Failed to deduct production stock for order:', stockErr);
      }

      // Set for printing
      setOrderToPrint(savedOrder);

      // If dine-in table, free up the table in database
      if (activeTab.tableNumber) {
        const tbl = await db.restaurantTables.where('number').equals(activeTab.tableNumber).first();
        if (tbl?.id) {
          await db.restaurantTables.update(tbl.id, { status: 'empty' });
        }
      }

      // Reset tab
      updateActiveTab({ 
        customerPhone: '', 
        customerName: '',
        customerSubscriptionCode: '',
        customerAddress: '',
        tableNumber: undefined,
        tableTitle: undefined,
        waiterName: undefined,
        items: [],
        discountType: 'none',
        discountValue: 0,
        taxEnabled: settings?.taxEnabled ?? false
      });
      setShowCartOnMobile(false);
      
    } catch (err) {
      console.error('Error saving order', err);
      alert('خطا در ثبت سفارش');
    }
  };

  const handleAcceptNetworkOrder = async (netOrder: NetworkOrder) => {
    if (netOrder.id) {
      await updateNetworkOrderStatus(netOrder.id, netOrder.tempId, 'accepted');
    }
    const newTabId = Date.now().toString();
    const newTabTitle = netOrder.tableTitle || `میز ${netOrder.tableNumber}`;
    const newItems: OrderItem[] = netOrder.items.map(item => ({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    }));

    setOpenTabs(prev => [
      ...prev,
      {
        id: newTabId,
        title: newTabTitle,
        customerPhone: netOrder.customerPhone || '',
        customerName: netOrder.customerName || '',
        customerSubscriptionCode: '',
        customerAddress: '',
        tableNumber: netOrder.tableNumber,
        tableTitle: netOrder.tableTitle,
        waiterName: netOrder.waiterName,
        items: newItems,
        discountType: 'none',
        discountValue: 0,
        taxEnabled: settings?.taxEnabled ?? false
      }
    ]);
    setActiveTabId(newTabId);
  };

  return (
    <div className="flex-1 min-w-0 max-w-full flex flex-col h-full bg-slate-50 relative overflow-hidden">
      
      {/* Hidden Receipt for Printing */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }} className="print:block">
        {orderToPrint && settings && (
          <Receipt 
            ref={receiptRef} 
            order={orderToPrint} 
            settings={settings} 
          />
        )}
      </div>

      {/* Top Tabs Bar */}
      <div className="bg-white border-b border-slate-200 flex px-2 pt-2 gap-1 overflow-x-auto shrink-0 shadow-sm z-10">
        {openTabs.map(tab => (
          <div 
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-t-xl cursor-pointer min-w-[140px] transition-colors border border-b-0 ${
              activeTabId === tab.id 
                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-[0_4px_0_0_rgba(59,130,246,1)]' 
                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50'
            }`}
          >
            <span className="font-medium flex-1 whitespace-nowrap">{tab.title}</span>
            <span className="bg-white/50 px-2 rounded text-xs font-bold">{tab.items.length}</span>
            <button 
              onClick={(e) => handleCloseTab(tab.id, e)}
              className="hover:bg-red-100 hover:text-red-600 rounded p-1 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button 
          onClick={handleNewTab}
          className="flex items-center justify-center px-4 py-3 text-blue-600 hover:bg-blue-50 rounded-t-xl transition-colors shrink-0"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Network Incoming Orders Alert Banner */}
      {pendingNetworkOrders && pendingNetworkOrders.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-md shrink-0 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-white/20 animate-bounce">
              <BellRing size={16} />
            </span>
            <span className="text-xs font-black">
              {pendingNetworkOrders.length} سفارش جدید از میزها / تبلت دریافت شد:
            </span>
            <span className="text-xs font-bold bg-black/20 px-2 py-0.5 rounded-full">
              {pendingNetworkOrders[0].tableTitle || `میز ${pendingNetworkOrders[0].tableNumber}`} ({pendingNetworkOrders[0].items.length} قلم کالا)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAcceptNetworkOrder(pendingNetworkOrders[0])}
              className="bg-white text-amber-950 hover:bg-amber-50 px-3.5 py-1 rounded-xl text-xs font-black shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Tablet size={13} />
              <span>تایید و انتقال به تب جدید فاکتور</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden min-w-0 max-w-full">
        
        {/* Left/Main Area: Menu Selection */}
        <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${showCartOnMobile ? 'hidden lg:flex' : 'flex'}`}>
          {/* Search & Categories */}
          <div className="p-4 bg-white border-b border-slate-200 shrink-0">
            <div className="relative mb-4 max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text"
                placeholder="جستجوی نام غذا..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-3 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              />
            </div>
            
            {!searchQuery && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {categories?.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategoryId(cat.id!)}
                    className={`px-5 py-2.5 rounded-full font-medium whitespace-nowrap transition-all ${
                      activeCategoryId === cat.id 
                        ? 'bg-slate-800 text-white shadow-md' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Menu Items Grid */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {displayedMenuItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleAddItem(item)}
                  className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all text-right flex flex-col h-48 overflow-hidden group"
                >
                  <div className="h-28 w-full bg-slate-100 shrink-0">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ReceiptIcon size={32} />
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <span className="font-bold text-sm text-slate-800 line-clamp-2 leading-tight">{item.name}</span>
                    <span className="mt-auto text-blue-600 font-bold text-sm">{formatCurrency(item.price)}</span>
                  </div>
                </button>
              ))}
              {displayedMenuItems.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400">
                  <ReceiptIcon size={48} className="mx-auto mb-4 opacity-20" />
                  <p>آیتمی یافت نشد.</p>
                </div>
              )}
            </div>
          </div>

          {/* Floating Mobile Cart summary bar */}
          {!showCartOnMobile && activeTab.items.length > 0 && (
            <div className="lg:hidden p-4 bg-white border-t border-slate-200 flex justify-between items-center z-30 shrink-0">
              <div className="flex flex-col text-right">
                <span className="text-[10px] text-slate-500">مجموع سبد خرید:</span>
                <span className="font-bold text-blue-600 text-lg">{formatCurrency(activeTabTotal)}</span>
              </div>
              <button
                onClick={() => setShowCartOnMobile(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2"
              >
                <span>مشاهده سبد خرید ({activeTab.items.reduce((sum, i) => sum + i.quantity, 0)})</span>
                <ArrowLeft size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Right Area: Cart/Order Details */}
        <div className={`w-full lg:w-[315px] xl:w-[335px] bg-white border-r border-slate-200 flex flex-col shadow-[4px_0_15px_rgba(0,0,0,0.03)] shrink-0 z-20 ${showCartOnMobile ? 'flex' : 'hidden lg:flex'}`}>
          
          <div className="p-3.5 border-b border-slate-100 shrink-0 space-y-2.5">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800">سبد خرید ({activeTab.title})</h2>
              <button
                type="button"
                onClick={() => setShowCartOnMobile(false)}
                className="lg:hidden bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <ArrowRight size={14} />
                <span>بازگشت به منو</span>
              </button>
            </div>

            {/* Table Selection Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <UtensilsCrossed size={15} className="text-blue-600 shrink-0 mr-0.5" />
              <select
                value={activeTab.tableNumber ? String(activeTab.tableNumber) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    updateActiveTab({ tableNumber: undefined, tableTitle: undefined });
                  } else {
                    const tbl = tables?.find(t => t.number === parseInt(val, 10));
                    updateActiveTab({
                      tableNumber: tbl?.number,
                      tableTitle: tbl?.title || `میز ${val}`,
                      title: tbl?.title || `میز ${val}`
                    });
                  }
                }}
                className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="">سفارش حضوری / بیرون‌بر (بدون میز)</option>
                {tables?.map(t => (
                  <option key={t.id || t.number} value={t.number}>
                    {t.title} ({t.section || 'سالن'}) {t.status === 'occupied' ? '• مشغول' : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="relative">
              <input 
                type="text"
                placeholder={`شماره موبایل مشتری ${settings?.requireCustomerPhone ? '(اجباری)' : '(اختیاری)'}`}
                value={activeTab.customerPhone}
                onChange={(e) => {
                  updateActiveTab({ customerPhone: e.target.value });
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                className={`w-full px-3 py-2 bg-slate-50 border ${settings?.requireCustomerPhone && !activeTab.customerPhone ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'} rounded-lg outline-none focus:ring-2 transition-all text-left font-mono text-xs`}
                dir="ltr"
              />
              
              {/* Autocomplete Dropdown */}
              {showCustomerDropdown && matchingCustomers.length > 0 && (
                <div className="absolute right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {matchingCustomers.map(customer => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        updateActiveTab({
                          customerPhone: customer.phone,
                          customerName: customer.name,
                          customerSubscriptionCode: customer.subscriptionCode,
                          customerAddress: customer.address
                        });
                        setShowCustomerDropdown(false);
                      }}
                      className="w-full text-right px-4 py-2 hover:bg-slate-50 transition-colors flex flex-col gap-0.5"
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-bold text-slate-800 text-xs">{customer.name || 'مشتری بدون نام'}</span>
                        {customer.subscriptionCode && (
                          <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-bold">
                            اشتراک: {customer.subscriptionCode}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono flex justify-between">
                        <span>{customer.phone}</span>
                        {customer.address && <span className="truncate max-w-[140px] text-slate-500">{customer.address}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Collapsible Customer Name, Subscription Code and Address fields */}
            {activeTab.customerPhone.trim() && (
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-right">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-500">مشخصات باشگاه و بیرون‌بر</span>
                  {activeTab.customerName && (
                    <span className="text-[9px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-bold">مشتری عضو</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input 
                    type="text"
                    placeholder="نام مشتری"
                    value={activeTab.customerName || ''}
                    onChange={(e) => updateActiveTab({ customerName: e.target.value })}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 text-xs text-right"
                  />
                  <input 
                    type="text"
                    placeholder="کد اشتراک"
                    value={activeTab.customerSubscriptionCode || ''}
                    onChange={(e) => updateActiveTab({ customerSubscriptionCode: e.target.value })}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 text-xs text-left font-mono"
                    dir="ltr"
                  />
                </div>
                <input 
                  type="text"
                  placeholder="آدرس بیرون‌بر"
                  value={activeTab.customerAddress || ''}
                  onChange={(e) => updateActiveTab({ customerAddress: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 text-xs text-right"
                />
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeTab.items.map(item => (
              <div key={item.menuItemId} className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                <div className="flex justify-between items-start gap-1.5 mb-1.5">
                  <span className="font-bold text-slate-800 text-xs break-words whitespace-normal leading-tight flex-1">{item.name}</span>
                  {can('pos_delete_item') && (
                    <button 
                      onClick={() => handleRemoveItem(item.menuItemId)}
                      className="text-slate-400 hover:text-red-500 p-0.5 shrink-0 cursor-pointer"
                      title="حذف از سفارش"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    {editingPriceId === item.menuItemId ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={tempPrice}
                          onChange={(e) => setTempPrice(e.target.value)}
                          className="w-20 px-1.5 py-0.5 text-xs border border-slate-300 rounded outline-none"
                          autoFocus
                          dir="ltr"
                          onKeyDown={(e) => e.key === 'Enter' && handleSavePrice(item.menuItemId)}
                        />
                        <button 
                          onClick={() => handleSavePrice(item.menuItemId)}
                          className="p-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <span className="text-blue-600 font-semibold text-xs">{formatCurrency(item.price)}</span>
                        <button 
                          onClick={() => handleStartPriceEdit(item)}
                          className="p-0.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-500 rounded"
                        >
                          <Edit3 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-0.5">
                    <button 
                      onClick={() => handleAdjustQuantity(item.menuItemId, -1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-bold text-xs w-4 text-center">{item.quantity}</span>
                    <button 
                      onClick={() => handleAdjustQuantity(item.menuItemId, 1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-900 text-white"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 text-left text-[11px] font-bold text-slate-500 border-t border-slate-200/50 pt-1">
                  جمع: {formatCurrency(item.price * item.quantity)}
                </div>
              </div>
            ))}
            
            {activeTab.items.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-50 py-8">
                <ReceiptIcon size={48} className="mb-2" />
                <p className="text-xs">سبد خرید خالی است.</p>
              </div>
            )}
          </div>

          {/* Settings / Discount & Tax Compact Toolbar */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 shrink-0 space-y-1.5">
            <div className="flex items-center justify-between gap-1.5">
              {/* Tax button toggle */}
              <button
                type="button"
                onClick={() => updateActiveTab({ taxEnabled: !activeTab.taxEnabled })}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 ${
                  activeTab.taxEnabled 
                    ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${activeTab.taxEnabled ? 'bg-blue-600' : 'bg-slate-300'}`} />
                <span>مالیات ({settings?.taxPercentage || 0}%)</span>
              </button>

              {/* Discount selector */}
              {can('pos_discount') ? (
                <div className="flex items-center gap-1 flex-1 justify-end">
                  <select 
                    value={activeTab.discountType}
                    onChange={(e) => updateActiveTab({ discountType: e.target.value as any, discountValue: 0 })}
                    className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-700"
                  >
                    <option value="none">تخفیف: ندارد</option>
                    <option value="percent">درصدی (%)</option>
                    <option value="amount">مبلغی</option>
                  </select>
                  
                  {activeTab.discountType !== 'none' && (
                    <div className="relative w-20 shrink-0">
                      <input 
                        type="number"
                        value={activeTab.discountValue || ''}
                        onChange={(e) => updateActiveTab({ discountValue: Number(e.target.value) })}
                        className="w-full px-1.5 py-1 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 text-left font-mono font-bold"
                        dir="ltr"
                        placeholder={activeTab.discountType === 'percent' ? '%' : 'مبلغ'}
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 font-medium">بدون مجوز تخفیف</div>
              )}
            </div>
          </div>

          {/* Checkout Block */}
          <div className="p-3 bg-white border-t border-slate-200 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10 space-y-2">
            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex justify-between items-center">
                <span>جمع اقلام:</span>
                <span className="font-semibold text-slate-800">{formatCurrency(activeTabSubtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-600 font-medium">
                  <span>تخفیف:</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between items-center text-rose-600 font-medium">
                  <span>مالیات ({settings?.taxPercentage || 0}%):</span>
                  <span>+{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                <span className="text-slate-800 font-bold text-sm">قابل پرداخت:</span>
                <span className="text-xl font-black text-blue-600 font-mono">{formatCurrency(activeTabTotal)}</span>
              </div>
            </div>
            
            {can('pos_checkout') ? (
              <button 
                onClick={handleCheckout}
                disabled={activeTab.items.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <CreditCard size={20} />
                <span>ثبت فاکتور و چاپ</span>
              </button>
            ) : (
              <button 
                disabled
                className="w-full bg-slate-200 text-slate-500 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-not-allowed border border-slate-300"
                title="شما مجوز ثبت نهایی فاکتور فروش ندارید."
              >
                <Lock size={16} />
                <span>عدم دسترسی به ثبت نهایی فاکتور فروش</span>
              </button>
            )}
          </div>
          
        </div>

      </div>
    </div>
  );
}
