export type PermissionCategory = 
  | 'nav'           // دسترسی به منوهای اصلی
  | 'pos'           // صندوق و فاکتور فروش
  | 'purchase'      // فاکتور خرید و هزینه‌ها
  | 'warehouse'     // انبار، حواله، ورود و خروج و تعدیل
  | 'recipe'        // فرمول تولید و بهای تمام‌شده
  | 'accounting'    // حسابداری، سود و زیان و پرسنل
  | 'management';   // مدیریت منو، میزها و تنظیمات

export type PermissionKey =
  // دسترسی به منوها (Navigation Access)
  | 'nav_pos'
  | 'nav_tables'
  | 'nav_menu'
  | 'nav_accounting'
  | 'nav_reports'
  | 'nav_customers'
  | 'nav_settings'
  | 'nav_users'
  | 'nav_chat'
  | 'nav_notifications'

  // فروش و صندوق (POS & Sales)
  | 'pos_checkout'          // ثبت و نهایی‌سازی فاکتور فروش
  | 'pos_discount'          // اعمال تخفیف روی فاکتور فروش
  | 'pos_delete_item'       // حذف قلم یا ابطال سفارش در صندوق
  | 'pos_view_daily_sales'  // مشاهده کارکرد و جمع فروش روزانه صندوق‌دار

  // فاکتور خرید و هزینه‌ها (Purchases & Expenses)
  | 'purchase_create'       // ثبت فاکتور خرید مواد اولیه و ورود به انبار
  | 'purchase_edit'         // ویرایش فاکتورهای خرید ثبت‌شده
  | 'purchase_delete'       // حذف فاکتور خرید
  | 'expense_create'        // ثبت هزینه جاری، اداری و قبوض
  | 'expense_edit_delete'   // ویرایش و حذف هزینه‌های جاری

  // انبار، ورود و خروج و تعدیل (Warehouses, Inbound/Outbound, Kardex, Adjustments)
  | 'stock_view'              // مشاهده موجودی زنده انبارها
  | 'stock_manage_warehouses' // تعریف و ویرایش انبارها
  | 'stock_manage_materials'  // تعریف و ویرایش کاتالوگ مواد اولیه
  | 'stock_transfer'          // صدور حواله انتقال بین انبارها (ورود و خروج کالا)
  | 'stock_adjust'            // ثبت انبارگردانی و تعدیل موجودی (کسری/اضافی فیزیکی)
  | 'stock_kardex'            // مشاهده کاردکس و ریز گردش ورود و خروج کالا

  // فرمول تولید و بهای تمام‌شده (BOM & Costing)
  | 'recipe_view'             // مشاهده فرمول‌های تولید و قیمت تمام‌شده
  | 'recipe_manage'           // تعریف، ویرایش و حذف فرمول تولید اقلام منو

  // حسابداری، سود و زیان و حقوق (Accounting, P&L & Payroll)
  | 'profit_loss_view'        // مشاهده گزارش سود و زیان دقیق (P&L)
  | 'payroll_manage'          // مدیریت پرسنل و ثبت پرداخت حقوق
  | 'parties_report_view'     // مشاهده حساب طرف‌حساب‌ها و بستانکاران

  // مدیریت منو و میزها (Menu & Tables Management)
  | 'menu_edit'               // افزودن و ویرایش غذاها و دسته‌بندی‌ها
  | 'menu_price_change'       // تغییر قیمت غذاها در منو
  | 'tables_manage';          // افزودن و چیدمان میزها و بخش‌ها

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
  category: PermissionCategory;
}

