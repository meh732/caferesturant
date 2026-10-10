import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Category, MenuItem } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit2, Trash2, CheckCircle2, Circle, UtensilsCrossed, Lock, Upload, Image as ImageIcon } from 'lucide-react';

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
    <div className="flex-1 flex overflow-hidden font-sans bg-[#F5F5F7]" dir="rtl">
      
      {/* Categories Sidebar (macOS Inset Sidebar) */}
      <div className="w-72 lg:w-80 bg-white/80 backdrop-blur-xl border-l border-black/[0.06] flex flex-col shrink-0">
        <div className="p-4 px-5 border-b border-black/[0.04] flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-neutral-900 tracking-tight">دسته‌بندی‌های منو</h2>
            <p className="text-[11px] text-neutral-500 font-normal">{categories?.length || 0} گروه ثبت‌شده</p>
          </div>
          {can('menu_edit') && (
            <button 
              onClick={() => setEditingCategory({ name: '' })}
              className="w-8 h-8 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs"
              title="افزودن گروه منو"
            >
              <Plus size={18} />
            </button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-none">
          {categories?.map(cat => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <div 
                key={cat.id}
                className={`flex items-center justify-between px-3.5 py-3 rounded-2xl cursor-pointer transition-all duration-150 active:scale-[0.99] ${
                  isSelected 
                    ? 'bg-[#007AFF] text-white shadow-[0_2px_10px_rgba(0,122,255,0.25)] font-semibold' 
                    : 'bg-transparent text-neutral-800 hover:bg-black/[0.04] font-medium'
                }`}
                onClick={() => setSelectedCategoryId(cat.id!)}
              >
                <span className="text-xs truncate">{cat.name}</span>
                {can('menu_edit') && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); }}
                      className={`p-1.5 rounded-lg active:scale-90 transition-all ${isSelected ? 'text-white/80 hover:text-white hover:bg-white/20' : 'text-neutral-400 hover:text-[#007AFF] hover:bg-black/[0.05]'}`}
                      title="ویرایش نام گروه"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id!); }}
                      className={`p-1.5 rounded-lg active:scale-90 transition-all ${isSelected ? 'text-white/80 hover:text-white hover:bg-white/20' : 'text-neutral-400 hover:text-[#FF3B30] hover:bg-black/[0.05]'}`}
                      title="حذف گروه"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {categories?.length === 0 && (
            <p className="text-center text-xs text-neutral-400 mt-10">هیچ گروهی ثبت نشده است.</p>
          )}
        </div>
      </div>

      {/* Items Area */}
      <div className="flex-1 flex flex-col bg-[#F5F5F7] overflow-hidden">
        {selectedCategoryId ? (
          <>
            {/* Header */}
            <div className="p-4 px-6 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 tracking-tight">
                  {categories?.find(c => c.id === selectedCategoryId)?.name}
                </h2>
                <p className="text-xs text-neutral-500 font-mono">{activeItems.length} آیتم در این گروه</p>
              </div>
              {can('menu_edit') && (
                <button 
                  onClick={() => setEditingItem({ categoryId: selectedCategoryId, name: '', price: 0, isActive: true })}
                  className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0062cc] active:scale-[0.98] text-white px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all shadow-[0_2px_8px_rgba(0,122,255,0.25)] cursor-pointer"
                >
                  <Plus size={16} />
                  <span>افزودن غذای جدید</span>
                </button>
              )}
            </div>
            
            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-none">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {activeItems.map(item => (
                  <div 
                    key={item.id} 
                    className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-black/[0.06] p-4 flex flex-col justify-between hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] transition-all duration-200"
                  >
                    <div>
                      {item.image ? (
                        <div className="w-full h-36 rounded-2xl overflow-hidden mb-3 bg-neutral-100">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-full h-24 rounded-2xl overflow-hidden mb-3 bg-neutral-100/70 border border-black/[0.04] flex items-center justify-center text-neutral-300">
                          <ImageIcon size={28} />
                        </div>
                      )}
                      
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="font-bold text-sm text-neutral-900 leading-snug">{item.name}</h3>
                        {can('menu_edit') ? (
                          <button 
                            onClick={() => toggleItemActive(item)} 
                            className="cursor-pointer active:scale-90 transition-all shrink-0"
                            title={item.isActive ? 'موجود' : 'ناموجود'}
                          >
                            {item.isActive ? (
                              <CheckCircle2 className="text-[#34C759]" size={20} />
                            ) : (
                              <Circle className="text-neutral-300" size={20} />
                            )}
                          </button>
                        ) : (
                          <span className="shrink-0">
                            {item.isActive ? (
                              <CheckCircle2 className="text-[#34C759]" size={20} />
                            ) : (
                              <Circle className="text-neutral-300" size={20} />
                            )}
                          </span>
                        )}
                      </div>
                      <p className="text-[#007AFF] font-bold text-base font-mono">{formatCurrency(item.price)}</p>
                    </div>
                    
                    {can('menu_edit') && (
                      <div className="flex justify-end gap-1.5 mt-4 pt-3 border-t border-black/[0.04]">
                        <button 
                          onClick={() => setEditingItem(item)}
                          className="p-1.5 text-neutral-400 hover:bg-[#007AFF]/10 hover:text-[#007AFF] rounded-xl transition-all cursor-pointer active:scale-90"
                          title="ویرایش غذا"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button 
                          onClick={() => handleDeleteItem(item.id!)}
                          className="p-1.5 text-neutral-400 hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] rounded-xl transition-all cursor-pointer active:scale-90"
                          title="حذف غذا"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {activeItems.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-24 text-neutral-400">
                    <div className="w-16 h-16 rounded-3xl bg-black/[0.03] flex items-center justify-center mb-3 text-neutral-300">
                      <UtensilsCrossed size={32} />
                    </div>
                    <p className="text-sm font-medium text-neutral-500">هنوز هیچ آیتمی در این گروه ثبت نشده است.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-400 flex-col p-6">
            <div className="w-20 h-20 rounded-3xl bg-black/[0.03] flex items-center justify-center mb-4 text-neutral-300">
              <UtensilsCrossed size={36} />
            </div>
            <p className="text-sm font-semibold text-neutral-600">برای مدیریت غذاها، ابتدا یک گروه را از منوی کناری انتخاب کنید.</p>
          </div>
        )}
      </div>

      {/* Category Modal (Apple Sheet) */}
      {editingCategory !== null && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white/95 backdrop-blur-2xl w-full max-w-md rounded-3xl shadow-2xl p-6 border border-black/[0.08]">
            <h3 className="text-lg font-bold text-neutral-900 mb-5 tracking-tight">
              {editingCategory.id ? 'ویرایش گروه' : 'گروه جدید'}
            </h3>
            <div className="mb-6">
              <label className="block text-xs font-semibold text-neutral-700 mb-2">نام دسته‌بندی</label>
              <input 
                autoFocus
                type="text"
                value={editingCategory.name || ''}
                onChange={e => setEditingCategory({...editingCategory, name: e.target.value})}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-xs text-neutral-900 transition-all"
                placeholder="مثال: پیتزا و ساندویچ"
              />
            </div>
            <div className="flex justify-end gap-2.5">
              <button 
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 rounded-xl text-neutral-600 text-xs font-semibold hover:bg-black/[0.05] active:scale-95 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button 
                onClick={handleSaveCategory}
                className="px-5 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white text-xs font-semibold active:scale-95 transition-all shadow-[0_2px_8px_rgba(0,122,255,0.25)] cursor-pointer"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal (Apple Sheet) */}
      {editingItem !== null && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white/95 backdrop-blur-2xl w-full max-w-lg rounded-3xl shadow-2xl p-6 border border-black/[0.08] max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-neutral-900 mb-5 tracking-tight">
              {editingItem.id ? 'ویرایش آیتم منو' : 'آیتم جدید منو'}
            </h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-2">تصویر آیتم (پیش‌فرض یا فایل شخصی)</label>
                
                {/* Preset Images */}
                <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">
                  {PRESET_IMAGES.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setEditingItem({ ...editingItem, image: preset.url })}
                      className={`shrink-0 w-14 h-14 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer active:scale-95 ${editingItem.image === preset.url ? 'border-[#007AFF] shadow-md ring-2 ring-[#007AFF]/20' : 'border-black/[0.06] hover:border-black/[0.15]'}`}
                      title={preset.label}
                    >
                      <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  {editingItem.image && (
                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-neutral-100 shrink-0 border border-black/[0.08]">
                      <img src={editingItem.image} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <input 
                      type="url"
                      value={editingItem.image || ''}
                      onChange={e => setEditingItem({...editingItem, image: e.target.value})}
                      className="w-full px-3 py-2 rounded-xl bg-black/[0.03] border border-black/[0.08] focus:border-[#007AFF] focus:bg-white outline-none text-xs font-mono"
                      placeholder="آدرس اینترنتی عکس..."
                      dir="ltr"
                    />
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <button type="button" className="w-full px-3 py-2 bg-black/[0.04] hover:bg-black/[0.07] text-neutral-700 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                        <Upload size={14} />
                        <span>انتخاب تصویر از حافظه دستگاه</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">نام غذا یا نوشیدنی</label>
                <input 
                  autoFocus
                  type="text"
                  value={editingItem.name || ''}
                  onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-xs text-neutral-900 transition-all"
                  placeholder="مثال: پیتزا مخصوص سرآشپز"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-neutral-700">قیمت فروش (تومان)</label>
                  {editingItem.id && !can('menu_price_change') && (
                    <span className="text-[10px] text-[#FF3B30] font-bold flex items-center gap-1">
                      <Lock size={11} />
                      تغییر قیمت قفل است
                    </span>
                  )}
                </div>
                <input 
                  type="number"
                  disabled={Boolean(editingItem.id && !can('menu_price_change'))}
                  value={editingItem.price || ''}
                  onChange={e => setEditingItem({...editingItem, price: Number(e.target.value) })}
                  className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-mono font-bold outline-none transition-all ${
                    editingItem.id && !can('menu_price_change')
                      ? 'bg-neutral-100 border-black/[0.06] text-neutral-400 cursor-not-allowed'
                      : 'bg-black/[0.03] border-black/[0.08] focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20'
                  }`}
                  placeholder="0"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-black/[0.04]">
              <button 
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl text-neutral-600 text-xs font-semibold hover:bg-black/[0.05] active:scale-95 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button 
                onClick={handleSaveItem}
                className="px-5 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white text-xs font-semibold active:scale-95 transition-all shadow-[0_2px_8px_rgba(0,122,255,0.25)] cursor-pointer"
              >
                ذخیره آیتم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
