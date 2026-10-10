import React, { useState, useEffect } from 'react';
import { db, Expense, ExpenseType, recordPurchaseStock, Warehouse, RawMaterial } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Save, ShoppingBag, Receipt, AlertCircle, Calendar, Hash, User, DollarSign, Layers, Building2, Package } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

interface PurchaseExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialExpense?: Expense | null;
  defaultType?: ExpenseType;
}

const MATERIAL_CATEGORIES = [
  'مواد غذایی و پروتئینی (گوشت و مرغ)',
  'برنج، حبوبات و غلات',
  'روغن، سس و چاشنی‌ها',
  'سبزیجات و صیفی‌جات',
  'لبنیات و پنیر',
  'نان و خمیر',
  'نوشیدنی‌ها و شربت‌ها',
  'ظروف یکبار مصرف و بسته‌بندی',
  'سایر اقلام مصرفی آشپزخانه',
];

const EXPENSE_CATEGORIES = [
  'اجاره بهای محل',
  'قبوض (برق، آب، گاز، تلفن و اینترنت)',
  'تبلیغات، چاپ تراکت و بازاریابی',
  'تعمیرات، سرویس دستگاه‌ها و تجهیزات',
  'لوازم بهداشتی، نظافت و مواد شوینده',
  'ایاب و ذهاب و حمل‌ونقل کالا',
  'پیک و ارسال سفارشات',
  'مالیات، عوارض و بیمه اداری',
  'سایر هزینه‌های متفرقه جاری',
];

const COMMON_UNITS = ['کیلوگرم', 'عدد', 'بسته', 'کارتن', 'لیتر', 'گرم', 'حلب', 'گونی'];

