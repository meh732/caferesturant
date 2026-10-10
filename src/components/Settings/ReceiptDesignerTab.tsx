import React, { useState, useRef, useEffect } from 'react';
import { db, AppSettings, ReceiptDesignConfig, defaultReceiptConfig, getEffectiveReceiptConfig, Order } from '../../lib/db';
import { Receipt } from '../POS/Receipt';
import { AppleSwitch, AppleSegmentedControl } from '../Common/AppleSwitch';
import { 
  Printer, Save, RotateCcw, Eye, Sparkles, Check, 
  Image as ImageIcon, Upload, Trash2, Globe, QrCode, 
  Wifi, Phone, MapPin, ReceiptText, Sliders, ChevronDown, 
  ChevronUp, Smartphone, Instagram, MessageSquare, Send,
  CreditCard, Percent, FileText, CheckCircle2, Copy,
  ZoomIn, ZoomOut, Maximize2, Tag, Utensils, Bike, ShoppingBag,
  Building, User, Hash, DollarSign
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

interface ReceiptDesignerTabProps {
  settings: AppSettings | undefined;
  onSaved?: () => void;
}

// Sample orders for live preview scenarios
const sampleOrders: Record<string, Order> = {
  dineIn: {
    id: 101,
    invoiceNumber: 14030725,
    orderType: 'dine_in',
    customerPhone: '',
    tableTitle: 'میز ۴ (سالن VIP)',
    waiterName: 'علی رضایی',
    items: [
      { menuItemId: 1, name: 'پیتزا سیر و استیک مخصوص', price: 345000, quantity: 2, notes: 'بدون پیاز' },
      { menuItemId: 2, name: 'سیب‌زمینی سرخ کرده با سس چدار', price: 110000, quantity: 1 },
      { menuItemId: 3, name: 'کوکاکولا قوطی', price: 25000, quantity: 2 },
    ],
    subtotal: 850000,
    discountType: 'percent',
    discountValue: 10,
    taxEnabled: true,
    taxPercentage: 9,
    taxAmount: 68850,
    total: 833850,
    paymentMethod: 'card',
    status: 'paid',
    createdAt: new Date(),
  },
  delivery: {
    id: 102,
    invoiceNumber: 14030726,
    orderType: 'delivery',
    customerName: 'مهندس سهرابی',
    customerPhone: '09123456789',
    customerSubscriptionCode: 'SUB-452',
    customerAddress: 'تهران، سعادت‌آباد، خیابان صرافها، پلاک ۱۸، واحد ۴',
    waiterName: 'پیک رستوران (رضا)',
    items: [
      { menuItemId: 4, name: 'چلو کباب کوبیده زعفرانی (دو سیخ)', price: 280000, quantity: 2 },
      { menuItemId: 5, name: 'ماست موسیر کوزه‌ای', price: 35000, quantity: 2 },
      { menuItemId: 6, name: 'دوغ سنتی آبعلی', price: 22000, quantity: 2 },
    ],
    subtotal: 674000,
    discountType: 'amount',
    discountValue: 30000,
    taxEnabled: false,
    taxPercentage: 0,
    taxAmount: 0,
    deliveryFee: 45000,
    total: 689000,
    paymentMethod: 'cash',
    status: 'paid',
    createdAt: new Date(),
  },
  simpleTakeaway: {
    id: 103,
    invoiceNumber: 14030727,
    orderType: 'takeaway',
    customerPhone: '',
    items: [
      { menuItemId: 7, name: 'دابل چیزبرگر کلاسیک', price: 215000, quantity: 1 },
      { menuItemId: 8, name: 'آبمیوه طبیعی پرتقال', price: 55000, quantity: 1 },
    ],
    subtotal: 270000,
    discountType: 'none',
    discountValue: 0,
    taxEnabled: false,
    taxPercentage: 0,
    taxAmount: 0,
    total: 270000,
    paymentMethod: 'card',
    status: 'paid',
    createdAt: new Date(),
  }
};

export default function ReceiptDesignerTab({ settings, onSaved }: ReceiptDesignerTabProps) {
  const [config, setConfig] = useState<ReceiptDesignConfig>(() => getEffectiveReceiptConfig(settings));
  const [selectedScenario, setSelectedScenario] = useState<'dineIn' | 'delivery' | 'simpleTakeaway'>('dineIn');
  const [previewZoom, setPreviewZoom] = useState<'80' | '100' | '120'>('100');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Accordion state with Apple design
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    paper: true,
    branding: true,
    social: false,
    orderMeta: false,
    items: false,
    financials: false,
    footer: false
  });

  const previewReceiptRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when settings change
  useEffect(() => {
    if (settings) {
      setConfig(getEffectiveReceiptConfig(settings));
    }
  }, [settings]);

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateConfig = <K extends keyof ReceiptDesignConfig>(key: K, value: ReceiptDesignConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  // Quick Preset Handlers
  const applyPreset = (type: 'restaurant' | 'compact58' | 'fastfood' | 'corporate') => {
    const currentBase = { ...config };
    switch (type) {
      case 'restaurant':
        setConfig({
          ...currentBase,
          paperWidth: '80mm',
          fontSize: 'md',
          dividerStyle: 'dashed',
          compactSpacing: false,
          showLogo: true,
          showQrCode: true,
          qrCodeType: 'menu',
          qrCodeCaption: 'اسکن جهت مشاهده منوی آنلاین و تصاویر غذاها',
          highlightTotal: 'inverse',
          showTotalInWords: true,
          showWifiBox: true,
          showInstagram: true,
          showWebsite: true,
          showItemRowNumber: true,
          showUnitPrice: true,
          showQuantity: true,
          showItemTotal: true,
          thankYouMessage: 'از انتخاب و اعتماد شما صمیمانه سپاسگزاریم!'
        });
        break;
      case 'compact58':
        setConfig({
          ...currentBase,
          paperWidth: '58mm',
          fontSize: 'sm',
          dividerStyle: 'dotted',
          compactSpacing: true,
          showLogo: false,
          showQrCode: false,
          showWifiBox: false,
          showTotalInWords: false,
          showItemRowNumber: false,
          showUnitPrice: false,
          showQuantity: true,
          showItemTotal: true,
          highlightTotal: 'box',
          thankYouMessage: 'از خرید شما متشکریم'
        });
        break;
      case 'fastfood':
        setConfig({
          ...currentBase,
          paperWidth: '80mm',
          fontSize: 'lg',
          dividerStyle: 'solid',
          compactSpacing: false,
          showTable: true,
          showOrderType: true,
          highlightTotal: 'inverse',
          showTotalInWords: false,
          showQrCode: true,
          qrCodeType: 'instagram',
          qrCodeCaption: 'ما را در اینستاگرام دنبال کنید',
          thankYouMessage: 'نوش جان! به امید دیدار دوباره'
        });
        break;
      case 'corporate':
        setConfig({
          ...currentBase,
          paperWidth: '80mm',
          fontSize: 'md',
          dividerStyle: 'double',
          compactSpacing: false,
          showEconomicCode: true,
          showCustomerInfo: true,
          showCustomerCode: true,
          showTax: true,
          showSubtotal: true,
          showTotalInWords: true,
          showPaymentMethod: true,
          highlightTotal: 'double',
          thankYouMessage: 'از همکاری و اعتماد شما سپاسگزاریم'
        });
        break;
    }
  };

  // Image upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('حجم تصویر لوگو نباید بیشتر از ۲ مگابایت باشد.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      updateConfig('logoUrl', result);
      updateConfig('showLogo', true);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Save changes to database
  const handleSave = async () => {
    if (!settings?.id) return;
    setIsSaving(true);
    try {
      await db.settings.update(settings.id, {
        ...settings,
        receiptSettings: config,
        // Sync restaurant details if changed in receipt config
        restaurantName: config.restaurantName || settings.restaurantName,
        phone: config.phone || settings.phone,
        address: config.address || settings.address,
        website: config.website || settings.website,
        instagram: config.instagram || settings.instagram,
        telegram: config.telegram || settings.telegram,
        logoUrl: config.logoUrl || settings.logoUrl,
        wifiSsid: config.wifiSsid || settings.wifiSsid,
        wifiPassword: config.wifiPassword || settings.wifiPassword,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (onSaved) onSaved();
    } catch (err) {
      console.error('Failed to save receipt settings', err);
      alert('خطا در ذخیره تنظیمات فیش پرینتر');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default
  const handleReset = () => {
    if (window.confirm('آیا می‌خواهید تنظیمات طراحی فیش به مقادیر اولیه اپل بازنشانی شود؟')) {
      setConfig({ ...defaultReceiptConfig });
    }
  };

  // Test Print trigger
  const handlePrintTest = useReactToPrint({
    contentRef: previewReceiptRef,
    documentTitle: 'Thermal_Receipt_Test',
    pageStyle: `
      @page {
        size: ${config.paperWidth === '58mm' ? '58mm auto' : '80mm auto'};
        margin: 1.5mm 2mm 1.5mm 2mm;
      }
      @media print {
        * {
          box-sizing: border-box !important;
        }
        html, body {
          width: 100% !important;
          max-width: ${config.paperWidth === '58mm' ? '52mm' : '72mm'} !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .receipt-print-wrapper {
          width: 100% !important;
          max-width: ${config.paperWidth === '58mm' ? '50mm' : '70mm'} !important;
          margin: 0 auto !important;
          padding: 1mm 1.5mm !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }
      }
    `
  });

  const activeOrder = sampleOrders[selectedScenario];

  const zoomScale = {
    '80': 0.85,
    '100': 1,
    '120': 1.15
  }[previewZoom];

  return (
    <div className="space-y-6">
      
      {/* Apple-style Top Bar & Actions */}
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-black/[0.06] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(0,122,255,0.25)] shrink-0">
            <Printer size={22} className="stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-neutral-900 tracking-tight">استودیو طراحی فیش پرینتر حرارتی</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF]">
                Thermal Studio
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5 font-normal">
              سفارشی‌سازی ابعاد، لوگو، شبکه‌های اجتماعی، بارکد منوی آنلاین، جدول اقلام و مبالغ با پیش‌نمایش آنی
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="px-3.5 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200/80 active:scale-[0.98] text-neutral-700 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border border-black/[0.04]"
          >
            <RotateCcw size={14} />
            <span>بازنشانی پیش‌فرض</span>
          </button>

          <button
            type="button"
            onClick={() => handlePrintTest()}
            className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200/80 active:scale-[0.98] text-neutral-800 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-black/[0.06] shadow-2xs"
          >
            <Printer size={15} />
            <span>چاپ فیش آزمایشی</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] active:scale-[0.98] text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_2px_8px_rgba(0,122,255,0.35)] disabled:opacity-50"
          >
            {isSaving ? <Sparkles size={15} className="animate-spin" /> : <Save size={15} />}
            <span>{isSaving ? 'در حال ذخیره‌سازی...' : 'ذخیره قالب فیش'}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 text-xs font-medium flex items-center gap-2.5 animate-in fade-in">
          <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Check size={13} className="stroke-[3]" />
          </div>
          <span>تنظیمات قالب فیش با موفقیت ذخیره گردید و در تمام بخش‌های صدور فاکتور اعمال شد.</span>
        </div>
      )}

      {/* Apple Presets Strip */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-black/[0.06] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#007AFF]" />
              <span>قالب‌های از پیش‌آماده (یک لمس برای اعمال سریع):</span>
            </span>
          </div>
          <span className="text-[11px] text-neutral-400 font-medium hidden sm:inline">
            قالب مورد نظر را انتخاب و به دلخواه سفارشی کنید
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => applyPreset('restaurant')}
            className="p-3.5 rounded-xl bg-neutral-50/70 hover:bg-[#007AFF]/5 border border-black/[0.04] hover:border-[#007AFF]/30 text-right transition-all duration-200 group cursor-pointer active:scale-[0.98] flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Utensils size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-900 group-hover:text-[#007AFF] transition-colors">
                استاندارد رستورانی
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5 leading-tight">
                کاغذ ۸۰mm، لوگو، کیوآرکد و وای‌فای
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('compact58')}
            className="p-3.5 rounded-xl bg-neutral-50/70 hover:bg-[#007AFF]/5 border border-black/[0.04] hover:border-[#007AFF]/30 text-right transition-all duration-200 group cursor-pointer active:scale-[0.98] flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ReceiptText size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-900 group-hover:text-[#007AFF] transition-colors">
                اقتصادی ۵۸ میلی‌متری
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5 leading-tight">
                باریک، فشرده و حداقل مصرف رول
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('fastfood')}
            className="p-3.5 rounded-xl bg-neutral-50/70 hover:bg-[#007AFF]/5 border border-black/[0.04] hover:border-[#007AFF]/30 text-right transition-all duration-200 group cursor-pointer active:scale-[0.98] flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-orange-400 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShoppingBag size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-900 group-hover:text-[#007AFF] transition-colors">
                فست‌فود و سفارش سریع
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5 leading-tight">
                فونت درشت و فاکتور شماره درشت
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('corporate')}
            className="p-3.5 rounded-xl bg-neutral-50/70 hover:bg-[#007AFF]/5 border border-black/[0.04] hover:border-[#007AFF]/30 text-right transition-all duration-200 group cursor-pointer active:scale-[0.98] flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-400 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Building size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-900 group-hover:text-[#007AFF] transition-colors">
                فروشگاهی و شرکتی
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5 leading-tight">
                کد اقتصادی، مشتری، مبلغ به حروف
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Main Layout: 7 Cols Controls (Right) + 5 Cols Sticky Preview (Left) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Controls Column (7 Columns) */}
        <div className="lg:col-span-7 space-y-4">

          {/* SECTION 1: Paper & Typography */}
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('paper')}
              className="w-full p-4 flex items-center justify-between text-right hover:bg-neutral-50/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#007AFF] text-white flex items-center justify-center shrink-0">
                  <Sliders size={16} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-neutral-900">۱. ابعاد رول کاغذ و قلم (Paper & Typography)</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">عرض ۸۰mm یا ۵۸mm، سایز قلم و استایل خطوط</p>
                </div>
              </div>
              <div className="text-neutral-400 transition-transform duration-200">
                {openSections.paper ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openSections.paper && (
              <div className="p-4 pt-2 border-t border-black/[0.04] space-y-4">
                
                {/* Paper Width & Font Size with Apple Segmented Control */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-2">عرض رول پرینتر حرارتی</label>
                    <AppleSegmentedControl
                      options={[
                        { value: '80mm', label: '۸۰ میلی‌متر (استاندارد)' },
                        { value: '58mm', label: '۵۸ میلی‌متر (جیبی)' },
                      ]}
                      value={config.paperWidth}
                      onChange={(val) => updateConfig('paperWidth', val)}
                      className="w-full justify-between"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-2">اندازه فونت متن</label>
                    <AppleSegmentedControl
                      options={[
                        { value: 'sm', label: 'ریز' },
                        { value: 'md', label: 'متوسط' },
                        { value: 'lg', label: 'درشت' },
                      ]}
                      value={config.fontSize || 'md'}
                      onChange={(val) => updateConfig('fontSize', val)}
                      className="w-full justify-between"
                    />
                  </div>
                </div>

                {/* Font Family & Divider Style */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-2">خانواده قلم متن</label>
                    <AppleSegmentedControl
                      options={[
                        { value: 'sans', label: 'ساده و مدرن (Sans)' },
                        { value: 'mono', label: 'ماشین‌تحریر (Mono)' },
                      ]}
                      value={config.fontFamily || 'sans'}
                      onChange={(val) => updateConfig('fontFamily', val)}
                      className="w-full justify-between"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-2">استایل خطوط جداکننده</label>
                    <select
                      value={config.dividerStyle || 'dashed'}
                      onChange={(e) => updateConfig('dividerStyle', e.target.value as any)}
                      className="w-full py-2 px-3 rounded-xl border border-black/[0.08] text-xs font-medium text-neutral-800 outline-none bg-neutral-50/70 hover:bg-neutral-50 focus:border-[#007AFF] transition-all"
                    >
                      <option value="dashed">خط‌چین (- - - - -)</option>
                      <option value="dotted">نقطه‌چین (. . . . .)</option>
                      <option value="solid">خط صاف ممتد (─────)</option>
                      <option value="double">خط دوبل (═════)</option>
                    </select>
                  </div>
                </div>

                {/* Compact Spacing Toggle */}
                <div className="pt-3 border-t border-black/[0.04] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-neutral-900 block">حالت متراکم و صرفه‌جویی در مصرف کاغذ (Compact)</span>
                    <span className="text-[11px] text-neutral-400">کاهش فاصله‌ها و حاشیه‌ها جهت کوتاه‌تر شدن طول فاکتور</span>
                  </div>
                  <AppleSwitch
                    checked={config.compactSpacing}
                    onChange={(checked) => updateConfig('compactSpacing', checked)}
                  />
                </div>

              </div>
            )}
          </div>

          {/* SECTION 2: Header, Logo & Branding */}
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('branding')}
              className="w-full p-4 flex items-center justify-between text-right hover:bg-neutral-50/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#AF52DE] text-white flex items-center justify-center shrink-0">
                  <ImageIcon size={16} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-neutral-900">۲. سربرگ، لوگو و اطلاعات فروشگاه (Header & Branding)</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">آپلود نشان تجاری، نام رستوران، شعار، تلفن و آدرس</p>
                </div>
              </div>
              <div className="text-neutral-400 transition-transform duration-200">
                {openSections.branding ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openSections.branding && (
              <div className="p-4 pt-2 border-t border-black/[0.04] space-y-4">
                
                {/* Logo Row */}
                <div className="p-3.5 rounded-xl bg-neutral-50/80 border border-black/[0.04] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-neutral-900 block">نمایش تصویر لوگو در بالای فاکتور</span>
                      <span className="text-[11px] text-neutral-400">نشان تجاری شما در صدر فیش چاپ خواهد شد</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {config.showLogo && (
                        <div className="flex items-center gap-2 text-[11px] text-neutral-600 bg-white px-2.5 py-1 rounded-lg border border-black/[0.04]">
                          <span>فیلتر سیاه‌وسفید:</span>
                          <AppleSwitch
                            size="sm"
                            checked={config.logoGrayscale}
                            onChange={(checked) => updateConfig('logoGrayscale', checked)}
                          />
                        </div>
                      )}
                      <AppleSwitch
                        checked={config.showLogo}
                        onChange={(checked) => updateConfig('showLogo', checked)}
                      />
                    </div>
                  </div>

                  {config.showLogo && (
                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-black/[0.04]">
                      {config.logoUrl ? (
                        <div className="relative group shrink-0">
                          <img
                            src={config.logoUrl}
                            alt="Logo"
                            className="w-14 h-14 rounded-xl object-contain bg-white border border-black/[0.08] p-1 shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => updateConfig('logoUrl', '')}
                            className="absolute -top-1.5 -right-1.5 bg-[#FF3B30] text-white p-1 rounded-full shadow-sm hover:opacity-90 active:scale-90 transition-all cursor-pointer"
                            title="حذف لوگو"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-neutral-200/60 border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 shrink-0">
                          <ImageIcon size={20} />
                        </div>
                      )}

                      <div className="flex-1 w-full space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="py-1.5 px-3 rounded-xl bg-white hover:bg-neutral-100 active:scale-[0.98] border border-black/[0.08] text-neutral-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                          >
                            <Upload size={13} className="text-[#007AFF]" />
                            <span>انتخاب فایل تصویر</span>
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />

                          <div className="flex items-center gap-1 mr-auto">
                            <span className="text-[11px] text-neutral-400">اندازه:</span>
                            <AppleSegmentedControl
                              size="sm"
                              options={[
                                { value: 'sm', label: 'کوچک' },
                                { value: 'md', label: 'متوسط' },
                                { value: 'lg', label: 'بزرگ' },
                              ]}
                              value={config.logoSize || 'md'}
                              onChange={(val) => updateConfig('logoSize', val)}
                            />
                          </div>
                        </div>

                        <input
                          value={config.logoUrl || ''}
                          onChange={(e) => updateConfig('logoUrl', e.target.value)}
                          placeholder="یا درج آدرس اینترنتی مستقیم لوگو (https://...)"
                          dir="ltr"
                          className="w-full px-3 py-1.5 rounded-xl border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Names */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">نام فروشگاه / رستوران</label>
                    <input
                      value={config.restaurantName || ''}
                      onChange={(e) => updateConfig('restaurantName', e.target.value)}
                      placeholder="مثال: رستوران البرز"
                      className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs font-semibold outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">شعار یا زیرعنوان</label>
                    <input
                      value={config.subTitle || ''}
                      onChange={(e) => updateConfig('subTitle', e.target.value)}
                      placeholder="مثال: طعم اصیل غذای سنتی"
                      className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">نام یا کد شعبه</label>
                    <input
                      value={config.branchName || ''}
                      onChange={(e) => updateConfig('branchName', e.target.value)}
                      placeholder="مثال: شعبه مرکزی (ولیعصر)"
                      className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                    />
                  </div>
                </div>

                {/* Phones */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-neutral-700">تلفن تماس اصلی</label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-neutral-400">چاپ:</span>
                        <AppleSwitch
                          size="sm"
                          checked={config.showPhone}
                          onChange={(checked) => updateConfig('showPhone', checked)}
                        />
                      </div>
                    </div>
                    <input
                      value={config.phone || ''}
                      onChange={(e) => updateConfig('phone', e.target.value)}
                      placeholder="مثال: 021-12345678"
                      dir="ltr"
                      className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs font-mono outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">تلفن دوم / خط سفارشات</label>
                    <input
                      value={config.secondaryPhone || ''}
                      onChange={(e) => updateConfig('secondaryPhone', e.target.value)}
                      placeholder="مثال: 0912-1234567"
                      dir="ltr"
                      className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs font-mono outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                    />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-neutral-700">آدرس فروشگاه</label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-neutral-400">چاپ آدرس:</span>
                      <AppleSwitch
                        size="sm"
                        checked={config.showAddress}
                        onChange={(checked) => updateConfig('showAddress', checked)}
                      />
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={config.address || ''}
                    onChange={(e) => updateConfig('address', e.target.value)}
                    placeholder="آدرس دقیق فروشگاه یا رستوران"
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                  />
                </div>

                {/* Economic Code */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-black/[0.04]">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">کد اقتصادی / شناسه ملی / شماره ثبت</label>
                    <input
                      value={config.economicCode || ''}
                      onChange={(e) => updateConfig('economicCode', e.target.value)}
                      placeholder="شناسه اقتصادی یا کد مالیاتی"
                      dir="ltr"
                      className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs font-mono outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50/80 border border-black/[0.04] self-end">
                    <span className="text-xs font-medium text-neutral-800">چاپ کد اقتصادی روی فاکتور</span>
                    <AppleSwitch
                      checked={config.showEconomicCode}
                      onChange={(checked) => updateConfig('showEconomicCode', checked)}
                    />
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* SECTION 3: Social & QR Code */}
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('social')}
              className="w-full p-4 flex items-center justify-between text-right hover:bg-neutral-50/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#30B0C7] text-white flex items-center justify-center shrink-0">
                  <QrCode size={16} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-neutral-900">۳. شبکه‌های اجتماعی، وبسایت و بارکد دو بعدی (Social & QR)</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">منوی دیجیتال آنلاین، اینستاگرام، تلگرام، بله، ایتا و واتس‌اپ</p>
                </div>
              </div>
              <div className="text-neutral-400 transition-transform duration-200">
                {openSections.social ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openSections.social && (
              <div className="p-4 pt-2 border-t border-black/[0.04] space-y-4">
                
                {/* QR Code Special Box */}
                <div className="p-3.5 rounded-xl bg-[#007AFF]/5 border border-[#007AFF]/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-neutral-900 block">چاپ بارکد دو بعدی QR Code روی فیش مشتری</span>
                      <span className="text-[11px] text-neutral-500">جهت اسکن فوری با دوربین تلفن همراه</span>
                    </div>
                    <AppleSwitch
                      checked={config.showQrCode}
                      onChange={(checked) => updateConfig('showQrCode', checked)}
                    />
                  </div>

                  {config.showQrCode && (
                    <div className="space-y-3 pt-2 border-t border-[#007AFF]/15">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 mb-1">نوع و هدف بارکد QR</label>
                          <select
                            value={config.qrCodeType}
                            onChange={(e) => updateConfig('qrCodeType', e.target.value as any)}
                            className="w-full py-2 px-3 rounded-xl border border-black/[0.08] text-xs font-medium text-neutral-800 outline-none bg-white focus:border-[#007AFF]"
                          >
                            <option value="menu">📱 منوی دیجیتال آنلاین (Digital Menu)</option>
                            <option value="website">🌐 وب‌سایت اصلی رستوران</option>
                            <option value="instagram">📸 صفحه اینستاگرام</option>
                            <option value="wifi">📶 اتصال خودکار به وای‌فای (Wi-Fi QR)</option>
                            <option value="custom">🔗 لینک دلخواه سفارشی</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-neutral-700 mb-1">متن راهنمای زیر بارکد</label>
                          <input
                            value={config.qrCodeCaption || ''}
                            onChange={(e) => updateConfig('qrCodeCaption', e.target.value)}
                            placeholder="مثال: اسکن جهت مشاهده منوی آنلاین"
                            className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs outline-none bg-white focus:border-[#007AFF]"
                          />
                        </div>
                      </div>

                      {config.qrCodeType === 'custom' && (
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 mb-1">آدرس لینک دلخواه سفارشی (URL)</label>
                          <input
                            value={config.qrCodeCustomUrl || ''}
                            onChange={(e) => updateConfig('qrCodeCustomUrl', e.target.value)}
                            placeholder="https://mysite.com/special-offer"
                            dir="ltr"
                            className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Social Channels List with Apple Inset Grouping */}
                <div className="rounded-xl border border-black/[0.06] divide-y divide-black/[0.04] bg-neutral-50/50 overflow-hidden">
                  
                  {/* Website */}
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-[140px]">
                      <div className="w-7 h-7 rounded-lg bg-[#007AFF] text-white flex items-center justify-center shrink-0">
                        <Globe size={14} />
                      </div>
                      <span className="text-xs font-medium text-neutral-800">وب‌سایت</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        value={config.website || ''}
                        onChange={(e) => updateConfig('website', e.target.value)}
                        placeholder="www.myrestaurant.ir"
                        dir="ltr"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                      />
                      <AppleSwitch
                        size="sm"
                        checked={config.showWebsite}
                        onChange={(checked) => updateConfig('showWebsite', checked)}
                      />
                    </div>
                  </div>

                  {/* Instagram */}
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-[140px]">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shrink-0">
                        <Instagram size={14} />
                      </div>
                      <span className="text-xs font-medium text-neutral-800">اینستاگرام</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        value={config.instagram || ''}
                        onChange={(e) => updateConfig('instagram', e.target.value)}
                        placeholder="@restaurant_name"
                        dir="ltr"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                      />
                      <AppleSwitch
                        size="sm"
                        checked={config.showInstagram}
                        onChange={(checked) => updateConfig('showInstagram', checked)}
                      />
                    </div>
                  </div>

                  {/* Telegram */}
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-[140px]">
                      <div className="w-7 h-7 rounded-lg bg-[#2AABEE] text-white flex items-center justify-center shrink-0">
                        <Send size={14} />
                      </div>
                      <span className="text-xs font-medium text-neutral-800">کانال تلگرام</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        value={config.telegram || ''}
                        onChange={(e) => updateConfig('telegram', e.target.value)}
                        placeholder="@telegram_channel"
                        dir="ltr"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                      />
                      <AppleSwitch
                        size="sm"
                        checked={config.showTelegram}
                        onChange={(checked) => updateConfig('showTelegram', checked)}
                      />
                    </div>
                  </div>

                  {/* Bale */}
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-[140px]">
                      <div className="w-7 h-7 rounded-lg bg-[#00A693] text-white flex items-center justify-center shrink-0">
                        <MessageSquare size={14} />
                      </div>
                      <span className="text-xs font-medium text-neutral-800">شناسه بله (Bale)</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        value={config.bale || ''}
                        onChange={(e) => updateConfig('bale', e.target.value)}
                        placeholder="@bale_channel"
                        dir="ltr"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                      />
                      <AppleSwitch
                        size="sm"
                        checked={config.showBale}
                        onChange={(checked) => updateConfig('showBale', checked)}
                      />
                    </div>
                  </div>

                  {/* Eitaa */}
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-[140px]">
                      <div className="w-7 h-7 rounded-lg bg-[#E67E22] text-white flex items-center justify-center shrink-0">
                        <MessageSquare size={14} />
                      </div>
                      <span className="text-xs font-medium text-neutral-800">شناسه ایتا (Eitaa)</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        value={config.eitaa || ''}
                        onChange={(e) => updateConfig('eitaa', e.target.value)}
                        placeholder="@eitaa_channel"
                        dir="ltr"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                      />
                      <AppleSwitch
                        size="sm"
                        checked={config.showEitaa}
                        onChange={(checked) => updateConfig('showEitaa', checked)}
                      />
                    </div>
                  </div>

                  {/* WhatsApp */}
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-[140px]">
                      <div className="w-7 h-7 rounded-lg bg-[#25D366] text-white flex items-center justify-center shrink-0">
                        <Phone size={14} />
                      </div>
                      <span className="text-xs font-medium text-neutral-800">شماره واتس‌اپ</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        value={config.whatsapp || ''}
                        onChange={(e) => updateConfig('whatsapp', e.target.value)}
                        placeholder="09121234567"
                        dir="ltr"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                      />
                      <AppleSwitch
                        size="sm"
                        checked={config.showWhatsapp}
                        onChange={(checked) => updateConfig('showWhatsapp', checked)}
                      />
                    </div>
                  </div>

                </div>

              </div>
            )}
          </div>

          {/* SECTION 4: Order Meta & Customer Info */}
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('orderMeta')}
              className="w-full p-4 flex items-center justify-between text-right hover:bg-neutral-50/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#5856D6] text-white flex items-center justify-center shrink-0">
                  <FileText size={16} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-neutral-900">۴. اطلاعات فاکتور، میز و مشتری (Order Meta)</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">شماره فاکتور، تاریخ، ساعت، میز، گارسون و اطلاعات تماس خریدار</p>
                </div>
              </div>
              <div className="text-neutral-400 transition-transform duration-200">
                {openSections.orderMeta ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openSections.orderMeta && (
              <div className="p-4 pt-2 border-t border-black/[0.04] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">عنوان فاکتور</label>
                    <input
                      value={config.receiptTitle || ''}
                      onChange={(e) => updateConfig('receiptTitle', e.target.value)}
                      placeholder="صورتحساب فروش"
                      className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs font-semibold outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">پیشوند شماره فاکتور</label>
                    <input
                      value={config.invoicePrefix || ''}
                      onChange={(e) => updateConfig('invoicePrefix', e.target.value)}
                      placeholder="فاکتور شماره یا #"
                      className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                    />
                  </div>
                </div>

                {/* Toggles Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">شماره فاکتور</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showInvoiceNumber}
                      onChange={(checked) => updateConfig('showInvoiceNumber', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">تاریخ شمسی</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showDate}
                      onChange={(checked) => updateConfig('showDate', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">ساعت ثبت سفارش</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showTime}
                      onChange={(checked) => updateConfig('showTime', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">شماره میز / سالن</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showTable}
                      onChange={(checked) => updateConfig('showTable', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">نام گارسون / صندوق‌دار</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showWaiter}
                      onChange={(checked) => updateConfig('showWaiter', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">نوع سفارش (سالن/پیک/بیرون‌بر)</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showOrderType}
                      onChange={(checked) => updateConfig('showOrderType', checked)}
                    />
                  </div>
                </div>

                {/* Customer Info Card */}
                <div className="pt-3 border-t border-black/[0.04] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-neutral-900 block">کادر مشخصات خریدار / مشتری</span>
                      <span className="text-[11px] text-neutral-400">نمایش نام، تلفن، اشتراک و آدرس پیک</span>
                    </div>
                    <AppleSwitch
                      checked={config.showCustomerInfo}
                      onChange={(checked) => updateConfig('showCustomerInfo', checked)}
                    />
                  </div>

                  {config.showCustomerInfo && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 border border-black/[0.04]">
                        <span className="text-[11px] text-neutral-700">نام مشتری</span>
                        <AppleSwitch
                          size="sm"
                          checked={config.showCustomerName}
                          onChange={(checked) => updateConfig('showCustomerName', checked)}
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 border border-black/[0.04]">
                        <span className="text-[11px] text-neutral-700">شماره تلفن</span>
                        <AppleSwitch
                          size="sm"
                          checked={config.showCustomerPhone}
                          onChange={(checked) => updateConfig('showCustomerPhone', checked)}
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 border border-black/[0.04]">
                        <span className="text-[11px] text-neutral-700">کد اشتراک</span>
                        <AppleSwitch
                          size="sm"
                          checked={config.showCustomerCode}
                          onChange={(checked) => updateConfig('showCustomerCode', checked)}
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 border border-black/[0.04]">
                        <span className="text-[11px] text-neutral-700">آدرس پیک</span>
                        <AppleSwitch
                          size="sm"
                          checked={config.showCustomerAddress}
                          onChange={(checked) => updateConfig('showCustomerAddress', checked)}
                        />
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

          {/* SECTION 5: Items Table Columns */}
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('items')}
              className="w-full p-4 flex items-center justify-between text-right hover:bg-neutral-50/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#FF9500] text-white flex items-center justify-center shrink-0">
                  <ReceiptText size={16} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-neutral-900">۵. ستون‌های جدول اقلام و کالاها (Items Table)</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">ردیف، قیمت واحد، تعداد، مبلغ جمع و توضیحات غذا</p>
                </div>
              </div>
              <div className="text-neutral-400 transition-transform duration-200">
                {openSections.items ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openSections.items && (
              <div className="p-4 pt-2 border-t border-black/[0.04] space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <div>
                      <span className="text-xs font-medium text-neutral-800 block">ستون ردیف (#)</span>
                      <span className="text-[10px] text-neutral-400">شماره‌گذاری خطوط کالاها</span>
                    </div>
                    <AppleSwitch
                      size="sm"
                      checked={config.showItemRowNumber}
                      onChange={(checked) => updateConfig('showItemRowNumber', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <div>
                      <span className="text-xs font-medium text-neutral-800 block">قیمت فی (تک کالا)</span>
                      <span className="text-[10px] text-neutral-400">نرخ واحد هر قلم</span>
                    </div>
                    <AppleSwitch
                      size="sm"
                      checked={config.showUnitPrice}
                      onChange={(checked) => updateConfig('showUnitPrice', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <div>
                      <span className="text-xs font-medium text-neutral-800 block">ستون تعداد</span>
                      <span className="text-[10px] text-neutral-400">تعداد سفارش داده شده</span>
                    </div>
                    <AppleSwitch
                      size="sm"
                      checked={config.showQuantity}
                      onChange={(checked) => updateConfig('showQuantity', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <div>
                      <span className="text-xs font-medium text-neutral-800 block">ستون جمع ردیف</span>
                      <span className="text-[10px] text-neutral-400">مجموع ضرب قیمت در تعداد</span>
                    </div>
                    <AppleSwitch
                      size="sm"
                      checked={config.showItemTotal}
                      onChange={(checked) => updateConfig('showItemTotal', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04] sm:col-span-2">
                    <div>
                      <span className="text-xs font-medium text-neutral-800 block">توضیحات و یادداشت هر قلم</span>
                      <span className="text-[10px] text-neutral-400">مانند: کم‌نمک، بدون پیاز، سس اضافه</span>
                    </div>
                    <AppleSwitch
                      size="sm"
                      checked={config.showItemNotes}
                      onChange={(checked) => updateConfig('showItemNotes', checked)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 6: Totals, Discounts & Financials */}
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('financials')}
              className="w-full p-4 flex items-center justify-between text-right hover:bg-neutral-50/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#34C759] text-white flex items-center justify-center shrink-0">
                  <Percent size={16} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-neutral-900">۶. مبالغ، تخفیف، مالیات و تسویه (Financials & Totals)</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">جمع کل، درصد تخفیف، مالیات، هزینه ارسال و مبلغ به حروف</p>
                </div>
              </div>
              <div className="text-neutral-400 transition-transform duration-200">
                {openSections.financials ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openSections.financials && (
              <div className="p-4 pt-2 border-t border-black/[0.04] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">جمع اقلام (Subtotal)</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showSubtotal}
                      onChange={(checked) => updateConfig('showSubtotal', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">مبلغ و درصد تخفیف</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showDiscount}
                      onChange={(checked) => updateConfig('showDiscount', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">مالیات ارزش افزوده (VAT)</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showTax}
                      onChange={(checked) => updateConfig('showTax', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">حق سرویس</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showServiceFee}
                      onChange={(checked) => updateConfig('showServiceFee', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">هزینه پیک / ارسال</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showDeliveryFee}
                      onChange={(checked) => updateConfig('showDeliveryFee', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50/70 border border-black/[0.04]">
                    <span className="text-xs font-medium text-neutral-800">شیوه پرداخت (کارت/نقدی)</span>
                    <AppleSwitch
                      size="sm"
                      checked={config.showPaymentMethod}
                      onChange={(checked) => updateConfig('showPaymentMethod', checked)}
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-black/[0.04] grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-2">استایل کادر مبلغ قابل پرداخت</label>
                    <select
                      value={config.highlightTotal}
                      onChange={(e) => updateConfig('highlightTotal', e.target.value as any)}
                      className="w-full py-2 px-3 rounded-xl border border-black/[0.08] text-xs font-medium text-neutral-800 outline-none bg-neutral-50/60 focus:border-[#007AFF]"
                    >
                      <option value="inverse">⬛️ کادر مشکی معکوس (حداکثر برجستگی حرارتی)</option>
                      <option value="box">🔲 کادر مشکی ساده دورخط</option>
                      <option value="double">══ کادر دوخطه رسمی</option>
                      <option value="bold">خط افقی ساده</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50/80 border border-black/[0.04] self-end">
                    <div>
                      <span className="text-xs font-semibold text-neutral-900 block">چاپ مبلغ به حروف</span>
                      <span className="text-[10px] text-neutral-400">مثال: هشتصد و سی و سه هزار تومان</span>
                    </div>
                    <AppleSwitch
                      checked={config.showTotalInWords}
                      onChange={(checked) => updateConfig('showTotalInWords', checked)}
                    />
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* SECTION 7: Footer, Free Wi-Fi & Tear Line */}
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('footer')}
              className="w-full p-4 flex items-center justify-between text-right hover:bg-neutral-50/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#8E8E93] text-white flex items-center justify-center shrink-0">
                  <Wifi size={16} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-neutral-900">۷. پانویس، پیام تشکر، وای‌فای و خط برش (Footer & Wi-Fi)</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">پیام تشکر پایانی، کادر اینترنت مهمان و راهنمای برش فیش</p>
                </div>
              </div>
              <div className="text-neutral-400 transition-transform duration-200">
                {openSections.footer ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openSections.footer && (
              <div className="p-4 pt-2 border-t border-black/[0.04] space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">پیام تشکر پایانی فیش</label>
                  <input
                    value={config.thankYouMessage || ''}
                    onChange={(e) => updateConfig('thankYouMessage', e.target.value)}
                    placeholder="از انتخاب و اعتماد شما صمیمانه سپاسگزاریم!"
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                  />
                </div>

                {/* Free Wi-Fi Box */}
                <div className="p-3.5 rounded-xl bg-neutral-50/80 border border-black/[0.04] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-neutral-900 block">چاپ کادر اختصاصی اینترنت وای‌فای مهمان (Free Wi-Fi)</span>
                      <span className="text-[11px] text-neutral-400">اشتراک‌گذاری خودکار مشخصات شبکه با مشتری</span>
                    </div>
                    <AppleSwitch
                      checked={config.showWifiBox}
                      onChange={(checked) => updateConfig('showWifiBox', checked)}
                    />
                  </div>

                  {config.showWifiBox && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-black/[0.04]">
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">نام شبکه وای‌فای (SSID)</label>
                        <input
                          value={config.wifiSsid || ''}
                          onChange={(e) => updateConfig('wifiSsid', e.target.value)}
                          placeholder="Arka-Guest-WiFi"
                          dir="ltr"
                          className="w-full px-3 py-1.5 rounded-xl border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">رمز عبور وای‌فای (Password)</label>
                        <input
                          value={config.wifiPassword || ''}
                          onChange={(e) => updateConfig('wifiPassword', e.target.value)}
                          placeholder="Guest12345"
                          dir="ltr"
                          className="w-full px-3 py-1.5 rounded-xl border border-black/[0.08] text-xs font-mono outline-none bg-white focus:border-[#007AFF]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">قوانین یا توضیحات تکمیلی فاکتور</label>
                  <textarea
                    rows={2}
                    value={config.footerNotes || ''}
                    onChange={(e) => updateConfig('footerNotes', e.target.value)}
                    placeholder="مثال: لطفاً فاکتور را تا پایان تحویل سفارش نزد خود نگه دارید."
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.08] text-xs outline-none focus:border-[#007AFF] bg-neutral-50/50 focus:bg-white"
                  />
                </div>

                <div className="pt-3 border-t border-black/[0.04] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-neutral-900 block">چاپ خط راهنمای برش فیش (Cut Line)</span>
                    <span className="text-[11px] text-neutral-400">علامت قیچی و خط‌چین در انتهای کاغذ جهت جدا کردن آسان</span>
                  </div>
                  <AppleSwitch
                    checked={config.showCutLine}
                    onChange={(checked) => updateConfig('showCutLine', checked)}
                  />
                </div>

              </div>
            )}
          </div>

        </div>

        {/* Live Thermal Preview Column (5 Columns - Sticky on Desktop) */}
        <div className="lg:col-span-5 sticky top-6 space-y-4">
          
          {/* Apple Hardware Studio Frame */}
          <div className="bg-[#1c1c1e] rounded-3xl p-4 text-white shadow-2xl border border-white/[0.08] overflow-hidden">
            
            {/* macOS Window Titlebar with Traffic Lights */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08]">
              {/* Traffic light dots */}
              <div className="flex items-center gap-2 select-none" dir="ltr">
                <div className="w-3 h-3 rounded-full bg-[#FF5F56] shadow-inner" />
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E] shadow-inner" />
                <div className="w-3 h-3 rounded-full bg-[#27C93F] shadow-inner" />
              </div>

              {/* Title & Live Status */}
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse" />
                <span className="text-xs font-semibold text-neutral-200">پیش‌نمایش زنده فیش حرارتی</span>
                <span className="text-[10px] bg-white/10 text-neutral-300 px-2 py-0.5 rounded-full font-mono">
                  {config.paperWidth}
                </span>
              </div>

              {/* Zoom Segmented */}
              <div className="flex items-center gap-1 bg-white/[0.08] p-0.5 rounded-lg text-[10px]" dir="ltr">
                {(['80', '100', '120'] as const).map(z => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setPreviewZoom(z)}
                    className={`px-1.5 py-0.5 rounded font-mono transition-all ${
                      previewZoom === z ? 'bg-white text-black font-bold' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {z}%
                  </button>
                ))}
              </div>
            </div>

            {/* Scenario Segmented Selector Bar */}
            <div className="py-3 flex items-center justify-between gap-2 border-b border-white/[0.06]">
              <span className="text-[11px] text-neutral-400 font-medium">سناریو آزمایشی:</span>
              <AppleSegmentedControl
                size="sm"
                options={[
                  { value: 'dineIn', label: 'سالن' },
                  { value: 'delivery', label: 'پیک / دلیوری' },
                  { value: 'simpleTakeaway', label: 'بیرون‌بر' },
                ]}
                value={selectedScenario}
                onChange={(val) => setSelectedScenario(val)}
                className="bg-white/10 border-white/5"
              />
            </div>

            {/* Thermal Roll Stage / Canvas */}
            <div className="py-6 px-2 flex justify-center items-center overflow-x-auto min-h-[480px] bg-[#121214] rounded-2xl my-2 border border-white/[0.04]">
              
              {/* Thermal Receipt Paper Roll Simulation */}
              <div 
                className="relative bg-white text-black transition-all duration-300 origin-top"
                style={{
                  width: config.paperWidth === '58mm' ? '240px' : '310px',
                  borderRadius: '1px',
                  transform: `scale(${zoomScale})`,
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.4)',
                }}
              >
                {/* Top Tear Edge (Sawtooth / Zigzag) */}
                <div 
                  className="w-full h-3 bg-white -mt-2.5 select-none"
                  style={{
                    clipPath: 'polygon(0% 100%, 5% 0%, 10% 100%, 15% 0%, 20% 100%, 25% 0%, 30% 100%, 35% 0%, 40% 100%, 45% 0%, 50% 100%, 55% 0%, 60% 100%, 65% 0%, 70% 100%, 75% 0%, 80% 100%, 85% 0%, 90% 100%, 95% 0%, 100% 100%)'
                  }}
                />

                {/* The Real Receipt Component */}
                <div className="p-1">
                  <Receipt
                    ref={previewReceiptRef}
                    order={activeOrder}
                    settings={settings || { id: 1, restaurantName: 'فروشگاه البرز', phone: '021-12345678', address: 'خیابان ولیعصر', website: '', instagram: '', telegram: '', logoUrl: '', taxEnabled: false, taxPercentage: 9, requireCustomerPhone: false }}
                    overrideConfig={config}
                  />
                </div>

                {/* Bottom Tear Edge (Sawtooth / Zigzag) */}
                <div 
                  className="w-full h-3 bg-white -mb-2.5 select-none"
                  style={{
                    clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)'
                  }}
                />
              </div>

            </div>

            {/* Bottom Actions inside Studio */}
            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-neutral-400">
              <span className="text-[11px] text-neutral-400">
                بروزرسانی بلادرنگ با هر تغییر در فرم
              </span>

              <button
                type="button"
                onClick={() => handlePrintTest()}
                className="px-3 py-1.5 rounded-xl bg-white text-black font-semibold hover:bg-neutral-200 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
              >
                <Printer size={13} />
                <span>چاپ فوری این فیش</span>
              </button>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
