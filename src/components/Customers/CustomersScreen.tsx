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
    if (confirm('آیا از حذف این مشتری مطمئن هستید؟')) {
      await db.customers.delete(id);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">باشگاه مشتریان</h1>
            <p className="text-slate-500 mt-2">مدیریت مشخصات، کد اشتراک و آدرس بیرون‌بر مشتریان رستوران.</p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text"
                placeholder="جستجو (نام، موبایل، اشتراک...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-3 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-right text-sm"
              />
            </div>
            <button
              onClick={handleOpenAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shrink-0 text-sm"
            >
              <UserPlus size={18} />
              افزودن مشتری جدید
            </button>
          </div>
        </div>

        {/* Customer Table List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-500">
                <tr>
                  <th className="py-4 px-6 text-right">مشخصات مشتری</th>
                  <th className="py-4 px-6 text-center">کد اشتراک</th>
                  <th className="py-4 px-6 text-center">تعداد خرید</th>
                  <th className="py-4 px-6 text-right">مجموع پرداختی</th>
                  <th className="py-4 px-6 text-right">آدرس بیرون‌بر</th>
                  <th className="py-4 px-6 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Phone & Name */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                          {customer.name ? customer.name[0] : <Phone size={16} />}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{customer.name || 'مشتری بدون نام'}</span>
                          <span className="text-xs text-slate-400 font-mono" dir="ltr">{customer.phone}</span>
                        </div>
                      </div>
                    </td>

                    {/* Subscription Code */}
                    <td className="py-4 px-6 text-center">
                      {customer.subscriptionCode ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Hash size={12} />
                          {customer.subscriptionCode}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">-</span>
                      )}
                    </td>

                    {/* Order Count */}
                    <td className="py-4 px-6 text-center text-slate-600 font-medium">
                      {customer.orderCount} بار
                    </td>

                    {/* Total Spent */}
                    <td className="py-4 px-6 font-bold text-emerald-600 text-sm">
                      {formatCurrency(customer.totalSpent)}
                    </td>

                    {/* Delivery Address */}
                    <td className="py-4 px-6 text-slate-600 text-sm max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                      {customer.address ? (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <MapPin size={14} className="text-slate-400 shrink-0" />
                          <span className="truncate" title={customer.address}>{customer.address}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">ثبت نشده</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenEditModal(customer)}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="ویرایش اطلاعات"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => customer.id && handleDeleteCustomer(customer.id)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="حذف"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {processedCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400">
                      <Users size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="text-lg font-medium">مشتری با این مشخصات یافت نشد.</p>
                      <button
                        onClick={handleOpenAddModal}
                        className="mt-3 text-blue-600 hover:text-blue-700 font-bold inline-flex items-center gap-1.5"
                      >
                        <Plus size={16} />
                        ایجاد مشتری جدید با این مشخصات
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Add / Edit Customer Modal */}
      {isModalOpen && editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">
                {editingCustomer.id ? 'ویرایش مشخصات مشتری' : 'افزودن مشتری جدید'}
              </h2>
              <button 
                onClick={() => { setIsModalOpen(false); setEditingCustomer(null); }}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4">
              {/* Phone Field */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">شماره موبایل <span className="text-red-500">*</span></label>
                <input 
                  type="text"
                  placeholder="مثال: 09123456789"
                  value={editingCustomer.phone || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-left font-mono"
                  dir="ltr"
                />
              </div>

              {/* Name Field */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">نام و نام خانوادگی (اختیاری)</label>
                <input 
                  type="text"
                  placeholder="مثال: علی محمدی"
                  value={editingCustomer.name || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-right"
                />
              </div>

              {/* Subscription Code Field */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">کد اشتراک (اختیاری)</label>
                <input 
                  type="text"
                  placeholder="مثال: 1045"
                  value={editingCustomer.subscriptionCode || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, subscriptionCode: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-left font-mono"
                  dir="ltr"
                />
              </div>

              {/* Delivery Address Field */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">آدرس کامل جهت سفارش‌های بیرون‌بر (اختیاری)</label>
                <textarea 
                  placeholder="مثال: خیابان ولیعصر، کوچه بهار، پلاک ۱۰، واحد ۴"
                  value={editingCustomer.address || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-right h-24 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <button
                onClick={() => { setIsModalOpen(false); setEditingCustomer(null); }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors font-medium text-sm"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveCustomer}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 transition-colors text-sm"
              >
                <Save size={16} />
                ذخیره تغییرات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
