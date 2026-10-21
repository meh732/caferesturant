import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  db, Category, MenuItem, Order, OrderItem, Customer, RestaurantTable, 
  NetworkOrder, deductProductionStockForOrder, getMenuItemIngredients,
  updateMenuItemsOrder, updateCategoriesOrder, deleteCategorySafely
} from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { 
  Search, Plus, Minus, X, Printer, CreditCard, Receipt as ReceiptIcon, 
  Edit3, Percent, DollarSign, Check, ArrowLeft, ArrowRight, UtensilsCrossed, 
  BellRing, Tablet, Lock, GripVertical, Settings, ArrowUpToLine, ArrowUp, 
  ArrowDown, Move, Layers, Edit2, Trash2, FolderPlus, Sparkles
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { Receipt } from './Receipt';
import POSPaymentModal, { POSPaymentData } from './POSPaymentModal';
import { processOrderPayment } from '../../lib/accountingServices';
import { recordSaleJournalEntry } from '../../lib/accountingJournalService';
import { updateNetworkOrderStatus } from '../../lib/networkSync';
import { useAuth } from '../../context/AuthContext';
import { triggerServerDbSync } from '../../lib/serverSync';

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
  const allRecipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const tables = useLiveQuery(() => db.restaurantTables.toArray());
  const pendingNetworkOrders = useLiveQuery(() => db.networkOrders.where('status').equals('pending').reverse().toArray());

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Category Management Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Drag & Drop / Reordering State
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<number | null>(null);
  
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

  // For Payment
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

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
    if (categories?.length && activeCategoryId !== null) {
      if (!categories.some(c => c.id === activeCategoryId)) {
        setActiveCategoryId(null);
      }
    }
  }, [categories, activeCategoryId]);

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

  const is58mm = settings?.receiptSettings?.paperWidth === '58mm';

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: 'Receipt',
    onAfterPrint: () => setOrderToPrint(null),
    pageStyle: `
      @page {
        size: ${is58mm ? '58mm auto' : '80mm auto'};
        margin: 1.5mm 2mm 1.5mm 2mm;
      }
      @media print {
        * {
          box-sizing: border-box !important;
        }
        html, body {
          width: 100% !important;
          max-width: ${is58mm ? '52mm' : '72mm'} !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .receipt-print-wrapper {
          width: 100% !important;
          max-width: ${is58mm ? '50mm' : '70mm'} !important;
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

  // Sorted Categories (by custom order or id)
  const sortedCategories = useMemo(() => {
    return [...(categories || [])].sort((a, b) => {
      const orderA = a.order !== undefined && a.order !== null ? a.order : (a.id || 0);
      const orderB = b.order !== undefined && b.order !== null ? b.order : (b.id || 0);
      return orderA - orderB;
    });
  }, [categories]);

  // Sorted Menu Items (by custom order or id)
  const displayedMenuItems = useMemo(() => {
    const list = allMenuItems?.filter(item => {
      if (!item.isActive) return false;
      if (searchQuery) {
        return item.name.includes(searchQuery);
      }
      if (activeCategoryId === null || activeCategoryId === undefined) {
        return true;
      }
      return Number(item.categoryId) === Number(activeCategoryId);
    }) || [];

    return [...list].sort((a, b) => {
      const orderA = a.order !== undefined && a.order !== null ? a.order : (a.id || 0);
      const orderB = b.order !== undefined && b.order !== null ? b.order : (b.id || 0);
      return orderA - orderB;
    });
  }, [allMenuItems, searchQuery, activeCategoryId]);

  // Item Drag & Drop Reorder Handlers
  const handleItemDrop = async (targetItemId: number) => {
    if (!draggedItemId || draggedItemId === targetItemId) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }

    const currentList = [...displayedMenuItems];
    const fromIndex = currentList.findIndex(i => i.id === draggedItemId);
    const toIndex = currentList.findIndex(i => i.id === targetItemId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }

    const [moved] = currentList.splice(fromIndex, 1);
    currentList.splice(toIndex, 0, moved);

    await updateMenuItemsOrder(currentList.map(i => i.id!));
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleMoveItemToTop = async (item: MenuItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentList = [...displayedMenuItems];
    const idx = currentList.findIndex(i => i.id === item.id);
    if (idx <= 0) return;

    const [moved] = currentList.splice(idx, 1);
    currentList.unshift(moved);

    await updateMenuItemsOrder(currentList.map(i => i.id!));
  };

  const handleMoveItemStep = async (item: MenuItem, direction: -1 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentList = [...displayedMenuItems];
    const idx = currentList.findIndex(i => i.id === item.id);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;

    const [moved] = currentList.splice(idx, 1);
    currentList.splice(targetIdx, 0, moved);

    await updateMenuItemsOrder(currentList.map(i => i.id!));
  };

  // Category CRUD & Reorder Handlers
  const handleMoveCategoryStep = async (cat: Category, direction: -1 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentList = [...sortedCategories];
    const idx = currentList.findIndex(c => c.id === cat.id);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;

    const [moved] = currentList.splice(idx, 1);
    currentList.splice(targetIdx, 0, moved);

    await updateCategoriesOrder(currentList.map(c => c.id!));
  };

  const handleSaveCategory = async () => {
    const trimmed = categoryNameInput.trim();
    if (!trimmed) return;

    if (editingCategory?.id) {
      await db.categories.update(editingCategory.id, { name: trimmed });
    } else {
      const nextOrder = (categories?.length || 0) + 1;
      const newId = await db.categories.add({ name: trimmed, order: nextOrder } as Category);
      setActiveCategoryId(newId);
    }
    setCategoryNameInput('');
    setEditingCategory(null);
    triggerServerDbSync(50);
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!cat.id) return;
    const count = allMenuItems?.filter(i => i.categoryId === cat.id).length || 0;
    
    if (count === 0) {
      if (window.confirm(`آیا از حذف دسته‌بندی «${cat.name}» مطمئن هستید؟`)) {
        await deleteCategorySafely(cat.id, true);
        if (activeCategoryId === cat.id) setActiveCategoryId(null);
      }
      return;
    }

    const confirmed = window.confirm(
      `دسته‌بندی «${cat.name}» دارای ${count} قلم کالا می‌باشد.\n\n` +
      `برای حذف دسته‌بندی و انتقال کالاها به گروه «سایر اقلام و متفرقه» روی OK کلیک کنید.\n` +
      `برای انصراف روی Cancel کلیک کنید.`
    );
    if (confirmed) {
      await deleteCategorySafely(cat.id, false);
      if (activeCategoryId === cat.id) setActiveCategoryId(null);
    }
  };

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

    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async (paymentData: POSPaymentData) => {
    setIsPaymentModalOpen(false);

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
        paymentMethod: paymentData.method,
        bankAccountId: paymentData.bankAccountId,
        bankAccountName: paymentData.bankAccountName,
        cashBoxId: paymentData.cashBoxId,
        cashBoxName: paymentData.cashBoxName,
        cardAmount: paymentData.cardAmount,
        cashAmount: paymentData.cashAmount,
        posTrackingCode: paymentData.posTrackingCode,
        chequeNumber: paymentData.chequeNumber,
        chequeDueDate: paymentData.chequeDueDate,
        chequeSayad: paymentData.chequeSayad,
        chequeBankName: paymentData.chequeBankName,
        chequeDrawer: paymentData.chequeDrawer,
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

      // Record financial transaction & update bank/cash balances
      try {
        await processOrderPayment(savedOrder);
      } catch (payErr) {
        console.error('Failed to process financial payment for order:', payErr);
      }

      // Record double-entry accounting journal voucher
      try {
        await recordSaleJournalEntry(savedOrder);
      } catch (journalErr) {
        console.error('Failed to record sale journal voucher:', journalErr);
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

      {/* Top Tabs Bar - macOS Safari Tabs Style */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-black/[0.06] flex items-center px-3 py-2 gap-1.5 overflow-x-auto shrink-0 z-10">
        {openTabs.map(tab => (
          <div 
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl cursor-pointer min-w-[130px] transition-all duration-150 border active:scale-[0.98] ${
              activeTabId === tab.id 
                ? 'bg-white text-neutral-900 border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] font-semibold' 
                : 'bg-black/[0.03] text-neutral-500 border-transparent hover:bg-black/[0.06] font-medium'
            }`}
          >
            <span className="text-xs flex-1 whitespace-nowrap">{tab.title}</span>
            <span className="bg-black/[0.06] px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold">{tab.items.length}</span>
            <button 
              onClick={(e) => handleCloseTab(tab.id, e)}
              className="hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] rounded-lg p-0.5 transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button 
          onClick={handleNewTab}
          className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-neutral-900 bg-black/[0.03] hover:bg-black/[0.07] rounded-xl transition-all shrink-0 cursor-pointer active:scale-95"
          title="سفارش جدید"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Network Incoming Orders Alert Banner */}
      {pendingNetworkOrders && pendingNetworkOrders.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2 shadow-sm shrink-0 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-white/20 animate-bounce">
              <BellRing size={15} />
            </span>
            <span className="text-xs font-semibold">
              {pendingNetworkOrders.length} سفارش جدید از میزها / تبلت دریافت شد:
            </span>
            <span className="text-xs font-medium bg-black/20 px-2 py-0.5 rounded-full">
              {pendingNetworkOrders[0].tableTitle || `میز ${pendingNetworkOrders[0].tableNumber}`} ({pendingNetworkOrders[0].items.length} قلم کالا)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAcceptNetworkOrder(pendingNetworkOrders[0])}
              className="bg-white text-amber-950 hover:bg-amber-50 px-3.5 py-1 rounded-xl text-xs font-semibold shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Tablet size={13} />
              <span>تایید و انتقال به تب جدید فاکتور</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden min-w-0 max-w-full">
        
        {/* Left/Main Area: Menu Selection */}
        <div className={`flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden ${showCartOnMobile ? 'hidden lg:flex' : 'flex'}`}>
          {/* Search & Categories Bar */}
          {/* Search & Categories Bar */}
          <div className="p-4 bg-white/70 backdrop-blur-md border-b border-black/[0.06] shrink-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={17} />
                <input 
                  type="text"
                  placeholder="جستجوی نام غذا و نوشیدنی..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-10 pl-4 py-2 bg-black/[0.04] border border-black/[0.04] focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 rounded-xl text-xs text-neutral-900 outline-none transition-all placeholder:text-neutral-400 font-medium"
                />
              </div>

              {/* Action Buttons: Reorder Mode Toggle + Manage Categories */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsReorderMode(!isReorderMode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isReorderMode 
                      ? 'bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.3)] animate-pulse' 
                      : 'bg-black/[0.04] hover:bg-black/[0.08] text-neutral-700'
                  }`}
                  title="تغییر حالت چیدمان و درگ کالاها"
                >
                  <Move size={13} />
                  <span>{isReorderMode ? 'اتمام چیدمان' : 'چیدمان و درگ'}</span>
                </button>

                {can('menu_edit') && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryNameInput('');
                      setIsCategoryModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] flex items-center gap-1.5 transition-all cursor-pointer"
                    title="افزودن، ویرایش و حذف دسته‌بندی‌ها"
                  >
                    <Layers size={13} />
                    <span>مدیریت دسته‌ها</span>
                  </button>
                )}
              </div>
            </div>

            {/* Reorder active banner */}
            {isReorderMode && (
              <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-900 text-xs flex items-center justify-between animate-in fade-in">
                <div className="flex items-center gap-2">
                  <GripVertical size={16} className="text-amber-600" />
                  <span>
                    <strong>حالت چیدمان کالاها:</strong> کالاها را با درگ‌کردن جابجا کنید یا روی دکمه «اولین» کلیک نمایید تا کالا به ابتدای منو بیاید.
                  </span>
                </div>
                <button
                  onClick={() => setIsReorderMode(false)}
                  className="px-2.5 py-1 bg-amber-600 text-white rounded-lg text-[11px] font-bold hover:bg-amber-700 cursor-pointer"
                >
                  ذخیره و اتمام
                </button>
              </div>
            )}
            
            {!searchQuery && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setActiveCategoryId(null)}
                  className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition-all duration-150 active:scale-95 cursor-pointer ${
                    activeCategoryId === null 
                      ? 'bg-[#007AFF] text-white font-semibold shadow-[0_2px_8px_rgba(0,122,255,0.28)]' 
                      : 'bg-black/[0.04] text-neutral-600 hover:bg-black/[0.07] font-medium'
                  }`}
                >
                  همه منو
                </button>
                {sortedCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategoryId(cat.id!)}
                    className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-all duration-150 active:scale-95 cursor-pointer flex items-center gap-1.5 group ${
                      activeCategoryId === cat.id 
                        ? 'bg-[#007AFF] text-white font-semibold shadow-[0_2px_8px_rgba(0,122,255,0.28)]' 
                        : 'bg-black/[0.04] text-neutral-600 hover:bg-black/[0.07] font-medium'
                    }`}
                  >
                    <span>{cat.name}</span>
                    {can('menu_edit') && (
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCategory(cat);
                          setCategoryNameInput(cat.name);
                          setIsCategoryModalOpen(true);
                        }}
                        className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                          activeCategoryId === cat.id ? 'hover:bg-white/20 text-white' : 'hover:bg-black/10 text-neutral-500'
                        }`}
                        title="ویرایش یا حذف این دسته"
                      >
                        <Edit2 size={11} />
                      </span>
                    )}
                  </button>
                ))}

                {can('menu_edit') && (
                  <button
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryNameInput('');
                      setIsCategoryModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap bg-black/[0.04] hover:bg-black/[0.08] text-[#007AFF] font-medium flex items-center gap-1 transition-all cursor-pointer"
                    title="افزودن دسته‌بندی جدید"
                  >
                    <Plus size={13} />
                    <span>دسته جدید</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Menu Items Grid */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {displayedMenuItems.map((item, idx) => {
                const isDraggingThis = draggedItemId === item.id;
                const isDragOverThis = dragOverItemId === item.id;
                return (
                  <div
                    key={item.id}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(item.id));
                      setDraggedItemId(item.id!);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDragEnter={() => {
                      if (draggedItemId && draggedItemId !== item.id) {
                        setDragOverItemId(item.id!);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverItemId === item.id) setDragOverItemId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleItemDrop(item.id!);
                    }}
                    onClick={() => {
                      if (!isReorderMode) {
                        handleAddItem(item);
                      }
                    }}
                    className={`bg-white rounded-2xl border transition-all text-right flex flex-col h-52 overflow-hidden group cursor-pointer relative select-none ${
                      isDragOverThis 
                        ? 'border-[#007AFF] ring-2 ring-[#007AFF]/40 bg-blue-50/40 scale-[1.03] z-10' 
                        : isDraggingThis
                        ? 'opacity-40 border-dashed border-neutral-300'
                        : 'border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:border-black/[0.1] active:scale-[0.98]'
                    }`}
                  >
                    {/* Top control badge / Drag Handle / Move to First */}
                    <div className="absolute top-2 right-2 left-2 flex items-center justify-between z-10 pointer-events-auto">
                      <div className="flex items-center gap-1 bg-black/45 backdrop-blur-xs text-white px-1.5 py-0.5 rounded-lg text-[10px] font-mono shadow-xs">
                        <GripVertical size={12} className="cursor-grab active:cursor-grabbing text-white/90" />
                        <span>#{idx + 1}</span>
                      </div>

                      {/* Move to First button (especially for coffee/items that user wants on top) */}
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={(e) => handleMoveItemToTop(item, e)}
                          className="bg-white/95 hover:bg-white text-[#007AFF] hover:text-[#0062cc] px-1.5 py-0.5 rounded-lg text-[10px] font-bold shadow-xs flex items-center gap-1 transition-all cursor-pointer opacity-90 group-hover:opacity-100"
                          title="انتقال سریع این کالا به اولین جایگاه (ابتدای منو)"
                        >
                          <ArrowUpToLine size={12} />
                          <span className="text-[9px]">اولین</span>
                        </button>
                      )}
                    </div>

                    <div className="h-28 w-full bg-neutral-100/70 shrink-0 overflow-hidden relative">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-300">
                          <ReceiptIcon size={28} />
                        </div>
                      )}
                    </div>

                    <div className="p-3 flex flex-col flex-1 justify-between">
                      <div>
                        <span className="font-semibold text-xs text-neutral-900 line-clamp-1 leading-tight">{item.name}</span>
                        {(() => {
                          const rec = allRecipes.find(r => r.menuItemId === item.id);
                          const ing = getMenuItemIngredients(item, rec);
                          return ing ? (
                            <span className="text-[10px] text-neutral-400 line-clamp-1 block mt-0.5 leading-snug font-normal" title={ing}>
                              {ing}
                            </span>
                          ) : null;
                        })()}
                      </div>

                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-[#007AFF] font-bold text-xs font-mono">{formatCurrency(item.price)}</span>
                        
                        {/* Step Move Buttons when in reorder mode */}
                        {isReorderMode && (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => handleMoveItemStep(item, -1, e)}
                              disabled={idx === 0}
                              className="p-1 rounded bg-black/[0.04] hover:bg-black/[0.08] disabled:opacity-20 text-neutral-700 transition-colors"
                              title="یک پله جلوتر"
                            >
                              <ArrowRight size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleMoveItemStep(item, 1, e)}
                              disabled={idx === displayedMenuItems.length - 1}
                              className="p-1 rounded bg-black/[0.04] hover:bg-black/[0.08] disabled:opacity-20 text-neutral-700 transition-colors"
                              title="یک پله عقب‌تر"
                            >
                              <ArrowLeft size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {displayedMenuItems.length === 0 && (
                <div className="col-span-full py-16 text-center text-neutral-400">
                  <ReceiptIcon size={44} className="mx-auto mb-3 opacity-20" />
                  <p className="text-xs font-medium">غذایی در این بخش یافت نشد.</p>
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

        {/* Right Area: Cart/Order Details (Apple Glass Panel) */}
        <div className={`w-full lg:w-[325px] xl:w-[345px] bg-white/90 backdrop-blur-xl border-r border-black/[0.06] flex flex-col h-full min-h-0 shadow-[4px_0_20px_rgba(0,0,0,0.02)] shrink-0 z-20 ${showCartOnMobile ? 'flex' : 'hidden lg:flex'}`}>
          
          <div className="p-3.5 border-b border-black/[0.04] shrink-0 space-y-2.5">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-semibold text-neutral-900">سبد خرید ({activeTab.title})</h2>
              <button
                type="button"
                onClick={() => setShowCartOnMobile(false)}
                className="lg:hidden bg-black/[0.04] hover:bg-black/[0.08] active:scale-95 text-neutral-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
              >
                <ArrowRight size={14} />
                <span>بازگشت به منو</span>
              </button>
            </div>

            {/* Table Selection Dropdown */}
            <div className="flex items-center gap-1.5 bg-black/[0.03] p-1.5 rounded-xl border border-black/[0.04]">
              <UtensilsCrossed size={14} className="text-[#007AFF] shrink-0 mr-0.5" />
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
                className="w-full bg-transparent text-xs font-semibold text-neutral-800 outline-none cursor-pointer"
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
                className={`w-full px-3 py-2 bg-black/[0.03] border ${settings?.requireCustomerPhone && !activeTab.customerPhone ? 'border-[#FF3B30] focus:ring-[#FF3B30]/30' : 'border-black/[0.04] focus:border-[#007AFF]'} rounded-xl outline-none focus:ring-2 focus:ring-[#007AFF]/20 transition-all text-left font-mono text-xs`}
                dir="ltr"
              />
              
              {/* Autocomplete Dropdown */}
              {showCustomerDropdown && matchingCustomers.length > 0 && (
                <div className="absolute right-0 left-0 mt-1 bg-white border border-black/[0.08] rounded-2xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-black/[0.04]">
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
                      className="w-full text-right px-4 py-2 hover:bg-neutral-50 transition-colors flex flex-col gap-0.5 cursor-pointer"
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-semibold text-neutral-800 text-xs">{customer.name || 'مشتری بدون نام'}</span>
                        {customer.subscriptionCode && (
                          <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                            اشتراک: {customer.subscriptionCode}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono flex justify-between">
                        <span>{customer.phone}</span>
                        {customer.address && <span className="truncate max-w-[140px] text-neutral-500">{customer.address}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Collapsible Customer Name, Subscription Code and Address fields */}
            {activeTab.customerPhone.trim() && (
              <div className="p-2.5 bg-neutral-50/80 rounded-2xl border border-black/[0.04] space-y-1.5 text-right">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-neutral-500">مشخصات باشگاه و بیرون‌بر</span>
                  {activeTab.customerName && (
                    <span className="text-[9px] bg-[#34C759]/10 text-[#34C759] px-2 py-0.5 rounded-full font-bold">مشتری عضو</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input 
                    type="text"
                    placeholder="نام مشتری"
                    value={activeTab.customerName || ''}
                    onChange={(e) => updateActiveTab({ customerName: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-black/[0.06] rounded-xl outline-none focus:border-[#007AFF] text-xs text-right"
                  />
                  <input 
                    type="text"
                    placeholder="کد اشتراک"
                    value={activeTab.customerSubscriptionCode || ''}
                    onChange={(e) => updateActiveTab({ customerSubscriptionCode: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-black/[0.06] rounded-xl outline-none focus:border-[#007AFF] text-xs text-left font-mono"
                    dir="ltr"
                  />
                </div>
                <input 
                  type="text"
                  placeholder="آدرس بیرون‌بر"
                  value={activeTab.customerAddress || ''}
                  onChange={(e) => updateActiveTab({ customerAddress: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-black/[0.06] rounded-xl outline-none focus:border-[#007AFF] text-xs text-right"
                />
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeTab.items.map(item => (
              <div key={item.menuItemId} className="bg-neutral-50/70 border border-black/[0.04] p-2.5 rounded-2xl">
                <div className="flex justify-between items-start gap-1.5 mb-1.5">
                  <span className="font-semibold text-neutral-900 text-xs break-words whitespace-normal leading-tight flex-1">{item.name}</span>
                  {can('pos_delete_item') && (
                    <button 
                      onClick={() => handleRemoveItem(item.menuItemId)}
                      className="text-neutral-400 hover:text-[#FF3B30] p-0.5 shrink-0 cursor-pointer active:scale-90 transition-all"
                      title="حذف از سفارش"
                    >
                      <X size={14} />
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
                          className="w-20 px-2 py-0.5 text-xs border border-black/[0.1] rounded-lg outline-none bg-white"
                          autoFocus
                          dir="ltr"
                          onKeyDown={(e) => e.key === 'Enter' && handleSavePrice(item.menuItemId)}
                        />
                        <button 
                          onClick={() => handleSavePrice(item.menuItemId)}
                          className="p-1 bg-[#007AFF]/10 text-[#007AFF] rounded-lg hover:bg-[#007AFF]/20 cursor-pointer"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <span className="text-[#007AFF] font-bold text-xs font-mono">{formatCurrency(item.price)}</span>
                        <button 
                          onClick={() => handleStartPriceEdit(item)}
                          className="p-0.5 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#007AFF] rounded cursor-pointer"
                        >
                          <Edit3 size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 bg-white rounded-xl border border-black/[0.06] p-0.5 shadow-2xs">
                    <button 
                      onClick={() => handleAdjustQuantity(item.menuItemId, -1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-black/[0.04] hover:bg-black/[0.08] active:scale-90 text-neutral-700 transition-all cursor-pointer"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="font-semibold text-xs w-4 text-center font-mono">{item.quantity}</span>
                    <button 
                      onClick={() => handleAdjustQuantity(item.menuItemId, 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-neutral-900 hover:bg-black active:scale-90 text-white transition-all cursor-pointer"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 text-left text-[11px] font-semibold text-neutral-500 border-t border-black/[0.03] pt-1 font-mono">
                  جمع: {formatCurrency(item.price * item.quantity)}
                </div>
              </div>
            ))}
            
            {activeTab.items.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-neutral-400 opacity-60 py-10">
                <ReceiptIcon size={40} className="mb-2 stroke-1" />
                <p className="text-xs font-medium">سبد خرید خالی است.</p>
              </div>
            )}
          </div>

          {/* Settings / Discount & Tax Compact Toolbar */}
          <div className="px-3 py-2 bg-neutral-50/70 border-t border-black/[0.04] shrink-0 space-y-1.5">
            <div className="flex items-center justify-between gap-1.5">
              {/* Tax button toggle */}
              <button
                type="button"
                onClick={() => updateActiveTab({ taxEnabled: !activeTab.taxEnabled })}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all border shrink-0 active:scale-95 cursor-pointer ${
                  activeTab.taxEnabled 
                    ? 'bg-[#007AFF]/10 border-[#007AFF]/30 text-[#007AFF] shadow-2xs' 
                    : 'bg-white border-black/[0.06] text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${activeTab.taxEnabled ? 'bg-[#007AFF]' : 'bg-neutral-300'}`} />
                <span>مالیات ({settings?.taxPercentage || 0}%)</span>
              </button>

              {/* Discount selector */}
              {can('pos_discount') ? (
                <div className="flex items-center gap-1 flex-1 justify-end">
                  <select 
                    value={activeTab.discountType}
                    onChange={(e) => updateActiveTab({ discountType: e.target.value as any, discountValue: 0 })}
                    className="px-2 py-1 text-xs bg-white border border-black/[0.06] rounded-xl outline-none focus:border-[#007AFF] font-medium text-neutral-700"
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
                        className="w-full px-2 py-1 text-xs bg-white border border-black/[0.08] rounded-xl outline-none focus:border-[#007AFF] text-left font-mono font-bold"
                        dir="ltr"
                        placeholder={activeTab.discountType === 'percent' ? '%' : 'مبلغ'}
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-neutral-400 font-medium">بدون مجوز تخفیف</div>
              )}
            </div>
          </div>

          {/* Checkout Block */}
          <div className="p-3.5 bg-white border-t border-black/[0.06] shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.02)] z-10 space-y-2.5">
            <div className="space-y-1 text-xs text-neutral-600">
              <div className="flex justify-between items-center">
                <span>جمع اقلام:</span>
                <span className="font-semibold text-neutral-900 font-mono">{formatCurrency(activeTabSubtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between items-center text-[#34C759] font-medium">
                  <span>تخفیف:</span>
                  <span className="font-mono">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between items-center text-[#FF3B30] font-medium">
                  <span>مالیات ({settings?.taxPercentage || 0}%):</span>
                  <span className="font-mono">+{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-black/[0.04]">
                <span className="text-neutral-900 font-semibold text-sm">مبلغ نهایی:</span>
                <span className="text-xl font-bold text-[#007AFF] font-mono">{formatCurrency(activeTabTotal)}</span>
              </div>
            </div>
            
            {can('pos_checkout') ? (
              <button 
                onClick={handleCheckout}
                disabled={activeTab.items.length === 0}
                className="w-full bg-[#007AFF] hover:bg-[#0062cc] active:scale-[0.98] disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed text-white py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-[0_4px_16px_rgba(0,122,255,0.3)] disabled:shadow-none cursor-pointer"
              >
                <CreditCard size={18} />
                <span>ثبت فاکتور و چاپ</span>
              </button>
            ) : (
              <button 
                disabled
                className="w-full bg-neutral-100 text-neutral-400 py-3 rounded-2xl font-medium text-xs flex items-center justify-center gap-2 cursor-not-allowed border border-black/[0.06]"
                title="شما مجوز ثبت نهایی فاکتور فروش ندارید."
              >
                <Lock size={15} />
                <span>عدم دسترسی به ثبت نهایی فاکتور فروش</span>
              </button>
            )}
          </div>
          
        </div>

      </div>

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 overflow-hidden space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Layers size={18} className="text-[#007AFF]" />
                <span>{editingCategory ? 'ویرایش نام دسته‌بندی' : 'مدیریت و تعریف دسته‌بندی‌های منو'}</span>
              </h3>
              <button 
                type="button"
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setEditingCategory(null);
                  setCategoryNameInput('');
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Input Form */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                {editingCategory ? 'ویرایش عنوان دسته‌بندی انتخاب‌شده:' : 'عنوان دسته‌بندی جدید:'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="مثال: نوشیدنی‌های گرم، پیتزا، پیش‌غذا..."
                  value={categoryNameInput}
                  onChange={(e) => setCategoryNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveCategory();
                    }
                  }}
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-[#007AFF] outline-none transition-all font-medium"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveCategory}
                  disabled={!categoryNameInput.trim()}
                  className="px-5 py-2.5 bg-[#007AFF] hover:bg-[#0062cc] active:scale-95 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Check size={14} />
                  <span>{editingCategory ? 'ثبت تغییر' : 'افزودن دسته'}</span>
                </button>
                {editingCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryNameInput('');
                    }}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    انصراف
                  </button>
                )}
              </div>
            </div>

            {/* List of existing categories */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-600 block mb-1">
                دسته‌بندی‌های فعلی ({sortedCategories.length} گروه):
              </span>
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {sortedCategories.map((cat, idx) => {
                  const itemCount = allMenuItems?.filter(i => i.categoryId === cat.id).length || 0;
                  const isBeingEdited = editingCategory?.id === cat.id;
                  return (
                    <div 
                      key={cat.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isBeingEdited 
                          ? 'bg-blue-50/70 border-[#007AFF] shadow-xs' 
                          : 'bg-slate-50/70 hover:bg-slate-100/70 border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-800">{cat.name}</span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          ({itemCount} کالا)
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleMoveCategoryStep(cat, -1, e)}
                          disabled={idx === 0}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-20 rounded-lg transition-colors cursor-pointer"
                          title="انتقال دسته‌بندی به بالاتر"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleMoveCategoryStep(cat, 1, e)}
                          disabled={idx === sortedCategories.length - 1}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-20 rounded-lg transition-colors cursor-pointer"
                          title="انتقال دسته‌بندی به پایین‌تر"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategory(cat);
                            setCategoryNameInput(cat.name);
                          }}
                          className="p-1.5 text-slate-500 hover:text-[#007AFF] hover:bg-white rounded-lg transition-colors cursor-pointer"
                          title="ویرایش نام دسته‌بندی"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="حذف دسته‌بندی"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {sortedCategories.length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-6">هنوز هیچ دسته‌بندی تعریف نشده است.</p>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setEditingCategory(null);
                  setCategoryNameInput('');
                }}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS Payment & Bank/Cashbox/Cheque Selector Modal */}
      <POSPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        totalAmount={activeTabTotal}
        customerName={activeTab.customerName}
        onConfirm={handleConfirmPayment}
      />
    </div>
  );
}