export default function PurchaseExpenseModal({
  isOpen,
  onClose,
  initialExpense,
  defaultType = 'material',
}: PurchaseExpenseModalProps) {
  const existingExpenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const warehouses = useLiveQuery(() => db.warehouses.filter(w => w.isActive).toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];

  // Unique suppliers from past records for autocomplete
  const knownSuppliers = Array.from(
    new Set(existingExpenses.map(e => e.supplierOrPerson?.trim()).filter(Boolean))
  );

  const [type, setType] = useState<ExpenseType>(defaultType);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(MATERIAL_CATEGORIES[0]);
  const [amount, setAmount] = useState<number>(0);
  const [quantity, setQuantity] = useState<number | undefined>(undefined);
  const [unit, setUnit] = useState('کیلوگرم');
  const [unitPrice, setUnitPrice] = useState<number | undefined>(undefined);
  const [supplierOrPerson, setSupplierOrPerson] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'credit' | 'cheque'>('card');
  const [status, setStatus] = useState<'paid' | 'pending'>('paid');
  const [dateObj, setDateObj] = useState<DateObject>(new DateObject({ calendar: persian }));
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [note, setNote] = useState('');
  const [warehouseId, setWarehouseId] = useState<number | undefined>(undefined);
  const [materialId, setMaterialId] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialExpense) {
      setType(initialExpense.type);
      setTitle(initialExpense.title);
      setCategory(initialExpense.category);
      setAmount(initialExpense.amount);
      setQuantity(initialExpense.quantity);
      setUnit(initialExpense.unit || 'کیلوگرم');
      setUnitPrice(initialExpense.unitPrice);
      setSupplierOrPerson(initialExpense.supplierOrPerson || '');
      setPaymentMethod(initialExpense.paymentMethod);
      setStatus(initialExpense.status);
      setDateObj(new DateObject({ date: new Date(initialExpense.date), calendar: persian }));
      setInvoiceNumber(initialExpense.invoiceNumber || '');
      setNote(initialExpense.note || '');
      setWarehouseId(initialExpense.warehouseId);
      setMaterialId(initialExpense.materialId);
    } else {
      setType(defaultType);
      setTitle('');
      setCategory(defaultType === 'material' ? MATERIAL_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
      setAmount(0);
      setQuantity(undefined);
      setUnit('کیلوگرم');
      setUnitPrice(undefined);
      setSupplierOrPerson('');
      setPaymentMethod('card');
      setStatus('paid');
      setDateObj(new DateObject({ calendar: persian }));
      setInvoiceNumber('');
      setNote('');
      setMaterialId(undefined);
      if (warehouses.length > 0) {
        const defaultWh = warehouses.find(w => w.isPurchaseDefault) || warehouses[0];
        setWarehouseId(defaultWh.id);
      }
    }
    setError(null);
  }, [initialExpense, defaultType, isOpen, warehouses.length]);

  // When type toggles, switch default category
  const handleTypeChange = (newType: ExpenseType) => {
    setType(newType);
    if (newType === 'material') {
      if (!MATERIAL_CATEGORIES.includes(category)) setCategory(MATERIAL_CATEGORIES[0]);
      if (!warehouseId && warehouses.length > 0) {
        const defaultWh = warehouses.find(w => w.isPurchaseDefault) || warehouses[0];
        setWarehouseId(defaultWh.id);
      }
    } else {
      if (!EXPENSE_CATEGORIES.includes(category)) setCategory(EXPENSE_CATEGORIES[0]);
    }
  };

  // Quick select an existing raw material from catalog
  const handleSelectRawMaterial = (matId: number) => {
    const mat = rawMaterials.find(m => m.id === matId);
    if (mat) {
      setMaterialId(mat.id);
      setTitle(mat.name);
      setCategory(mat.category);
      setUnit(mat.unit);
      if (mat.unitPrice && (!unitPrice || unitPrice === 0)) {
        setUnitPrice(mat.unitPrice);
        if (quantity) {
          setAmount(Math.round(quantity * mat.unitPrice));
        }
      }
    }
  };

  // Auto-calc unit price or amount
  const handleQuantityChange = (q: number | undefined) => {
    setQuantity(q);
    if (q && q > 0 && unitPrice && unitPrice > 0) {
      setAmount(Math.round(q * unitPrice));
    } else if (q && q > 0 && amount && amount > 0) {
      setUnitPrice(Math.round(amount / q));
    }
  };

  const handleUnitPriceChange = (up: number | undefined) => {
    setUnitPrice(up);
    if (quantity && quantity > 0 && up && up > 0) {
      setAmount(Math.round(quantity * up));
    }
  };

  const handleAmountChange = (amt: number) => {
    setAmount(amt);
    if (amt > 0 && quantity && quantity > 0) {
      setUnitPrice(Math.round(amt / quantity));
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('لطفا عنوان خرید یا هزینه را وارد کنید.');
      return;
    }

    if (!amount || amount <= 0) {
      setError('لطفا مبلغ معتبر وارد کنید.');
      return;
    }

    const selectedWh = warehouses.find(w => w.id === warehouseId);
    const numAmount = Number(amount) || 0;
    const numQty = quantity ? Number(quantity) : 0;

    let computedUnitPrice: number | undefined = unitPrice ? Number(unitPrice) : undefined;
    if (type === 'material' && numQty > 0 && numAmount > 0) {
      if (!computedUnitPrice || (numQty > 1 && Math.abs(computedUnitPrice - numAmount) < 1)) {
        computedUnitPrice = Math.round(numAmount / numQty);
      }
    }

    const expenseData: Expense = {
      title: title.trim(),
      type,
      category,
      amount: numAmount,
      quantity: numQty > 0 ? numQty : undefined,
      unit: type === 'material' ? unit : undefined,
      unitPrice: computedUnitPrice,
      supplierOrPerson: supplierOrPerson.trim() || 'فروشنده عمومی',
      paymentMethod,
      status,
      date: dateObj ? dateObj.toDate() : new Date(),
      invoiceNumber: invoiceNumber.trim() || undefined,
      note: note.trim() || undefined,
      warehouseId: type === 'material' ? warehouseId : undefined,
      warehouseName: type === 'material' ? selectedWh?.name : undefined,
      materialId: type === 'material' ? materialId : undefined,
      createdAt: initialExpense?.createdAt || new Date(),
    };

    try {
      let savedExpenseId: number;
      if (initialExpense?.id) {
        await db.expenses.update(initialExpense.id, expenseData);
        savedExpenseId = initialExpense.id;
      } else {
        savedExpenseId = await db.expenses.add(expenseData);
      }

      // If it's a raw material purchase and a warehouse is selected:
      if (type === 'material' && warehouseId && numQty > 0) {
        await recordPurchaseStock({
          expenseId: savedExpenseId,
          invoiceNumber: invoiceNumber.trim(),
          warehouseId,
          materialId,
          materialName: title.trim(),
          category,
          quantity: numQty,
          unit,
          unitPrice: computedUnitPrice || Math.round(numAmount / numQty),
          totalAmount: numAmount,
          date: dateObj ? dateObj.toDate() : new Date(),
          supplierName: supplierOrPerson.trim() || 'فروشنده'
        });
      }

      onClose();
    } catch (err) {
      console.error(err);
      setError('خطا در ذخیره‌سازی داده‌ها.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            type === 'material' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
          }`}>
            {type === 'material' ? <ShoppingBag size={24} /> : <Receipt size={24} />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {initialExpense?.id ? 'ویرایش ثبت مالی' : 'ثبت خرید یا هزینه جدید'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ثبت خرید مواد اولیه یا هزینه‌های جاری با اثرگذاری آنی در گزارشات و سود و زیان
            </p>
          </div>
        </div>

        {/* Type Selection (Tabs) */}
        <div className="flex p-1 bg-slate-100 rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => handleTypeChange('material')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              type === 'material'
                ? 'bg-white text-amber-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShoppingBag size={16} />
            <span>خرید مواد اولیه و ملزومات</span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange('general_expense')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              type === 'general_expense'
                ? 'bg-white text-rose-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Receipt size={16} />
            <span>هزینه جاری / اداری / عمومی</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Warehouse Selection for Raw Materials */}
          {type === 'material' && (
            <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <Building2 size={16} className="text-amber-700" />
                  <span>انبار مقصد ورودی کالا (کالا در کدام انبار دپو و ثبت شود؟) *</span>
                </label>
                <span className="text-[10px] sm:text-[11px] text-amber-800 font-bold bg-amber-200/60 px-2 py-0.5 rounded-full">
                  افزایش آنی موجودی زنده
                </span>
              </div>
              <select
                value={warehouseId || ''}
                onChange={e => setWarehouseId(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-amber-300 bg-white font-bold text-xs sm:text-sm text-slate-800 outline-none"
                required
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code}) {w.isProductionDefault ? '★ انبار خط تولید/آشپزخانه' : w.isPurchaseDefault ? '★ انبار پیش‌فرض خرید' : ''}
                  </option>
                ))}
              </select>

              {/* Quick Select from existing catalog if any */}
              {rawMaterials.length > 0 && !initialExpense && (
                <div className="pt-1.5 flex items-center gap-2 overflow-x-auto text-xs text-amber-900">
                  <span className="text-[11px] font-bold text-amber-800 shrink-0">انتخاب سریع از کاتالوگ:</span>
                  <select
                    value={materialId || ''}
                    onChange={e => {
                      if (e.target.value) handleSelectRawMaterial(Number(e.target.value));
                    }}
                    className="px-2 py-1 rounded-lg border border-amber-200 bg-white/90 text-xs outline-none"
                  >
                    <option value="">-- انتخاب از اقلام از پیش تعریف شده --</option>
                    {rawMaterials.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.code} - {m.unit})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Row 1: Title and Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {type === 'material' ? 'عنوان کالا یا خرید مواد اولیه *' : 'شرح هزینه جاری *'}
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={type === 'material' ? 'مثال: گوشت گوساله سردست، برنج طارم' : 'مثال: قبض برق، اجاره مغازه، تبلیغات اینستاگرام'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">دسته‌بندی</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm transition-all"
              >
                {(type === 'material' ? MATERIAL_CATEGORIES : EXPENSE_CATEGORIES).map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2 (For Raw Materials): Quantity, Unit, Unit Price */}
          {type === 'material' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-amber-50/50 rounded-2xl border border-amber-200/60">
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">مقدار یا تعداد</label>
                <input
                  type="number"
                  step="any"
                  value={quantity !== undefined ? quantity : ''}
                  onChange={e => handleQuantityChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="مثال: 15"
                  className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm outline-none"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">واحد اندازه‌گیری</label>
                <select
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-xs outline-none"
                >
                  {COMMON_UNITS.map(u => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">قیمت هر واحد (تومان)</label>
                <input
                  type="number"
                  value={unitPrice !== undefined ? unitPrice : ''}
                  onChange={e => handleUnitPriceChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="مثال: 550000"
                  className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm outline-none"
                  dir="ltr"
                />
              </div>
            </div>
          )}

          {/* Row 3: Total Amount & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">مبلغ کل فاکتور (تومان) *</label>
              <div className="relative">
                <input
                  type="number"
                  value={amount || ''}
                  onChange={e => handleAmountChange(parseFloat(e.target.value) || 0)}
                  placeholder="مبلغ به تومان"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-base font-bold text-slate-800 transition-all"
                  dir="ltr"
                  required
                />
                <DollarSign size={18} className="absolute right-3 top-3 text-slate-400" />
              </div>
              {amount > 0 && (
                <p className="text-[11px] text-teal-600 font-bold mt-1">
                  معادل: {formatCurrency(amount)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">روش پرداخت</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm"
              >
                <option value="card">کارتخوان / کارت به کارت / واریز بانکی</option>
                <option value="cash">نقدی (از صندوق)</option>
                <option value="credit">نسیه / اعتباری (بدهی به طرف‌حساب)</option>
                <option value="cheque">چک بانکی صیادی</option>
              </select>
            </div>
          </div>

          {/* Row 4: Supplier/Person & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                طرف‌حساب / تامین‌کننده / شخص
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="knownSuppliersList"
                  value={supplierOrPerson}
                  onChange={e => setSupplierOrPerson(e.target.value)}
                  placeholder="مثال: قصابی برادران، لبنیات میهن، اداره برق"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                />
                <User size={18} className="absolute right-3 top-3 text-slate-400" />
                <datalist id="knownSuppliersList">
                  {knownSuppliers.map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">وضعیت تسویه</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('paid')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    status === 'paid'
                      ? 'bg-teal-50 text-teal-700 border-teal-300 ring-2 ring-teal-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  ✓ پرداخت شده / تسویه
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('pending')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    status === 'pending'
                      ? 'bg-amber-50 text-amber-700 border-amber-300 ring-2 ring-amber-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  ⏳ نسیه / در انتظار پرداخت
                </button>
              </div>
            </div>
          </div>

          {/* Row 5: Date & Invoice Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">تاریخ ثبت فاکتور (شمسی)</label>
              <div className="w-full">
                <DatePicker
                  value={dateObj}
                  onChange={(d: any) => setDateObj(d)}
                  calendar={persian}
                  locale={persian_fa}
                  calendarPosition="bottom-right"
                  inputClass="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm outline-none"
                  containerClassName="w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">شماره فاکتور / پیگیری (اختیاری)</label>
              <div className="relative">
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="مثال: ف-1405"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                  dir="ltr"
                />
                <Hash size={18} className="absolute right-3 top-3 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">یادداشت و توضیحات (اختیاری)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="توضیحات تکمیلی پیرامون این خرید یا هزینه..."
              rows={2}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm outline-none transition-all resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Save size={16} />
              <span>{initialExpense?.id ? 'بروزرسانی اطلاعات' : 'ثبت فاکتور'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
