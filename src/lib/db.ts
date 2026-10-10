import Dexie, { Table } from 'dexie';

export interface Category {
  id?: number;
  name: string;
}

export interface MenuItem {
  id?: number;
  categoryId: number;
  name: string;
  price: number;
  isActive: boolean;
  image?: string;
}

export interface OrderItem {
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

export interface Order {
  id?: number;
  invoiceNumber: number;
  createdAt: Date;
  customerPhone: string;
  customerName?: string;
  customerSubscriptionCode?: string;
  customerAddress?: string;
  tableNumber?: number;
  tableTitle?: string;
  orderType?: 'dine_in' | 'takeaway' | 'delivery';
  source?: 'pos' | 'waiter_tablet' | 'customer_qr' | 'snappfood';
  snappfoodOrderCode?: string; // شماره سفارش اسنپ فود (مثلا SF-48192)
  snappfoodDeliveryFee?: number; // کرایه حمل / پیک اسنپ‌فود
  snappfoodPrepTime?: number; // مدت زمان تخمینی آماده‌سازی (دقیقه)
  snappfoodCustomerNote?: string; // یادداشت مشتری در اسنپ فود
  waiterName?: string;
  items: OrderItem[];
  subtotal: number;
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  taxEnabled: boolean;
  taxPercentage: number;
  taxAmount: number;
  total: number;
  cogsAmount?: number; // بهای تمام شده کالای فروش رفته بر اساس فرمول تولید
  productionWarehouseId?: number; // شناسه انبار کسر مواد اولیه (مثلا آشپزخانه)
  paymentMethod?: 'card' | 'cash' | 'cheque';
  deliveryFee?: number; // هزینه پیک
  serviceFee?: number; // حق سرویس
  status: 'paid' | 'cancelled';
}

export interface Customer {
  id?: number;
  phone: string;
  name: string;
  subscriptionCode: string; // کد اشتراک
  address: string; // آدرس مشتری جهت غذاهای بیرون بر
  createdAt: Date;
}

export type UserRole = 'admin' | 'accountant' | 'cashier' | 'stock' | 'waiter';

export interface User {
  id?: number;
  name: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  permissions?: string[]; // دسترسی‌های تفکیک‌شده و سفارشی کاربر
}

export interface RestaurantTable {
  id?: number;
  number: number;
  title: string;
  section: string;
  capacity: number;
  status: 'empty' | 'occupied' | 'reserved' | 'needs_waiter';
  activeInvoiceTabId?: string;
  notes?: string;
  createdAt: Date;
}

export interface NetworkOrder {
  id?: number;
  tempId: string;
  tableNumber: number;
  tableTitle: string;
  customerName?: string;
  customerPhone?: string;
  waiterName?: string;
  source: 'waiter_tablet' | 'customer_qr';
  items: (OrderItem & { note?: string })[];
  subtotal: number;
  notes?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  createdAt: Date;
}

export type ExpenseType = 'material' | 'general_expense';

export interface Expense {
  id?: number;
  title: string; // عنوان هزینه یا کالای خریداری شده
  type: ExpenseType; // 'material' (خرید مواد اولیه) | 'general_expense' (هزینه عمومی / اداری / جاری)
  category: string; // دسته‌بندی (گوشت، سبزیجات، قبوض، اجاره، بسته بندی و ...)
  amount: number; // مبلغ کل (تومان)
  quantity?: number; // مقدار یا تعداد (مثلا ۲۰)
  unit?: string; // واحد (کیلوگرم، عدد، کارتن، لیتر، ...)
  unitPrice?: number; // قیمت هر واحد
  supplierOrPerson: string; // نام طرف حساب / فروشنده / تامین کننده
  paymentMethod: 'cash' | 'card' | 'credit' | 'cheque'; // روش پرداخت: نقدی، کارتخوان/بانک، نسیه/بدهی، چک
  status: 'paid' | 'pending'; // پرداخت شده یا نسیه/تسویه نشده
  date: Date; // تاریخ ثبت فاکتور/هزینه
  invoiceNumber?: string; // شماره فاکتور یا پیگیری خرید
  note?: string; // توضیحات
  warehouseId?: number; // شناسه انبار مقصد ورود کالا
  warehouseName?: string; // نام انبار مقصد
  materialId?: number; // شناسه کالا در جدول مواد اولیه
  createdAt: Date;
}

export type WarehouseType = 
  | 'kitchen_production' // انبار خط تولید / آشپزخانه
  | 'central'            // انبار مرکزی و اصلی
  | 'cold_storage'        // سردخانه مواد پروتئینی و لبنی
  | 'dry_storage'         // انبار مواد خشک و غلات
  | 'bar'                 // انبار نوشیدنی و بار
  | 'waste'               // انبار ضایعات و افت بار
  | 'other';              // سایر انبارها

export interface Warehouse {
  id?: number;
  code: string; // کد انبار (مثلا WH-01)
  name: string; // نام انبار (مثلا انبار مرکزی، انبار آشپزخانه و خط تولید)
  type: WarehouseType;
  manager: string; // نام انباردار / مسئول
  phone?: string; // شماره تماس
  location?: string; // موقعیت فیزیکی یا آدرس
  isProductionDefault: boolean; // آیا انبار پیش‌فرض خط تولید جهت کسر خودکار هنگام فروش غذا است؟
  isPurchaseDefault: boolean;   // آیا انبار پیش‌فرض فاکتورهای خرید کالا است؟
  isActive: boolean;
  notes?: string;
  createdAt: Date;
}

export interface RawMaterial {
  id?: number;
  code: string; // کد کالا یا بارکد (مثلا RM-101)
  name: string; // نام کالا (گوشت فیله، پنیر پیتزا، روغن سرخ‌کردنی، نان برگر، نوشابه و ...)
  category: string; // دسته‌بندی
  unit: string; // واحد اصلی سنجش (کیلوگرم، گرم، لیتر، عدد، بسته و ...)
  unitPrice: number; // آخرین قیمت خرید هر واحد (تومان)
  weightedAveragePrice: number; // میانگین موزون نرخ خرید برای بهای تمام شده دقیق
  minStockAlert: number; // حداقل موجودی جهت هشدار کسر موجودی
  notes?: string;
  createdAt: Date;
}

export interface WarehouseStock {
  id?: number;
  warehouseId: number;
  materialId: number;
  quantity: number; // موجودی زنده در این انبار
  lastUpdated: Date;
}

export interface TransferItem {
  materialId: number;
  materialName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  notes?: string;
}

export interface WarehouseTransfer {
  id?: number;
  transferNumber: string; // شماره حواله انبار (مثلا TR-1001)
  sourceWarehouseId: number;
  sourceWarehouseName: string;
  destWarehouseId: number;
  destWarehouseName: string;
  transferDate: Date;
  transferredBy?: string; // تحویل‌دهنده
  receivedBy?: string; // تحویل‌گیرنده
  items: TransferItem[];
  totalQuantity: number;
  totalValue: number;
  status: 'completed' | 'draft' | 'cancelled';
  notes?: string;
  createdAt: Date;
}

export type StockTransactionType = 
  | 'purchase_in'          // ورود از فاکتور خرید
  | 'transfer_in'          // ورود حواله انتقالی بین انبارها
  | 'transfer_out'         // خروج حواله انتقالی بین انبارها
  | 'sale_production_out'  // خروج اتوماتیک مصرف در فروش غذا
  | 'waste_out'            // خروج ضایعات و افت
  | 'manual_adjust';       // تعدیل دستی انبارگردانی

export interface StockTransaction {
  id?: number;
  warehouseId: number;
  warehouseName: string;
  materialId: number;
  materialName: string;
  unit: string;
  type: StockTransactionType;
  quantityChange: number; // مثبت برای ورود، منفی برای خروج
  quantityBefore: number;
  quantityAfter: number;
  unitCost: number; // نرخ واحد در لحظه تراکنش (تومان)
  totalCost: number; // ارزش ریالی کل تراکنش
  referenceId: string; // شماره فاکتور خرید / حواله / شماره سفارش فروش
  referenceType: 'expense_purchase' | 'transfer' | 'order_sale' | 'adjustment';
  description: string;
  date: Date;
  createdAt: Date;
}

export interface RecipeIngredient {
  materialId: number;
  materialName: string;
  quantity: number; // مقدار مصرف برای ۱ واحد غذا (مثلا 0.18 کیلوگرم یا 1 عدد)
  unit: string;
  unitCost: number; // نرخ خرید واحد ماده اولیه
  itemTotalCost: number; // quantity * unitCost
  notes?: string;
}

export interface Recipe {
  id?: number;
  menuItemId: number; // شناسه آیتم منو
  menuItemName: string;
  yieldQuantity: number; // تعداد پرس حاصل از فرمول (پیش‌فرض ۱)
  ingredients: RecipeIngredient[];
  overheadCost: number; // هزینه سربار متغیر پخت، بسته‌بندی، گاز، ظروف (تومان)
  totalCost: number; // بهای تمام شده دقیق فرمول = مجموع هزینه مواد + سربار
  isActive: boolean;
  updatedAt: Date;
}

export interface Employee {
  id?: number;
  name: string; // نام و نام خانوادگی پرسنل
  roleTitle: string; // سمت شغلی (سرآشپز، صندوق دار، باریستا، سالن کار، پیک و ...)
  phone: string; // شماره تماس
  nationalCode?: string; // کد ملی
  bankCard?: string; // شماره کارت یا شبا برای واریز حقوق
  baseSalary: number; // حقوق پایه (تومان)
  salaryType: 'monthly' | 'daily' | 'hourly'; // نوع حقوق
  hireDate?: Date; // تاریخ شروع به کار
  isActive: boolean; // فعال / غیرفعال
  notes?: string;
  createdAt: Date;
}

export interface SalaryPayment {
  id?: number;
  employeeId: number;
  employeeName: string; // نام کارمند
  periodMonth: string; // دوره حقوق (مثلا شهریور ۱۴۰۵)
  baseAmount: number; // مبلغ حقوق پایه
  bonusAmount: number; // اضافه کاری / پاداش
  deductionsAmount: number; // کسورات / مساعده / بیمه
  totalPaid: number; // خالص پرداختی = base + bonus - deductions
  paymentDate: Date; // تاریخ پرداخت
  paymentMethod: 'card' | 'cash' | 'cheque'; // روش پرداخت
  trackingNumber?: string; // شماره پیگیری واریز
  notes?: string; // توضیحات
  createdAt: Date;
}

export interface AppSettings {
  id?: number;
  restaurantName: string;
  phone: string;
  address: string;
  website: string;
  instagram: string;
  telegram: string;
  logoUrl: string;
  taxEnabled: boolean;
  taxPercentage: number;
  requireCustomerPhone: boolean;
  wifiSsid?: string;
  wifiPassword?: string;
  localServerUrl?: string;
  localServerPort?: number; // پورت اختصاصی سرور شبکه محلی (پیش‌فرض ۳۰۰۰)
  
  // Telegram Bot Settings
  telegramBotToken?: string;
  telegramAdminChatIds?: string;
  telegramBackupEnabled?: boolean;

  // Bale Messenger Bot Settings
  baleBotToken?: string;
  baleAdminChatIds?: string;
  baleBackupEnabled?: boolean;

  // Auto Backup Schedule
  autoBackupIntervalHours?: number; // ۱ (ساعتی)، ۳، ۶، ۱۲، ۲۴ ساعت یا ۰ (غیرفعال)
  lastAutoBackupTime?: string; // تاریخ آخرین ارسال خودکار

  // SnappFood Integration Settings
  snappfoodEnabled?: boolean;
  snappfoodVendorCode?: string; // کد وندور در اسنپ‌فود
  snappfoodApiKey?: string; // کلید توکن API اسنپ‌فود
  snappfoodAutoAccept?: boolean; // تایید خودکار سفارشات ورودی
  snappfoodDefaultPrepTime?: number; // مدت زمان تخمینی آماده‌سازی (دقیقه، پیش‌فرض ۲۵)
  snappfoodAutoPrint?: boolean; // چاپ خودکار فاکتور
  snappfoodWebhookSecret?: string; // کلید اختصاصی امنیت وب‌هوک

