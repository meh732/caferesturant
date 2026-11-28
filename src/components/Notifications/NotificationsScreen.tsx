import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Bell, BellRing, CheckCheck, Trash2, Check,
  UtensilsCrossed, MessageSquare, AlertTriangle, 
  TrendingUp, Sparkles, Filter, Clock, ChevronRight,
  CheckCircle2, XCircle, Eye, Volume2, VolumeX, X, Store, Receipt,
  Lock, User, Crown, Archive, Inbox
} from 'lucide-react';
import { db, SystemNotification, NotificationType, NetworkOrder, Order } from '../../lib/db';
import { 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  deleteNotification, 
  clearAllNotifications 
} from '../../lib/chatNotificationService';
import {
  playNewOrderChime,
  unlockNotificationAudio,
  requestBrowserNotificationPermission,
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  updateNetworkOrderStatus
} from '../../lib/networkSync';
import {
  findFinalizedOrderForNetwork,
  isNetworkOrderInvoiced,
  getFinalInvoiceNumber,
  resolveCustomerDetailsForOrder,
  CUSTOMER_TIER_LABELS
} from '../../lib/networkOrderGuard';
import CustomerClubSummaryCard from '../Common/CustomerClubSummaryCard';
import { formatCurrency } from '../../lib/utils';
import { format as formatJalali } from 'date-fns-jalali';
import { TabType } from '../../context/AuthContext';

interface NotificationsScreenProps {
  onNavigateTab?: (tab: TabType) => void;
  onOpenOrderInPos?: (order: NetworkOrder) => void;
}

type FeedItem = SystemNotification & {
  synthetic?: boolean;
  linkedNetworkOrder?: NetworkOrder;
  linkedFinalOrder?: Order;
  duplicateNotificationIds?: number[];
};

