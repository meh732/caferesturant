import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db, User, UserRole } from '../lib/db';
import { 
  PermissionKey, 
  hasUserPermission, 
  getUserEffectivePermissions, 
  ROLE_DEFAULT_PERMISSIONS 
} from '../lib/permissions';

export type TabType = 'pos' | 'menu' | 'tables' | 'accounting' | 'reports' | 'customers' | 'settings' | 'users';

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  hasPermission: (tab: TabType) => boolean;
  can: (permission: PermissionKey) => boolean;
  effectivePermissions: PermissionKey[];
  getRoleLabel: (role: UserRole) => string;
  refreshCurrentUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CURRENT_USER_KEY = 'arka_pos_current_user_id';

const TAB_TO_PERMISSION_MAP: Record<TabType, PermissionKey> = {
  pos: 'nav_pos',
  tables: 'nav_tables',
  menu: 'nav_menu',
  accounting: 'nav_accounting',
  reports: 'nav_reports',
  customers: 'nav_customers',
  settings: 'nav_settings',
  users: 'nav_users',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدیر کل (دسترسی کامل)',
  accountant: 'حسابدار و امور مالی',
  cashier: 'صندوق‌دار فروشگاه',
  stock: 'مسئول انبار و تدارکات',
  waiter: 'گارسون / سفارش‌گیر تبلت',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCurrentUser = useCallback(async () => {
    try {
      const savedUserId = localStorage.getItem(CURRENT_USER_KEY);
      if (savedUserId) {
        const user = await db.users.get(Number(savedUserId));
        if (user && user.isActive) {
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
          localStorage.removeItem(CURRENT_USER_KEY);
        }
      }
    } catch (err) {
      console.error('Failed to refresh user', err);
    }
  }, []);

  // Initialize and ensure default admin exists
  useEffect(() => {
    const initAuth = async () => {
      try {
        const count = await db.users.count();
        if (count === 0) {
          const defaultAdminId = await db.users.add({
            name: 'مدیر ارشد سیستم',
            username: 'admin',
            password: '1234',
            role: 'admin',
            isActive: true,
            createdAt: new Date(),
          });
          const adminUser = await db.users.get(defaultAdminId);
          if (adminUser) {
            setCurrentUser(adminUser);
            localStorage.setItem(CURRENT_USER_KEY, String(adminUser.id));
            setIsLoading(false);
            return;
          }
        }

        // Try restoring last user session
        await refreshCurrentUser();
      } catch (err) {
        console.error('Failed to init auth', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [refreshCurrentUser]);

  const login = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      return { success: false, message: 'لطفا نام کاربری و کلمه عبور را وارد کنید.' };
    }

    try {
      const user = await db.users.where('username').equalsIgnoreCase(cleanUsername).first();
      if (!user) {
        return { success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' };
      }

      if (!user.isActive) {
        return { success: false, message: 'این حساب کاربری غیرفعال شده است. با مدیر تماس بگیرید.' };
      }

      if (user.password !== cleanPassword) {
        return { success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' };
      }

      setCurrentUser(user);
      if (user.id) {
        localStorage.setItem(CURRENT_USER_KEY, String(user.id));
      }
      return { success: true };
    } catch (err) {
      console.error('Login error', err);
      return { success: false, message: 'خطا در احراز هویت سیستم.' };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(CURRENT_USER_KEY);
  };

  const can = useCallback((permission: PermissionKey): boolean => {
    if (!currentUser) return false;
    return hasUserPermission(currentUser as any, permission);
  }, [currentUser]);

  const hasPermission = useCallback((tab: TabType): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const requiredPermission = TAB_TO_PERMISSION_MAP[tab];
    if (requiredPermission) {
      return can(requiredPermission);
    }
    return false;
  }, [currentUser, can]);

  const effectivePermissions = React.useMemo(() => {
    if (!currentUser) return [];
    return getUserEffectivePermissions(currentUser as any);
  }, [currentUser]);

  const getRoleLabel = (role: UserRole): string => {
    return ROLE_LABELS[role] || role;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        login,
        logout,
        hasPermission,
        can,
        effectivePermissions,
        getRoleLabel,
        refreshCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