  // Receipt Printer Design Settings
  receiptSettings?: ReceiptDesignConfig;
}

export interface ReceiptDesignConfig {
  // Paper & Typography
  paperWidth: '80mm' | '58mm';
  fontSize: 'sm' | 'md' | 'lg'; // 9px, 11px, 12.5px
  fontFamily: 'sans' | 'mono';
  dividerStyle: 'dashed' | 'dotted' | 'solid' | 'double';
  compactSpacing: boolean;

  // Header & Branding
  showLogo: boolean;
  logoUrl?: string;
  logoSize: 'sm' | 'md' | 'lg'; // 36px, 48px, 64px
  logoGrayscale: boolean;
  restaurantName?: string;
  subTitle?: string; // شعار یا نوع کسب‌وکار
  branchName?: string; // نام یا کد شعبه
  showPhone: boolean;
  phone?: string;
  secondaryPhone?: string;
  showAddress: boolean;
  address?: string;
  economicCode?: string; // کد اقتصادی / شناسه ملی
  showEconomicCode: boolean;

  // Social & Online
  showWebsite: boolean;
  website?: string;
  showInstagram: boolean;
  instagram?: string;
  showTelegram: boolean;
  telegram?: string;
  showBale: boolean;
  bale?: string;
  showEitaa: boolean;
  eitaa?: string;
  showWhatsapp: boolean;
  whatsapp?: string;

  // QR Code
  showQrCode: boolean;
  qrCodeType: 'menu' | 'website' | 'instagram' | 'wifi' | 'custom';
  qrCodeCustomUrl?: string;
  qrCodeCaption?: string;

  // Invoice Meta
  receiptTitle: string; // عنوان فاکتور (صورتحساب فروش / فیش مشتری / فاکتور سفارش)
  showInvoiceNumber: boolean;
  invoicePrefix?: string; // e.g. # or فاکتور
  showDate: boolean;
  showTime: boolean;
  showTable: boolean;
  showOrderType: boolean; // سالن، بیرون‌بر، پیک
  showCashier: boolean;
  showWaiter: boolean;

  // Customer Info
  showCustomerInfo: boolean;
  showCustomerName: boolean;
  showCustomerPhone: boolean;
  showCustomerAddress: boolean;
  showCustomerCode: boolean;

  // Items Table Columns
  showItemRowNumber: boolean; // ستون ردیف
  showUnitPrice: boolean; // فی
  showQuantity: boolean; // تعداد
  showItemTotal: boolean; // مبلغ کل
  showItemNotes: boolean; // توضیحات قلم کالا

  // Totals & Financials
  showSubtotal: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showServiceFee: boolean;
  showDeliveryFee: boolean;
  highlightTotal: 'box' | 'inverse' | 'bold' | 'double';
  showTotalInWords: boolean; // مبلغ به حروف
  showPaymentMethod: boolean; // نقدی، پوز و...

  // Footer & Notices
  thankYouMessage?: string; // پیام تشکر
  showWifiBox: boolean; // کادر اتصال وای‌فای
  wifiSsid?: string;
  wifiPassword?: string;
  footerNotes?: string; // قوانین یا توضیحات تکمیلی
  showCutLine: boolean; // خط راهنمای برش فیش
}

export const defaultReceiptConfig: ReceiptDesignConfig = {
  paperWidth: '80mm',
  fontSize: 'md',
  fontFamily: 'sans',
  dividerStyle: 'dashed',
  compactSpacing: false,

  showLogo: true,
  logoSize: 'md',
  logoGrayscale: true,
  restaurantName: '',
  subTitle: 'رستوران و فست‌فود',
  branchName: 'شعبه مرکزی',
  showPhone: true,
  phone: '',
  secondaryPhone: '',
  showAddress: true,
  address: '',
  economicCode: '',
  showEconomicCode: false,

  showWebsite: true,
  website: '',
  showInstagram: true,
  instagram: '',
  showTelegram: true,
  telegram: '',
  showBale: false,
  bale: '',
  showEitaa: false,
  eitaa: '',
  showWhatsapp: false,
  whatsapp: '',

  showQrCode: true,
  qrCodeType: 'menu',
  qrCodeCustomUrl: '',
  qrCodeCaption: 'اسکن جهت مشاهده منوی آنلاین',

  receiptTitle: 'صورتحساب فروش',
  showInvoiceNumber: true,
  invoicePrefix: 'فاکتور شماره',
  showDate: true,
  showTime: true,
  showTable: true,
  showOrderType: true,
  showCashier: true,
  showWaiter: true,

  showCustomerInfo: true,
  showCustomerName: true,
  showCustomerPhone: true,
  showCustomerAddress: true,
  showCustomerCode: true,

  showItemRowNumber: true,
  showUnitPrice: true,
  showQuantity: true,
  showItemTotal: true,
  showItemNotes: true,

  showSubtotal: true,
  showDiscount: true,
  showTax: true,
  showServiceFee: false,
  showDeliveryFee: true,
  highlightTotal: 'inverse',
  showTotalInWords: true,
  showPaymentMethod: true,

  thankYouMessage: 'از انتخاب و اعتماد شما صمیمانه سپاسگزاریم!',
  showWifiBox: false,
  wifiSsid: '',
  wifiPassword: '',
  footerNotes: 'لطفاً فاکتور را تا پایان دریافت سفارش نزد خود نگه دارید.',
  showCutLine: true,
};

export function getEffectiveReceiptConfig(settings?: AppSettings): ReceiptDesignConfig {
  const base = { ...defaultReceiptConfig };
  if (!settings) return base;

  const saved: Partial<ReceiptDesignConfig> = settings.receiptSettings || {};

  return {
    ...base,
    ...saved,
    // Fall back to main settings if receipt specific field is empty
    restaurantName: saved.restaurantName || settings.restaurantName || base.restaurantName,
    phone: saved.phone || settings.phone || base.phone,
    address: saved.address || settings.address || base.address,
    website: saved.website || settings.website || base.website,
    instagram: saved.instagram || settings.instagram || base.instagram,
    telegram: saved.telegram || settings.telegram || base.telegram,
    logoUrl: saved.logoUrl || settings.logoUrl || base.logoUrl,
    wifiSsid: saved.wifiSsid || settings.wifiSsid || base.wifiSsid,
    wifiPassword: saved.wifiPassword || settings.wifiPassword || base.wifiPassword,
  };
}

export interface ChatAttachment {
  id: string;
  name: string;
  type: 'image' | 'file' | 'audio' | 'report';
  mimeType?: string;
  size?: number;
  dataUrl?: string; // Base64 data url for files / images / voices
  reportData?: {
    reportType: 'sales_summary' | 'daily_z' | 'low_stock' | 'cash_drawer';
    title: string;
    periodText?: string;
    metrics: Array<{ label: string; value: string; color?: string }>;
    summaryText?: string;
  };
}

export interface ChatMessage {
  id?: number;
  channelId: string; // 'general' | 'kitchen' | 'waiters' | 'management'
  senderId?: number;
  senderName: string;
  senderRole?: UserRole;
  senderAvatar?: string;
  content: string;
  attachments?: ChatAttachment[];
  voiceNote?: {
    dataUrl: string;
    durationSeconds: number;
  };
  isSystemEvent?: boolean;
  createdAt: Date;
}

export type NotificationType = 'waiter_call' | 'new_order' | 'snappfood_order' | 'chat_message' | 'low_stock' | 'system_alert' | 'report_shared';

export interface SystemNotification {
  id?: number;
  type: NotificationType;
  title: string;
  message: string;
  category?: string;
  targetTab?: string; // 'chat' | 'tables' | 'pos' | 'accounting' | 'reports'
  metadata?: any;
  isRead: boolean;
  createdAt: Date;
}

export class POSDatabase extends Dexie {
  categories!: Table<Category>;
  menuItems!: Table<MenuItem>;
  orders!: Table<Order>;
  settings!: Table<AppSettings>;
  customers!: Table<Customer>;
  users!: Table<User>;
  expenses!: Table<Expense>;
  employees!: Table<Employee>;
  salaryPayments!: Table<SalaryPayment>;
  restaurantTables!: Table<RestaurantTable>;
  networkOrders!: Table<NetworkOrder>;
  warehouses!: Table<Warehouse>;
  rawMaterials!: Table<RawMaterial>;
  warehouseStocks!: Table<WarehouseStock>;
  warehouseTransfers!: Table<WarehouseTransfer>;
  stockTransactions!: Table<StockTransaction>;
  recipes!: Table<Recipe>;
  chatMessages!: Table<ChatMessage>;
  systemNotifications!: Table<SystemNotification>;