export const PERMISSION_CATEGORIES: { id: PermissionCategory; label: string; iconName: string; color: string }[] = [
  { id: 'nav', label: 'دسترسی به منوهای اصلی سیستم', iconName: 'LayoutGrid', color: 'blue' },
  { id: 'pos', label: 'فروش، صندوق و صدور فاکتور فروش', iconName: 'ShoppingBag', color: 'emerald' },
  { id: 'purchase', label: 'خرید مواد اولیه و ثبت هزینه‌ها', iconName: 'Receipt', color: 'amber' },
  { id: 'warehouse', label: 'انبارداری، ورود و خروج، حواله و تعدیل', iconName: 'Building2', color: 'teal' },
  { id: 'recipe', label: 'فرمول تولید و بهای تمام‌شده کالا', iconName: 'Utensils', color: 'indigo' },
  { id: 'accounting', label: 'حسابداری، سود و زیان و حقوق پرسنل', iconName: 'Calculator', color: 'purple' },
  { id: 'management', label: 'مدیریت منوی غذا، میزها و سیستم', iconName: 'Settings', color: 'slate' },
];

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // منوها
  {
    key: 'nav_pos',
    label: 'منوی صندوق و فروش',
    description: 'مشاهده و ورود به صفحه صندوق و فاکتور فروش',
    category: 'nav',
  },
  {
    key: 'nav_tables',
    label: 'منوی میزها و رزرو',
    description: 'مشاهده سالن، نقشه میزها و سفارشات شبکه‌ای',
    category: 'nav',
  },
  {
    key: 'nav_menu',
    label: 'منوی لیست غذاها و منو',
    description: 'مشاهده صفحه کاتالوگ و مدیریت منو',
    category: 'nav',
  },
  {
    key: 'nav_accounting',
    label: 'منوی حسابداری و انبارداری',
    description: 'مشاهده صفحه جامع حسابداری، انبارها، هزینه‌ها و فرمول تولید',
    category: 'nav',
  },
  {
    key: 'nav_reports',
    label: 'منوی گزارشات و داشبورد',
    description: 'مشاهده نمودارها، آمار و گزارشات جامع فروش',
    category: 'nav',
  },
  {
    key: 'nav_customers',
    label: 'منوی باشگاه مشتریان',
    description: 'مشاهده و مدیریت پرونده و اشتراک مشتریان',
    category: 'nav',
  },
  {
    key: 'nav_settings',
    label: 'منوی تنظیمات سیستم',
    description: 'تنظیمات چاپگر، مالیات و مشخصات مجموعه',
    category: 'nav',
  },
  {
    key: 'nav_users',
    label: 'منوی مدیریت کاربران و دسترسی‌ها',
    description: 'تعریف پرسنل، کلمه عبور و تعیین سطح دسترسی‌ها',
    category: 'nav',
  },
  {
    key: 'nav_chat',
    label: 'سیستم گفتگوی داخلی و تبادل پیام پرسنل',
    description: 'دسترسی به گفتگوی پرسنل، ارسال فایل، ویس صوتی و اشتراک گزارشات',
    category: 'nav',
  },
  {
    key: 'nav_notifications',
    label: 'مرکز اعلان‌ها و هشدارهای هوشمند',
    description: 'مشاهده درخواست‌های گارسون سر میزها، پیام‌های جدید و هشدارهای موجودی',
    category: 'nav',
  },

  // صندوق و فروش
  {
    key: 'pos_checkout',
    label: 'ثبت و نهایی‌سازی فاکتور فروش',
    description: 'مجوز تسویه حساب، ثبت دریافت وجه و صدور نهایی فاکتور فروش (با کسر خودکار مواد اولیه)',
    category: 'pos',
  },
  {
    key: 'pos_discount',
    label: 'اعمال تخفیف روی فاکتور فروش',
    description: 'امکان ثبت تخفیف درصدی یا مبلغی برای مشتری در صندوق',
    category: 'pos',
  },
  {
    key: 'pos_delete_item',
    label: 'حذف قلم یا ابطال سفارش',
    description: 'مجوز حذف آیتم‌های انتخاب شده یا لغو کل سفارش باز در صندوق',
    category: 'pos',
  },
  {
    key: 'pos_view_daily_sales',
    label: 'مشاهده جمع فروش روزانه صندوق',
    description: 'نمایش خلاصه فروش نوبت کاری صندوق‌دار و جمع صندوق',
    category: 'pos',
  },

  // خرید و هزینه‌ها
  {
    key: 'purchase_create',
    label: 'ثبت فاکتور خرید مواد اولیه',
    description: 'ثبت خرید جدید، انتخاب انبار مقصد و ورود آنی کالا به انبار',
    category: 'purchase',
  },
  {
    key: 'purchase_edit',
    label: 'ویرایش فاکتورهای خرید ثبت‌شده',
    description: 'امکان تغییر مشخصات، مقادیر یا مبالغ فاکتورهای خرید قبلی',
    category: 'purchase',
  },
  {
    key: 'purchase_delete',
    label: 'حذف فاکتور خرید',
    description: 'حذف فاکتور خرید ثبت‌شده از سیستم مالی',
    category: 'purchase',
  },
  {
    key: 'expense_create',
    label: 'ثبت هزینه جاری و اداری',
    description: 'ثبت قبوض، اجاره، تبلیغات و سایر هزینه‌های دوره‌ای',
    category: 'purchase',
  },
  {
    key: 'expense_edit_delete',
    label: 'ویرایش و حذف هزینه‌های جاری',
    description: 'تغییر یا لغو اسناد هزینه‌های عمومی و اداری',
    category: 'purchase',
  },

  // انبارداری، ورود و خروج، حواله و تعدیل
  {
    key: 'stock_view',
    label: 'مشاهده موجودی زنده انبارها',
    description: 'دیدن کاردکس و موجودی لحظه‌ای مواد اولیه در تمامی انبارها',
    category: 'warehouse',
  },
  {
    key: 'stock_manage_warehouses',
    label: 'تعریف و ویرایش انبارها',
    description: 'ایجاد انبار جدید، تغییر نام، مدیر انبار و مشخصات انبارها',
    category: 'warehouse',
  },
  {
    key: 'stock_manage_materials',
    label: 'تعریف و ویرایش کاتالوگ مواد اولیه',
    description: 'ثبت ماده اولیه، واحد سنجش، هشدار کسری و قیمت مرجع',
    category: 'warehouse',
  },
  {
    key: 'stock_transfer',
    label: 'صدور حواله انتقال بین انبارها (ورود و خروج)',
    description: 'انتقال کالا از انبار مبدأ به انبار مقصد با ثبت سند حواله و چاپ',
    category: 'warehouse',
  },
  {
    key: 'stock_adjust',
    label: 'انبارگردانی و تعدیل موجودی (کسری/اضافی)',
    description: 'ثبت شمارش فیزیکی انبار و همگام‌سازی مانده سیستم با انبار فیزیکی',
    category: 'warehouse',
  },
  {
    key: 'stock_kardex',
    label: 'مشاهده کاردکس و ریز گردش کالا',
    description: 'بررسی تاریخچه کامل ورود، خروج، مصرف تولید و مانده مواد اولیه',
    category: 'warehouse',
  },

  // فرمول تولید و بهای تمام‌شده
  {
    key: 'recipe_view',
    label: 'مشاهده فرمول‌های تولید و قیمت تمام‌شده',
    description: 'مشاهده ریز مواد اولیه مصرفی هر غذا و درصد سود ناخالص',
    category: 'recipe',
  },
  {
    key: 'recipe_manage',
    label: 'تعریف، ویرایش و حذف فرمول تولید',
    description: 'ایجاد و تغییر جدول ساخت غذاها (BOM) و هزینه‌های آماده‌سازی',
    category: 'recipe',
  },

  // حسابداری و حقوق
  {
    key: 'profit_loss_view',
    label: 'مشاهده گزارش سود و زیان (P&L)',
    description: 'دسترسی به گزارش سود ناخالص واقعی، هزینه‌ها و سود خالص دوره',
    category: 'accounting',
  },
  {
    key: 'payroll_manage',
    label: 'مدیریت پرسنل و ثبت پرداخت حقوق',
    description: 'ثبت مشخصات کارمندان، مساعده، حقوق ماهانه و صدور فیش پرداخت',
    category: 'accounting',
  },
  {
    key: 'parties_report_view',
    label: 'مشاهده گزارش طرف‌حساب‌ها و بستانکاران',
    description: 'ریز حساب تأمین‌کنندگان، مانده بدهی و فاکتورهای معوق',
    category: 'accounting',
  },

  // مدیریت منو و میزها
  {
    key: 'menu_edit',
    label: 'افزودن و ویرایش غذاها و دسته‌ها',
    description: 'تعریف غذای جدید، فعال/غیرفعال‌سازی و تغییر دسته‌بندی',
    category: 'management',
  },
  {
    key: 'menu_price_change',
    label: 'تغییر قیمت اقلام منو',
    description: 'مجوز اصلاح قیمت فروش غذاها و نوشیدنی‌ها در منو',
    category: 'management',
  },
  {
    key: 'tables_manage',
    label: 'مدیریت چیدمان و تعریف میزها',
    description: 'افزودن میز جدید، تغییر بخش‌ها و ظرفیت میزها در سالن',
    category: 'management',
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_DEFINITIONS.map(p => p.key);

import { UserRole } from './db';

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  // مدیر کل: به تمام عملیات دسترسی دارد
  admin: [...ALL_PERMISSION_KEYS],

  // حسابدار: دسترسی به بخش‌های مالی، گزارشات، کاردکس، خرید، هزینه‌ها، سود و زیان و حقوق
  accountant: [
    'nav_accounting',
    'nav_reports',
    'nav_customers',
    'nav_chat',
    'nav_notifications',
    'purchase_create',
    'purchase_edit',
    'purchase_delete',
    'expense_create',
    'expense_edit_delete',
    'stock_view',
    'stock_transfer',
    'stock_kardex',
    'recipe_view',
    'profit_loss_view',
    'payroll_manage',
    'parties_report_view',
  ],

  // انباردار: دسترسی کامل به تعریف انبار، کالا، حواله، تعدیل، ثبت خرید و ورود به انبار و کاردکس
  stock: [
    'nav_accounting',
    'nav_menu',
    'nav_chat',
    'nav_notifications',
    'stock_view',
    'stock_manage_warehouses',
    'stock_manage_materials',
    'stock_transfer',
    'stock_adjust',
    'stock_kardex',
    'purchase_create',
    'purchase_edit',
    'recipe_view',
    'recipe_manage',
  ],

  // صندوق‌دار: دسترسی به صندوق فروش، میزها، مشتریان و صدور فاکتور
  cashier: [
    'nav_pos',
    'nav_tables',
    'nav_customers',
    'nav_chat',
    'nav_notifications',
    'pos_checkout',
    'pos_discount',
    'pos_delete_item',
    'pos_view_daily_sales',
  ],

  // گارسون: سفارش‌گیری در تبلت / میزها به همراه چت و اعلان‌ها
  waiter: [
    'nav_pos',
    'nav_tables',
    'nav_chat',
    'nav_notifications',
  ],
};

export function getUserEffectivePermissions(user: { role: UserRole; permissions?: PermissionKey[] } | null): PermissionKey[] {
  if (!user) return [];
  // Super admin always has all permissions
  if (user.role === 'admin') {
    return ALL_PERMISSION_KEYS;
  }
  // If custom permissions were configured, use them
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions;
  }
  // Otherwise fallback to default role permissions
  return ROLE_DEFAULT_PERMISSIONS[user.role] || [];
}

export function hasUserPermission(
  user: { role: UserRole; permissions?: PermissionKey[] } | null,
  key: PermissionKey
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const effective = getUserEffectivePermissions(user);
  return effective.includes(key);
}
