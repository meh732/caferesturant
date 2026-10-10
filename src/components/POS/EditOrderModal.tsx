import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Order, OrderItem, MenuItem, updateOrderAndSyncStock } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { 
  X, Save, Plus, Minus, Trash2, Search, Edit3, CheckCircle2, 
  AlertTriangle, User, Phone, MapPin, Hash, ShoppingBag, CreditCard, DollarSign
} from 'lucide-react';

interface EditOrderModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated?: () => void;
}

export default function EditOrderModal({
  order,
  isOpen,
  onClose,
  onOrderUpdated
}: EditOrderModalProps) {
  const menuItems = useLiveQuery(() => db.menuItems.filter(m => m.isActive).toArray()) || [];
  
  const [items, setItems] = useState<OrderItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'cheque'>('card');
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [taxEnabled, setTaxEnabled] = useState<boolean>(true);
  const [tableNumber, setTableNumber] = useState<string>('');

  const [searchItemQuery, setSearchItemQuery] = useState('');
  const [showItemSearch, setShowItemSearch] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      setItems(order.items ? [...order.items] : []);
      setCustomerName(order.customerName || '');
      setCustomerPhone(order.customerPhone || '');
      setCustomerAddress(order.customerAddress || '');
      setOrderType(order.orderType || 'dine_in');
      setPaymentMethod(order.paymentMethod || 'card');
      setDiscountType(order.discountType || 'none');
      setDiscountValue(order.discountValue || 0);
      setTaxEnabled(order.taxEnabled ?? true);
      setTableNumber(order.tableNumber ? String(order.tableNumber) : '');
      setErrorMsg(null);
    }
  }, [order]);

  if (!isOpen || !order) return null;

  // Calculation
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = (subtotal * discountValue) / 100;
  } else if (discountType === 'amount') {
    discountAmount = discountValue;
  }

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxEnabled ? Math.round(taxableAmount * 0.10) : 0; // 10% VAT default
  const total = Math.max(0, subtotal - discountAmount + taxAmount);

  const handleQuantityChange = (index: number, delta: number) => {
    setItems(prev => {
      const next = [...prev];
      const newQty = next[index].quantity + delta;
      if (newQty <= 0) {
        return next.filter((_, i) => i !== index);
      }
      next[index] = { ...next[index], quantity: newQty };
      return next;
    });
  };

  const handlePriceChange = (index: number, newPrice: number) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], price: Math.max(0, newPrice) };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddMenuItem = (menuItem: MenuItem) => {
    setItems(prev => {
      const existingIdx = prev.findIndex(i => i.menuItemId === menuItem.id);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], quantity: next[existingIdx].quantity + 1 };
        return next;
      } else {
        return [
          ...prev,
          {
            menuItemId: menuItem.id!,
            name: menuItem.name,
            price: menuItem.price,
            quantity: 1,
          }
        ];
      }
    });
    setSearchItemQuery('');
    setShowItemSearch(false);
  };

  const handleSave = async () => {
    if (items.length === 0) {
      setErrorMsg('فاکتور نمی‌تواند بدون قلم کالا باشد. حداقل یک محصول اضافه کنید.');
      return;
    }

    if (!order.id) return;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      await updateOrderAndSyncStock(order.id, {
        items,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        orderType,
        paymentMethod,
        discountType,
        discountValue,
        taxEnabled,
        tableNumber: tableNumber ? Number(tableNumber) : undefined,
      });

      if (onOrderUpdated) {
        onOrderUpdated();
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to update order', err);
      setErrorMsg(err?.message || 'خطا در ویرایش فاکتور فروش.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredMenuItems = menuItems.filter(m => 
    m.name.toLowerCase().includes(searchItemQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in" dir="rtl">
      <div className="bg-white rounded-3xl border border-black/10 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-black/[0.06] bg-neutral-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0">
              <Edit3 size={20} />
            </div>
            <div>
              <h2 className="font-bold text-base text-neutral-900">
                ویرایش فاکتور فروش شماره #{order.invoiceNumber}
              </h2>
              <p className="text-xs text-neutral-500 font-medium">
                تغییر اقلام، اطلاعات مشتری، روش پرداخت و به‌روزرسانی خودکار موجودی انبار
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-neutral-200/60 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form Top Section: Customer & Delivery details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-neutral-50/70 p-4 rounded-2xl border border-black/[0.04]">
            
            <div>
              <label className="text-xs font-bold text-neutral-700 mb-1 block">نام مشتری</label>
              <div className="relative">
                <User size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="مشتری عمومی"
                  className="w-full pr-8 pl-3 py-2 bg-white border border-black/10 rounded-xl text-xs focus:border-[#007AFF] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 mb-1 block">شماره تماس</label>
              <div className="relative">
                <Phone size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="0912..."
                  className="w-full pr-8 pl-3 py-2 bg-white border border-black/10 rounded-xl text-xs focus:border-[#007AFF] outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 mb-1 block">نوع سفارش و تحویل</label>
              <select
                value={orderType}
                onChange={e => setOrderType(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs focus:border-[#007AFF] outline-none font-medium"
              >
                <option value="dine_in">سالن (حضوری)</option>
                <option value="takeaway">بیرون‌بر</option>
                <option value="delivery">پیک و ارسال</option>
              </select>
            </div>

            {orderType === 'dine_in' && (
              <div>
                <label className="text-xs font-bold text-neutral-700 mb-1 block">شماره میز</label>
                <input
                  type="number"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  placeholder="مثلا 12"
                  className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs focus:border-[#007AFF] outline-none font-mono"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-neutral-700 mb-1 block">روش پرداخت / تسویه</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs focus:border-[#007AFF] outline-none font-medium"
              >
                <option value="card">کارتخوان / کارت به کارت</option>
                <option value="cash">وجه نقدی</option>
                <option value="cheque">چک / نسیه</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-bold text-neutral-700 mb-1 block">آدرس ارسال مشتری</label>
              <div className="relative">
                <MapPin size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={customerAddress}
                  onChange={e => setCustomerAddress(e.target.value)}
                  placeholder="آدرس جهت فاکتورهای پیک..."
                  className="w-full pr-8 pl-3 py-2 bg-white border border-black/10 rounded-xl text-xs focus:border-[#007AFF] outline-none"
                />
              </div>
            </div>

          </div>

          {/* Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                <ShoppingBag size={16} className="text-[#007AFF]" />
                <span>اقلام فاکتور فروش ({items.length} آیتم)</span>
              </h3>

              <button
                onClick={() => setShowItemSearch(!showItemSearch)}
                className="px-3 py-1.5 bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus size={14} />
                <span>افزودن غذای جدید</span>
              </button>
            </div>

            {/* Menu Item Search Dropdown */}
            {showItemSearch && (
              <div className="p-4 bg-white rounded-2xl border border-[#007AFF]/30 shadow-lg space-y-3 animate-in fade-in">
                <div className="relative">
                  <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchItemQuery}
                    onChange={e => setSearchItemQuery(e.target.value)}
                    placeholder="جستجوی نام غذا یا نوشیدنی در منو..."
                    className="w-full pr-8 pl-3 py-2 bg-neutral-50 border border-black/10 rounded-xl text-xs focus:border-[#007AFF] outline-none"
                    autoFocus
                  />
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-black/[0.04] border border-black/[0.06] rounded-xl bg-neutral-50">
                  {filteredMenuItems.map(m => (
                    <div
                      key={m.id}
                      onClick={() => handleAddMenuItem(m)}
                      className="p-2.5 hover:bg-white flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <span className="text-xs font-bold text-neutral-900">{m.name}</span>
                      <span className="text-xs font-mono font-bold text-[#007AFF]">{formatCurrency(m.price)}</span>
                    </div>
                  ))}
                  {filteredMenuItems.length === 0 && (
                    <div className="p-4 text-center text-xs text-neutral-400">غذایی با این نام یافت نشد.</div>
                  )}
                </div>
              </div>
            )}

            {/* Items Table */}
            <div className="border border-black/[0.08] rounded-2xl overflow-hidden bg-white shadow-sm">
              <table className="w-full text-right text-xs">
                <thead className="bg-neutral-100/80 text-neutral-600 font-semibold border-b border-black/[0.06]">
                  <tr>
                    <th className="py-2.5 px-3">ردیف</th>
                    <th className="py-2.5 px-3">نام محصول</th>
                    <th className="py-2.5 px-3 text-center">تعداد</th>
                    <th className="py-2.5 px-3">قیمت واحد (تومان)</th>
                    <th className="py-2.5 px-3">مبلغ کل (تومان)</th>
                    <th className="py-2.5 px-3 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-neutral-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-neutral-900">{item.name}</td>
                      
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleQuantityChange(idx, -1)}
                            className="w-6 h-6 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center justify-center cursor-pointer"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="font-bold font-mono text-sm w-6 text-center">{item.quantity}</span>
                          <button
                            onClick={() => handleQuantityChange(idx, 1)}
                            className="w-6 h-6 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center justify-center cursor-pointer"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          value={item.price}
                          onChange={e => handlePriceChange(idx, Number(e.target.value))}
                          className="w-28 px-2 py-1 border border-black/10 rounded-lg text-xs font-mono font-bold text-neutral-800 focus:border-[#007AFF] outline-none"
                        />
                      </td>

                      <td className="py-2.5 px-3 font-bold font-mono text-[#007AFF]">
                        {formatCurrency(item.price * item.quantity)}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          className="w-7 h-7 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-500 inline-flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-400">
                        هیچ آیتمی وجود ندارد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Discounts & Final Calculation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-neutral-50 p-4 rounded-2xl border border-black/[0.06]">
            
            {/* Discount & Tax controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-700">نوع تخفیف</span>
                <select
                  value={discountType}
                  onChange={e => setDiscountType(e.target.value as any)}
                  className="px-2 py-1 bg-white border border-black/10 rounded-lg text-xs font-medium"
                >
                  <option value="none">بدون تخفیف</option>
                  <option value="percent">درصدی (%)</option>
                  <option value="amount">مبلغی ثابت (تومان)</option>
                </select>
              </div>

              {discountType !== 'none' && (
                <div>
                  <label className="text-[11px] text-neutral-500 font-semibold block mb-1">
                    {discountType === 'percent' ? 'درصد تخفیف:' : 'مبلغ تخفیف (تومان):'}
                  </label>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={e => setDiscountValue(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white border border-black/10 rounded-xl text-xs font-mono font-bold outline-none focus:border-[#007AFF]"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-black/[0.04]">
                <label className="text-xs font-bold text-neutral-700 cursor-pointer flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={taxEnabled}
                    onChange={e => setTaxEnabled(e.target.checked)}
                    className="w-4 h-4 text-[#007AFF] rounded border-neutral-300 focus:ring-[#007AFF]"
                  />
                  <span>محاسبه ارزش افزوده و مالیات (۱۰٪)</span>
                </label>
              </div>
            </div>

            {/* Price Summary Box */}
            <div className="bg-white p-3.5 rounded-xl border border-black/[0.06] space-y-2 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>جمع کل سفارش:</span>
                <span className="font-mono font-bold text-neutral-800">{formatCurrency(subtotal)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>تخفیف اعمال شده:</span>
                  <span className="font-mono font-bold">- {formatCurrency(discountAmount)}</span>
                </div>
              )}

              {taxAmount > 0 && (
                <div className="flex justify-between text-neutral-500">
                  <span>مالیات بر ارزش افزوده:</span>
                  <span className="font-mono font-bold">+ {formatCurrency(taxAmount)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-black/[0.08] flex justify-between items-center font-bold text-neutral-900 text-sm">
                <span>مبلغ قابل پرداخت:</span>
                <span className="font-mono text-base text-[#007AFF]">{formatCurrency(total)}</span>
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-black/[0.06] bg-neutral-50/80 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 bg-neutral-200/80 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            انصراف
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            {isSaving ? (
              <span>در حال به‌روزرسانی و انبارداری...</span>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>ذخیره تغییرات فاکتور</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