  constructor() {
    super('RestaurantPOSDB');
    this.version(1).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id'
    });
    this.version(2).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id'
    }).upgrade(tx => {
      tx.table('settings').toCollection().modify(setting => {
        if (setting.taxEnabled === undefined) setting.taxEnabled = false;
        if (setting.taxPercentage === undefined) setting.taxPercentage = 0;
      });
      tx.table('orders').toCollection().modify(order => {
        if (order.subtotal === undefined) order.subtotal = order.total;
        if (order.discountType === undefined) order.discountType = 'none';
        if (order.discountValue === undefined) order.discountValue = 0;
        if (order.taxEnabled === undefined) order.taxEnabled = false;
        if (order.taxPercentage === undefined) order.taxPercentage = 0;
        if (order.taxAmount === undefined) order.taxAmount = 0;
      });
    });
    this.version(3).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id'
    }).upgrade(tx => {
      tx.table('settings').toCollection().modify(setting => {
        if (setting.requireCustomerPhone === undefined) setting.requireCustomerPhone = false;
      });
    });
    this.version(4).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id'
    }).upgrade(tx => {
      tx.table('menuItems').toCollection().modify(item => {
        if (item.image === undefined) item.image = '';
      });
    });
    this.version(5).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id',
      customers: '++id, phone, name, subscriptionCode'
    }).upgrade(tx => {
      tx.table('orders').toArray().then(ordersList => {
        const uniquePhones = new Set<string>();
        ordersList.forEach(order => {
          if (order.customerPhone && order.customerPhone.trim()) {
            uniquePhones.add(order.customerPhone.trim());
          }
        });
        uniquePhones.forEach(phone => {
          tx.table('customers').add({
            phone,
            name: '',
            subscriptionCode: '',
            address: '',
            createdAt: new Date()
          });
        });
      });
    });
    this.version(6).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id',
      customers: '++id, phone, name, subscriptionCode',
      users: '++id, username, role, isActive',
      expenses: '++id, type, category, supplierOrPerson, date, paymentMethod, status',
      employees: '++id, name, phone, roleTitle, isActive',
      salaryPayments: '++id, employeeId, periodMonth, paymentDate, paymentMethod'
    }).upgrade(async tx => {
      // Seed default admin user if none exists
      const usersTable = tx.table('users');
      const count = await usersTable.count();
      if (count === 0) {
        await usersTable.add({
          name: 'مدیر ارشد',
          username: 'admin',
          password: '1234',
          role: 'admin',
          isActive: true,
          createdAt: new Date()
        });
      }
    });

    this.version(7).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id',
      customers: '++id, phone, name, subscriptionCode',
      users: '++id, username, role, isActive',
      expenses: '++id, type, category, supplierOrPerson, date, paymentMethod, status',
      employees: '++id, name, phone, roleTitle, isActive',
      salaryPayments: '++id, employeeId, periodMonth, paymentDate, paymentMethod',
      restaurantTables: '++id, number, section, status',
      networkOrders: '++id, tempId, tableNumber, source, status, createdAt'
    }).upgrade(async tx => {
      const tablesTable = tx.table('restaurantTables');
      const count = await tablesTable.count();
      if (count === 0) {
        const defaultTables: Omit<RestaurantTable, 'id'>[] = [
          { number: 1, title: 'میز ۱', section: 'سالن اصلی', capacity: 4, status: 'empty', createdAt: new Date() },
          { number: 2, title: 'میز ۲', section: 'سالن اصلی', capacity: 4, status: 'empty', createdAt: new Date() },
          { number: 3, title: 'میز ۳', section: 'سالن اصلی', capacity: 2, status: 'empty', createdAt: new Date() },
          { number: 4, title: 'میز ۴', section: 'سالن اصلی', capacity: 6, status: 'empty', createdAt: new Date() },
          { number: 5, title: 'میز ۵', section: 'سالن اصلی', capacity: 4, status: 'empty', createdAt: new Date() },
          { number: 6, title: 'میز ۶ (تراس)', section: 'تراس و فضای باز', capacity: 4, status: 'empty', createdAt: new Date() },
          { number: 7, title: 'میز ۷ (تراس)', section: 'تراس و فضای باز', capacity: 4, status: 'empty', createdAt: new Date() },
          { number: 8, title: 'میز VIP', section: 'بخش VIP', capacity: 8, status: 'empty', createdAt: new Date() },
        ];
        for (const tbl of defaultTables) {
          await tablesTable.add(tbl);
        }
      }
    });

    this.version(8).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id',
      customers: '++id, phone, name, subscriptionCode',
      users: '++id, username, role, isActive',
      expenses: '++id, type, category, supplierOrPerson, date, paymentMethod, status, warehouseId, materialId',
      employees: '++id, name, phone, roleTitle, isActive',
      salaryPayments: '++id, employeeId, periodMonth, paymentDate, paymentMethod',
      restaurantTables: '++id, number, section, status',
      networkOrders: '++id, tempId, tableNumber, source, status, createdAt',
      warehouses: '++id, code, name, type, isProductionDefault, isPurchaseDefault, isActive',
      rawMaterials: '++id, code, name, category, unit, minStockAlert',
      warehouseStocks: '++id, warehouseId, materialId, [warehouseId+materialId]',
      warehouseTransfers: '++id, transferNumber, sourceWarehouseId, destWarehouseId, transferDate, status',
      stockTransactions: '++id, warehouseId, materialId, type, referenceType, referenceId, date',
      recipes: '++id, menuItemId, menuItemName, isActive'
    });

    this.version(9).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id',
      customers: '++id, phone, name, subscriptionCode',
      users: '++id, username, role, isActive',
      expenses: '++id, type, category, supplierOrPerson, date, paymentMethod, status, warehouseId, materialId',
      employees: '++id, name, phone, roleTitle, isActive',
      salaryPayments: '++id, employeeId, periodMonth, paymentDate, paymentMethod',
      restaurantTables: '++id, number, section, status',
      networkOrders: '++id, tempId, tableNumber, source, status, createdAt',
      warehouses: '++id, code, name, type, isProductionDefault, isPurchaseDefault, isActive',
      rawMaterials: '++id, code, name, category, unit, minStockAlert',
      warehouseStocks: '++id, warehouseId, materialId, [warehouseId+materialId]',
      warehouseTransfers: '++id, transferNumber, sourceWarehouseId, destWarehouseId, transferDate, status',
      stockTransactions: '++id, warehouseId, materialId, type, referenceType, referenceId, date',
      recipes: '++id, menuItemId, menuItemName, isActive',
      chatMessages: '++id, channelId, senderName, createdAt',
      systemNotifications: '++id, type, isRead, createdAt'
    }).upgrade(async tx => {
      // Seed welcome chat message
      const chatTable = tx.table('chatMessages');
      const chatCount = await chatTable.count();
      if (chatCount === 0) {
        await chatTable.add({
          channelId: 'general',
          senderName: 'سیستم هوشمند آرکا',
          senderRole: 'admin',
          content: 'به سامانه گفتگوی داخلی و تبادل پیام پرسنل آرکا خوش آمدید. در این بخش می‌توانید پیام متنی، ویس، فایل، تصویر و گزارشات زنده سیستم را مستقیماً ارسال کنید.',
          isSystemEvent: true,
          createdAt: new Date()
        });
      }

      // Seed initial sample system notifications
      const notifTable = tx.table('systemNotifications');
      const notifCount = await notifTable.count();
      if (notifCount === 0) {
        await notifTable.add({
          type: 'system_alert',
          title: 'راه‌اندازی سامانه اطلاع‌رسانی و نوتیفیکیشن',
          message: 'مرکز اعلان‌های هوشمند فعال شد. تمامی درخواست‌های گارسون، سفارشات جدید و پیام‌ها در این بخش نمایش داده می‌شوند.',
          targetTab: 'chat',
          isRead: false,
          createdAt: new Date()
        });
      }
    });
  }
}

export const db = new POSDatabase();

export async function ensureDefaultTables(): Promise<RestaurantTable[]> {
  try {
    const count = await db.restaurantTables.count();
    if (count === 0) {
      const defaultTables: Omit<RestaurantTable, 'id'>[] = [
        { number: 1, title: 'میز ۱', section: 'سالن اصلی', capacity: 4, status: 'empty', createdAt: new Date() },
        { number: 2, title: 'میز ۲', section: 'سالن اصلی', capacity: 4, status: 'empty', createdAt: new Date() },
        { number: 3, title: 'میز ۳', section: 'سالن اصلی', capacity: 2, status: 'empty', createdAt: new Date() },
        { number: 4, title: 'میز ۴', section: 'سالن اصلی', capacity: 6, status: 'empty', createdAt: new Date() },
        { number: 5, title: 'میز ۵', section: 'سالن اصلی', capacity: 4, status: 'empty', createdAt: new Date() },
        { number: 6, title: 'میز ۶ (تراس)', section: 'تراس و فضای باز', capacity: 4, status: 'empty', createdAt: new Date() },
        { number: 7, title: 'میز ۷ (تراس)', section: 'تراس و فضای باز', capacity: 4, status: 'empty', createdAt: new Date() },
        { number: 8, title: 'میز VIP', section: 'بخش VIP', capacity: 8, status: 'empty', createdAt: new Date() },
      ];
      for (const tbl of defaultTables) {
        await db.restaurantTables.add(tbl);
      }
    }
    return await db.restaurantTables.toArray();
  } catch (err) {
    console.error('Failed to ensure default tables', err);
    return [];
  }
}

/**
 * Calculates current real-time cost of goods sold (COGS) for a recipe based on live material prices
 */
export function calculateRecipeCost(recipe: Recipe, materialsMap: Map<number, RawMaterial>): {
  totalCost: number;
  ingredientsCost: number;
  overheadCost: number;
  breakdown: Array<{ materialName: string; quantity: number; unit: string; unitCost: number; total: number }>;
} {
  let ingredientsCost = 0;
  const breakdown: Array<{ materialName: string; quantity: number; unit: string; unitCost: number; total: number }> = [];

  recipe.ingredients.forEach(ing => {
    const liveMat = materialsMap.get(ing.materialId);
    const unitPrice = liveMat ? (liveMat.weightedAveragePrice || liveMat.unitPrice || ing.unitCost) : ing.unitCost;
    const { totalCost: itemTotal } = computeIngredientCostAndQty(
      ing.quantity,
      ing.unit,
      unitPrice,
      liveMat?.unit || 'کیلوگرم'
    );
    ingredientsCost += itemTotal;
    breakdown.push({
      materialName: liveMat?.name || ing.materialName,
      quantity: ing.quantity,
      unit: ing.unit || liveMat?.unit || 'واحد',
      unitCost: unitPrice,
      total: Math.round(itemTotal)
    });
  });

  const overhead = recipe.overheadCost || 0;
  const totalCost = Math.round(ingredientsCost + overhead);

  return {
    totalCost,
    ingredientsCost: Math.round(ingredientsCost),
    overheadCost: overhead,
    breakdown
  };
}

/**
 * Normalizes Persian/Arabic text for exact string comparison.
 */
export function normalizePersianText(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u064A\u0649]/g, '\u06CC') // Arabic Yeh (ي, ى) -> Persian Ye (ی)
    .replace(/\u0643/g, '\u06A9')         // Arabic Kaf (ك) -> Persian Keh (ک)
    .replace(/[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]/g, '') // Remove diacritics
    .trim()
    .toLowerCase();
}

/**
 * Smart ingredient cost calculation that handles Grams -> Kg, ML -> Liters conversion,
 * and auto-converts raw quantities if specified in grams for Kg materials.
 */
export function computeIngredientCostAndQty(
  qty: number,
  ingUnit: string = '',
  matUnitPrice: number = 0,
  matUnit: string = ''
): { normalizedQty: number; totalCost: number; isUnitConverted: boolean } {
  const normIngUnit = normalizePersianText(ingUnit);
  const normMatUnit = normalizePersianText(matUnit);
  
  let normalizedQty = Number(qty) || 0;
  let isUnitConverted = false;

  // Sanitize matUnitPrice if passed in Rials or corrupted (> 1,500,000 Toman/kg)
  let cleanUnitPrice = Number(matUnitPrice) || 0;
  if (cleanUnitPrice > 5000000) {
    cleanUnitPrice = Math.round(cleanUnitPrice / 1000);
  } else if (cleanUnitPrice > 1500000) {
    cleanUnitPrice = Math.round(cleanUnitPrice / 10);
  }

  // 1. Grams -> Kilograms conversion
  if (
    (normIngUnit.includes('گرم') || normIngUnit === 'g' || normIngUnit === 'gm' || normIngUnit === 'grm') &&
    (normMatUnit.includes('کیلو') || normMatUnit === 'kg' || normMatUnit === '')
  ) {
    normalizedQty = normalizedQty / 1000;
    isUnitConverted = true;
  }
  // 2. Milliliters / CC -> Liters conversion
  else if (
    (normIngUnit.includes('میلی') || normIngUnit.includes('سی‌سی') || normIngUnit === 'ml' || normIngUnit === 'cc') &&
    (normMatUnit.includes('لیتر') || normMatUnit === 'l' || normMatUnit === '')
  ) {
    normalizedQty = normalizedQty / 1000;
    isUnitConverted = true;
  }
  // 3. Smart Auto-detect: If material is measured in Kg (or default) and raw qty >= 10 (e.g. 150 grams of chicken/meat),
  // and wasn't already converted above, convert grams to kg.
  else if (
    (normMatUnit.includes('کیلو') || normMatUnit === 'kg' || normMatUnit === '') &&
    normalizedQty >= 10
  ) {
    normalizedQty = normalizedQty / 1000;
    isUnitConverted = true;
  }
  // 4. Smart Auto-detect for Liters (e.g., 250 ml)
  else if (
    (normMatUnit.includes('لیتر') || normMatUnit === 'l') &&
    normalizedQty >= 10
  ) {
    normalizedQty = normalizedQty / 1000;
    isUnitConverted = true;
  }

  const totalCost = Math.round(normalizedQty * cleanUnitPrice);
  return { normalizedQty, totalCost, isUnitConverted };
}

/**
 * Resets database to clean raw state (clears test orders, expenses, and re-seeds standard materials)
 */
export async function resetDatabaseToRawCleanState(): Promise<void> {
  await db.transaction('rw', [
    db.orders,
    db.expenses,
    db.warehouseStocks,
    db.stockTransactions,
    db.warehouseTransfers,
    db.rawMaterials,
    db.recipes
  ], async () => {
    await db.orders.clear();
    await db.expenses.clear();
    await db.warehouseStocks.clear();
    await db.stockTransactions.clear();
    await db.warehouseTransfers.clear();
    await db.rawMaterials.clear();
    await db.recipes.clear();
  });

  // Re-seed clean defaults
  await ensureDefaultInventoryData();
}

