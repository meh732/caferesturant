/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Store, UtensilsCrossed, BarChart3, Settings, Users, Calculator, 
  ShieldCheck, LogOut, UserCheck, ChevronDown, Menu as MenuIcon, X,
  QrCode, Tablet, Smartphone, MessageSquare, Bell
} from 'lucide-react';
import POSScreen from './components/POS/POSScreen';
import MenuManagerScreen from './components/MenuManager/MenuManagerScreen';
import ReportsScreen from './components/Reports/ReportsScreen';
import SettingsScreen from './components/Settings/SettingsScreen';
import CustomersScreen from './components/Customers/CustomersScreen';
import AccountingScreen from './components/Accounting/AccountingScreen';
import UsersScreen from './components/Users/UsersScreen';
import TablesScreen from './components/Tables/TablesScreen';
import ChatScreen from './components/Chat/ChatScreen';
import NotificationsScreen from './components/Notifications/NotificationsScreen';
import CustomerMenuView from './components/CustomerMenu/CustomerMenuView';
import WaiterTabletScreen from './components/WaiterTablet/WaiterTabletScreen';
import LoginScreen from './components/Auth/LoginScreen';
import SwitchUserModal from './components/Auth/SwitchUserModal';
import MobileAppQrModal from './components/Common/MobileAppQrModal';
import PWAInstallBanner from './components/Common/PWAInstallBanner';
import { AuthProvider, useAuth, TabType, ROLE_LABELS } from './context/AuthContext';
import { db, ensureDefaultInventoryData, ensureDefaultTables } from './lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAutoBotBackup } from './hooks/useAutoBotBackup';
import { initLanServer, getNetworkInfo } from './lib/networkSync';