export default function NotificationsScreen({ onNavigateTab, onOpenOrderInPos }: NotificationsScreenProps) {
  const [viewMode, setViewMode] = useState<'active' | 'archive'>('active');
  const [filterType, setFilterType] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<{
    networkOrder?: NetworkOrder;
    finalOrder?: Order;
    notif?: SystemNotification;
  } | null>(null);
  const [notifPermStatus, setNotifPermStatus] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isNotificationSoundEnabled());

  const allNotifications = useLiveQuery(() => db.systemNotifications.orderBy('createdAt').reverse().toArray()) || [];
  const allNetworkOrders = useLiveQuery(() => db.networkOrders.orderBy('createdAt').reverse().toArray()) || [];
  const allFinalOrders = useLiveQuery(() => db.orders.toArray()) || [];
  const allCustomers = useLiveQuery(() => db.customers.toArray()) || [];

  const { networkByTempId, networkById } = useMemo(() => {
    const byTemp = new Map<string, NetworkOrder>();
    const byId = new Map<number, NetworkOrder>();
    const statusRank: Record<string, number> = { pending: 1, accepted: 2, rejected: 3, completed: 4 };
    for (const o of allNetworkOrders) {
      if (o.tempId) {
        const prev = byTemp.get(o.tempId);
        if (!prev || (statusRank[o.status] || 0) >= (statusRank[prev.status] || 0)) {
          byTemp.set(o.tempId, o);
        }
      }
      if (o.id) byId.set(o.id, o);
    }
    return { networkByTempId: byTemp, networkById: byId };
  }, [allNetworkOrders]);

  // Merge stored notifications with any NetworkOrder that lacks a SystemNotification record,
  // strictly deduplicating so each customer order / invoice ALWAYS appears in exactly ONE row.
  const mergedFeed: FeedItem[] = useMemo(() => {
    const coveredTempIds = new Set<string>();
    const coveredNetIds = new Set<number>();
    const coveredInvoiceNums = new Set<number>();
    const dedupOrderMap = new Map<string, FeedItem>();
    const nonOrderItems: FeedItem[] = [];

    for (const n of allNotifications) {
      const catTempId =
        typeof n.category === 'string' && n.category.startsWith('order-')
          ? n.category.slice(6).trim()
          : '';
      const tId = (n.metadata?.tempId ? String(n.metadata.tempId).trim() : '') || catTempId;
      const oId = n.metadata?.orderId ? Number(n.metadata.orderId) : 0;
      const linkedNet = (tId && networkByTempId.get(tId)) || (oId && networkById.get(oId)) || undefined;
      if (linkedNet?.tempId) coveredTempIds.add(linkedNet.tempId);
      if (linkedNet?.id) coveredNetIds.add(linkedNet.id);

      const linkedFinal =
        findFinalizedOrderForNetwork(linkedNet, allFinalOrders) ||
        (tId ? allFinalOrders.find(o => o.networkOrderTempId === tId && o.status !== 'cancelled') : undefined);
      if (linkedFinal?.invoiceNumber) coveredInvoiceNums.add(linkedFinal.invoiceNumber);

      if (n.type === 'new_order') {
        const canonicalKey = linkedFinal?.invoiceNumber
          ? `inv:${linkedFinal.invoiceNumber}`
          : linkedNet?.tempId
          ? `temp:${linkedNet.tempId}`
          : tId
          ? `temp:${tId}`
          : linkedNet?.id
          ? `net:${linkedNet.id}`
          : `notif:${n.id || n.category || n.createdAt}`;

        const existing = dedupOrderMap.get(canonicalKey);
        if (!existing) {
          dedupOrderMap.set(canonicalKey, {
            ...n,
            linkedNetworkOrder: linkedNet,
            linkedFinalOrder: linkedFinal,
            duplicateNotificationIds: n.id && n.id > 0 ? [n.id] : []
          });
        } else {
          // Merge duplicate rows for the same customer order into a single row
          const dupIds = [...(existing.duplicateNotificationIds || [])];
          if (n.id && n.id > 0 && !dupIds.includes(n.id)) dupIds.push(n.id);
          const mergedIsRead = existing.isRead || n.isRead;
          dedupOrderMap.set(canonicalKey, {
            ...existing,
            isRead: mergedIsRead,
            linkedNetworkOrder: existing.linkedNetworkOrder || linkedNet,
            linkedFinalOrder: existing.linkedFinalOrder || linkedFinal,
            duplicateNotificationIds: dupIds
          });
        }
      } else {
        nonOrderItems.push({
          ...n,
          linkedNetworkOrder: linkedNet,
          linkedFinalOrder: linkedFinal,
          duplicateNotificationIds: n.id && n.id > 0 ? [n.id] : []
        });
      }
    }

    // Add synthetic items for unique networkOrders that don't have a notification entry
    for (const net of allNetworkOrders) {
      const linkedFinal = findFinalizedOrderForNetwork(net, allFinalOrders);
      const hasTemp = net.tempId && coveredTempIds.has(net.tempId);
      const hasId = net.id && coveredNetIds.has(net.id);
      const hasInv = linkedFinal?.invoiceNumber && coveredInvoiceNums.has(linkedFinal.invoiceNumber);
      if (hasTemp || hasId || hasInv) continue;

      const canonicalKey = linkedFinal?.invoiceNumber
        ? `inv:${linkedFinal.invoiceNumber}`
        : net.tempId
        ? `temp:${net.tempId}`
        : `net:${net.id}`;

      if (dedupOrderMap.has(canonicalKey)) continue;
      if (net.tempId) coveredTempIds.add(net.tempId);
      if (net.id) coveredNetIds.add(net.id);
      if (linkedFinal?.invoiceNumber) coveredInvoiceNums.add(linkedFinal.invoiceNumber);

      const displayAmount = linkedFinal?.total ?? net.total ?? net.subtotal ?? 0;

      dedupOrderMap.set(canonicalKey, {
        id: net.id ? -net.id : undefined,
        synthetic: true,
        type: 'new_order',
        title: `سفارش از ${net.tableTitle || `میز ${net.tableNumber || 1}`}`,
        message: `${(net.items || []).length} قلم کالا به ارزش ${formatCurrency(displayAmount)}`,
        category: `order-${net.tempId}`,
        targetTab: 'pos',
        metadata: { orderId: net.id, tempId: net.tempId },
        isRead: net.status !== 'pending',
        createdAt: net.createdAt,
        linkedNetworkOrder: net,
        linkedFinalOrder: linkedFinal,
        duplicateNotificationIds: []
      });
    }

    return [...nonOrderItems, ...Array.from(dedupOrderMap.values())].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [allNotifications, allNetworkOrders, networkByTempId, networkById, allFinalOrders]);

  const isFeedItemArchived = (item: FeedItem): boolean => {
    if (item.type === 'new_order' && item.linkedNetworkOrder) {
      const invoiced = isNetworkOrderInvoiced(item.linkedNetworkOrder, item.linkedFinalOrder);
      return invoiced || item.linkedNetworkOrder.status === 'rejected';
    }
    return false;
  };

  const activeFeed = useMemo(
    () => mergedFeed.filter((item) => !isFeedItemArchived(item)),
    [mergedFeed]
  );

  const archivedFeed = useMemo(
    () => mergedFeed.filter((item) => isFeedItemArchived(item)),
    [mergedFeed]
  );

  const scopedFeed = viewMode === 'archive' ? archivedFeed : activeFeed;

  const filteredItems = useMemo(() => {
    return scopedFeed.filter(n => {
      if (viewMode === 'active' && unreadOnly && n.isRead) return false;
      if (filterType !== 'all' && n.type !== filterType) return false;
      return true;
    });
  }, [scopedFeed, filterType, unreadOnly, viewMode]);

  const unreadCount = useMemo(
    () => activeFeed.filter(item => !item.isRead && !item.synthetic).length,
    [activeFeed]
  );

  const handleTestSoundAndPermission = async () => {
    if (!soundEnabled) {
      setNotificationSoundEnabled(true);
      setSoundEnabled(true);
    }
    unlockNotificationAudio();
    playNewOrderChime();
    const res = await requestBrowserNotificationPermission();
    setNotifPermStatus(res);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setNotificationSoundEnabled(next);
    setSoundEnabled(next);
    if (next) {
      unlockNotificationAudio();
      playNewOrderChime();
    }
  };

  const markFeedItemRead = async (item: FeedItem) => {
    const ids = item.duplicateNotificationIds && item.duplicateNotificationIds.length > 0
      ? item.duplicateNotificationIds
      : (item.id && item.id > 0 ? [item.id] : []);
    for (const id of ids) {
      await markNotificationAsRead(id);
    }
  };

  const deleteFeedItem = async (item: FeedItem) => {
    const ids = item.duplicateNotificationIds && item.duplicateNotificationIds.length > 0
      ? item.duplicateNotificationIds
      : (item.id && item.id > 0 ? [item.id] : []);
    for (const id of ids) {
      await deleteNotification(id);
    }
  };

  const handleItemClick = async (item: FeedItem) => {
    if (!item.synthetic && !item.isRead) {
      await markFeedItemRead(item);
    }

    if (item.type === 'new_order' && item.linkedNetworkOrder) {
      const ord = item.linkedNetworkOrder;
      const alreadyInvoiced = isNetworkOrderInvoiced(ord, item.linkedFinalOrder);
      // If NOT invoiced and NOT rejected (pending OR accepted) -> go straight to POS so cashier can confirm/invoice it!
      if (!alreadyInvoiced && (ord.status === 'pending' || ord.status === 'accepted') && onOpenOrderInPos) {
        onOpenOrderInPos(ord);
        return;
      }
      // Already invoiced or rejected -> strictly read-only details modal (NEVER re-open in POS)
      setSelectedOrderDetail({
        networkOrder: ord,
        finalOrder: item.linkedFinalOrder,
        notif: item
      });
      return;
    }

    if (item.targetTab && onNavigateTab) {
      onNavigateTab(item.targetTab as TabType);
    }
  };

  const handleRejectOrder = async (ord: NetworkOrder) => {
    await updateNetworkOrderStatus(ord.id || 0, ord.tempId, 'rejected');
    setSelectedOrderDetail(null);
  };

  const getOrderStatusBadge = (net?: NetworkOrder, finalOrd?: Order) => {
    if (isNetworkOrderInvoiced(net, finalOrd)) {
      const inv = getFinalInvoiceNumber(net, finalOrd);
      return {
        label: inv ? `فاکتور نهایی #${inv} • تکمیل و قفل شده ✓` : 'فاکتور و تسویه شده • قفل شده ✓',
        cls: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        icon: <Lock size={11} className="text-emerald-600" />
      };
    }
    if (net?.status === 'accepted') {
      return {
        label: 'در حال ثبت در صندوق (هنوز فاکتور نشده)',
        cls: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: <Store size={12} className="text-blue-600" />
      };
    }
    if (net?.status === 'rejected') {
      return {
        label: 'رد / لغو شده',
        cls: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: <XCircle size={12} className="text-rose-600" />
      };
    }
    if (net?.status === 'pending') {
      return {
        label: 'سفارش جدید — در انتظار تایید و فاکتور در صندوق',
        cls: 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse',
        icon: <Clock size={12} className="text-amber-600" />
      };
    }
    return null;
  };

  const getTypeBadge = (type: NotificationType) => {
    switch (type) {
      case 'waiter_call':
        return {
          icon: <UtensilsCrossed size={16} className="text-[#FF9500] animate-pulse" />,
          label: 'درخواست گارسون',
          bg: 'bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20',
          dot: 'bg-[#FF9500]'
        };
      case 'chat_message':
        return {
          icon: <MessageSquare size={16} className="text-[#007AFF]" />,
          label: 'پیام گفتگو',
          bg: 'bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/20',
          dot: 'bg-[#007AFF]'
        };
      case 'new_order':
        return {
          icon: <Sparkles size={16} className="text-[#34C759]" />,
          label: 'سفارش آنلاین / منو',
          bg: 'bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20',
          dot: 'bg-[#34C759]'
        };
      case 'low_stock':
        return {
          icon: <AlertTriangle size={16} className="text-[#FF3B30]" />,
          label: 'کسری انبار',
          bg: 'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20',
          dot: 'bg-[#FF3B30]'
        };
      case 'report_shared':
        return {
          icon: <TrendingUp size={16} className="text-[#5856D6]" />,
          label: 'گزارش ارسالی',
          bg: 'bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/20',
          dot: 'bg-[#5856D6]'
        };
      default:
        return {
          icon: <Bell size={16} className="text-[#5856D6]" />,
          label: 'سیستمی',
          bg: 'bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/20',
          dot: 'bg-[#5856D6]'
        };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5F5F7] overflow-hidden font-sans" dir="rtl">
      
      {/* Top Header Bar (Apple Translucent Header) */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-black/[0.06] px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#FF9500] to-[#FF3B30] text-white flex items-center justify-center shadow-xs">
            <BellRing size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight">مرکز اعلان‌ها و سفارشات منو</h1>
              {unreadCount > 0 && (
                <span className="bg-[#FF3B30] text-white text-[11px] font-bold px-2 py-0.5 rounded-full font-mono shadow-xs">
                  {unreadCount} خوانده‌نشده
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 font-normal mt-0.5">
              سفارشات منوی بارکد و تبلت، وضعیت تایید و ثبت در صندوق، درخواست گارسون و هشدارهای انبار
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleToggleSound}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 border ${
              soundEnabled
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                : 'bg-neutral-100 text-neutral-500 border-neutral-200 hover:bg-neutral-200'
            }`}
            title={soundEnabled ? 'صدای اعلان‌ها فعال است (برای بی‌صدا کردن کلیک کنید)' : 'صدای اعلان‌ها خاموش است (برای فعال کردن کلیک کنید)'}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{soundEnabled ? 'صدا فعال' : 'بی‌صدا'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestSoundAndPermission}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 border ${
              notifPermStatus === 'granted'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
            title="پخش صدای زنگ سفارش و فعال‌سازی نوتیفیکیشن دسکتاپ"
          >
            <BellRing size={14} />
            <span>{notifPermStatus === 'granted' ? 'تست صدای اعلان' : 'فعال‌سازی صدا و نوتیف'}</span>
          </button>

          {unreadCount > 0 && (
            <button
              onClick={() => markAllNotificationsAsRead()}
              className="px-3.5 py-1.5 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <CheckCheck size={15} />
              <span>خواندن همه</span>
            </button>
          )}

          {allNotifications && allNotifications.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('آیا از پاک کردن تمامی تاریخچه اعلان‌ها اطمینان دارید؟')) {
                  clearAllNotifications();
                }
              }}
              className="p-2 rounded-xl text-neutral-400 hover:text-[#FF3B30] hover:bg-black/[0.04] transition-all cursor-pointer active:scale-90"
              title="پاک کردن تمامی اعلان‌ها"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Filter Chips Bar (Active Inbox vs Archived Completed + Type Filters) */}
      <div className="bg-white/60 backdrop-blur-xl border-b border-black/[0.04] px-5 py-2.5 flex flex-wrap items-center gap-2.5 shrink-0">
        {/* Primary Active vs Completed/Archived Switch */}
        <div className="flex items-center p-1 bg-slate-200/70 rounded-xl border border-black/[0.05] text-xs font-bold gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setViewMode('active');
              setFilterType('all');
            }}
            className={`px-3.5 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              viewMode === 'active'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Inbox size={13} className={viewMode === 'active' ? 'text-[#007AFF]' : 'text-slate-500'} />
            <span>فعال و باز</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
              viewMode === 'active' ? 'bg-[#007AFF] text-white' : 'bg-slate-300/70 text-slate-700'
            }`}>
              {activeFeed.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode('archive');
              setFilterType('all');
            }}
            className={`px-3.5 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              viewMode === 'archive'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Archive size={13} className={viewMode === 'archive' ? 'text-emerald-600' : 'text-slate-500'} />
            <span>فاکتور شده / آرشیو</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
              viewMode === 'archive' ? 'bg-emerald-600 text-white' : 'bg-slate-300/70 text-slate-700'
            }`}>
              {archivedFeed.length}
            </span>
          </button>
        </div>

        {viewMode === 'active' && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none flex-1 min-w-0">
            <Filter size={14} className="text-neutral-400 shrink-0 ml-0.5" />
            
            <div className="flex items-center p-1 bg-black/[0.05] rounded-xl border border-black/[0.04] text-xs font-semibold gap-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg transition-all duration-150 cursor-pointer active:scale-95 ${
                  filterType === 'all'
                    ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                    : 'text-neutral-500 hover:text-neutral-800 font-medium'
                }`}
              >
                همه ({activeFeed.length})
              </button>

              <button
                onClick={() => setFilterType('new_order')}
                className={`px-3 py-1 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                  filterType === 'new_order'
                    ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                    : 'text-neutral-500 hover:text-neutral-800 font-medium'
                }`}
              >
                <Sparkles size={12} className="text-[#34C759]" />
                <span>سفارشات باز ({activeFeed.filter(i => i.type === 'new_order').length})</span>
              </button>

              <button
                onClick={() => setFilterType('waiter_call')}
                className={`px-3 py-1 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                  filterType === 'waiter_call'
                    ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                    : 'text-neutral-500 hover:text-neutral-800 font-medium'
                }`}
              >
                <UtensilsCrossed size={12} className="text-[#FF9500]" />
                <span>گارسون</span>
              </button>

              <button
                onClick={() => setFilterType('chat_message')}
                className={`px-3 py-1 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                  filterType === 'chat_message'
                    ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                    : 'text-neutral-500 hover:text-neutral-800 font-medium'
                }`}
              >
                <MessageSquare size={12} className="text-[#007AFF]" />
                <span>گفتگو</span>
              </button>

              <button
                onClick={() => setFilterType('low_stock')}
                className={`px-3 py-1 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                  filterType === 'low_stock'
                    ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                    : 'text-neutral-500 hover:text-neutral-800 font-medium'
                }`}
              >
                <AlertTriangle size={12} className="text-[#FF3B30]" />
                <span>کسری انبار</span>
              </button>
            </div>

            <div className="mr-auto flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                  className="rounded text-[#007AFF] focus:ring-[#007AFF]"
                />
                <span className="font-semibold text-xs">فقط خوانده‌نشده‌ها</span>
              </label>
            </div>
          </div>
        )}

        {viewMode === 'archive' && (
          <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-semibold">
            سفارش‌های فاکتور شده و لغوشده به صورت خودکار به این بخش منتقل و قفل می‌شوند تا دوباره فاکتور نشوند.
          </div>
        )}
      </div>

      {/* Notifications List Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 scrollbar-none">
        {filteredItems.length > 0 ? (
          filteredItems.map(item => {
            const badge = getTypeBadge(item.type);
            const orderStatus = item.type === 'new_order'
              ? getOrderStatusBadge(item.linkedNetworkOrder, item.linkedFinalOrder)
              : null;
            const invoiced = item.type === 'new_order' && isNetworkOrderInvoiced(item.linkedNetworkOrder, item.linkedFinalOrder);
            const finalInvNum = invoiced ? getFinalInvoiceNumber(item.linkedNetworkOrder, item.linkedFinalOrder) : undefined;
            const isPendingOrder = item.type === 'new_order' && !invoiced && item.linkedNetworkOrder?.status === 'pending';
            const isAcceptedUninvoiced = item.type === 'new_order' && !invoiced && item.linkedNetworkOrder?.status === 'accepted';
            const hasOrderDetails = item.type === 'new_order' && !!item.linkedNetworkOrder;
            const customerInfo = hasOrderDetails
              ? resolveCustomerDetailsForOrder(item.linkedNetworkOrder, item.linkedFinalOrder, allCustomers)
              : null;
            const timeStr = item.createdAt 
              ? formatJalali(new Date(item.createdAt), 'yyyy/MM/dd HH:mm')
              : '';

            return (
              <div
                key={`${item.synthetic ? 'syn-' : 'n-'}${item.id || item.category || timeStr}`}
                onClick={() => handleItemClick(item)}
                className={`group rounded-3xl border transition-all duration-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer ${
                  isPendingOrder
                    ? 'bg-amber-50/70 border-amber-300 shadow-[0_4px_16px_rgba(245,158,11,0.1)] ring-1 ring-amber-300/60'
                    : isAcceptedUninvoiced
                    ? 'bg-blue-50/40 border-blue-300 shadow-[0_4px_16px_rgba(0,122,255,0.08)] ring-1 ring-blue-200/70'
                    : invoiced
                    ? 'bg-white border-emerald-200/90 hover:shadow-[0_2px_12px_rgba(16,185,129,0.08)]'
                    : !item.isRead
                    ? 'bg-white border-[#007AFF]/30 shadow-[0_4px_16px_rgba(0,122,255,0.06)] ring-1 ring-[#007AFF]/20'
                    : 'bg-white/85 border-black/[0.06] hover:bg-white hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]'
                }`}
              >
                {/* Left side: Type Badge, Text, Meta */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${badge.bg}`}>
                    {badge.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                        {badge.label}
                      </span>
                      {orderStatus && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${orderStatus.cls}`}>
                          {orderStatus.icon}
                          <span>{orderStatus.label}</span>
                        </span>
                      )}
                      {!item.isRead && !invoiced && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#007AFF] bg-[#007AFF]/10 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-ping"></span>
                          جدید
                        </span>
                      )}
                      <span className="text-[11px] text-neutral-400 font-mono flex items-center gap-1 mr-auto">
                        <Clock size={11} />
                        {timeStr}
                      </span>
                    </div>

                    <h3 className={`text-sm ${!item.isRead || isPendingOrder || isAcceptedUninvoiced ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-800'}`}>
                      {item.title}
                    </h3>
                    <p className="text-xs text-neutral-600 mt-1 leading-relaxed break-words font-normal">
                      {item.type === 'new_order' && item.linkedNetworkOrder
                        ? `${(item.linkedFinalOrder?.items || item.linkedNetworkOrder.items || []).length} قلم کالا به ارزش نهایی ${formatCurrency(
                            item.linkedFinalOrder?.total ?? item.linkedNetworkOrder.total ?? item.linkedNetworkOrder.subtotal ?? 0
                          )}${
                            (item.linkedFinalOrder?.taxAmount || item.linkedNetworkOrder.taxAmount || 0) > 0
                              ? ' (با احتساب مالیات)'
                              : ''
                          } ثبت شد.`
                        : item.message}
                    </p>

                    {/* Customer & Customer Club Inline Summary */}
                    {customerInfo && (customerInfo.name || customerInfo.phone || customerInfo.isClubMember) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200/80 font-bold">
                          <User size={11} />
                          <span>{customerInfo.name || 'مشتری'}</span>
                          {customerInfo.phone && (
                            <span dir="ltr" className="font-mono text-[10px] text-indigo-600 mr-1">
                              {customerInfo.phone}
                            </span>
                          )}
                        </span>
                        {customerInfo.isClubMember && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                            <Crown size={11} className="text-amber-600" />
                            <span>
                              {customerInfo.isClubApproved ? 'عضو تایید شده' : 'عضو باشگاه'} ({CUSTOMER_TIER_LABELS[customerInfo.tier || 'bronze'] || 'برنزی'})
                            </span>
                            {customerInfo.subscriptionCode && (
                              <span dir="ltr" className="font-mono text-[10px] text-amber-700">
                                #{customerInfo.subscriptionCode}
                              </span>
                            )}
                          </span>
                        )}
                        {(item.linkedFinalOrder?.paymentMethod === 'credit' || item.linkedNetworkOrder?.paymentMethod === 'credit') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                            پرداخت از طریق باشگاه (لیست بدهی)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Preview of ordered items right inside the card */}
                    {item.linkedNetworkOrder && item.linkedNetworkOrder.items?.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {item.linkedNetworkOrder.items.slice(0, 4).map((ordItem, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded-lg border border-slate-200/70"
                          >
                            <span className="font-mono font-bold text-blue-600">{ordItem.quantity}×</span>
                            <span>{ordItem.name}</span>
                          </span>
                        ))}
                        {item.linkedNetworkOrder.items.length > 4 && (
                          <span className="text-[11px] text-slate-500 font-semibold px-1.5">
                            +{item.linkedNetworkOrder.items.length - 4} مورد دیگر
                          </span>
                        )}
                      </div>
                    )}

                    {item.metadata?.tableNumber && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs bg-[#FF9500]/10 text-[#FF9500] font-bold px-2.5 py-1 rounded-xl border border-[#FF9500]/20 font-mono">
                        <UtensilsCrossed size={12} />
                        <span>میز شماره {item.metadata.tableNumber}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: Action buttons */}
                <div
                  className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(isPendingOrder || isAcceptedUninvoiced) && item.linkedNetworkOrder ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedOrderDetail({
                            networkOrder: item.linkedNetworkOrder,
                            finalOrder: item.linkedFinalOrder,
                            notif: item
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        title="مشاهده جزئیات و مشخصات مشتری"
                      >
                        <Eye size={13} />
                        <span>جزئیات</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className={`px-3.5 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                          isPendingOrder
                            ? 'bg-amber-600 hover:bg-amber-700 shadow-[0_2px_8px_rgba(245,158,11,0.3)]'
                            : 'bg-[#007AFF] hover:bg-[#0062cc] shadow-[0_2px_8px_rgba(0,122,255,0.28)]'
                        }`}
                      >
                        <Store size={14} />
                        <span>
                          {isPendingOrder ? 'باز کردن و تایید در صندوق' : 'ادامه و ثبت فاکتور در صندوق'}
                        </span>
                      </button>
                    </>
                  ) : hasOrderDetails ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedOrderDetail({
                          networkOrder: item.linkedNetworkOrder,
                          finalOrder: item.linkedFinalOrder,
                          notif: item
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                    >
                      <Eye size={14} />
                      <span>
                        {invoiced && finalInvNum
                          ? `مشاهده فاکتور #${finalInvNum} و مشتری`
                          : 'مشاهده جزئیات سفارش و مشتری'}
                      </span>
                    </button>
                  ) : item.targetTab ? (
                    <button
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className="px-3.5 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white text-xs font-semibold flex items-center gap-1.5 shadow-[0_2px_8px_rgba(0,122,255,0.25)] transition-all active:scale-95 cursor-pointer"
                    >
                      <span>مشاهده و اقدام</span>
                      <ChevronRight size={13} className="rotate-180" />
                    </button>
                  ) : null}

                  {!item.synthetic && !item.isRead && item.id && item.id > 0 && (
                    <button
                      type="button"
                      onClick={() => markFeedItemRead(item)}
                      className="p-2 rounded-xl text-neutral-400 hover:text-[#007AFF] hover:bg-[#007AFF]/10 transition-all cursor-pointer active:scale-90"
                      title="علامت‌گذاری به عنوان خوانده شده"
                    >
                      <Check size={15} />
                    </button>
                  )}

                  {!item.synthetic && item.id && item.id > 0 && (
                    <button
                      type="button"
                      onClick={() => deleteFeedItem(item)}
                      className="p-2 rounded-xl text-neutral-300 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-all cursor-pointer active:scale-90"
                      title="حذف این اعلان"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="h-96 flex flex-col items-center justify-center text-center p-8 bg-white/70 rounded-3xl border border-dashed border-black/[0.08]">
            <div className="w-14 h-14 rounded-3xl bg-black/[0.03] flex items-center justify-center text-neutral-400 mb-3">
              {viewMode === 'archive' ? <Archive size={26} /> : <CheckCircle2 size={28} className="text-emerald-500" />}
            </div>
            <h3 className="font-bold text-neutral-800 text-sm">
              {viewMode === 'archive'
                ? 'آرشیو سفارش‌های تکمیل‌شده خالی است'
                : 'همه اعلان‌ها و سفارش‌های باز رسیدگی شده‌اند ✓'}
            </h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-sm font-normal">
              {viewMode === 'archive'
                ? 'سفارش‌هایی که در صندوق فاکتور و تسویه شوند یا رد شوند به این بخش منتقل می‌گردند.'
                : 'سفارش‌های فاکتور شده به‌صورت خودکار از این لیست حذف شده و به تب «فاکتور شده / آرشیو» منتقل می‌شوند.'}
            </p>
            {viewMode === 'active' && archivedFeed.length > 0 && (
              <button
                type="button"
                onClick={() => setViewMode('archive')}
                className="mt-4 px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Archive size={14} />
                <span>مشاهده {archivedFeed.length} سفارش فاکتور شده / آرشیو</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Order Details Modal (for viewing confirmed/registered or pending menu orders) */}
      {selectedOrderDetail?.networkOrder && (() => {
        const net =
          (selectedOrderDetail.networkOrder.tempId && networkByTempId.get(selectedOrderDetail.networkOrder.tempId)) ||
          (selectedOrderDetail.networkOrder.id && networkById.get(selectedOrderDetail.networkOrder.id)) ||
          selectedOrderDetail.networkOrder;
        const fin = findFinalizedOrderForNetwork(net, allFinalOrders) || selectedOrderDetail.finalOrder;
        const alreadyInvoiced = isNetworkOrderInvoiced(net, fin);
        const finalInvNum = getFinalInvoiceNumber(net, fin);
        const badge = getOrderStatusBadge(net, fin);
        const displayItems = fin?.items && fin.items.length > 0 ? fin.items : net.items;
        const displaySubtotal = fin?.subtotal ?? net.subtotal ?? 0;
        const displayDiscount = fin
          ? (fin.discountType === 'percent'
              ? Math.round((displaySubtotal * (fin.discountValue || 0)) / 100)
              : fin.discountType === 'amount'
              ? (fin.discountValue || 0)
              : 0)
          : (net.discountAmount || 0);
        const displayTaxAmount = fin?.taxAmount ?? net.taxAmount ?? 0;
        const displayTaxPct = fin?.taxPercentage ?? net.taxPercentage ?? 0;
        const displayTotal = fin?.total ?? net.total ?? net.subtotal ?? 0;
        const createdTime = net.createdAt ? formatJalali(new Date(net.createdAt), 'yyyy/MM/dd HH:mm') : '';

        return (
          <div
            className="fixed inset-0 z-[105] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs"
            dir="rtl"
            onClick={() => setSelectedOrderDetail(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-lg w-full max-h-[88dvh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                    <Receipt size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black">
                      جزئیات سفارش — {net.tableTitle || `میز ${net.tableNumber || 1}`}
                    </h3>
                    <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                      {finalInvNum ? `فاکتور نهایی #${finalInvNum} • ` : ''}
                      {net.tempId} {createdTime ? `• ${createdTime}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrderDetail(null)}
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer"
                  aria-label="بستن"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
                {badge && (
                  <div className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between ${badge.cls}`}>
                    <span className="flex items-center gap-2">
                      {badge.icon}
                      <span>{badge.label}</span>
                    </span>
                    <span className="text-[11px] font-normal">
                      {net.source === 'waiter_tablet'
                        ? `تبلت گارسون${net.waiterName ? ` (${net.waiterName})` : ''}`
                        : net.source === 'customer_wallet'
                        ? 'باشگاه مشتریان'
                        : 'منوی بارکد (QR)'}
                    </span>
                  </div>
                )}

                {/* Final Invoice Lock + Customer & Customer Club Summary Card */}
                <CustomerClubSummaryCard
                  customerInfo={resolveCustomerDetailsForOrder(net, fin, allCustomers)}
                  networkOrder={net}
                  finalOrder={fin}
                  alreadyInvoiced={alreadyInvoiced}
                  invoiceNumber={finalInvNum}
                />

                {/* Itemized Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-100 px-3.5 py-2 grid grid-cols-12 text-[11px] font-bold text-slate-600">
                    <span className="col-span-6">نام کالا / غذا</span>
                    <span className="col-span-2 text-center">تعداد</span>
                    <span className="col-span-4 text-left">مبلغ</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {(displayItems || []).map((ordItem: any, idx: number) => (
                      <div key={idx} className="px-3.5 py-2.5 grid grid-cols-12 items-center text-xs">
                        <div className="col-span-6">
                          <div className="font-bold text-slate-800">{ordItem.name}</div>
                          {(ordItem.note || ordItem.notes) && (
                            <div className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5 w-fit">
                              یادداشت: {ordItem.note || ordItem.notes}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 text-center font-mono font-bold text-slate-900">
                          {ordItem.quantity}
                        </div>
                        <div className="col-span-4 text-left font-mono font-bold text-blue-600">
                          {formatCurrency((ordItem.price || 0) * (ordItem.quantity || 1))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-50 px-3.5 py-2.5 border-t border-slate-200 space-y-1 text-xs">
                    {(displayDiscount > 0 || displayTaxAmount > 0) && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>جمع اقلام:</span>
                        <span className="font-mono font-semibold">{formatCurrency(displaySubtotal)}</span>
                      </div>
                    )}
                    {displayDiscount > 0 && (
                      <div className="flex items-center justify-between text-emerald-700 font-semibold">
                        <span>تخفیف اختصاصی:</span>
                        <span className="font-mono">-{formatCurrency(displayDiscount)}</span>
                      </div>
                    )}
                    {displayTaxAmount > 0 && (
                      <div className="flex items-center justify-between text-rose-600 font-semibold">
                        <span>مالیات بر ارزش افزوده ({displayTaxPct}%):</span>
                        <span className="font-mono">+{formatCurrency(displayTaxAmount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-black pt-1 border-t border-slate-200/70">
                      <span className="text-slate-800">مبلغ نهایی سفارش:</span>
                      <span className="text-blue-700 font-mono text-sm">{formatCurrency(displayTotal)}</span>
                    </div>
                  </div>
                </div>

                {net.notes && (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 text-xs text-amber-950">
                    <strong className="block mb-0.5">توضیحات سفارش:</strong>
                    <span>{net.notes}</span>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedOrderDetail(null)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                >
                  بستن
                </button>

                {alreadyInvoiced ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                    <Lock size={13} className="text-emerald-600" />
                    <span>
                      {finalInvNum
                        ? `فاکتور #${finalInvNum} صادر شده — امکان فاکتور مجدد مسدود است`
                        : 'فاکتور صادر شده — امکان فاکتور مجدد مسدود است'}
                    </span>
                  </span>
                ) : (net.status === 'pending' || net.status === 'accepted') ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRejectOrder(net)}
                      className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer transition-all"
                    >
                      لغو / رد سفارش
                    </button>
                    {onOpenOrderInPos && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = net;
                          setSelectedOrderDetail(null);
                          onOpenOrderInPos(target);
                        }}
                        className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                          net.status === 'pending' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#007AFF] hover:bg-[#0062cc]'
                        }`}
                      >
                        <Store size={14} />
                        <span>
                          {net.status === 'pending' ? 'باز کردن و تایید در صندوق' : 'ادامه و ثبت فاکتور در صندوق'}
                        </span>
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