/**
 * Records stock movement for a purchase invoice, updates warehouse inventory,
 * and updates moving weighted average unit cost.
 */
export async function recordPurchaseStock(params: {
  expenseId?: number;
  invoiceNumber?: string;
  warehouseId: number;
  materialId?: number;
  materialName: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  date: Date;
  supplierName?: string;
}): Promise<void> {
  const {
    expenseId,
    invoiceNumber,
    warehouseId,
    materialName,
    category,
    quantity,
    unit,
    unitPrice,
    totalAmount,
    date,
    supplierName
  } = params;

  if (quantity <= 0) return;

  const targetWhId = Number(warehouseId);

  // 1. Get or create Warehouse
  const warehouse = await db.warehouses.get(targetWhId);
  const warehouseName = warehouse ? warehouse.name : 'انبار نامشخص';

  // 2. Get or create RawMaterial
  let material: RawMaterial | undefined;
  if (params.materialId) {
    material = await db.rawMaterials.get(Number(params.materialId));
  }
  if (!material) {
    material = await db.rawMaterials.where('name').equalsIgnoreCase(materialName.trim()).first();
  }

  let finalMaterialId: number;
  const numQty = Number(quantity) || 1;
  const numTotal = Number(totalAmount) || 0;
  let numUnitPrice = Number(unitPrice) || 0;

  // Sanity check: if unitPrice was passed equal to totalAmount when quantity > 1, calculate true unit price
  if (numQty > 1 && numTotal > 0 && Math.abs(numUnitPrice - numTotal) < 1) {
    numUnitPrice = Math.round(numTotal / numQty);
  } else if (!numUnitPrice && numQty > 0 && numTotal > 0) {
    numUnitPrice = Math.round(numTotal / numQty);
  }

  if (material && material.id) {
    finalMaterialId = Number(material.id);
    // Calculate new moving weighted average cost across all stocks
    const allStocks = await db.warehouseStocks.where('materialId').equals(finalMaterialId).toArray();
    const currentTotalQty = allStocks.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    const prevAvg = Number(material.weightedAveragePrice) || Number(material.unitPrice) || numUnitPrice;
    
    // Sanity check on prevAvg: if prevAvg is unreasonably high (> 10,000,000 for kg), replace with numUnitPrice
    const cleanPrevAvg = (prevAvg > 10000000 && numUnitPrice < 5000000) ? numUnitPrice : prevAvg;

    const newTotalQty = Math.max(0, currentTotalQty) + numQty;
    const newWeightedAvg = newTotalQty > 0 
      ? Math.round(((Math.max(0, currentTotalQty) * cleanPrevAvg) + (numQty * numUnitPrice)) / newTotalQty)
      : numUnitPrice;

    await db.rawMaterials.update(finalMaterialId, {
      unitPrice: numUnitPrice,
      weightedAveragePrice: newWeightedAvg,
      unit: unit || material.unit
    });
  } else {
    // Create new material in catalog
    const count = await db.rawMaterials.count();
    const code = `RM-${101 + count}`;
    finalMaterialId = await db.rawMaterials.add({
      code,
      name: materialName.trim(),
      category: category || 'سایر اقلام مصرفی',
      unit: unit || 'کیلوگرم',
      unitPrice: numUnitPrice,
      weightedAveragePrice: numUnitPrice,
      minStockAlert: 10,
      createdAt: new Date()
    });
  }

  // 3. Update Warehouse Stock in specific warehouse
  const existingStock = await db.warehouseStocks
    .where('[warehouseId+materialId]')
    .equals([targetWhId, finalMaterialId])
    .first();

  const prevQty = existingStock ? Number(existingStock.quantity) : 0;
  const newQty = Math.round((prevQty + numQty) * 1000) / 1000;

  if (existingStock && existingStock.id) {
    await db.warehouseStocks.update(existingStock.id, {
      quantity: newQty,
      lastUpdated: new Date()
    });
  } else {
    await db.warehouseStocks.add({
      warehouseId: targetWhId,
      materialId: finalMaterialId,
      quantity: newQty,
      lastUpdated: new Date()
    });
  }

  // 4. Log StockTransaction (کاردکس ورود از خرید)
  await db.stockTransactions.add({
    warehouseId: targetWhId,
    warehouseName,
    materialId: finalMaterialId,
    materialName: materialName.trim(),
    unit: unit || 'کیلوگرم',
    type: 'purchase_in',
    quantityChange: numQty,
    quantityBefore: prevQty,
    quantityAfter: newQty,
    unitCost: numUnitPrice,
    totalCost: Number(totalAmount) || Math.round(numQty * numUnitPrice),
    referenceId: invoiceNumber || String(expenseId || 'خرید'),
    referenceType: 'expense_purchase',
    description: `ورود از فاکتور خرید ${invoiceNumber ? '#' + invoiceNumber : ''} (${supplierName || 'تامین‌کننده'})`,
    date: date || new Date(),
    createdAt: new Date()
  });
}

/**
 * Transfers stock between two warehouses and logs detailed ledger entries
 */
export async function transferStock(params: {
  transferNumber?: string;
  sourceWarehouseId: number;
  destWarehouseId: number;
  transferDate: Date;
  transferredBy?: string;
  receivedBy?: string;
  items: TransferItem[];
  notes?: string;
}): Promise<WarehouseTransfer> {
  const {
    transferDate,
    transferredBy,
    receivedBy,
    items,
    notes
  } = params;

  const sourceWarehouseId = Number(params.sourceWarehouseId);
  const destWarehouseId = Number(params.destWarehouseId);

  if (!sourceWarehouseId || !destWarehouseId) {
    throw new Error('شناسه انبار مبدا و مقصد نامعتبر است.');
  }

  if (sourceWarehouseId === destWarehouseId) {
    throw new Error('انبار مبدا و انبار مقصد نمی‌توانند یکسان باشند.');
  }

  const sourceWh = await db.warehouses.get(sourceWarehouseId);
  const destWh = await db.warehouses.get(destWarehouseId);

  const sourceWhName = sourceWh ? sourceWh.name : 'انبار مبدا';
  const destWhName = destWh ? destWh.name : 'انبار مقصد';

  const transferCount = await db.warehouseTransfers.count();
  const transferNum = params.transferNumber?.trim() || `TR-${1001 + transferCount}`;

  let totalQuantity = 0;
  let totalValue = 0;

  for (const item of items) {
    const matId = Number(item.materialId);
    const itemQty = Number(item.quantity) || 0;
    const itemUnitPrice = Number(item.unitPrice) || 0;

    if (itemQty <= 0) continue;

    totalQuantity += itemQty;
    totalValue += (itemQty * itemUnitPrice);

    // 1. Decrement source warehouse stock
    const sourceStock = await db.warehouseStocks
      .where('[warehouseId+materialId]')
      .equals([sourceWarehouseId, matId])
      .first();

    const srcPrev = sourceStock ? Number(sourceStock.quantity) : 0;
    const srcNew = Math.round((srcPrev - itemQty) * 1000) / 1000;

    if (sourceStock && sourceStock.id) {
      await db.warehouseStocks.update(sourceStock.id, {
        quantity: srcNew,
        lastUpdated: new Date()
      });
    } else {
      await db.warehouseStocks.add({
        warehouseId: sourceWarehouseId,
        materialId: matId,
        quantity: srcNew,
        lastUpdated: new Date()
      });
    }

    // Log source transfer_out
    await db.stockTransactions.add({
      warehouseId: sourceWarehouseId,
      warehouseName: sourceWhName,
      materialId: matId,
      materialName: item.materialName,
      unit: item.unit,
      type: 'transfer_out',
      quantityChange: -itemQty,
      quantityBefore: srcPrev,
      quantityAfter: srcNew,
      unitCost: itemUnitPrice,
      totalCost: Math.round(itemQty * itemUnitPrice),
      referenceId: transferNum,
      referenceType: 'transfer',
      description: `حواله انتقالی خروجی به ${destWhName} (${transferNum})`,
      date: transferDate,
      createdAt: new Date()
    });

    // 2. Increment destination warehouse stock
    const destStock = await db.warehouseStocks
      .where('[warehouseId+materialId]')
      .equals([destWarehouseId, matId])
      .first();

    const destPrev = destStock ? Number(destStock.quantity) : 0;
    const destNew = Math.round((destPrev + itemQty) * 1000) / 1000;

    if (destStock && destStock.id) {
      await db.warehouseStocks.update(destStock.id, {
        quantity: destNew,
        lastUpdated: new Date()
      });
    } else {
      await db.warehouseStocks.add({
        warehouseId: destWarehouseId,
        materialId: matId,
        quantity: destNew,
        lastUpdated: new Date()
      });
    }

    // Log dest transfer_in
    await db.stockTransactions.add({
      warehouseId: destWarehouseId,
      warehouseName: destWhName,
      materialId: matId,
      materialName: item.materialName,
      unit: item.unit,
      type: 'transfer_in',
      quantityChange: itemQty,
      quantityBefore: destPrev,
      quantityAfter: destNew,
      unitCost: itemUnitPrice,
      totalCost: Math.round(itemQty * itemUnitPrice),
      referenceId: transferNum,
      referenceType: 'transfer',
      description: `حواله انتقالی ورودی از ${sourceWhName} (${transferNum})`,
      date: transferDate,
      createdAt: new Date()
    });
  }

  const transferRecord: WarehouseTransfer = {
    transferNumber: transferNum,
    sourceWarehouseId,
    sourceWarehouseName: sourceWhName,
    destWarehouseId,
    destWarehouseName: destWhName,
    transferDate,
    transferredBy: transferredBy || '',
    receivedBy: receivedBy || '',
    items,
    totalQuantity,
    totalValue,
    status: 'completed',
    notes: notes || '',
    createdAt: new Date()
  };

  const id = await db.warehouseTransfers.add(transferRecord);
  return { ...transferRecord, id };
}

/**
 * Automatically deducts raw materials from the kitchen/production warehouse
 * based on each sold menu item's recipe (فرمول تولید), calculates the exact
 * Cost of Goods Sold (قیمت تمام شده), and logs perpetual inventory transactions.
 */
