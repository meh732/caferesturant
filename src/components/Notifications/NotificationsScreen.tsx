import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Bell, BellRing, CheckCheck, Trash2, Check,
  UtensilsCrossed, MessageSquare, AlertTriangle, 
  TrendingUp, Sparkles, Filter, Clock, ChevronRight,
  CheckCircle2, XCircle, Eye, Volume2, X, Store, Receipt
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
  requestBrowserNotificationPermission
} from '../../lib/networkSync';
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
};

export default function NotificationsScreen({ onNavigateTab, onOpenOrderInPos }: NotificationsScreenProps) {
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

  const allNotifications = useLiveQuery(() => db.systemNotifications.orderBy('createdAt').reverse().toArray()) || [];
  const allNetworkOrders = useLiveQuery(() => db.networkOrders.orderBy('createdAt').reverse().toArray()) || [];
  const allFinalOrders = useLiveQuery(() => db.orders.toArray()) || [];

  const { networkByTempId, networkById } = useMemo(() => {
    const byTemp = new Map<string, NetworkOrder>();
    const byId = new Map<number, NetworkOrder>();
    for (const o of allNetworkOrders) {
      if (o.tempId) byTemp.set(o.tempId, o);
      if (o.id) byId.set(o.id, o);
    }
    return { networkByTempId: byTemp, networkById: byId };
  }, [allNetworkOrders]);

  const { finalOrderByTempId, finalOrderById } = useMemo(() => {
    const byTemp = new Map<string, Order>();
    const byId = new Map<number, Order>();
    for (const o of allFinalOrders) {
      if (o.networkOrderTempId) byTemp.set(o.networkOrderTempId, o);
      if (o.id) byId.set(o.id, o);
    }
    return { finalOrderByTempId: byTemp, finalOrderById: byId };
  }, [allFinalOrders]);

  // Merge stored notifications with any NetworkOrder that lacks a SystemNotification record
  const mergedFeed: FeedItem[] = useMemo(() => {
    const coveredTempIds = new Set<string>();
    const coveredNetIds = new Set<number>();

    const enriched: FeedItem[] = allNotifications.map(n => {
      const tId = n.metadata?.tempId ? String(n.metadata.tempId) : '';
      const oId = n.metadata?.orderId ? Number(n.metadata.orderId) : 0;
      const linkedNet = (tId && networkByTempId.get(tId)) || (oId && networkById.get(oId)) || undefined;
      if (linkedNet?.tempId) coveredTempIds.add(linkedNet.tempId);
      if (linkedNet?.id) coveredNetIds.add(linkedNet.id);

      const linkedFinal =
        (linkedNet?.completedOrderId && finalOrderById.get(linkedNet.completedOrderId)) ||
        (linkedNet?.tempId && finalOrderByTempId.get(linkedNet.tempId)) ||
        (tId && finalOrderByTempId.get(tId)) ||
        undefined;

      return {
        ...n,
        linkedNetworkOrder: linkedNet,
        linkedFinalOrder: linkedFinal
      };
    });

    // Add synthetic items for networkOrders that don't have a notification entry (e.g. after clearing notifications)
    for (const net of allNetworkOrders) {
      const hasTemp = net.tempId && coveredTempIds.has(net.tempId);
      const hasId = net.id && coveredNetIds.has(net.id);
      if (hasTemp || hasId) continue;

      const linkedFinal =
        (net.completedOrderId && finalOrderById.get(net.completedOrderId)) ||
        (net.tempId && finalOrderByTempId.get(net.tempId)) ||
        undefined;

      enriched.push({
        id: net.id ? -net.id : undefined,
        synthetic: true,
        type: 'new_order',
        title: `سفارش از ${net.tableTitle || `میز ${net.tableNumber || 1}`}`,
        message: `${(net.items || []).length} قلم کالا به ارزش ${formatCurrency(net.subtotal || 0)}`,
        category: `order-${net.tempId}`,
        targetTab: 'pos',
        metadata: { orderId: net.id, tempId: net.tempId },
        isRead: net.status !== 'pending',
        createdAt: net.createdAt,
        linkedNetworkOrder: net,
        linkedFinalOrder: linkedFinal
      });
    }

    return enriched.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [allNotifications, allNetworkOrders, networkByTempId, networkById, finalOrderById, finalOrderByTempId]);

  const filteredItems = useMemo(() => {
    return mergedFeed.filter(n => {
      if (unreadOnly && n.isRead) return false;
      if (filterType !== 'all' && n.type !== filterType) return false;
      return true;
    });
  }, [mergedFeed, filterType, unreadOnly]);

  const unreadCount = allNotifications.filter(n => !n.isRead).length;

  const handleTestSoundAndPermission = async () => {
    unlockNotificationAudio();
    playNewOrderChime();
    const res = await requestBrowserNotificationPermission();
    setNotifPermStatus(res);
  };

  const handleItemClick = async (item: FeedItem) => {
    if (!item.synthetic && !item.isRead && item.id && item.id > 0) {
      await markNotificationAsRead(item.id);
    }

    if (item.type === 'new_order' && item.linkedNetworkOrder) {
      const ord = item.linkedNetworkOrder;
      if (ord.status === 'pending' && onOpenOrderInPos) {
        onOpenOrderInPos(ord);
        return;
      }
      // Already accepted / completed / rejected -> open rich order details modal!
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

  const getOrderStatusBadge = (net?: NetworkOrder, finalOrd?: Order) => {
    if (net?.status === 'completed' || finalOrd) {
      const inv = net?.completedInvoiceNumber || finalOrd?.invoiceNumber;
      return {
        label: inv ? `ثبت شده در صندوق (فاکتور #${inv}) ✓` : 'سفارش ثبت و تسویه شده ✓',
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: <CheckCircle2 size={12} className="text-emerald-600" />
      };
    }
    if (net?.status === 'accepted') {
      return {
        label: 'تایید شده و باز در صندوق ✓',
        cls: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: <CheckCircle2 size={12} className="text-blue-600" />
      };
    }
    if (net?.status === 'rejected') {
      return {
        label: 'رد شده',
        cls: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: <XCircle size={12} className="text-rose-600" />
      };
    }
    if (net?.status === 'pending') {
      return {
        label: 'در انتظار باز کردن و تایید در صندوق',
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
            onClick={handleTestSoundAndPermission}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 border ${
              notifPermStatus === 'granted'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
            title="پخش صدای زنگ سفارش و فعال‌سازی نوتیفیکیشن دسکتاپ"
          >
            <Volume2 size={14} />
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

      {/* Filter Chips Bar (Cupertino Segmented) */}
      <div className="bg-white/60 backdrop-blur-xl border-b border-black/[0.04] px-5 py-2 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
        <Filter size={14} className="text-neutral-400 shrink-0 ml-1" />
        
        <div className="flex items-center p-1 bg-black/[0.05] rounded-xl border border-black/[0.04] text-xs font-semibold gap-1">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-lg transition-all duration-150 cursor-pointer active:scale-95 ${
              filterType === 'all'
                ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] font-semibold'
                : 'text-neutral-500 hover:text-neutral-800 font-medium'
            }`}
          >
            همه ({mergedFeed.length})
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
            <span>سفارشات ({mergedFeed.filter(i => i.type === 'new_order').length})</span>
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

      {/* Notifications List Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 scrollbar-none">
        {filteredItems.length > 0 ? (
          filteredItems.map(item => {
            const badge = getTypeBadge(item.type);
            const orderStatus = item.type === 'new_order'
              ? getOrderStatusBadge(item.linkedNetworkOrder, item.linkedFinalOrder)
              : null;
            const isPendingOrder = item.type === 'new_order' && item.linkedNetworkOrder?.status === 'pending';
            const hasOrderDetails = item.type === 'new_order' && !!item.linkedNetworkOrder;
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
                      {!item.isRead && (
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

                    <h3 className={`text-sm ${!item.isRead || isPendingOrder ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-800'}`}>
                      {item.title}
                    </h3>
                    <p className="text-xs text-neutral-600 mt-1 leading-relaxed break-words font-normal">
                      {item.message}
                    </p>

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
                  className="flex items-center gap-2 self-end sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isPendingOrder && item.linkedNetworkOrder ? (
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
                        title="مشاهده جزئیات قبل از تایید"
                      >
                        <Eye size={13} />
                        <span>جزئیات</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_2px_8px_rgba(245,158,11,0.3)] transition-all active:scale-95 cursor-pointer"
                      >
                        <Store size={14} />
                        <span>باز کردن و تایید در صندوق</span>
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
                      <span>مشاهده جزئیات سفارش</span>
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
                      onClick={() => item.id && markNotificationAsRead(item.id)}
                      className="p-2 rounded-xl text-neutral-400 hover:text-[#007AFF] hover:bg-[#007AFF]/10 transition-all cursor-pointer active:scale-90"
                      title="علامت‌گذاری به عنوان خوانده شده"
                    >
                      <Check size={15} />
                    </button>
                  )}

                  {!item.synthetic && item.id && item.id > 0 && (
                    <button
                      type="button"
                      onClick={() => item.id && deleteNotification(item.id)}
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
              <Bell size={26} />
            </div>
            <h3 className="font-semibold text-neutral-800 text-sm">هیچ اعلانی یافت نشد</h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm font-normal">
              تمامی هشدارهای جدید، سفارشات منوی دیجیتال، درخواست‌های گارسون و پیام‌های دریافتی در این مرکز نمایش داده می‌شوند.
            </p>
          </div>
        )}
      </div>

      {/* Order Details Modal (for viewing confirmed/registered or pending menu orders) */}
      {selectedOrderDetail?.networkOrder && (() => {
        const net = selectedOrderDetail.networkOrder;
        const fin = selectedOrderDetail.finalOrder;
        const badge = getOrderStatusBadge(net, fin);
        const displayItems = fin?.items && fin.items.length > 0 ? fin.items : net.items;
        const displayTotal = fin?.total ?? net.subtotal ?? 0;
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

                {(net.customerName || net.customerPhone || net.paymentMethod || fin?.paymentMethod) && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-xs space-y-1.5">
                    {(fin?.customerName || net.customerName) && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">نام مشتری:</span>
                        <span className="font-bold text-slate-800">{fin?.customerName || net.customerName}</span>
                      </div>
                    )}
                    {(fin?.customerPhone || net.customerPhone) && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">شماره تماس:</span>
                        <span className="font-mono font-bold text-slate-800">{fin?.customerPhone || net.customerPhone}</span>
                      </div>
                    )}
                    {(fin?.paymentMethod || net.paymentMethod) && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">روش پرداخت:</span>
                        <span className="font-bold text-blue-700">
                          {(fin?.paymentMethod || net.paymentMethod) === 'wallet'
                            ? 'کیف پول باشگاه'
                            : (fin?.paymentMethod || net.paymentMethod) === 'credit'
                            ? 'نسیه / حساب مشتری'
                            : (fin?.paymentMethod || net.paymentMethod) === 'cash'
                            ? 'نقدی'
                            : (fin?.paymentMethod || net.paymentMethod) === 'card'
                            ? 'کارتخوان (POS)'
                            : 'پرداخت در صندوق'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

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
                  <div className="bg-slate-50 px-3.5 py-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-black">
                    <span className="text-slate-700">مبلغ کل سفارش:</span>
                    <span className="text-blue-700 font-mono text-sm">{formatCurrency(displayTotal)}</span>
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
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedOrderDetail(null)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                >
                  بستن
                </button>

                {(net.status === 'pending' || net.status === 'accepted') && onOpenOrderInPos && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = net;
                      setSelectedOrderDetail(null);
                      onOpenOrderInPos(target);
                    }}
                    className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                      net.status === 'pending' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    <Store size={14} />
                    <span>
                      {net.status === 'pending' ? 'باز کردن و تایید در صندوق' : 'نمایش تب در صندوق'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
