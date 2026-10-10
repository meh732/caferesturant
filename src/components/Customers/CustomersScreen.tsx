import { useLiveQuery } from 'dexie-react-hooks';
import { db, Customer } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { format } from 'date-fns-jalali';
import { Users, Search, Phone, Plus, Edit2, Trash2, MapPin, Hash, X, Save, UserPlus } from 'lucide-react';
import { useState, useMemo } from 'react';

export default function CustomersScreen() {
  const customersList = useLiveQuery(() => db.customers.toArray()) || [];
  const orders = useLiveQuery(() => db.orders.toArray()) || [];
  const [searchQuery, setSearchQuery] = useState('');
  
  // State for adding/editing customer
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);

  // Compute aggregated stats for customers based on phone number matching
  const customerStats = useMemo(() => {
    const map = new Map<string, { totalSpent: number; orderCount: number; lastOrderDate?: Date }>();
    
    orders.forEach(order => {
      if (!order.customerPhone) return;
      const phone = order.customerPhone.trim();
      if (!map.has(phone)) {
        map.set(phone, { totalSpent: 0, orderCount: 0 });
      }
      const stats = map.get(phone)!;
      stats.totalSpent += order.total;
      stats.orderCount += 1;
      if (!stats.lastOrderDate || new Date(order.createdAt) > new Date(stats.lastOrderDate)) {
        stats.lastOrderDate = order.createdAt;
      }
    });
    
    return map;
  }, [orders]);

  // Combine customers list from database with their computed stats
  const processedCustomers = useMemo(() => {
    return customersList.map(customer => {
      const stats = customerStats.get(customer.phone.trim()) || { totalSpent: 0, orderCount: 0 };
      return {
        ...customer,
        totalSpent: stats.totalSpent,
        orderCount: stats.orderCount,
        lastOrderDate: stats.lastOrderDate
      };
    }).filter(c => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        c.phone.includes(query) ||
        (c.name && c.name.toLowerCase().includes(query)) ||
        (c.subscriptionCode && c.subscriptionCode.toLowerCase().includes(query)) ||
        (c.address && c.address.toLowerCase().includes(query))
      );
    }).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [customersList, customerStats, searchQuery]);

  const handleOpenAddModal = () => {
    setEditingCustomer({
      phone: '',
      name: '',
      subscriptionCode: '',
      address: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer?.phone?.trim()) {
      alert('لطفا شماره موبایل مشتری را وارد کنید.');
      return;
    }

    const phone = editingCustomer.phone.trim();
    const name = editingCustomer.name?.trim() || '';
    const subscriptionCode = editingCustomer.subscriptionCode?.trim() || '';
    const address = editingCustomer.address?.trim() || '';

    // Check if phone number is already registered
    const existing = await db.customers.where('phone').equals(phone).first();
    if (existing && existing.id !== editingCustomer.id) {
      alert('این شماره موبایل قبلا ثبت شده است.');
      return;
    }

    if (editingCustomer.id) {
      // Update
      await db.customers.update(editingCustomer.id, {
        phone,
        name,
        subscriptionCode,
        address
      });
    } else {
      // Add
      await db.customers.add({
        phone,
        name,
        subscriptionCode,
        address,
        createdAt: new Date()
      });
    }

    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const handleDeleteCustomer = async (id: number) => {
    if (window.confirm('آیا از حذف این مشتری اطمینان دارید؟')) {
      await db.customers.delete(id);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#F5F5F7] font-sans" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Section (Apple Translucent Card) */}
        <div className="bg-white/85 backdrop-blur-xl p-5 sm:p-6 rounded-3xl border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#30B0C7] text-white flex items-center justify-center shadow-sm">
              <Users size={26} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">باشگاه مشتریان و اشتراک</h1>
              <p className="text-xs sm:text-sm text-neutral-500 font-normal mt-0.5">
                مدیریت مشخصات، کدهای اشتراک، تاریخچه خرید و آدرس‌های ارسال بیرون‌بر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            {/* Apple Spotlight Search */}
            <div className="relative flex-1 md:w-72">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input 
                type="text"
                placeholder="جستجو (نام، شماره، اشتراک...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-3.5 py-2.5 bg-black/[0.04] border border-black/[0.06] rounded-2xl outline-none focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all text-right text-xs text-neutral-900"
              />
            </div>
            <button
              onClick={handleOpenAddModal}
              className="bg-[#007AFF] hover:bg-[#0062cc] active:scale-[0.98] text-white px-4 py-2.5 rounded-2xl font-semibold flex items-center gap-2 transition-all shrink-0 text-xs shadow-[0_2px_8px_rgba(0,122,255,0.25)] cursor-pointer"
            >
              <UserPlus size={16} />
              <span>مشتری جدید</span>
            </button>
          </div>
        </div>

        {/* Customer Table List */}
        <div className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-black/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right whitespace-nowrap text-xs">
              <thead className="bg-neutral-50/70 border-b border-black/[0.04] font-semibold text-neutral-500">
                <tr>
                  <th className="py-3.5 px-5 text-right">مشخصات مشتری</th>
                  <th className="py-3.5 px-4 text-center">کد اشتراک</th>
                  <th className="py-3.5 px-4 text-center">تعداد خرید</th>
                  <th className="py-3.5 px-5 text-right">مجموع پرداختی</th>
                  <th className="py-3.5 px-5 text-right">آدرس بیرون‌بر</th>
                  <th className="py-3.5 px-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {processedCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-neutral-50/70 transition-colors">
                    {/* Phone & Name */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center font-bold text-xs shrink-0">
                          {customer.name ? customer.name[0] : <Phone size={14} />}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-neutral-900 text-xs">{customer.name || 'مشتری بدون نام'}</span>
                          <span className="text-[11px] text-neutral-400 font-mono" dir="ltr">{customer.phone}</span>
                        </div>
                      </div>
                    </td>

                    {/* Subscription Code */}
                    <td className="py-3.5 px-4 text-center">
                      {customer.subscriptionCode ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FF9500]/10 text-[#FF9500] font-mono">
                          <Hash size={11} />
                          {customer.subscriptionCode}
                        </span>
                      ) : (
                        <span className="text-neutral-300 text-xs">-</span>
                      )}
                    </td>

                    {/* Order Count */}
                    <td className="py-3.5 px-4 text-center text-neutral-700 font-bold font-mono">
                      {customer.orderCount} <span className="font-normal text-neutral-400 text-[11px]">فاکتور</span>
                    </td>

                    {/* Total Spent */}
                    <td className="py-3.5 px-5 font-bold text-[#34C759] text-xs font-mono">
                      {formatCurrency(customer.totalSpent)}
                    </td>

                    {/* Delivery Address */}
                    <td className="py-3.5 px-5 text-neutral-600 text-xs max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                      {customer.address ? (
                        <div className="flex items-center gap-1.5 text-neutral-700">
                          <MapPin size={13} className="text-neutral-400 shrink-0" />
                          <span className="truncate max-w-[220px]" title={customer.address}>{customer.address}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-300 text-xs">ثبت نشده</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(customer)}
                          className="p-1.5 text-neutral-400 hover:text-[#007AFF] hover:bg-[#007AFF]/10 rounded-xl transition-all cursor-pointer active:scale-90"
                          title="ویرایش اطلاعات"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => customer.id && handleDeleteCustomer(customer.id)}
                          className="p-1.5 text-neutral-400 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-xl transition-all cursor-pointer active:scale-90"
                          title="حذف"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {processedCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-neutral-400">
                      <div className="w-14 h-14 rounded-3xl bg-black/[0.03] flex items-center justify-center mx-auto mb-3 text-neutral-300">
                        <Users size={28} />
                      </div>
                      <p className="text-sm font-medium text-neutral-500">مشتری با این مشخصات یافت نشد.</p>
                      <button
                        onClick={handleOpenAddModal}
                        className="mt-2.5 text-[#007AFF] hover:text-[#0062cc] font-semibold text-xs inline-flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        <Plus size={14} />
                        <span>ایجاد مشتری جدید با این مشخصات</span>
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Add / Edit Customer Modal (Apple Sheet) */}
      {isModalOpen && editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-md animate-in fade-in">
          <div className="bg-white/95 backdrop-blur-2xl rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-black/[0.08] flex flex-col gap-5">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3.5 border-b border-black/[0.04]">
              <h2 className="text-base font-bold text-neutral-900 tracking-tight">
                {editingCustomer.id ? 'ویرایش مشخصات مشتری' : 'افزودن مشتری جدید'}
              </h2>
              <button 
                onClick={() => { setIsModalOpen(false); setEditingCustomer(null); }}
                className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-xl hover:bg-black/[0.04] transition-all cursor-pointer active:scale-90"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-3.5">
              {/* Phone Field */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">شماره موبایل <span className="text-[#FF3B30]">*</span></label>
                <input 
                  type="text"
                  placeholder="09123456789"
                  value={editingCustomer.phone || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-left font-mono text-xs transition-all"
                  dir="ltr"
                />
              </div>

              {/* Name Field */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">نام و نام خانوادگی (اختیاری)</label>
                <input 
                  type="text"
                  placeholder="مثال: علی محمدی"
                  value={editingCustomer.name || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-right text-xs transition-all"
                />
              </div>

              {/* Subscription Code Field */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">کد اشتراک (اختیاری)</label>
                <input 
                  type="text"
                  placeholder="مثال: 1045"
                  value={editingCustomer.subscriptionCode || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, subscriptionCode: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-left font-mono text-xs transition-all"
                  dir="ltr"
                />
              </div>

              {/* Delivery Address Field */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">آدرس کامل جهت سفارش‌های بیرون‌بر (اختیاری)</label>
                <textarea 
                  placeholder="مثال: خیابان ولیعصر، کوچه بهار، پلاک ۱۰، واحد ۴"
                  value={editingCustomer.address || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-right text-xs h-20 resize-none transition-all"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-2.5 justify-end pt-3 border-t border-black/[0.04]">
              <button
                onClick={() => { setIsModalOpen(false); setEditingCustomer(null); }}
                className="px-4 py-2 rounded-xl text-neutral-600 hover:bg-black/[0.05] transition-all font-semibold text-xs active:scale-95 cursor-pointer"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveCustomer}
                className="px-5 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white font-semibold flex items-center gap-1.5 transition-all text-xs active:scale-95 shadow-[0_2px_8px_rgba(0,122,255,0.25)] cursor-pointer"
              >
                <Save size={15} />
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
