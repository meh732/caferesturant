import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Bell, BellRing, CheckCheck, Trash2, Check, ArrowLeft, 
  ExternalLink, UtensilsCrossed, MessageSquare, AlertTriangle, 
  TrendingUp, Sparkles, Filter, Clock, ChevronRight
} from 'lucide-react';
import { db, SystemNotification, NotificationType } from '../../lib/db';
import { 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  deleteNotification, 
  clearAllNotifications 
} from '../../lib/chatNotificationService';
import { format as formatJalali } from 'date-fns-jalali';
import { TabType } from '../../context/AuthContext';

interface NotificationsScreenProps {
  onNavigateTab?: (tab: TabType) => void;
}

export default function NotificationsScreen({ onNavigateTab }: NotificationsScreenProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const notifications = useLiveQuery(async () => {
    let query = db.systemNotifications.orderBy('createdAt').reverse();
    const all = await query.toArray();

    return all.filter(n => {
      if (unreadOnly && n.isRead) return false;
      if (filterType !== 'all' && n.type !== filterType) return false;
      return true;
    });
  }, [filterType, unreadOnly]);

  const allNotifications = useLiveQuery(() => db.systemNotifications.toArray());
  const unreadCount = allNotifications?.filter(n => !n.isRead).length || 0;

  const handleActionClick = async (notif: SystemNotification) => {
    if (!notif.isRead && notif.id) {
      await markNotificationAsRead(notif.id);
    }
    if (notif.targetTab && onNavigateTab) {
      onNavigateTab(notif.targetTab as TabType);
    }
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
          label: 'سفارش آنلاین',
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
              <h1 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight">مرکز اعلان‌ها و هشدارهای سیستم</h1>
              {unreadCount > 0 && (
                <span className="bg-[#FF3B30] text-white text-[11px] font-bold px-2 py-0.5 rounded-full font-mono shadow-xs">
                  {unreadCount} خوانده‌نشده
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 font-normal mt-0.5">
              درخواست‌های زنده گارسون سر میز، سفارشات شبکه، هشدارهای انبار و پیام‌های پرسنل
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
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
                ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] font-semibold'
                : 'text-neutral-500 hover:text-neutral-800 font-medium'
            }`}
          >
            همه ({allNotifications?.length || 0})
          </button>

          <button
            onClick={() => setFilterType('waiter_call')}
            className={`px-3 py-1 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              filterType === 'waiter_call'
                ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] font-semibold'
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
                ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] font-semibold'
                : 'text-neutral-500 hover:text-neutral-800 font-medium'
            }`}
          >
            <MessageSquare size={12} className="text-[#007AFF]" />
            <span>گفتگو</span>
          </button>

          <button
            onClick={() => setFilterType('new_order')}
            className={`px-3 py-1 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              filterType === 'new_order'
                ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] font-semibold'
                : 'text-neutral-500 hover:text-neutral-800 font-medium'
            }`}
          >
            <Sparkles size={12} className="text-[#34C759]" />
            <span>سفارشات</span>
          </button>

          <button
            onClick={() => setFilterType('low_stock')}
            className={`px-3 py-1 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              filterType === 'low_stock'
                ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] font-semibold'
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
        {notifications && notifications.length > 0 ? (
          notifications.map(item => {
            const badge = getTypeBadge(item.type);
            const timeStr = item.createdAt 
              ? formatJalali(new Date(item.createdAt), 'yyyy/MM/dd HH:mm')
              : '';

            return (
              <div
                key={item.id}
                className={`group rounded-3xl border transition-all duration-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  !item.isRead
                    ? 'bg-white border-[#007AFF]/30 shadow-[0_4px_16px_rgba(0,122,255,0.06)] ring-1 ring-[#007AFF]/20'
                    : 'bg-white/80 border-black/[0.06] hover:bg-white hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
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

                    <h3 className={`text-sm ${!item.isRead ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-700'}`}>
                      {item.title}
                    </h3>
                    <p className="text-xs text-neutral-600 mt-1 leading-relaxed break-words font-normal">
                      {item.message}
                    </p>

                    {item.metadata?.tableNumber && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs bg-[#FF9500]/10 text-[#FF9500] font-bold px-2.5 py-1 rounded-xl border border-[#FF9500]/20 font-mono">
                        <UtensilsCrossed size={12} />
                        <span>میز شماره {item.metadata.tableNumber}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: Action buttons */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end">
                  {item.targetTab && (
                    <button
                      onClick={() => handleActionClick(item)}
                      className="px-3.5 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white text-xs font-semibold flex items-center gap-1.5 shadow-[0_2px_8px_rgba(0,122,255,0.25)] transition-all active:scale-95 cursor-pointer"
                    >
                      <span>مشاهده و اقدام</span>
                      <ChevronRight size={13} className="rotate-180" />
                    </button>
                  )}

                  {!item.isRead && (
                    <button
                      onClick={() => item.id && markNotificationAsRead(item.id)}
                      className="p-2 rounded-xl text-neutral-400 hover:text-[#007AFF] hover:bg-[#007AFF]/10 transition-all cursor-pointer active:scale-90"
                      title="علامت‌گذاری به عنوان خوانده شده"
                    >
                      <Check size={15} />
                    </button>
                  )}

                  <button
                    onClick={() => item.id && deleteNotification(item.id)}
                    className="p-2 rounded-xl text-neutral-300 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-all cursor-pointer active:scale-90"
                    title="حذف این اعلان"
                  >
                    <Trash2 size={15} />
                  </button>
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
              تمامی هشدارهای جدید، درخواست‌های گارسون از سر میزها و پیام‌های دریافتی در این مرکز نمایش داده می‌شوند.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
