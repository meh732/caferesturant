import React, { useState, useEffect } from 'react';
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
          icon: <UtensilsCrossed size={16} className="text-amber-600 animate-pulse" />,
          label: 'درخواست گارسون',
          bg: 'bg-amber-100 text-amber-800 border-amber-300',
          dot: 'bg-amber-500'
        };
      case 'chat_message':
        return {
          icon: <MessageSquare size={16} className="text-blue-600" />,
          label: 'پیام گفتگو',
          bg: 'bg-blue-100 text-blue-800 border-blue-300',
          dot: 'bg-blue-500'
        };
      case 'new_order':
        return {
          icon: <Sparkles size={16} className="text-emerald-600" />,
          label: 'سفارش آنلاین',
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          dot: 'bg-emerald-500'
        };
      case 'low_stock':
        return {
          icon: <AlertTriangle size={16} className="text-rose-600" />,
          label: 'کسری انبار',
          bg: 'bg-rose-100 text-rose-800 border-rose-300',
          dot: 'bg-rose-500'
        };
      case 'report_shared':
        return {
          icon: <TrendingUp size={16} className="text-indigo-600" />,
          label: 'گزارش ارسالی',
          bg: 'bg-indigo-100 text-indigo-800 border-indigo-300',
          dot: 'bg-indigo-500'
        };
      default:
        return {
          icon: <Bell size={16} className="text-purple-600" />,
          label: 'سیستمی',
          bg: 'bg-purple-100 text-purple-800 border-purple-300',
          dot: 'bg-purple-500'
        };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden" dir="rtl">
      
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/25">
            <BellRing size={24} className="animate-wiggle" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-800">مرکز اعلان‌ها و هشدارهای سیستم</h1>
              {unreadCount > 0 && (
                <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-bounce">
                  {unreadCount} خوانده‌نشده
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              درخواست‌های زنده گارسون سر میز، سفارشات ثبت‌شده، هشدارهای انبار و پیام‌های پرسنل
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllNotificationsAsRead()}
              className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-blue-200"
            >
              <CheckCheck size={16} />
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
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="پاک کردن تمامی اعلان‌ها"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Filter Chips Bar */}
      <div className="bg-white/80 backdrop-blur-xs border-b border-slate-200 px-6 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
        <Filter size={15} className="text-slate-400 shrink-0 ml-1" />
        
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            filterType === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          همه ({allNotifications?.length || 0})
        </button>

        <button
          onClick={() => setFilterType('waiter_call')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            filterType === 'waiter_call'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
          }`}
        >
          <UtensilsCrossed size={14} />
          <span>درخواست‌های گارسون</span>
        </button>

        <button
          onClick={() => setFilterType('chat_message')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            filterType === 'chat_message'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
          }`}
        >
          <MessageSquare size={14} />
          <span>پیام‌های گفتگو</span>
        </button>

        <button
          onClick={() => setFilterType('new_order')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            filterType === 'new_order'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          }`}
        >
          <Sparkles size={14} />
          <span>سفارشات جدید</span>
        </button>

        <button
          onClick={() => setFilterType('low_stock')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            filterType === 'low_stock'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
          }`}
        >
          <AlertTriangle size={14} />
          <span>کسری انبار</span>
        </button>

        <div className="mr-auto flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-semibold">فقط خوانده‌نشده‌ها</span>
          </label>
        </div>
      </div>

      {/* Notifications List Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {notifications && notifications.length > 0 ? (
          notifications.map(item => {
            const badge = getTypeBadge(item.type);
            const timeStr = item.createdAt 
              ? formatJalali(new Date(item.createdAt), 'yyyy/MM/dd HH:mm')
              : '';

            return (
              <div
                key={item.id}
                className={`group rounded-2xl border transition-all duration-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  !item.isRead
                    ? 'bg-white border-blue-200 shadow-md shadow-blue-500/5 ring-1 ring-blue-100'
                    : 'bg-white/70 border-slate-200/80 hover:bg-white hover:border-slate-300'
                }`}
              >
                {/* Left side: Type Badge, Text, Meta */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${badge.bg}`}>
                    {badge.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.bg}`}>
                        {badge.label}
                      </span>
                      {!item.isRead && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
                          جدید
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mr-auto">
                        <Clock size={12} />
                        {timeStr}
                      </span>
                    </div>

                    <h3 className={`text-sm ${!item.isRead ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">
                      {item.message}
                    </p>

                    {item.metadata?.tableNumber && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-900 font-bold px-2.5 py-1 rounded-lg border border-amber-200">
                        <UtensilsCrossed size={13} />
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
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-transform active:scale-95 cursor-pointer"
                    >
                      <span>مشاهده و اقدام</span>
                      <ChevronRight size={14} className="rotate-180" />
                    </button>
                  )}

                  {!item.isRead && (
                    <button
                      onClick={() => item.id && markNotificationAsRead(item.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                      title="علامت‌گذاری به عنوان خوانده شده"
                    >
                      <Check size={16} />
                    </button>
                  )}

                  <button
                    onClick={() => item.id && deleteNotification(item.id)}
                    className="p-2 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="حذف این اعلان"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="h-96 flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Bell size={28} />
            </div>
            <h3 className="font-bold text-slate-700 text-sm">هیچ اعلانی یافت نشد</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              تمامی هشدارهای جدید، درخواست‌های گارسون از سر میزها و پیام‌های دریافتی در این مرکز نمایش داده می‌شوند.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
