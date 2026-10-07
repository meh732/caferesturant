import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Category, MenuItem } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit2, Trash2, CheckCircle2, Circle, UtensilsCrossed, Lock } from 'lucide-react';

export default function MenuManagerScreen() {
  const { can } = useAuth();
  const categories = useLiveQuery(() => db.categories.toArray());
  const menuItems = useLiveQuery(() => db.menuItems.toArray());
  
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);

  const activeItems = useMemo(() => {
    return menuItems?.filter(i => i.categoryId === selectedCategoryId) || [];
  }, [menuItems, selectedCategoryId]);

  // Category Actions
  const handleSaveCategory = async () => {
    if (!editingCategory?.name?.trim()) return;
    if (editingCategory.id) {
      await db.categories.update(editingCategory.id, { name: editingCategory.name });
    } else {
      await db.categories.add({ name: editingCategory.name } as Category);
    }
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (id: number) => {
    if (window.confirm('آیا از حذف این گروه و تمام غذاهای آن مطمئن هستید؟')) {
      await db.categories.delete(id);
      const itemsToDelete = await db.menuItems.where('categoryId').equals(id).toArray();
      const itemIds = itemsToDelete.map(i => i.id).filter(id => id !== undefined) as number[];
      await db.menuItems.bulkDelete(itemIds);
      if (selectedCategoryId === id) setSelectedCategoryId(null);
    }
  };

  const PRESET_IMAGES = [
    { url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&q=80', label: 'برگر' },
    { url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&q=80', label: 'پیتزا' },
    { url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500&q=80', label: 'ساندویچ' },
    { url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500&q=80', label: 'کباب' },
    { url: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=500&q=80', label: 'سیب زمینی' },
    { url: 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=500&q=80', label: 'نوشیدنی' },
    { url: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=500&q=80', label: 'کوبیده' },
    { url: 'https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?w=500&q=80', label: 'سوپ' },
  ];

  // Item Actions
  const handleSaveItem = async () => {
    if (!editingItem?.name?.trim() || !editingItem.price || !selectedCategoryId) return;
    
    if (editingItem.id) {
      await db.menuItems.update(editingItem.id, { 
        name: editingItem.name,
        price: Number(editingItem.price),
        isActive: editingItem.isActive !== undefined ? editingItem.isActive : true,
        image: editingItem.image || ''
      });
    } else {
      await db.menuItems.add({ 
        categoryId: selectedCategoryId,
        name: editingItem.name,
        price: Number(editingItem.price),
        isActive: true,
        image: editingItem.image || ''
      } as MenuItem);
    }
    setEditingItem(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingItem(prev => prev ? { ...prev, image: reader.result as string } : null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (window.confirm('آیا از حذف این آیتم مطمئن هستید؟')) {
      await db.menuItems.delete(id);
    }
  };

  const toggleItemActive = async (item: MenuItem) => {
    if (item.id) {
      await db.menuItems.update(item.id, { isActive: !item.isActive });
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      
      {/* Categories Sidebar */}
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800">گروه‌های منو</h2>
          {can('menu_edit') && (
            <button 
              onClick={() => setEditingCategory({ name: '' })}
              className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer"
              title="افزودن گروه منو"
            >
              <Plus size={20} />
            </button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {categories?.map(cat => (
            <div 
              key={cat.id}
              className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all ${
                selectedCategoryId === cat.id 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-white border border-slate-200 hover:border-blue-300'
              }`}
              onClick={() => setSelectedCategoryId(cat.id!)}
            >
              <span className="font-medium">{cat.name}</span>
              {can('menu_edit') && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); }}
                    className={`p-1.5 rounded-md ${selectedCategoryId === cat.id ? 'hover:bg-blue-500' : 'text-slate-400 hover:bg-slate-100 hover:text-blue-600'}`}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id!); }}
                    className={`p-1.5 rounded-md ${selectedCategoryId === cat.id ? 'hover:bg-blue-500' : 'text-slate-400 hover:bg-slate-100 hover:text-red-600'}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {categories?.length === 0 && (
            <p className="text-center text-slate-500 mt-10">هیچ گروهی ثبت نشده است.</p>
          )}
        </div>
      </div>

      {/* Items Area */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {selectedCategoryId ? (
          <>
            <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
              <h2 className="text-2xl font-bold text-slate-800">
                {categories?.find(c => c.id === selectedCategoryId)?.name}
              </h2>
              {can('menu_edit') && (
                <button 
                  onClick={() => setEditingItem({ categoryId: selectedCategoryId, name: '', price: 0, isActive: true })}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  <Plus size={20} />
                  افزودن آیتم جدید
                </button>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeItems.map(item => (
                  <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                    <div>
                      {item.image && (
                        <div className="w-full h-32 rounded-xl overflow-hidden mb-3 bg-slate-100">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg text-slate-800">{item.name}</h3>
                        {can('menu_edit') ? (
                          <button onClick={() => toggleItemActive(item)} className="cursor-pointer">
                            {item.isActive ? (
                              <CheckCircle2 className="text-emerald-500" size={24} />
                            ) : (
                              <Circle className="text-slate-300" size={24} />
                            )}
                          </button>
                        ) : (
                          <span>
                            {item.isActive ? (
                              <CheckCircle2 className="text-emerald-500" size={24} />
                            ) : (
                              <Circle className="text-slate-300" size={24} />
                            )}
                          </span>
                        )}
                      </div>
                      <p className="text-blue-600 font-bold text-xl">{formatCurrency(item.price)}</p>
                    </div>
                    
                    {can('menu_edit') && (
                      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
                        <button 
                          onClick={() => setEditingItem(item)}
                          className="p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                          title="ویرایش غذا"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteItem(item.id!)}
                          className="p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                          title="حذف غذا"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {activeItems.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                    <UtensilsCrossed size={64} className="mb-4 opacity-20" />
                    <p className="text-lg">هنوز هیچ آیتمی در این گروه ثبت نشده است.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 flex-col">
            <UtensilsCrossed size={80} className="mb-6 opacity-10" />
            <p className="text-xl font-medium">برای مدیریت غذاها، ابتدا یک گروه را از منوی سمت راست انتخاب کنید.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {/* Category Modal */}
      {editingCategory !== null && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-6">
              {editingCategory.id ? 'ویرایش گروه' : 'گروه جدید'}
            </h3>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">نام گروه</label>
              <input 
                autoFocus
                type="text"
                value={editingCategory.name || ''}
                onChange={e => setEditingCategory({...editingCategory, name: e.target.value})}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="مثال: پیتزاها"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setEditingCategory(null)}
                className="px-5 py-2.5 rounded-lg text-slate-600 font-medium hover:bg-slate-100"
              >
                انصراف
              </button>
              <button 
                onClick={handleSaveCategory}
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {editingItem !== null && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-6">
              {editingItem.id ? 'ویرایش آیتم' : 'آیتم جدید'}
            </h3>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">عکس غذا (اختیاری)</label>
                
                {/* Preset Images */}
                <div className="flex gap-2 overflow-x-auto pb-2 mb-3 snap-x">
                  {PRESET_IMAGES.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => setEditingItem({ ...editingItem, image: preset.url })}
                      className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all snap-center ${editingItem.image === preset.url ? 'border-blue-500 shadow-md' : 'border-transparent hover:border-slate-300'}`}
                      title={preset.label}
                    >
                      <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  {editingItem.image && (
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                      <img src={editingItem.image} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <input 
                      type="url"
                      value={editingItem.image || ''}
                      onChange={e => setEditingItem({...editingItem, image: e.target.value})}
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="لینک عکس..."
                      dir="ltr"
                    />
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <button className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
                        یا انتخاب فایل از دستگاه
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نام غذا/نوشیدنی</label>
                <input 
                  autoFocus
                  type="text"
                  value={editingItem.name || ''}
                  onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="مثال: پیتزا پپرونی"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">قیمت (تومان)</label>
                  {editingItem.id && !can('menu_price_change') && (
                    <span className="text-xs text-rose-500 font-bold flex items-center gap-1">
                      <Lock size={12} />
                      تغییر قیمت قفل است
                    </span>
                  )}
                </div>
                <input 
                  type="number"
                  disabled={Boolean(editingItem.id && !can('menu_price_change'))}
                  value={editingItem.price || ''}
                  onChange={e => setEditingItem({...editingItem, price: Number(e.target.value)})}
                  className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none ${
                    editingItem.id && !can('menu_price_change')
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'border-slate-300'
                  }`}
                  placeholder="0"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setEditingItem(null)}
                className="px-5 py-2.5 rounded-lg text-slate-600 font-medium hover:bg-slate-100"
              >
                انصراف
              </button>
              <button 
                onClick={handleSaveItem}
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