export async function deductProductionStockForOrder(order: Order, preferredWhId?: number): Promise<{
  totalCOGS: number;
  productionWarehouseId: number;
  deductedCount: number;
}> {
  // 1. Find Kitchen / Production Warehouse
  const allWh = await db.warehouses.toArray();
  let productionWh: Warehouse | undefined;
  if (preferredWhId) {
    productionWh = allWh.find(w => w.id === Number(preferredWhId));
  }
  if (!productionWh) {
    productionWh = allWh.find(w => Boolean(w.isProductionDefault) && w.isActive !== false)
      || allWh.find(w => Boolean(w.isProductionDefault))
      || allWh.find(w => w.type === 'kitchen_production' && w.isActive !== false)
      || allWh.find(w => w.type === 'kitchen_production')
      || allWh.find(w => w.isActive !== false)
      || allWh[0];
  }

  if (!productionWh || !productionWh.id) {
    console.warn('No active warehouse found to deduct production raw materials.');
    return { totalCOGS: 0, productionWarehouseId: 0, deductedCount: 0 };
  }

  const whId = Number(productionWh.id);
  const whName = productionWh.name;

  let totalCOGS = 0;
  let deductedCount = 0;

  // Cache materials for fast price resolution
  const materialsList = await db.rawMaterials.toArray();
  const materialsMap = new Map<number, RawMaterial>();
  materialsList.forEach(m => {
    if (m.id) materialsMap.set(Number(m.id), m);
  });

  const allRecipes = await db.recipes.toArray();

  for (const orderItem of order.items) {
    const itemQty = Number(orderItem.quantity) || 1;
    const cleanItemName = normalizePersianText(orderItem.name || '');

    // 1. Find recipe for this menu item:
    // a. By menuItemId
    let recipe: Recipe | undefined;
    if (orderItem.menuItemId) {
      recipe = allRecipes.find(r => Number(r.menuItemId) === Number(orderItem.menuItemId) && r.isActive !== false);
    }
    // b. By exact normalized name
    if (!recipe && cleanItemName) {
      recipe = allRecipes.find(r => normalizePersianText(r.menuItemName) === cleanItemName && r.isActive !== false);
    }
    // c. By partial normalized name
    if (!recipe && cleanItemName) {
      recipe = allRecipes.find(r => {
        const rName = normalizePersianText(r.menuItemName);
        return (rName.includes(cleanItemName) || cleanItemName.includes(rName)) && r.isActive !== false;
      });
    }
    // d. Dish category fallback
    if (!recipe && cleanItemName) {
      if (cleanItemName.includes('پیتزا') || cleanItemName.includes('pizza')) {
        recipe = allRecipes.find(r => normalizePersianText(r.menuItemName).includes('پیتزا') && r.isActive !== false);
      } else if (cleanItemName.includes('برگر') || cleanItemName.includes('burger')) {
        recipe = allRecipes.find(r => normalizePersianText(r.menuItemName).includes('برگر') && r.isActive !== false);
      } else if (cleanItemName.includes('سیب‌زمینی') || cleanItemName.includes('fries')) {
        recipe = allRecipes.find(r => normalizePersianText(r.menuItemName).includes('سیب‌زمینی') && r.isActive !== false);
      } else if (cleanItemName.includes('مرغ') || cleanItemName.includes('جوجه') || cleanItemName.includes('نون')) {
        recipe = allRecipes.find(r => {
          const rNorm = normalizePersianText(r.menuItemName);
          return (rNorm.includes('مرغ') || rNorm.includes('جوجه')) && r.isActive !== false;
        });
      }
    }

    if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
      let itemSingleUnitCost = 0;

      for (const ingredient of recipe.ingredients) {
        const ingMatId = Number(ingredient.materialId);
        const liveMat = materialsMap.get(ingMatId);
        const unitPrice = liveMat ? (Number(liveMat.weightedAveragePrice) || Number(liveMat.unitPrice) || Number(ingredient.unitCost)) : Number(ingredient.unitCost);
        
        // Use smart ingredient cost and quantity conversion
        const { normalizedQty: singleNormQty, totalCost: singleCost } = computeIngredientCostAndQty(
          ingredient.quantity,
          ingredient.unit,
          unitPrice,
          liveMat?.unit
        );

        const totalUsedQty = Math.round((singleNormQty * itemQty) * 1000) / 1000;
        const lineCost = singleCost * itemQty;

        itemSingleUnitCost += singleCost;

        // Update kitchen warehouse stock
        const existingStock = await db.warehouseStocks
          .where('[warehouseId+materialId]')
          .equals([whId, ingMatId])
          .first();

        const prevQty = existingStock ? Number(existingStock.quantity) : 0;
        const newQty = Math.round((prevQty - totalUsedQty) * 1000) / 1000;

        if (existingStock && existingStock.id) {
          await db.warehouseStocks.update(existingStock.id, {
            quantity: newQty,
            lastUpdated: new Date()
          });
        } else {
          await db.warehouseStocks.add({
            warehouseId: whId,
            materialId: ingMatId,
            quantity: newQty,
            lastUpdated: new Date()
          });
        }

        // Record stock transaction (کاردکس خروج مصرف در پخت و تولید)
        await db.stockTransactions.add({
          warehouseId: whId,
          warehouseName: whName,
          materialId: ingMatId,
          materialName: liveMat?.name || ingredient.materialName,
          unit: liveMat?.unit || ingredient.unit,
          type: 'sale_production_out',
          quantityChange: -totalUsedQty,
          quantityBefore: prevQty,
          quantityAfter: newQty,
          unitCost: unitPrice,
          totalCost: Math.round(lineCost),
          referenceId: String(order.invoiceNumber || order.id || 'فروش'),
          referenceType: 'order_sale',
          description: `مصرف در سفارش فروش #${order.invoiceNumber || ''} (${orderItem.name} × ${itemQty})`,
          date: order.createdAt || new Date(),
          createdAt: new Date()
        });

        deductedCount++;
      }

      const overhead = (Number(recipe.overheadCost) || 0) * itemQty;
      totalCOGS += (itemSingleUnitCost * itemQty) + overhead;
    } else {
      // Direct raw material match if no recipe (e.g. direct canned drink, or un-reciped dish)
      let directMat = materialsList.find(m => {
        const mNorm = normalizePersianText(m.name);
        return mNorm === cleanItemName || mNorm.includes(cleanItemName) || cleanItemName.includes(mNorm);
      });

      // Partial fallback for chicken / meat / rice / drinks
      if (!directMat && cleanItemName) {
        if (cleanItemName.includes('مرغ') || cleanItemName.includes('جوجه')) {
          directMat = materialsList.find(m => {
            const mNorm = normalizePersianText(m.name);
            return mNorm.includes('مرغ') || mNorm.includes('جوجه');
          });
        } else if (cleanItemName.includes('گوشت') || cleanItemName.includes('کباب') || cleanItemName.includes('کوبیده')) {
          directMat = materialsList.find(m => {
            const mNorm = normalizePersianText(m.name);
            return mNorm.includes('گوشت') || mNorm.includes('کباب');
          });
        } else if (cleanItemName.includes('برنج') || cleanItemName.includes('چلو')) {
          directMat = materialsList.find(m => normalizePersianText(m.name).includes('برنج'));
        }
      }

      if (directMat && directMat.id) {
        const matId = Number(directMat.id);
        const unitCost = Number(directMat.weightedAveragePrice) || Number(directMat.unitPrice) || 0;
        
        // If material unit is Kilogram or Liter, 1 food portion sold directly uses ~0.220 kg/L (220g) of raw material, not 1.0 kg!
        const perPortionFactor = (directMat.unit === 'کیلوگرم' || directMat.unit === 'لیتر') ? 0.220 : 1;
        const totalUsedQty = Math.round((itemQty * perPortionFactor) * 1000) / 1000;
        const lineCost = totalUsedQty * unitCost;
        totalCOGS += lineCost;

        const existingStock = await db.warehouseStocks
          .where('[warehouseId+materialId]')
          .equals([whId, matId])
          .first();

        const prevQty = existingStock ? Number(existingStock.quantity) : 0;
        const newQty = Math.round((prevQty - totalUsedQty) * 1000) / 1000;

        if (existingStock && existingStock.id) {
          await db.warehouseStocks.update(existingStock.id, {
            quantity: newQty,
            lastUpdated: new Date()
          });
        } else {
          await db.warehouseStocks.add({
            warehouseId: whId,
            materialId: matId,
            quantity: newQty,
            lastUpdated: new Date()
          });
        }

        await db.stockTransactions.add({
          warehouseId: whId,
          warehouseName: whName,
          materialId: matId,
          materialName: directMat.name,
          unit: directMat.unit,
          type: 'sale_production_out',
          quantityChange: -totalUsedQty,
          quantityBefore: prevQty,
          quantityAfter: newQty,
          unitCost: unitCost,
          totalCost: Math.round(lineCost),
          referenceId: String(order.invoiceNumber || order.id || 'فروش'),
          referenceType: 'order_sale',
          description: `کسر مصرف در فروش #${order.invoiceNumber || ''} (${orderItem.name} × ${itemQty})`,
          date: order.createdAt || new Date(),
          createdAt: new Date()
        });

        deductedCount++;
      }
    }
  }

  const finalCOGS = Math.round(totalCOGS);

  if (order.id) {
    await db.orders.update(order.id, {
      cogsAmount: finalCOGS,
      productionWarehouseId: whId
    });
  }

  return {
    totalCOGS: finalCOGS,
    productionWarehouseId: whId,
    deductedCount
  };
}

/**
 * Restores raw material inventory when a sales order is deleted or updated.
 */
export async function restoreProductionStockForOrder(order: Order, reason = 'لغو/ابطال فاکتور فروش'): Promise<void> {
  if (!order || !order.items || order.items.length === 0) return;

  // Resolve target warehouse
  let whId = order.productionWarehouseId;
  let productionWh: Warehouse | undefined;
  if (whId) {
    productionWh = await db.warehouses.get(whId);
  }
  if (!productionWh) {
    productionWh = await db.warehouses.where('isProductionDefault').equals(1).first();
    if (!productionWh) {
      productionWh = await db.warehouses.filter(w => w.type === 'kitchen_production' || w.type === 'central').first();
    }
  }

  if (!productionWh || !productionWh.id) return;
  const targetWhId = Number(productionWh.id);
  const whName = productionWh.name;

  const materialsList = await db.rawMaterials.toArray();
  const materialsMap = new Map<number, RawMaterial>();
  materialsList.forEach(m => {
    if (m.id) materialsMap.set(Number(m.id), m);
  });

  const allRecipes = await db.recipes.toArray();

  for (const orderItem of order.items) {
    const itemQty = Number(orderItem.quantity) || 1;
    const cleanItemName = normalizePersianText(orderItem.name || '');

    let recipe: Recipe | undefined;
    if (orderItem.menuItemId) {
      recipe = allRecipes.find(r => Number(r.menuItemId) === Number(orderItem.menuItemId) && r.isActive !== false);
    }
    if (!recipe && cleanItemName) {
      recipe = allRecipes.find(r => normalizePersianText(r.menuItemName) === cleanItemName && r.isActive !== false);
    }
    if (!recipe && cleanItemName) {
      recipe = allRecipes.find(r => {
        const rName = normalizePersianText(r.menuItemName);
        return (rName.includes(cleanItemName) || cleanItemName.includes(rName)) && r.isActive !== false;
      });
    }

    if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
      for (const ingredient of recipe.ingredients) {
        const ingMatId = Number(ingredient.materialId);
        const liveMat = materialsMap.get(ingMatId);
        const unitPrice = liveMat ? (Number(liveMat.weightedAveragePrice) || Number(liveMat.unitPrice) || Number(ingredient.unitCost)) : Number(ingredient.unitCost);

        const { normalizedQty: singleNormQty, totalCost: singleCost } = computeIngredientCostAndQty(
          ingredient.quantity,
          ingredient.unit,
          unitPrice,
          liveMat?.unit
        );

        const totalUsedQty = Math.round((singleNormQty * itemQty) * 1000) / 1000;
        const lineCost = singleCost * itemQty;

        const existingStock = await db.warehouseStocks
          .where('[warehouseId+materialId]')
          .equals([targetWhId, ingMatId])
          .first();

        const prevQty = existingStock ? Number(existingStock.quantity) : 0;
        const newQty = Math.round((prevQty + totalUsedQty) * 1000) / 1000;

        if (existingStock && existingStock.id) {
          await db.warehouseStocks.update(existingStock.id, {
            quantity: newQty,
            lastUpdated: new Date()
          });
        } else {
          await db.warehouseStocks.add({
            warehouseId: targetWhId,
            materialId: ingMatId,
            quantity: newQty,
            lastUpdated: new Date()
          });
        }

        await db.stockTransactions.add({
          warehouseId: targetWhId,
          warehouseName: whName,
          materialId: ingMatId,
          materialName: liveMat ? liveMat.name : ingredient.materialName,
          unit: liveMat ? liveMat.unit : ingredient.unit,
          type: 'manual_adjust',
          quantityChange: totalUsedQty,
          quantityBefore: prevQty,
          quantityAfter: newQty,
          unitCost: unitPrice,
          totalCost: Math.round(lineCost),
          referenceId: String(order.invoiceNumber || order.id || ''),
          referenceType: 'order_sale',
          description: `بازگشت به انبار بابت ${reason} فاکتور #${order.invoiceNumber || ''} (${orderItem.name} × ${itemQty})`,
          date: new Date(),
          createdAt: new Date()
        });
      }
    } else {
      const directMat = materialsList.find(m => {
        const mNorm = normalizePersianText(m.name);
        return mNorm === cleanItemName || mNorm.includes(cleanItemName) || cleanItemName.includes(mNorm);
      });

      if (directMat && directMat.id) {
        const matId = Number(directMat.id);
        const unitCost = Number(directMat.weightedAveragePrice) || Number(directMat.unitPrice) || 0;
        const totalUsedQty = Math.round(itemQty * 1000) / 1000;
        const lineCost = totalUsedQty * unitCost;

        const existingStock = await db.warehouseStocks
          .where('[warehouseId+materialId]')
          .equals([targetWhId, matId])
          .first();

        const prevQty = existingStock ? Number(existingStock.quantity) : 0;
        const newQty = Math.round((prevQty + totalUsedQty) * 1000) / 1000;

        if (existingStock && existingStock.id) {
          await db.warehouseStocks.update(existingStock.id, {
            quantity: newQty,
            lastUpdated: new Date()
          });
        } else {
          await db.warehouseStocks.add({
            warehouseId: targetWhId,
            materialId: matId,
            quantity: newQty,
            lastUpdated: new Date()
          });
        }

        await db.stockTransactions.add({
          warehouseId: targetWhId,
          warehouseName: whName,
          materialId: matId,
          materialName: directMat.name,
          unit: directMat.unit,
          type: 'manual_adjust',
          quantityChange: totalUsedQty,
          quantityBefore: prevQty,
          quantityAfter: newQty,
          unitCost: unitCost,
          totalCost: Math.round(lineCost),
          referenceId: String(order.invoiceNumber || order.id || ''),
          referenceType: 'order_sale',
          description: `بازگشت به انبار بابت ${reason} فاکتور #${order.invoiceNumber || ''} (${orderItem.name} × ${itemQty})`,
          date: new Date(),
          createdAt: new Date()
        });
      }
    }
  }
}

