import React, { useState } from 'react';
import { 
  X, BookOpen, CheckCircle2, HelpCircle, Lightbulb, ArrowLeft, 
  Wallet, ShoppingBag, Package, Utensils, Scale, FileSpreadsheet, 
  TrendingUp, Users, Search
} from 'lucide-react';
import { AccountingSubTab } from './AccountingScreen';

interface AccountingBeginnerGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab: (tab: AccountingSubTab) => void;
}

interface GlossaryItem {
  term: string;
  english: string;
  simpleMeaning: string;
  realExample: string;
  relatedTab: AccountingSubTab;
  relatedTabLabel: string;
  category: 'basics' | 'inventory' | 'treasury' | 'reports';
}

const GLOSSARY_ITEMS: GlossaryItem[] = [
  {
    term: 'بدهکار و بستانکار',
    english: 'Debit & Credit',
    simpleMeaning: 'در حسابداری یک قانون طلایی و ساده وجود دارد: هر حساب یا دارایی که چیزی «دریافت کند» بدهکار می‌شود و هر حسابی که چیزی از آن «خارج شود» بستانکار می‌شود.',
    realExample: 'وقتی ۱۰ میلیون تومان از کارتخوان به بانک ملت واریز می‌شود، «بانک ملت» ۱۰ میلیون بدهکار (دریافت‌کننده) و «فروش» ۱۰ میلیون بستانکار می‌شود. سیستم آرکا این کار را ۱۰۰٪ خودکار انجام می‌دهد!',
    relatedTab: 'journal_entries',
    relatedTabLabel: 'مشاهده اسناد خودکار',
    category: 'basics'
  },
  {
    term: 'بهای تمام‌شده کالای فروش‌رفته',
    english: 'Cost of Goods Sold (COGS)',
    simpleMeaning: 'یعنی فقط پول مواد اولیه‌ای که دقیقاً داخل غذاهای فروخته‌شده مصرف شده است (نه کل خریدهای انبار و نه هزینه‌هایی مثل اجاره و برق).',
    realExample: 'اگر یک پیتزا را ۲۵۰ هزار تومان بفروشید و پنیر، خمیر و گوشت داخل آن ۹۰ هزار تومان تمام شده باشد، بهای تمام‌شده ۹۰ هزار تومان و سود ناخالص شما ۱۶۰ هزار تومان است.',
    relatedTab: 'production_recipes',
    relatedTabLabel: 'تعریف فرمول ساخت غذا',
    category: 'inventory'
  },
  {
    term: 'تفاوت خرید انبار با هزینه جاری',
    english: 'Inventory Asset vs Operating Expense',
    simpleMeaning: 'خرید مواد اولیه (مثل گوشت و روغن) تا وقتی در انبار است «دارایی» شماست و پولتان از بین نرفته؛ اما هزینه جاری (مثل قبض برق، اجاره یا پیک) همان لحظه خرج شده است.',
    realExample: 'وقتی ۵۰ کیلو برنج می‌خرید، پول نقد شما تبدیل به دارایی انبار شده است. هر وقت آن برنج تبدیل به غذا شد و فروخته شد، به اندازه مصرف‌شده از سود کسر می‌گردد.',
    relatedTab: 'purchases_expenses',
    relatedTabLabel: 'ثبت خرید و هزینه',
    category: 'basics'
  },
  {
    term: 'کاردکس کالا (تاریخچه انبار)',
    english: 'Stock Kardex / Ledger',
    simpleMeaning: 'دفترچه تاریخچه ورود و خروج یک کالای خاص در انبار که نشان می‌دهد چه روزی، چقدر جنس وارد انبار شده و چقدر در فروش‌ها مصرف شده است.',
    realExample: 'اگر شک دارید چرا موجودی پنیر پیتزا کم شده، در «کاردکس کالا» پنیر را انتخاب می‌کنید تا ریز تمام فاکتورهای خرید و غذاهایی که از آن پنیر مصرف کرده‌اند را خط به خط ببینید.',
    relatedTab: 'stock_kardex',
    relatedTabLabel: 'مشاهده کاردکس کالا',
    category: 'inventory'
  },
  {
    term: 'حواله انتقال بین انبارها',
    english: 'Warehouse Transfer',
    simpleMeaning: 'جابجایی جنس از یک انبار (مثلاً انبار مرکزی یا سردخانه) به انبار دیگر (مثلاً انبار آشپزخانه) بدون اینکه خرید یا فروشی اتفاق افتاده باشد.',
    realExample: 'صبح اول وقت ۲۰ کیلو گوشت از انبار سردخانه تحویل سرآشپز در آشپزخانه می‌دهید؛ با ثبت حواله، از سردخانه کم شده و به موجودی آشپزخانه اضافه می‌شود.',
    relatedTab: 'transfers',
    relatedTabLabel: 'ثبت حواله بین انبار',
    category: 'inventory'
  },
  {
    term: 'سود ناخالص در برابر سود خالص',
    english: 'Gross Profit vs Net Profit',
    simpleMeaning: '«سود ناخالص» یعنی فروش منهای پول مواد اولیه غذا. اما «سود خالص» یعنی بعد از کم کردن اجاره، قبض، حقوق پرسنل و تمام هزینه‌های جانبی، چقدر واقعاً برایتان مانده است.',
    realExample: 'اگر ۱۰۰ میلیون فروش داشتید، ۴۰ میلیون مواد اولیه مصرف شد (سود ناخالص = ۶۰ میلیون) و ۲۵ میلیون هم حقوق و اجاره دادید، سود خالص واقعی شما ۳۵ میلیون تومان است.',
    relatedTab: 'profit_loss',
    relatedTabLabel: 'مشاهده سود و زیان',
    category: 'reports'
  },
  {
    term: 'ترازنامه (بیلان مالی)',
    english: 'Balance Sheet',
    simpleMeaning: 'یک عکس فوری از وضعیت ثروت کسب‌وکار شما که در یک طرف «دارایی‌ها» (پول بانک، صندوق، موجودی انبار و طلب‌ها) و در طرف دیگر «بدهی‌ها و سرمایه» را نشان می‌دهد.',
    realExample: 'هر زمان بخواهید بدانید کل ارزش دارایی‌های موجود در کسب‌وکارتان چقدر است و چقدر بدهی تسویه‌نشده دارید، به ترازنامه نگاه می‌کنید.',
    relatedTab: 'financial_statements',
    relatedTabLabel: 'مشاهده ترازنامه',
    category: 'reports'
  },
  {
    term: 'حساب معین اشخاص (طرف‌حساب‌ها)',
    english: 'Party Statement / Sub-Ledger',
    simpleMeaning: 'دفتر حساب و کتاب شما با هر فروشنده، تامین‌کننده یا مشتری که نشان می‌دهد چقدر از او جنس خریده‌اید، چقدر پرداخت کرده‌اید و چقدر بدهکار یا طلبکار هستید.',
    realExample: 'اگر از «پخش لبنیات کاله» در طول ماه ۱۰ بار نسیه و نقد خرید کرده‌اید، در این بخش ریز فاکتورها و مانده بدهی دقیق به او را یکجا می‌بینید.',
    relatedTab: 'parties_report',
    relatedTabLabel: 'مشاهده حساب اشخاص',
    category: 'treasury'
  },
  {
    term: 'سرفصل حساب‌ها و دفتر کل',
    english: 'Chart of Accounts & General Ledger',
    simpleMeaning: 'قفسه‌بندی استاندارد حساب‌ها (دارایی، بدهی، درآمد، هزینه) تا تمام اعداد مالی در جای درست خود دسته‌بندی شوند.',
    realExample: 'شما نیازی به حفظ کردن کد حساب‌ها ندارید؛ وقتی فاکتور فروش یا هزینه ثبت می‌کنید، سیستم خودش آن را در قفسه درست در دفتر کل قرار می‌دهد.',
    relatedTab: 'general_ledger',
    relatedTabLabel: 'مشاهده دفتر کل',
    category: 'reports'
  }
];