function MainApp() {
  const { currentUser, isLoading, logout, hasPermission } = useAuth();
  useAutoBotBackup(); // Background automated hourly database backup to Telegram & Bale bots

  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const [isSwitchUserOpen, setIsSwitchUserOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTabletMode, setIsTabletMode] = useState(false);
  const [isMobileQrOpen, setIsMobileQrOpen] = useState(false);

  // Live queries for real-time notification & chat unread badges
  const unreadNotificationsCount = useLiveQuery(
    () => db.systemNotifications.filter(n => !n.isRead).count()
  ) || 0;

  // Always reset window scroll on tab change to prevent any layout offset
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  const unreadChatCount = useLiveQuery(async () => {
    try {
      const lastRead = Number(localStorage.getItem('arka_last_read_chat_time') || 0);
      return await db.chatMessages.filter(m => new Date(m.createdAt).getTime() > lastRead).count();
    } catch {
      return 0;
    }
  }) || 0;

  // Initialize default settings and inventory on first load + start LAN server
  useEffect(() => {
    const initSystem = async () => {
      try {
        const settingsCount = await db.settings.count();
        if (settingsCount === 0) {
          await db.settings.add({
            restaurantName: 'فروشگاه من',
            phone: '',
            address: '',
            website: '',
            instagram: '',
            telegram: '',
            logoUrl: '',
            taxEnabled: false,
            taxPercentage: 9,
            requireCustomerPhone: false,
            localServerPort: 3000
          });
        }
        const currentSettings = await db.settings.toCollection().first();
        const activePort = currentSettings?.localServerPort || 3000;
        initLanServer(activePort);
        getNetworkInfo(activePort).then(info => {
          const valid = (info?.localIps || []).filter(
            ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.startsWith('169.254.') && !ip.startsWith('192.168.56.')
          );
          if (valid.length > 0) {
            localStorage.setItem('arka_lan_ip', valid[0]);
          }
        }).catch(() => {});

        await ensureDefaultTables();
        await ensureDefaultInventoryData();
      } catch (err) {
        console.error('Failed to initialize default system data:', err);
      }
    };
    initSystem();
  }, []);

  // Ensure current active tab is permitted for current user
  useEffect(() => {
    if (currentUser && !hasPermission(activeTab)) {
      if (hasPermission('pos')) {
        setActiveTab('pos');
      } else if (hasPermission('tables')) {
        setActiveTab('tables');
      } else if (hasPermission('accounting')) {
        setActiveTab('accounting');
      } else if (hasPermission('reports')) {
        setActiveTab('reports');
      } else if (hasPermission('menu')) {
        setActiveTab('menu');
      } else {
        setActiveTab('pos');
      }
    }
  }, [currentUser, activeTab, hasPermission]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white font-sans" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-slate-300">در حال بارگذاری سیستم آرکا...</span>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Login Screen
  if (!currentUser) {
    return <LoginScreen />;
  }

  // Waiter Tablet Mode
  if (isTabletMode || currentUser.role === 'waiter') {
    return (
      <WaiterTabletScreen 
        onBackToPos={currentUser.role === 'waiter' ? undefined : () => setIsTabletMode(false)} 
      />
    );
  }

  const navItems: { tab: TabType; icon: any; label: string; badge?: number; mobileOnly?: boolean }[] = [
    { tab: 'pos', icon: Store, label: 'صندوق' },
    { tab: 'tables', icon: QrCode, label: 'میز و بارکد' },
    { tab: 'chat', icon: MessageSquare, label: 'گفتگو', badge: unreadChatCount },
    { tab: 'notifications', icon: Bell, label: 'اعلان‌ها', badge: unreadNotificationsCount },
    { tab: 'menu', icon: UtensilsCrossed, label: 'منو' },
    { tab: 'accounting', icon: Calculator, label: 'حسابداری' },
    { tab: 'reports', icon: BarChart3, label: 'گزارشات' },
    { tab: 'customers', icon: Users, label: 'مشتریان' },
    { tab: 'users', icon: ShieldCheck, label: 'کاربران' },
    { tab: 'settings', icon: Settings, label: 'تنظیمات' },
  ];

  const permittedNavItems = navItems.filter(item => hasPermission(item.tab));

  const NavButton = ({ 
    tab, 
    icon: Icon, 
    label, 
    mobile,
    badge,
    onClickExtra
  }: { 
    tab: TabType; 
    icon: any; 
    label: string; 
    mobile?: boolean;
    badge?: number;
    onClickExtra?: () => void;
    key?: React.Key;
  }) => (
    <button
      onClick={() => {
        setActiveTab(tab);
        if (tab === 'chat') {
          localStorage.setItem('arka_last_read_chat_time', Date.now().toString());
        }
        if (onClickExtra) onClickExtra();
      }}
      className={`relative flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
        mobile 
          ? `flex-1 py-1.5 h-full active:scale-95 ${activeTab === tab ? 'text-[#007AFF] font-semibold' : 'text-neutral-400 hover:text-neutral-700 font-medium'}`
          : `py-1.5 px-1 rounded-xl w-full min-h-[48px] shrink-0 active:scale-[0.95] ${
              activeTab === tab
                ? 'bg-white text-neutral-950 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] border border-black/[0.04] font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/[0.03] font-medium'
            }`
      }`}
    >
      <div className="relative">
        <Icon 
          size={mobile ? 20 : 19} 
          className={`${mobile ? 'mb-0.5' : 'mb-0.5'} ${activeTab === tab ? 'text-[#007AFF] stroke-[2.2]' : 'stroke-[1.8]'}`} 
        />
        {!!badge && badge > 0 && (
          <span className={`absolute -top-1 -right-2 min-w-[16px] h-[16px] px-1 text-[9px] font-bold flex items-center justify-center rounded-full text-white shadow-xs ${
            tab === 'notifications' ? 'bg-[#FF3B30] animate-pulse' : 'bg-[#007AFF]'
          }`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={mobile ? 'text-[10px] tracking-tight' : 'text-[10px] tracking-tight leading-tight'}>{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col md:flex-row h-screen h-[100dvh] w-screen max-w-full bg-[#F5F5F7] overflow-hidden" dir="rtl">
      
      {/* Sidebar Navigation (Desktop) - Apple Glass Material */}
      <aside className="hidden md:flex w-22 bg-white/80 backdrop-blur-2xl border-l border-black/[0.06] flex-col items-center py-2.5 justify-between shadow-[0_0_20px_rgba(0,0,0,0.02)] z-20 shrink-0 h-full max-h-screen overflow-hidden">
        
        {/* Top: Logo & Nav items */}
        <div className="flex flex-col items-center w-full min-h-0 flex-1 overflow-hidden">
          {/* Logo Squircle */}
          <div className="mb-2 flex flex-col items-center gap-0.5 shrink-0">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-black/[0.06] shadow-[0_4px_12px_rgba(0,122,255,0.2)] bg-gradient-to-tr from-[#007AFF] to-[#30B0C7] flex items-center justify-center p-0.5 transition-transform active:scale-95 cursor-pointer">
              <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="32" stroke="white" strokeWidth="2.5" strokeOpacity="0.2" strokeDasharray="6 4" />
                <path 
                  d="M50 28 L68 68 H58 L50 48 L42 68 H32 L50 28 Z" 
                  fill="white" 
                />
                <path 
                  d="M45 58 H55" 
                  stroke="white" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                />
                <circle cx="50" cy="42" r="3" fill="#ffffff" />
              </svg>
            </div>
            <span className="text-[9px] font-semibold text-neutral-800 tracking-tight">آرکا پوز</span>
          </div>

          {/* Navigation Items */}
          <div className="flex-1 min-h-0 flex flex-col items-center gap-1 overflow-y-auto w-full px-1.5 scrollbar-thin py-0.5">
            {permittedNavItems.map(item => (
              <NavButton 
                key={item.tab} 
                tab={item.tab} 
                icon={item.icon} 
                label={item.label} 
                badge={item.badge}
              />
            ))}
          </div>
        </div>

        {/* Bottom: Current User Info & Quick Actions */}
        <div className="w-full px-1.5 flex flex-col items-center pt-2 border-t border-black/[0.04] gap-1 shrink-0">
          {/* Quick buttons: Mobile QR & Tablet mode in 2 columns */}
          <div className="grid grid-cols-2 gap-1 w-full">
            <button
              onClick={() => setIsMobileQrOpen(true)}
              className="py-1 px-0.5 rounded-lg bg-black/[0.03] hover:bg-black/[0.06] active:scale-95 border border-black/[0.04] text-neutral-700 flex flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-all cursor-pointer"
              title="بارکد اتصال گوشی و وب‌اپلیکیشن (PWA)"
            >
              <Smartphone size={12} className="text-[#007AFF]" />
              <span className="truncate">موبایل</span>
            </button>
            <button
              onClick={() => setIsTabletMode(true)}
              className="py-1 px-0.5 rounded-lg bg-black/[0.03] hover:bg-black/[0.06] active:scale-95 border border-black/[0.04] text-neutral-700 flex flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-all cursor-pointer"
              title="حالت سفارش‌گیری تبلت"
            >
              <Tablet size={12} className="text-[#5856D6]" />
              <span className="truncate">تبلت</span>
            </button>
          </div>

          {/* Apple ID Profile Card */}
          <button
            onClick={() => setIsSwitchUserOpen(true)}
            title="تغییر کاربر فعال یا قفل سیستم"
            className="w-full p-1.5 rounded-xl bg-white/70 hover:bg-white active:scale-95 border border-black/[0.06] shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer group"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white text-[10px] font-semibold flex items-center justify-center shadow-xs shrink-0">
              {(currentUser?.name || currentUser?.username || 'کاربر').charAt(0)}
            </div>
            <div className="flex flex-col text-right min-w-0">
              <span className="text-[10px] font-semibold text-neutral-800 truncate max-w-[48px] leading-tight">
                {(currentUser?.name || currentUser?.username || 'کاربر').split(' ')[0]}
              </span>
              <span className="text-[8px] text-[#007AFF] font-medium leading-tight truncate">
                {currentUser?.role ? ROLE_LABELS[currentUser.role] : ''}
              </span>
            </div>
          </button>

          <div className="flex items-center justify-center gap-1 w-full">
            <button
              onClick={() => setIsSwitchUserOpen(true)}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-800 hover:bg-black/[0.04] active:scale-90 transition-all cursor-pointer"
              title="تغییر کاربر"
            >
              <UserCheck size={14} />
            </button>
            <button
              onClick={logout}
              className="p-1 rounded-lg text-neutral-400 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 active:scale-90 transition-all cursor-pointer"
              title="خروج از حساب"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>

      </aside>

      {/* Mobile Top Header - Apple Glass */}
      <header className="flex md:hidden bg-white/85 backdrop-blur-xl border-b border-black/[0.06] h-14 px-3 items-center justify-between shadow-2xs z-30 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-neutral-700 hover:bg-black/[0.04] active:scale-95 rounded-xl cursor-pointer transition-all"
            aria-label="منو"
          >
            {isMobileMenuOpen ? <X size={20} /> : <MenuIcon size={20} />}
          </button>
          <span className="font-semibold text-xs text-neutral-900 truncate max-w-[110px]">آرکا پوز</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick Notifications Button with Badge */}
          <button
            onClick={() => setActiveTab('notifications')}
            className={`relative p-2 rounded-xl border transition-all cursor-pointer active:scale-95 ${
              activeTab === 'notifications'
                ? 'bg-[#007AFF] text-white border-[#007AFF] shadow-xs'
                : 'bg-black/[0.03] text-neutral-700 hover:bg-black/[0.06] border-black/[0.04]'
            }`}
            title="اعلان‌ها و رویدادهای سیستم"
          >
            <Bell size={16} />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 text-[9px] font-bold bg-[#FF3B30] text-white rounded-full flex items-center justify-center animate-pulse shadow-xs">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Quick Chat Button with Badge */}
          <button
            onClick={() => {
              setActiveTab('chat');
              localStorage.setItem('arka_last_read_chat_time', Date.now().toString());
            }}
            className={`relative p-2 rounded-xl border transition-all cursor-pointer active:scale-95 ${
              activeTab === 'chat'
                ? 'bg-[#007AFF] text-white border-[#007AFF] shadow-xs'
                : 'bg-black/[0.03] text-neutral-700 hover:bg-black/[0.06] border-black/[0.04]'
            }`}
            title="گفتگو و تبادل پیام پرسنل"
          >
            <MessageSquare size={16} />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 text-[9px] font-bold bg-[#007AFF] text-white rounded-full flex items-center justify-center shadow-xs">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsMobileQrOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/[0.03] text-[#007AFF] text-[11px] font-semibold border border-black/[0.04] active:scale-95 transition-all"
            title="بارکد اتصال گوشی / PWA"
          >
            <Smartphone size={13} />
            <span>PWA</span>
          </button>

          <button
            onClick={() => setIsTabletMode(true)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-[#007AFF]/10 text-[#007AFF] text-[11px] font-semibold border border-[#007AFF]/20 active:scale-95 transition-all"
            title="سفارش‌گیری تبلت"
          >
            <Tablet size={13} />
          </button>

          {/* Current user mobile pill */}
          <button
            onClick={() => setIsSwitchUserOpen(true)}
            className="flex items-center gap-1 p-1 rounded-full bg-white border border-black/[0.06] shadow-2xs cursor-pointer active:scale-95 transition-all"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white text-[10px] font-semibold flex items-center justify-center">
              {(currentUser?.name || currentUser?.username || 'کاربر').charAt(0)}
            </div>
          </button>
        </div>
      </header>

      {/* Mobile Extended Drawer Menu (Apple Sheet Style) */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-md flex md:hidden animate-in fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div 
            className="w-72 bg-white/95 backdrop-blur-2xl h-full p-5 flex flex-col justify-between shadow-2xl border-l border-black/[0.06]"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-black/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#30B0C7] text-white font-semibold flex items-center justify-center text-sm shadow-sm">
                    آ
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-neutral-900">نرم‌افزار آرکا</h3>
                    <p className="text-[10px] text-neutral-500 font-normal">منوی کامل دسترسی‌ها</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-xl active:scale-90 transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="py-4 space-y-1.5 overflow-y-auto max-h-[calc(100vh-200px)]">
                {permittedNavItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      onClick={() => {
                        setActiveTab(item.tab);
                        if (item.tab === 'chat') {
                          localStorage.setItem('arka_last_read_chat_time', Date.now().toString());
                        }
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all cursor-pointer active:scale-[0.98] ${
                        isActive
                          ? 'bg-[#007AFF] text-white font-semibold shadow-[0_2px_8px_rgba(0,122,255,0.3)]'
                          : 'text-neutral-700 hover:bg-black/[0.04] font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} className={isActive ? 'text-white' : 'text-neutral-500'} />
                        <span>{item.label}</span>
                      </div>
                      {!!item.badge && item.badge > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive 
                            ? 'bg-white text-[#007AFF]' 
                            : item.tab === 'notifications' 
                              ? 'bg-[#FF3B30] text-white' 
                              : 'bg-[#007AFF] text-white'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-black/[0.06] space-y-2">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSwitchUserOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-black/[0.04] hover:bg-black/[0.07] text-neutral-800 text-xs font-semibold transition-all cursor-pointer active:scale-[0.98]"
              >
                <UserCheck size={16} />
                <span>تغییر کاربر فعال</span>
              </button>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FF3B30]/10 hover:bg-[#FF3B30]/15 text-[#FF3B30] text-xs font-semibold transition-all cursor-pointer active:scale-[0.98]"
              >
                <LogOut size={16} />
                <span>خروج از حساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-full min-h-0 flex flex-col overflow-hidden bg-[#F5F5F7]">
        {activeTab === 'pos' && hasPermission('pos') && <POSScreen />}
        {activeTab === 'tables' && hasPermission('tables') && <TablesScreen onLoadOrderToPos={() => setActiveTab('pos')} />}
        {activeTab === 'chat' && hasPermission('chat') && <ChatScreen />}
        {activeTab === 'notifications' && hasPermission('notifications') && (
          <NotificationsScreen onNavigateTab={(tab) => setActiveTab(tab)} />
        )}
        {activeTab === 'menu' && hasPermission('menu') && <MenuManagerScreen />}
        {activeTab === 'accounting' && hasPermission('accounting') && <AccountingScreen />}
        {activeTab === 'reports' && hasPermission('reports') && <ReportsScreen />}
        {activeTab === 'customers' && hasPermission('customers') && <CustomersScreen />}
        {activeTab === 'users' && hasPermission('users') && <UsersScreen />}
        {activeTab === 'settings' && hasPermission('settings') && <SettingsScreen />}
      </main>

      {/* Bottom Navigation (Mobile iOS Tab Bar Style) */}
      <nav className="flex md:hidden bg-white/85 backdrop-blur-xl border-t border-black/[0.06] h-16 shrink-0 z-30 justify-around items-center px-1 shadow-[0_-2px_12px_rgba(0,0,0,0.02)] w-full">
        {permittedNavItems.slice(0, 5).map(item => (
          <NavButton 
            key={item.tab} 
            tab={item.tab} 
            icon={item.icon} 
            label={item.label} 
            badge={item.badge}
            mobile 
          />
        ))}
      </nav>

      {/* Switch User Modal */}
      <SwitchUserModal
        isOpen={isSwitchUserOpen}
        onClose={() => setIsSwitchUserOpen(false)}
      />

      {/* Mobile App & PWA QR Modal */}
      <MobileAppQrModal 
        isOpen={isMobileQrOpen}
        onClose={() => setIsMobileQrOpen(false)}
      />

      {/* PWA In-App Install Banner */}
      <PWAInstallBanner />

    </div>
  );
}

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode');
  const tableParam = urlParams.get('table');

  // Customer Digital Menu via QR code (?mode=menu or ?table=X)
  if (mode === 'menu' || (tableParam && mode !== 'waiter')) {
    return (
      <>
        <CustomerMenuView tableNumber={tableParam ? parseInt(tableParam, 10) : undefined} />
        <PWAInstallBanner />
      </>
    );
  }

  // Staff Waiter Tablet direct link (?mode=waiter)
  if (mode === 'waiter') {
    return (
      <AuthProvider>
        <WaiterTabletScreen onBackToPos={() => { window.location.href = window.location.pathname; }} />
        <PWAInstallBanner />
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