/**
 * Completely deletes a sales order and restores consumed stock to kitchen warehouse.
 */
export async function deleteOrderAndRestoreStock(orderId: number, reason = 'ابطال فاکتور فروش'): Promise<boolean> {
  const order = await db.orders.get(orderId);
  if (!order) return false;

  if (order.status === 'paid') {
    await restoreProductionStockForOrder(order, reason);
  }

  await db.orders.delete(orderId);
  return true;
}

/**
 * Updates a sales order, reverses previous stock deduction and re-applies deduction for updated items.
 */
export async function updateOrderAndSyncStock(orderId: number, updatedFields: Partial<Order>): Promise<Order | null> {
  const existingOrder = await db.orders.get(orderId);
  if (!existingOrder) return null;

  // Step 1: Restore stock for previous items if paid
  if (existingOrder.status === 'paid') {
    await restoreProductionStockForOrder(existingOrder, 'ویرایش مجدد');
  }

  // Step 2: Recalculate totals for updated order
  const mergedOrder: Order = {
    ...existingOrder,
    ...updatedFields,
    id: orderId
  };

  const subtotal = mergedOrder.items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  mergedOrder.subtotal = subtotal;

  let discountAmount = 0;
  if (mergedOrder.discountType === 'percent') {
    discountAmount = (subtotal * Number(mergedOrder.discountValue)) / 100;
  } else if (mergedOrder.discountType === 'amount') {
    discountAmount = Number(mergedOrder.discountValue);
  }

  const settings = await db.settings.toCollection().first();
  const taxPercentage = settings?.taxPercentage || 10;

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  let taxAmount = 0;
  if (mergedOrder.taxEnabled) {
    taxAmount = Math.round((taxableAmount * taxPercentage) / 100);
  }

  mergedOrder.taxAmount = taxAmount;
  mergedOrder.total = Math.max(0, subtotal - discountAmount + taxAmount + (Number(mergedOrder.deliveryFee) || 0) + (Number(mergedOrder.serviceFee) || 0));

  // Step 3: Update order record in Dexie
  await db.orders.update(orderId, mergedOrder as any);

  // Step 4: Re-apply stock deduction if status is paid
  if (mergedOrder.status === 'paid') {
    const { totalCOGS } = await deductProductionStockForOrder(mergedOrder);
    mergedOrder.cogsAmount = totalCOGS;
  }

  return mergedOrder;
}

/**
 * Adjusts inventory for physical stocktaking (انبارگردانی و مغایرت‌گیری)
 */
export async function adjustWarehouseStock(params: {
  warehouseId: number;
  materialId: number;
  newQuantity: number;
  reason?: string;
  referenceId?: string;
}): Promise<void> {
  const { warehouseId, materialId, newQuantity, reason, referenceId } = params;

  const wh = await db.warehouses.get(warehouseId);
  const mat = await db.rawMaterials.get(materialId);

  if (!wh || !mat) return;

  const existingStock = await db.warehouseStocks
    .where('[warehouseId+materialId]')
    .equals([warehouseId, materialId])
    .first();

  const prevQty = existingStock ? existingStock.quantity : 0;
  const diff = newQuantity - prevQty;
  if (diff === 0) return;

  if (existingStock && existingStock.id) {
    await db.warehouseStocks.update(existingStock.id, {
      quantity: newQuantity,
      lastUpdated: new Date()
    });
  } else {
    await db.warehouseStocks.add({
      warehouseId,
      materialId,
      quantity: newQuantity,
      lastUpdated: new Date()
    });
  }

  const unitCost = mat.weightedAveragePrice || mat.unitPrice;
  const transType: StockTransactionType = diff < 0 ? 'waste_out' : 'manual_adjust';

  await db.stockTransactions.add({
    warehouseId,
    warehouseName: wh.name,
    materialId,
    materialName: mat.name,
    unit: mat.unit,
    type: transType,
    quantityChange: diff,
    quantityBefore: prevQty,
    quantityAfter: newQuantity,
    unitCost,
    totalCost: Math.abs(Math.round(diff * unitCost)),
    referenceId: referenceId || 'ADJ',
    referenceType: 'adjustment',
    description: reason || (diff < 0 ? 'کسر موجودی و ثبت ضایعات انبار' : 'تعدیل مثبت انبارگردانی'),
    date: new Date(),
    createdAt: new Date()
  });
}

/**
 * Ensures default warehouses, raw materials, initial stocks, and production recipes
 * are populated for an enterprise-ready experience out of the box.
 */