export default function AccountingBeginnerGuideModal({
  isOpen,
  onClose,
  onNavigateToTab
}: AccountingBeginnerGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'workflow' | 'glossary'>('workflow');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredGlossary = GLOSSARY_ITEMS.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      item.term.toLowerCase().includes(q) ||
      item.simpleMeaning.toLowerCase().includes(q) ||
      item.realExample.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-inner">
              <BookOpen size={24} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">راهنمای حسابداری به زبان ساده (بدون نیاز به دانش قبلی)</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                چطور بدون بلد بودن فرمول‌های پیچیده، تمام حساب‌وکتاب، انبار و سود خالص خود را دقیق مدیریت کنید؟
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-4 pb-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('workflow')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'workflow'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Lightbulb size={16} />
              <span>ترتیب کار روزانه (از کجا شروع کنم؟)</span>
            </button>
            <button
              onClick={() => setActiveTab('glossary')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'glossary'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HelpCircle size={16} />
              <span>معنی اصطلاحات حسابداری به زبان ساده</span>
            </button>
          </div>

          {activeTab === 'glossary' && (
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی اصطلاح (مثلاً کاردکس، ترازنامه)..."
                className="w-full pr-9 pl-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'workflow' ? (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs sm:text-sm text-blue-900 leading-relaxed flex items-start gap-3">
                <CheckCircle2 size={20} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">خبر خوب:</span> در این نرم‌افزار شما اصلاً نیازی به نوشتن سند حسابداری (بدهکار و بستانکار) ندارید! شما فقط کارهای روزمره مغازه یا رستوران (خرید، هزینه، فروش) را ثبت می‌کنید و <strong>موتور هوشمند آرکا خودش تمام دفاتر رسمی، ترازنامه و سود خالص را در پشت صحنه می‌سازد.</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Step 1 */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">۱</span>
                      <h3 className="font-bold text-slate-900 text-sm">معرفی حساب بانکی و صندوق نقد</h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      ابتدا حساب بانکی متصل به دستگاه کارتخوان و صندوق پول نقد خود را تعریف کنید تا هر پولی که از فروش می‌آید یا برای خرید خرج می‌شود، دقیقاً از حساب درست کم یا زیاد شود.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onNavigateToTab('banking_cash');
                      onClose();
                    }}
                    className="mt-4 w-full py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Wallet size={14} />
                    <span>رفتن به بخش بانک‌ها و صندوق</span>
                    <ArrowLeft size={14} />
                  </button>
                </div>

                {/* Step 2 */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center">۲</span>
                      <h3 className="font-bold text-slate-900 text-sm">تعریف انبار و مواد اولیه</h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      کالاها و مواد اولیه مصرفی خود (مثل گوشت، پنیر، نوشابه، ظرف یکبارمصرف) را با واحد شمارش (کیلوگرم، گرم، عدد) تعریف کنید تا موجودی لحظه‌ای آن‌ها همیشه جلوی چشمتان باشد.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onNavigateToTab('warehouses_inventory');
                      onClose();
                    }}
                    className="mt-4 w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Package size={14} />
                    <span>رفتن به بخش انبار و کالاها</span>
                    <ArrowLeft size={14} />
                  </button>
                </div>

                {/* Step 3 */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="w-7 h-7 rounded-lg bg-purple-600 text-white font-black text-xs flex items-center justify-center">۳</span>
                      <h3 className="font-bold text-slate-900 text-sm">فرمول ساخت غذا (رسپی)</h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      برای هر آیتم منو مشخص کنید چقدر مواد اولیه می‌برد (مثلاً همبرگر: ۱۵۰ گرم گوشت + ۱ عدد نان). با این کار، در هر فروش صندوقدار، مواد اولیه خودکار از انبار کسر شده و سود واقعی هر غذا مشخص می‌شود!
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onNavigateToTab('production_recipes');
                      onClose();
                    }}
                    className="mt-4 w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Utensils size={14} />
                    <span>رفتن به فرمول ساخت غذا</span>
                    <ArrowLeft size={14} />
                  </button>
                </div>

                {/* Step 4 */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="w-7 h-7 rounded-lg bg-amber-600 text-white font-black text-xs flex items-center justify-center">۴</span>
                      <h3 className="font-bold text-slate-900 text-sm">ثبت فاکتورهای خرید و هزینه‌های روزانه</h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      هر بار جنسی برای انبار می‌خرید، «ثبت خرید مواد اولیه» و هر بار هزینه‌ای مثل قبض، اجاره، پیک یا تعمیرات می‌دهید، «ثبت هزینه جاری» را بزنید. حتی اگر نسیه یا چکی خرید کنید، بدهی شما به فروشنده خودکار ثبت می‌شود.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onNavigateToTab('purchases_expenses');
                      onClose();
                    }}
                    className="mt-4 w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ShoppingBag size={14} />
                    <span>رفتن به خریدها و هزینه‌ها</span>
                    <ArrowLeft size={14} />
                  </button>
                </div>

                {/* Step 5 */}
                <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center">۵</span>
                      <h3 className="font-bold text-slate-900 text-sm">مشاهده سود خالص، حقوق پرسنل و گزارشات آماده</h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      حالا کار تمام است! در هر لحظه می‌توانید در بخش «سود و زیان» یا «داشبورد شاخص‌ها» ببینید چقدر فروخته‌اید، چقدر هزینه کرده‌اید و چقدر سود خالص در جیبتان مانده است.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onNavigateToTab('profit_loss');
                      onClose();
                    }}
                    className="shrink-0 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <TrendingUp size={15} />
                    <span>مشاهده سود و زیان خالص</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGlossary.map((item, idx) => (
                <div key={idx} className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      <h4 className="font-bold text-slate-900 text-sm">{item.term}</h4>
                      <span className="text-xs text-slate-400 font-mono">({item.english})</span>
                    </div>
                    <button
                      onClick={() => {
                        onNavigateToTab(item.relatedTab);
                        onClose();
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                    >
                      <span>{item.relatedTabLabel}</span>
                      <ArrowLeft size={13} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed mb-2">
                    <strong className="text-slate-900">به زبان ساده: </strong>
                    {item.simpleMeaning}
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 leading-relaxed">
                    <strong className="text-blue-700">مثال واقعی در کار شما: </strong>
                    {item.realExample}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            تمامی قابلیت‌های تخصصی حسابداری دوبل، انبارداری و خزانه‌داری به صورت کامل و خودکار فعال هستند.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs cursor-pointer transition-colors"
          >
            متوجه شدم، بستن راهنما
          </button>
        </div>

      </div>
    </div>
  );
}
