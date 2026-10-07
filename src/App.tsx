/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Store, UtensilsCrossed, BarChart3, Settings, Users, Calculator, 
  ShieldCheck, LogOut, UserCheck, ChevronDown, Menu as MenuIcon, X,
  QrCode, Tablet, Smartphone
} from 'lucide-react';
import POSScreen from './components/POS/POSScreen';
import MenuManagerScreen from './components/MenuManager/MenuManagerScreen';
import ReportsScreen from './components/Reports/ReportsScreen';
import SettingsScreen from './components/Settings/SettingsScreen';
import CustomersScreen from './components/Customers/CustomersScreen';
import AccountingScreen from './components/Accounting/AccountingScreen';
import UsersScreen from './components/Users/UsersScreen';
import TablesScreen from './components/Tables/TablesScreen';
import CustomerMenuView from './components/CustomerMenu/CustomerMenuView';
import WaiterTabletScreen from './components/WaiterTablet/WaiterTabletScreen';
import LoginScreen from './components/Auth/LoginScreen';
import SwitchUserModal from './components/Auth/SwitchUserModal';
import MobileAppQrModal from './components/Common/MobileAppQrModal';
import PWAInstallBanner from './components/Common/PWAInstallBanner';
import { AuthProvider, useAuth, TabType, ROLE_LABELS } from './context/AuthContext';
import { db, ensureDefaultInventoryData, ensureDefaultTables } from './lib/db';