export async function ensureDefaultInventoryData(): Promise<void> {
  try {
    // 1. Ensure Warehouses
    const whCount = await db.warehouses.count();
    let centralWhId: number;
    let kitchenWhId: number;
    let coldWhId: number;
    let dryWhId: number;
    let barWhId: number;

    if (whCount === 0) {
      centralWhId = await db.warehouses.add({
        code: 'WH-01',
        name: 'انبار مرکزی (تدارکات و دپو)',
        type: 'central',
        manager: 'مهندس رضایی',
        phone: '09121112233',
        location: 'ساختمان مرکزی - طبقه منفی ۱',
        isPurchaseDefault: true,
        isProductionDefault: false,
        isActive: true,
        notes: 'انبار اصلی ورود فاکتورهای عمده خرید و توزیع بین سایر انبارها',
        createdAt: new Date()
      });

      kitchenWhId = await db.warehouses.add({
        code: 'WH-02',
        name: 'انبار خط تولید و آشپزخانه',
        type: 'kitchen_production',
        manager: 'سرآشپز حسینی',
        phone: '09123334455',
        location: 'بخش آماده‌سازی و طبخ غذا',
        isPurchaseDefault: false,
        isProductionDefault: true,
        isActive: true,
        notes: 'انبار مصرف مستقیم؛ کسر اتوماتیک مواد اولیه با صدور هر سفارش فروش از این انبار انجام می‌شود',
        createdAt: new Date()
      });

      coldWhId = await db.warehouses.add({
        code: 'WH-03',
        name: 'سردخانه مواد پروتئینی و لبنی',
        type: 'cold_storage',
        manager: 'آقای کریمی',
        phone: '09124445566',
        location: 'سردخانه زیر صفر و بالای صفر',
        isPurchaseDefault: false,
        isProductionDefault: false,
        isActive: true,
        notes: 'نگهداری گوشت، مرغ، ماهی و پنیر پیتزا در دمای کنترل شده',
        createdAt: new Date()
      });

      dryWhId = await db.warehouses.add({
        code: 'WH-04',
        name: 'انبار مواد خشک و غلات',
        type: 'dry_storage',
        manager: 'آقای ناصری',
        phone: '09125556677',
        location: 'انبار خشک مجاور آشپزخانه',
        isPurchaseDefault: false,
        isProductionDefault: false,
        isActive: true,
        notes: 'نگهداری برنج، روغن، حبوبات، ادویه‌جات و بسته‌بندی‌ها',
        createdAt: new Date()
      });

      barWhId = await db.warehouses.add({
        code: 'WH-05',
        name: 'انبار بار، نوشیدنی و کافه',
        type: 'bar',
        manager: 'آقای مرادی',
        phone: '09126667788',
        location: 'بخش بار و پیشخوان',
        isPurchaseDefault: false,
        isProductionDefault: false,
        isActive: true,
        notes: 'نگهداری انواع نوشیدنی، سیروپ و ملزومات بار',
        createdAt: new Date()
      });
    } else {
      const allWh = await db.warehouses.toArray();
      centralWhId = allWh.find(w => w.type === 'central')?.id || allWh[0].id!;
      kitchenWhId = allWh.find(w => w.isProductionDefault)?.id || allWh.find(w => w.type === 'kitchen_production')?.id || allWh[0].id!;
      coldWhId = allWh.find(w => w.type === 'cold_storage')?.id || centralWhId;
      dryWhId = allWh.find(w => w.type === 'dry_storage')?.id || centralWhId;
      barWhId = allWh.find(w => w.type === 'bar')?.id || centralWhId;
    }

    // 2. Ensure Raw Materials
    const matCount = await db.rawMaterials.count();
    if (matCount === 0) {
      const defaultMaterials: Omit<RawMaterial, 'id'>[] = [
        { code: 'RM-101', name: 'گوشت چرخ‌کرده مخلوط گوساله و گوسفند', category: 'پروتئینی', unit: 'کیلوگرم', unitPrice: 680000, weightedAveragePrice: 680000, minStockAlert: 15, createdAt: new Date() },
        { code: 'RM-102', name: 'فیله سینه مرغ تازه', category: 'پروتئینی', unit: 'کیلوگرم', unitPrice: 240000, weightedAveragePrice: 240000, minStockAlert: 20, createdAt: new Date() },
        { code: 'RM-103', name: 'پنیر پیتزا موزارلا درجه یک', category: 'لبنیات', unit: 'کیلوگرم', unitPrice: 310000, weightedAveragePrice: 310000, minStockAlert: 12, createdAt: new Date() },
        { code: 'RM-104', name: 'نان برگر کنجدی تازه', category: 'نان و غلات', unit: 'عدد', unitPrice: 12000, weightedAveragePrice: 12000, minStockAlert: 50, createdAt: new Date() },
        { code: 'RM-105', name: 'برنج طارم هاشمی معطر', category: 'برنج و غلات', unit: 'کیلوگرم', unitPrice: 185000, weightedAveragePrice: 185000, minStockAlert: 40, createdAt: new Date() },
        { code: 'RM-106', name: 'روغن سرخ‌کردنی مخصوص', category: 'روغن و چاشنی', unit: 'لیتر', unitPrice: 95000, weightedAveragePrice: 95000, minStockAlert: 25, createdAt: new Date() },
        { code: 'RM-107', name: 'سیب‌زمینی خلال منجمد نیمه‌آماده', category: 'سبزیجات و منجمد', unit: 'کیلوگرم', unitPrice: 80000, weightedAveragePrice: 80000, minStockAlert: 30, createdAt: new Date() },
        { code: 'RM-108', name: 'گوجه فرنگی تازه', category: 'سبزیجات', unit: 'کیلوگرم', unitPrice: 35000, weightedAveragePrice: 35000, minStockAlert: 15, createdAt: new Date() },
        { code: 'RM-109', name: 'خیارشور ویژه قلمی', category: 'سبزیجات و ترشی', unit: 'کیلوگرم', unitPrice: 75000, weightedAveragePrice: 75000, minStockAlert: 10, createdAt: new Date() },
        { code: 'RM-110', name: 'سس مخصوص برگر و ساندویچ', category: 'سس و چاشنی', unit: 'کیلوگرم', unitPrice: 110000, weightedAveragePrice: 110000, minStockAlert: 10, createdAt: new Date() },
        { code: 'RM-111', name: 'نوشابه قوطی ۳۳۰ سی‌سی', category: 'نوشیدنی', unit: 'عدد', unitPrice: 28000, weightedAveragePrice: 28000, minStockAlert: 80, createdAt: new Date() },
        { code: 'RM-112', name: 'دوغ سنتی محلی', category: 'نوشیدنی', unit: 'بطری', unitPrice: 22000, weightedAveragePrice: 22000, minStockAlert: 40, createdAt: new Date() },
        { code: 'RM-113', name: 'جعبه و بسته‌بندی بیرون‌بر', category: 'ملزومات بسته‌بندی', unit: 'عدد', unitPrice: 14000, weightedAveragePrice: 14000, minStockAlert: 100, createdAt: new Date() },
      ];

      const insertedMatIds: number[] = [];
      for (const mat of defaultMaterials) {
        const id = await db.rawMaterials.add(mat);
        insertedMatIds.push(id);
      }

      // Seed Initial Stocks across warehouses
      // In Cold Storage: Meat (50 kg), Chicken (40 kg), Cheese (30 kg)
      await db.warehouseStocks.bulkAdd([
        { warehouseId: coldWhId, materialId: insertedMatIds[0], quantity: 50, lastUpdated: new Date() },
        { warehouseId: coldWhId, materialId: insertedMatIds[1], quantity: 40, lastUpdated: new Date() },
        { warehouseId: coldWhId, materialId: insertedMatIds[2], quantity: 30, lastUpdated: new Date() },
      ]);

      // In Central Warehouse: Rice (120 kg), Oil (80 L), Packaging (400 pcs), Soda (250 pcs)
      await db.warehouseStocks.bulkAdd([
        { warehouseId: centralWhId, materialId: insertedMatIds[4], quantity: 120, lastUpdated: new Date() },
        { warehouseId: centralWhId, materialId: insertedMatIds[5], quantity: 80, lastUpdated: new Date() },
        { warehouseId: centralWhId, materialId: insertedMatIds[10], quantity: 250, lastUpdated: new Date() },
        { warehouseId: centralWhId, materialId: insertedMatIds[12], quantity: 400, lastUpdated: new Date() },
      ]);

      // In Kitchen / Production Warehouse (Active cooking line):
      // Meat (18 kg), Chicken (15 kg), Cheese (10 kg), Buns (80 pcs), Fries (35 kg), Tomatoes (20 kg), Pickles (12 kg), Sauce (8 kg), Packaging (80 pcs)
      await db.warehouseStocks.bulkAdd([
        { warehouseId: kitchenWhId, materialId: insertedMatIds[0], quantity: 18, lastUpdated: new Date() },
        { warehouseId: kitchenWhId, materialId: insertedMatIds[1], quantity: 15, lastUpdated: new Date() },
        { warehouseId: kitchenWhId, materialId: insertedMatIds[2], quantity: 10, lastUpdated: new Date() },
        { warehouseId: kitchenWhId, materialId: insertedMatIds[3], quantity: 80, lastUpdated: new Date() },
        { warehouseId: kitchenWhId, materialId: insertedMatIds[5], quantity: 15, lastUpdated: new Date() },
        { warehouseId: kitchenWhId, materialId: insertedMatIds[6], quantity: 35, lastUpdated: new Date() },
        { warehouseId: kitchenWhId, materialId: insertedMatIds[7], quantity: 20, lastUpdated: new Date() },
        { warehouseId: kitchenWhId, materialId: insertedMatIds[8], quantity: 12, lastUpdated: new Date() },
        { warehouseId: kitchenWhId, materialId: insertedMatIds[9], quantity: 8, lastUpdated: new Date() },
        { warehouseId: kitchenWhId, materialId: insertedMatIds[12], quantity: 80, lastUpdated: new Date() },
      ]);

      // In Bar Warehouse: Soda (60 pcs), Doogh (45 pcs)
      await db.warehouseStocks.bulkAdd([
        { warehouseId: barWhId, materialId: insertedMatIds[10], quantity: 60, lastUpdated: new Date() },
        { warehouseId: barWhId, materialId: insertedMatIds[11], quantity: 45, lastUpdated: new Date() },
      ]);

      // Initial Stock Transactions for audit trial
      const centralWh = await db.warehouses.get(centralWhId);
      const kitchenWh = await db.warehouses.get(kitchenWhId);
      const coldWh = await db.warehouses.get(coldWhId);

      await db.stockTransactions.bulkAdd([
        {
          warehouseId: coldWhId,
          warehouseName: coldWh?.name || 'سردخانه',
          materialId: insertedMatIds[0],
          materialName: 'گوشت چرخ‌کرده مخلوط گوساله و گوسفند',
          unit: 'کیلوگرم',
          type: 'purchase_in',
          quantityChange: 50,
          quantityBefore: 0,
          quantityAfter: 50,
          unitCost: 680000,
          totalCost: 34000000,
          referenceId: 'INV-1001',
          referenceType: 'expense_purchase',
          description: 'موجودی اولیه و ورود از فاکتور خرید کشتارگاه',
          date: new Date(),
          createdAt: new Date()
        },
        {
          warehouseId: kitchenWhId,
          warehouseName: kitchenWh?.name || 'انبار آشپزخانه',
          materialId: insertedMatIds[3],
          materialName: 'نان برگر کنجدی تازه',
          unit: 'عدد',
          type: 'purchase_in',
          quantityChange: 80,
          quantityBefore: 0,
          quantityAfter: 80,
          unitCost: 12000,
          totalCost: 960000,
          referenceId: 'INV-1002',
          referenceType: 'expense_purchase',
          description: 'ورود از فاکتور خرید نانوایی فانتزی',
          date: new Date(),
          createdAt: new Date()
        }
      ]);
    }

    // 3. Ensure Default Categories & Menu Items if empty, and link Production Recipes
    const catCount = await db.categories.count();
    let burgerCatId: number;
    let pizzaCatId: number;
    let drinksCatId: number;

    if (catCount === 0) {
      burgerCatId = await db.categories.add({ name: 'برگرها و ساندویچ' });
      pizzaCatId = await db.categories.add({ name: 'پیتزاها' });
      drinksCatId = await db.categories.add({ name: 'نوشیدنی‌ها' });

      // Add default menu items
      const burgerItemId = await db.menuItems.add({
        categoryId: burgerCatId,
        name: 'برگر کلاسیک مخصوص',
        price: 320000,
        isActive: true,
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&q=80'
      });

      const doubleBurgerId = await db.menuItems.add({
        categoryId: burgerCatId,
        name: 'دوبل برگر با پنیر',
        price: 460000,
        isActive: true,
        image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=500&q=80'
      });

      const pizzaItemId = await db.menuItems.add({
        categoryId: pizzaCatId,
        name: 'پیتزا مخلوط مخصوص',
        price: 390000,
        isActive: true,
        image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&q=80'
      });

      const friesItemId = await db.menuItems.add({
        categoryId: burgerCatId,
        name: 'سیب‌زمینی سرخ‌کرده',
        price: 130000,
        isActive: true,
        image: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=500&q=80'
      });

      const sodaItemId = await db.menuItems.add({
        categoryId: drinksCatId,
        name: 'نوشابه قوطی ۳۳۰ میل',
        price: 45000,
        isActive: true,
        image: 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=500&q=80'
      });

      // Now create Recipes (فرمول تولید)
      const allMats = await db.rawMaterials.toArray();
      const getMat = (name: string) => allMats.find(m => m.name.includes(name));

      const meat = getMat('گوشت');
      const chicken = getMat('مرغ');
      const bun = getMat('نان');
      const cheese = getMat('پنیر');
      const tomato = getMat('گوجه');
      const pickle = getMat('خیارشور');
      const sauce = getMat('سس');
      const fries = getMat('سیب‌زمینی');
      const box = getMat('جعبه');
      const soda = getMat('نوشابه');

      // 1. Recipe for 'برگر کلاسیک مخصوص'
      if (meat && bun && cheese && tomato && pickle && sauce && box) {
        const ingredients: RecipeIngredient[] = [
          { materialId: meat.id!, materialName: meat.name, quantity: 0.18, unit: 'کیلوگرم', unitCost: meat.unitPrice, itemTotalCost: Math.round(0.18 * meat.unitPrice) },
          { materialId: bun.id!, materialName: bun.name, quantity: 1, unit: 'عدد', unitCost: bun.unitPrice, itemTotalCost: bun.unitPrice },
          { materialId: cheese.id!, materialName: cheese.name, quantity: 0.04, unit: 'کیلوگرم', unitCost: cheese.unitPrice, itemTotalCost: Math.round(0.04 * cheese.unitPrice) },
          { materialId: tomato.id!, materialName: tomato.name, quantity: 0.05, unit: 'کیلوگرم', unitCost: tomato.unitPrice, itemTotalCost: Math.round(0.05 * tomato.unitPrice) },
          { materialId: pickle.id!, materialName: pickle.name, quantity: 0.04, unit: 'کیلوگرم', unitCost: pickle.unitPrice, itemTotalCost: Math.round(0.04 * pickle.unitPrice) },
          { materialId: sauce.id!, materialName: sauce.name, quantity: 0.03, unit: 'کیلوگرم', unitCost: sauce.unitPrice, itemTotalCost: Math.round(0.03 * sauce.unitPrice) },
          { materialId: box.id!, materialName: box.name, quantity: 1, unit: 'عدد', unitCost: box.unitPrice, itemTotalCost: box.unitPrice },
        ];
        const overhead = 8000;
        const totalCost = ingredients.reduce((sum, i) => sum + i.itemTotalCost, 0) + overhead;

        await db.recipes.add({
          menuItemId: burgerItemId,
          menuItemName: 'برگر کلاسیک مخصوص',
          yieldQuantity: 1,
          ingredients,
          overheadCost: overhead,
          totalCost,
          isActive: true,
          updatedAt: new Date()
        });
      }

      // 2. Recipe for 'سیب‌زمینی سرخ‌کرده'
      if (fries && box) {
        const oil = getMat('روغن');
        const ingredients: RecipeIngredient[] = [
          { materialId: fries.id!, materialName: fries.name, quantity: 0.35, unit: 'کیلوگرم', unitCost: fries.unitPrice, itemTotalCost: Math.round(0.35 * fries.unitPrice) },
          { materialId: box.id!, materialName: box.name, quantity: 1, unit: 'عدد', unitCost: box.unitPrice, itemTotalCost: box.unitPrice },
        ];
        if (oil) {
          ingredients.push({ materialId: oil.id!, materialName: oil.name, quantity: 0.05, unit: 'لیتر', unitCost: oil.unitPrice, itemTotalCost: Math.round(0.05 * oil.unitPrice) });
        }
        const overhead = 4000;
        const totalCost = ingredients.reduce((sum, i) => sum + i.itemTotalCost, 0) + overhead;

        await db.recipes.add({
          menuItemId: friesItemId,
          menuItemName: 'سیب‌زمینی سرخ‌کرده',
          yieldQuantity: 1,
          ingredients,
          overheadCost: overhead,
          totalCost,
          isActive: true,
          updatedAt: new Date()
        });
      }

      // 3. Recipe for 'نوشابه قوطی'
      if (soda) {
        const ingredients: RecipeIngredient[] = [
          { materialId: soda.id!, materialName: soda.name, quantity: 1, unit: 'عدد', unitCost: soda.unitPrice, itemTotalCost: soda.unitPrice }
        ];
        await db.recipes.add({
          menuItemId: sodaItemId,
          menuItemName: 'نوشابه قوطی ۳۳۰ میل',
          yieldQuantity: 1,
          ingredients,
          overheadCost: 0,
          totalCost: soda.unitPrice,
          isActive: true,
          updatedAt: new Date()
        });
      }

      // 4. Recipe for 'پیتزا مخلوط مخصوص'
      if (pizzaItemId && cheese && meat && chicken && box) {
        const ingredients: RecipeIngredient[] = [
          { materialId: cheese.id!, materialName: cheese.name, quantity: 0.22, unit: 'کیلوگرم', unitCost: cheese.unitPrice, itemTotalCost: Math.round(0.22 * cheese.unitPrice) },
          { materialId: meat.id!, materialName: meat.name, quantity: 0.12, unit: 'کیلوگرم', unitCost: meat.unitPrice, itemTotalCost: Math.round(0.12 * meat.unitPrice) },
          { materialId: chicken.id!, materialName: chicken.name, quantity: 0.08, unit: 'کیلوگرم', unitCost: chicken.unitPrice, itemTotalCost: Math.round(0.08 * chicken.unitPrice) },
          { materialId: box.id!, materialName: box.name, quantity: 1, unit: 'عدد', unitCost: box.unitPrice, itemTotalCost: box.unitPrice },
        ];
        if (sauce) {
          ingredients.push({ materialId: sauce.id!, materialName: sauce.name, quantity: 0.04, unit: 'کیلوگرم', unitCost: sauce.unitPrice, itemTotalCost: Math.round(0.04 * sauce.unitPrice) });
        }
        const overhead = 15000;
        const totalCost = ingredients.reduce((sum, i) => sum + i.itemTotalCost, 0) + overhead;

        await db.recipes.add({
          menuItemId: pizzaItemId,
          menuItemName: 'پیتزا مخلوط مخصوص',
          yieldQuantity: 1,
          ingredients,
          overheadCost: overhead,
          totalCost,
          isActive: true,
          updatedAt: new Date()
        });
      }
    }

    // 4. Post-check: Guarantee EVERY menu item in db (Chicken, Meat, Kebab, Pizza, Burger, Rice, Fries) has a connected Recipe
    const allMenuItems = await db.menuItems.toArray();
    const allRecipes = await db.recipes.toArray();
    const currentMaterials = await db.rawMaterials.toArray();
    const findMat = (term: string) => currentMaterials.find(m => m.name.includes(term));

    const pCheese = findMat('پنیر');
    const pMeat = findMat('گوشت');
    const pChicken = findMat('مرغ') || findMat('جوجه');
    const pRice = findMat('برنج');
    const pBun = findMat('نان');
    const pSauce = findMat('سس');
    const pBox = findMat('جعبه');
    const pFries = findMat('سیب‌زمینی');
    const pOil = findMat('روغن');

    for (const item of allMenuItems) {
      if (!item.id) continue;
      const hasRecipe = allRecipes.some(r => r.menuItemId === item.id || r.menuItemName.trim() === item.name.trim());
      if (hasRecipe) continue;

      const itemName = item.name.trim();

      // Chicken & Joojeh Dishes
      if ((itemName.includes('مرغ') || itemName.includes('جوجه') || itemName.includes('زرشک')) && pChicken) {
        const ingredients: RecipeIngredient[] = [
          { materialId: pChicken.id!, materialName: pChicken.name, quantity: 0.22, unit: 'کیلوگرم', unitCost: pChicken.unitPrice, itemTotalCost: Math.round(0.22 * pChicken.unitPrice) },
        ];
        if (pRice && (itemName.includes('چلو') || itemName.includes('زرشک') || itemName.includes('پلو'))) {
          ingredients.push({ materialId: pRice.id!, materialName: pRice.name, quantity: 0.25, unit: 'کیلوگرم', unitCost: pRice.unitPrice, itemTotalCost: Math.round(0.25 * pRice.unitPrice) });
        }
        if (pBox) {
          ingredients.push({ materialId: pBox.id!, materialName: pBox.name, quantity: 1, unit: 'عدد', unitCost: pBox.unitPrice, itemTotalCost: pBox.unitPrice });
        }
        const overhead = 12000;
        const totalCost = ingredients.reduce((sum, i) => sum + i.itemTotalCost, 0) + overhead;

        await db.recipes.add({
          menuItemId: item.id,
          menuItemName: item.name,
          yieldQuantity: 1,
          ingredients,
          overheadCost: overhead,
          totalCost,
          isActive: true,
          updatedAt: new Date()
        });
      }

      // Meat & Kebab Dishes
      else if ((itemName.includes('کباب') || itemName.includes('گوشت') || itemName.includes('کوبیده') || itemName.includes('استیک')) && pMeat) {
        const ingredients: RecipeIngredient[] = [
          { materialId: pMeat.id!, materialName: pMeat.name, quantity: 0.18, unit: 'کیلوگرم', unitCost: pMeat.unitPrice, itemTotalCost: Math.round(0.18 * pMeat.unitPrice) },
        ];
        if (pRice && (itemName.includes('چلو') || itemName.includes('پلو'))) {
          ingredients.push({ materialId: pRice.id!, materialName: pRice.name, quantity: 0.25, unit: 'کیلوگرم', unitCost: pRice.unitPrice, itemTotalCost: Math.round(0.25 * pRice.unitPrice) });
        }
        if (pBox) {
          ingredients.push({ materialId: pBox.id!, materialName: pBox.name, quantity: 1, unit: 'عدد', unitCost: pBox.unitPrice, itemTotalCost: pBox.unitPrice });
        }
        const overhead = 15000;
        const totalCost = ingredients.reduce((sum, i) => sum + i.itemTotalCost, 0) + overhead;

        await db.recipes.add({
          menuItemId: item.id,
          menuItemName: item.name,
          yieldQuantity: 1,
          ingredients,
          overheadCost: overhead,
          totalCost,
          isActive: true,
          updatedAt: new Date()
        });
      }

      // Pizza items
      else if (itemName.includes('پیتزا') && (pCheese || pMeat)) {
        const ingredients: RecipeIngredient[] = [];
        if (pCheese) ingredients.push({ materialId: pCheese.id!, materialName: pCheese.name, quantity: 0.22, unit: 'کیلوگرم', unitCost: pCheese.unitPrice, itemTotalCost: Math.round(0.22 * pCheese.unitPrice) });
        if (pMeat) ingredients.push({ materialId: pMeat.id!, materialName: pMeat.name, quantity: 0.12, unit: 'کیلوگرم', unitCost: pMeat.unitPrice, itemTotalCost: Math.round(0.12 * pMeat.unitPrice) });
        if (pChicken) ingredients.push({ materialId: pChicken.id!, materialName: pChicken.name, quantity: 0.08, unit: 'کیلوگرم', unitCost: pChicken.unitPrice, itemTotalCost: Math.round(0.08 * pChicken.unitPrice) });
        if (pBox) ingredients.push({ materialId: pBox.id!, materialName: pBox.name, quantity: 1, unit: 'عدد', unitCost: pBox.unitPrice, itemTotalCost: pBox.unitPrice });
        
        const overhead = 15000;
        const totalCost = ingredients.reduce((sum, i) => sum + i.itemTotalCost, 0) + overhead;

        await db.recipes.add({
          menuItemId: item.id,
          menuItemName: item.name,
          yieldQuantity: 1,
          ingredients,
          overheadCost: overhead,
          totalCost,
          isActive: true,
          updatedAt: new Date()
        });
      }

      // Burger items
      else if (itemName.includes('برگر') && (pMeat || pBun)) {
        const ingredients: RecipeIngredient[] = [];
        if (pMeat) ingredients.push({ materialId: pMeat.id!, materialName: pMeat.name, quantity: 0.18, unit: 'کیلوگرم', unitCost: pMeat.unitPrice, itemTotalCost: Math.round(0.18 * pMeat.unitPrice) });
        if (pBun) ingredients.push({ materialId: pBun.id!, materialName: pBun.name, quantity: 1, unit: 'عدد', unitCost: pBun.unitPrice, itemTotalCost: pBun.unitPrice });
        if (pCheese) ingredients.push({ materialId: pCheese.id!, materialName: pCheese.name, quantity: 0.04, unit: 'کیلوگرم', unitCost: pCheese.unitPrice, itemTotalCost: Math.round(0.04 * pCheese.unitPrice) });
        if (pBox) ingredients.push({ materialId: pBox.id!, materialName: pBox.name, quantity: 1, unit: 'عدد', unitCost: pBox.unitPrice, itemTotalCost: pBox.unitPrice });
        
        const overhead = 8000;
        const totalCost = ingredients.reduce((sum, i) => sum + i.itemTotalCost, 0) + overhead;

        await db.recipes.add({
          menuItemId: item.id,
          menuItemName: item.name,
          yieldQuantity: 1,
          ingredients,
          overheadCost: overhead,
          totalCost,
          isActive: true,
          updatedAt: new Date()
        });
      }

      // Fries
      else if (itemName.includes('سیب‌زمینی') && (pFries || pBox)) {
        const ingredients: RecipeIngredient[] = [];
        if (pFries) ingredients.push({ materialId: pFries.id!, materialName: pFries.name, quantity: 0.35, unit: 'کیلوگرم', unitCost: pFries.unitPrice, itemTotalCost: Math.round(0.35 * pFries.unitPrice) });
        if (pBox) ingredients.push({ materialId: pBox.id!, materialName: pBox.name, quantity: 1, unit: 'عدد', unitCost: pBox.unitPrice, itemTotalCost: pBox.unitPrice });
        if (pOil) ingredients.push({ materialId: pOil.id!, materialName: pOil.name, quantity: 0.05, unit: 'لیتر', unitCost: pOil.unitPrice, itemTotalCost: Math.round(0.05 * pOil.unitPrice) });
        
        const overhead = 4000;
        const totalCost = ingredients.reduce((sum, i) => sum + i.itemTotalCost, 0) + overhead;

        await db.recipes.add({
          menuItemId: item.id,
          menuItemName: item.name,
          yieldQuantity: 1,
          ingredients,
          overheadCost: overhead,
          totalCost,
          isActive: true,
          updatedAt: new Date()
        });
      }
    }

    // 5. Self-Healing DB Repair: Repair any raw material unit price that was erroneously set to total purchase invoice amount (> 1.2M)
    const materialsToFix = await db.rawMaterials.toArray();
    for (const mat of materialsToFix) {
      if (!mat.id) continue;
      const currentPrice = mat.weightedAveragePrice || mat.unitPrice || 0;
      if (currentPrice >= 1200000 || currentPrice === 0) {
        const expenses = await db.expenses.where('materialId').equals(mat.id).toArray();
        let trueUnitPrice = 0;
        if (expenses.length > 0) {
          const validExp = expenses.find(e => e.quantity && e.quantity > 0 && e.amount > 0);
          if (validExp && validExp.quantity) {
            trueUnitPrice = Math.round(validExp.amount / validExp.quantity);
          }
        }
        if (!trueUnitPrice || trueUnitPrice >= 1200000) {
          trueUnitPrice = mat.name.includes('گوشت') ? 850000 : mat.name.includes('مرغ') ? 350000 : mat.name.includes('پنیر') ? 320000 : mat.name.includes('برنج') ? 140000 : 250000;
        }
        await db.rawMaterials.update(mat.id, {
          unitPrice: trueUnitPrice,
          weightedAveragePrice: trueUnitPrice
        });
      }
    }
  } catch (err) {
    console.error('Failed to ensure default inventory data:', err);
  }
}