function MainApp() {
  const { currentUser, isLoading, logout, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const [isSwitchUserOpen, setIsSwitchUserOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTabletMode, setIsTabletMode] = useState(false);
  const [isMobileQrOpen, setIsMobileQrOpen] = useState(false);

  // Initialize default settings and inventory on first load
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
            requireCustomerPhone: false
          });
        }
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

  const navItems: { tab: TabType; icon: any; label: string; mobileOnly?: boolean }[] = [
    { tab: 'pos', icon: Store, label: 'صندوق' },
    { tab: 'tables', icon: QrCode, label: 'میز و بارکد' },
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
    onClickExtra
  }: { 
    tab: TabType; 
    icon: any; 
    label: string; 
    mobile?: boolean;
    onClickExtra?: () => void;
    key?: React.Key;
  }) => (
    <button
      onClick={() => {
        setActiveTab(tab);
        if (onClickExtra) onClickExtra();
      }}
      className={`flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${
        mobile 
          ? `flex-1 py-1.5 h-full ${activeTab === tab ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700'}`
          : `p-3 rounded-2xl w-20 h-20 shrink-0 ${
              activeTab === tab
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 font-bold'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`
      }`}
    >
      <Icon size={mobile ? 20 : 26} className={mobile ? 'mb-0.5' : 'mb-1.5'} />
      <span className={mobile ? 'text-[10px] tracking-tight' : 'text-xs font-medium'}>{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen max-w-full bg-slate-100 overflow-hidden" dir="rtl">
      
      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden md:flex w-28 bg-white border-l border-slate-200 flex-col items-center py-5 justify-between shadow-xs z-20 shrink-0">
        
        {/* Top: Logo & Nav items */}
        <div className="flex flex-col items-center w-full gap-2">
          {/* Logo */}
          <div className="mb-4 flex flex-col items-center gap-1 shrink-0">
            <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 shadow-xs bg-white flex items-center justify-center p-0.5">
              <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#0d9488" />
                  </linearGradient>
                  <filter id="logo-glow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#2563eb" floodOpacity="0.2" />
                  </filter>
                </defs>
                <rect width="100" height="100" rx="20" fill="url(#logo-grad)" />
                <circle cx="50" cy="50" r="32" stroke="white" strokeWidth="2.5" strokeOpacity="0.15" strokeDasharray="6 4" />
                <path 
                  d="M50 28 L68 68 H58 L50 48 L42 68 H32 L50 28 Z" 
                  fill="white" 
                  filter="url(#logo-glow)"
                />
                <path 
                  d="M45 58 H55" 
                  stroke="white" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                />
                <circle cx="50" cy="42" r="3" fill="#38bdf8" />
              </svg>
            </div>
            <span className="text-[11px] font-bold text-blue-600">آرکا پوز</span>
          </div>

          {/* Navigation Items */}
          <div className="flex flex-col items-center gap-2 overflow-y-auto max-h-[calc(100vh-230px)] no-scrollbar py-1">
            {permittedNavItems.map(item => (
              <NavButton key={item.tab} tab={item.tab} icon={item.icon} label={item.label} />
            ))}
          </div>
        </div>

        {/* Bottom: Current User Info & Quick Actions */}
        <div className="w-full px-2 flex flex-col items-center pt-3 border-t border-slate-100 gap-2">
          {/* Quick Mobile PWA QR Code */}
          <button
            onClick={() => setIsMobileQrOpen(true)}
            className="w-full py-1.5 px-1 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200/80 text-blue-700 flex flex-col items-center gap-0.5 text-[10px] font-bold transition-all cursor-pointer"
            title="نمایش بارکد QR اتصال فوری گوشی و وب‌اپلیکیشن (PWA)"
          >
            <Smartphone size={15} />
            <span>اتصال گوشی</span>
          </button>

          {/* Quick Tablet Mode Switch */}
          <button
            onClick={() => setIsTabletMode(true)}
            className="w-full py-1.5 px-1 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200/80 text-slate-700 hover:text-blue-700 flex flex-col items-center gap-0.5 text-[10px] font-bold transition-all cursor-pointer"
            title="حالت سفارش‌گیری تبلت / موبایل پرسنل"
          >
            <Tablet size={15} />
            <span>حالت تبلت</span>
          </button>

          <button
            onClick={() => setIsSwitchUserOpen(true)}
            title="تغییر کاربر فعال یا قفل سیستم"
            className="w-full p-2 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 flex flex-col items-center gap-1 transition-all cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center group-hover:scale-105 transition-transform">
              {(currentUser?.name || currentUser?.username || 'کاربر').charAt(0)}
            </div>
            <span className="text-[11px] font-bold text-slate-700 truncate max-w-[80px]">
              {(currentUser?.name || currentUser?.username || 'کاربر').split(' ')[0]}
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 font-medium">
              {currentUser?.role ? ROLE_LABELS[currentUser.role] : ''}
            </span>
          </button>

          <div className="flex items-center justify-center gap-1 w-full">
            <button
              onClick={() => setIsSwitchUserOpen(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
              title="تغییر کاربر"
            >
              <UserCheck size={16} />
            </button>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="خروج از حساب"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

      </aside>

      {/* Mobile Top Header */}
      <header className="flex md:hidden bg-white border-b border-slate-200 h-14 px-4 items-center justify-between shadow-xs z-30 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            aria-label="منو"
          >
            {isMobileMenuOpen ? <X size={20} /> : <MenuIcon size={20} />}
          </button>
          <span className="font-black text-sm text-slate-800">سامانه فروشگاهی آرکا</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMobileQrOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 text-blue-700 text-xs font-bold border border-slate-200"
            title="بارکد اتصال گوشی / PWA"
          >
            <Smartphone size={13} />
            <span>PWA</span>
          </button>

          <button
            onClick={() => setIsTabletMode(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200"
          >
            <Tablet size={13} />
            <span>تبلت</span>
          </button>

          {/* Current user mobile pill */}
          <button
            onClick={() => setIsSwitchUserOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center">
              {(currentUser?.name || currentUser?.username || 'کاربر').charAt(0)}
            </div>
            <span className="text-[11px]">{(currentUser?.name || currentUser?.username || 'کاربر').split(' ')[0]}</span>
          </button>
        </div>
      </header>

      {/* Mobile Extended Drawer Menu */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div 
            className="w-72 bg-white h-full p-5 flex flex-col justify-between shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                    آ
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800">نرم‌افزار آرکا</h3>
                    <p className="text-[10px] text-slate-500">منوی کامل دسترسی‌ها</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="py-4 space-y-1">
                {permittedNavItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      onClick={() => {
                        setActiveTab(item.tab);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSwitchUserOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                <UserCheck size={16} />
                <span>تغییر کاربر فعال</span>
              </button>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer"
              >
                <LogOut size={16} />
                <span>خروج از حساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-full flex flex-col h-[calc(100vh-7.5rem)] md:h-full overflow-hidden">
        {activeTab === 'pos' && hasPermission('pos') && <POSScreen />}
        {activeTab === 'tables' && hasPermission('tables') && <TablesScreen onLoadOrderToPos={() => setActiveTab('pos')} />}
        {activeTab === 'menu' && hasPermission('menu') && <MenuManagerScreen />}
        {activeTab === 'accounting' && hasPermission('accounting') && <AccountingScreen />}
        {activeTab === 'reports' && hasPermission('reports') && <ReportsScreen />}
        {activeTab === 'customers' && hasPermission('customers') && <CustomersScreen />}
        {activeTab === 'users' && hasPermission('users') && <UsersScreen />}
        {activeTab === 'settings' && hasPermission('settings') && <SettingsScreen />}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="flex md:hidden bg-white border-t border-slate-200 h-16 shrink-0 z-30 justify-around items-center px-1 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] w-full">
        {permittedNavItems.slice(0, 5).map(item => (
          <NavButton 
            key={item.tab} 
            tab={item.tab} 
            icon={item.icon} 
            label={item.label} 
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
    return <CustomerMenuView tableNumber={tableParam ? parseInt(tableParam, 10) : undefined} />;
  }

  // Staff Waiter Tablet direct link (?mode=waiter)
  if (mode === 'waiter') {
    return (
      <AuthProvider>
        <WaiterTabletScreen onBackToPos={() => { window.location.href = window.location.pathname; }} />
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
