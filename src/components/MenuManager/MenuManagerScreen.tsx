import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Category, MenuItem, getMenuItemIngredients, updateMenuItemsOrder, updateCategoriesOrder, deleteCategorySafely } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { triggerServerDbSync } from '../../lib/serverSync';
import { 
  Plus, Edit2, Trash2, CheckCircle2, Circle, UtensilsCrossed, 
  Lock, Upload, Image as ImageIcon, AlertCircle, X, Sparkles,
  GripVertical, ArrowUp, ArrowDown, ArrowUpToLine, Move,
  ChevronLeft, ChevronRight, Layers, ArrowRight
} from 'lucide-react';

const COMMON_INGREDIENT_CHIPS = [
  'پنیر موزارلا',
  'قارچ تازه',
  'فیله گوشت',
  'فیله مرغ',
  'فلفل دلمه‌ای',
  'زیتون سیاه',
  'سس مخصوص',
  'پیاز کاراملی',
  'گوجه فرنگی',
  'خیارشور',
  'پنیر گودا',
  'نان کنجدی',
  'سیب‌زمینی سرخ‌کرده',
  'پپرونی',
  'ادویه مخصوص'
];

export default function MenuManagerScreen() {
  const { can } = useAuth();
  const rawCategories = useLiveQuery(() => db.categories.toArray());
  const menuItems = useLiveQuery(() => db.menuItems.toArray());
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<'categories' | 'items'>('categories');
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

  // Drag and drop state for items
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<number | null>(null);

  // Sorted categories
  const categories = useMemo(() => {
    return [...(rawCategories || [])].sort((a, b) => {
      const orderA = a.order !== undefined && a.order !== null ? a.order : (a.id || 0);
      const orderB = b.order !== undefined && b.order !== null ? b.order : (b.id || 0);
      return orderA - orderB;
    });
  }, [rawCategories]);

  // Count items per category for badges
  const itemsCountPerCategory = useMemo(() => {
    const map = new Map<number, number>();
    menuItems?.forEach(item => {
      if (item.categoryId) {
        map.set(item.categoryId, (map.get(item.categoryId) || 0) + 1);
      }
    });
    return map;
  }, [menuItems]);

  // Auto-select first category if none is selected
  useEffect(() => {
    if (!selectedCategoryId && categories && categories.length > 0 && categories[0].id) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const activeItems = useMemo(() => {
    const items = menuItems?.filter(i => i.categoryId === selectedCategoryId) || [];
    return [...items].sort((a, b) => {
      const orderA = a.order !== undefined && a.order !== null ? a.order : (a.id || 0);
      const orderB = b.order !== undefined && b.order !== null ? b.order : (b.id || 0);
      return orderA - orderB;
    });
  }, [menuItems, selectedCategoryId]);

  // Item Drag & Drop Reorder Handlers
  const handleItemDrop = async (targetItemId: number) => {
    if (!draggedItemId || draggedItemId === targetItemId) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }

    const currentList = [...activeItems];
    const fromIndex = currentList.findIndex(i => i.id === draggedItemId);
    const toIndex = currentList.findIndex(i => i.id === targetItemId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }

    const [moved] = currentList.splice(fromIndex, 1);
    currentList.splice(toIndex, 0, moved);

    await updateMenuItemsOrder(currentList.map(i => i.id!));
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleMoveItemToTop = async (item: MenuItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentList = [...activeItems];
    const idx = currentList.findIndex(i => i.id === item.id);
    if (idx <= 0) return;

    const [moved] = currentList.splice(idx, 1);
    currentList.unshift(moved);

    await updateMenuItemsOrder(currentList.map(i => i.id!));
    triggerServerDbSync(50);
  };

  const handleMoveItemStep = async (item: MenuItem, direction: -1 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentList = [...activeItems];
    const idx = currentList.findIndex(i => i.id === item.id);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;

    const [moved] = currentList.splice(idx, 1);
    currentList.splice(targetIdx, 0, moved);

    await updateMenuItemsOrder(currentList.map(i => i.id!));
    triggerServerDbSync(50);
  };

  // Category Reorder Handlers
  const handleMoveCategoryStep = async (cat: Category, direction: -1 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentList = [...categories];
    const idx = currentList.findIndex(c => c.id === cat.id);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;

    const [moved] = currentList.splice(idx, 1);
    currentList.splice(targetIdx, 0, moved);

    await updateCategoriesOrder(currentList.map(c => c.id!));
    triggerServerDbSync(50);
  };

  // Category Actions
  const handleSaveCategory = async () => {
    if (!editingCategory?.name?.trim()) return;
    if (editingCategory.id) {
      await db.categories.update(editingCategory.id, { name: editingCategory.name.trim() });
    } else {
      const nextOrder = (categories?.length || 0) + 1;
      const newId = await db.categories.add({ name: editingCategory.name.trim(), order: nextOrder } as Category);
      setSelectedCategoryId(newId);
    }
    setEditingCategory(null);
    triggerServerDbSync(50);
  };

  const handleDeleteCategory = async (id: number) => {
    const targetCat = categories?.find(c => c.id === id);
    const count = menuItems?.filter(i => i.categoryId === id).length || 0;
    
    if (count === 0) {
      if (window.confirm(`آیا از حذف دسته‌بندی «${targetCat?.name || ''}» مطمئن هستید؟`)) {
        await deleteCategorySafely(id, true);
        if (selectedCategoryId === id) setSelectedCategoryId(null);
      }
      return;
    }

    const confirmed = window.confirm(
      `این دسته‌بندی دارای ${count} غذا می‌باشد.\n\n` +
      `برای حذف این دسته و انتقال غذاهای آن به «سایر اقلام و متفرقه» روی OK کلیک کنید.\n` +
      `برای انصراف روی Cancel کلیک کنید.`
    );
    if (confirmed) {
      await deleteCategorySafely(id, false);
      if (selectedCategoryId === id) setSelectedCategoryId(null);
    }
  };

  // 100% Offline SVG Preset Images (no Unsplash / external CDN dependency)
  const PRESET_IMAGES = [
    { url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="%23007AFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="background:%23EFF6FF"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>', label: 'ساده' },
    { url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="%2334C759" stroke-width="1.5" style="background:%23F0FDF4"><path d="M12 2v20M2 12h20"/></svg>', label: 'پیتزا' },
  ];

  // Item Actions
  const handleSaveItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingItem) return;

    const trimmedName = (editingItem.name || '').trim();
    if (!trimmedName) {
      setItemError('لطفاً نام غذا یا نوشیدنی را وارد کنید.');
      return;
    }

    const targetCatId = editingItem.categoryId || selectedCategoryId || categories?.[0]?.id;
    if (!targetCatId) {
      setItemError('لطفاً ابتدا یک دسته‌بندی برای این غذا انتخاب کنید.');
      return;
    }

    const priceNum = Number(editingItem.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setItemError('قیمت فروش باید عدد معتبر (۰ یا بیشتر) باشد.');
      return;
    }

    try {
      const itemData = {
        name: trimmedName,
        price: priceNum,
        categoryId: Number(targetCatId),
        isActive: editingItem.isActive !== undefined ? editingItem.isActive : true,
        image: editingItem.image || '',
        description: (editingItem.description || '').trim()
      };

      if (editingItem.id) {
        await db.menuItems.update(editingItem.id, itemData);
      } else {
        await db.menuItems.add(itemData as MenuItem);
      }

      setEditingItem(null);
      setItemError(null);
      triggerServerDbSync(50);
    } catch (err: any) {
      console.error('Failed to save menu item:', err);
      setItemError('خطا در ذخیره‌سازی آیتم: ' + (err?.message || 'نامشخص'));
    }
  };

  const handleAppendIngredient = (chip: string) => {
    setEditingItem(prev => {
      if (!prev) return null;
      const current = (prev.description || '').trim();
      if (!current) {
        return { ...prev, description: chip };
      }
      if (current.includes(chip)) return prev;
      return { ...prev, description: `${current}، ${chip}` };
    });
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
      triggerServerDbSync(50);
    }
  };

  const toggleItemActive = async (item: MenuItem) => {
    if (item.id) {
      await db.menuItems.update(item.id, { isActive: !item.isActive });
      triggerServerDbSync(50);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden font-sans bg-[#F5F5F7]" dir="rtl">
      
      {/* Categories Sidebar (macOS Inset Sidebar on Desktop, Full View on Mobile when mobileTab === 'categories') */}
      <div className={`w-full md:w-72 lg:w-80 bg-white/90 backdrop-blur-xl border-l border-black/[0.06] flex-col shrink-0 ${mobileTab === 'categories' ? 'flex' : 'hidden md:flex'}`}>
        <div className="p-4 px-5 border-b border-black/[0.06] flex justify-between items-center bg-white/80 sticky top-0 z-10">
          <div>
            <h2 className="text-base font-bold text-neutral-900 tracking-tight">دسته‌بندی‌های منو</h2>
            <p className="text-[11px] text-neutral-500 font-normal">{categories?.length || 0} گروه ثبت‌شده</p>
          </div>
          {can('menu_edit') && (
            <button 
              onClick={() => setEditingCategory({ name: '' })}
              className="px-3 py-1.5 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm text-xs font-semibold"
              title="افزودن گروه منو"
            >
              <Plus size={16} />
              <span>گروه جدید</span>
            </button>
          )}
        </div>

        {/* Mobile helper banner */}
        <div className="p-2.5 px-4 bg-blue-50/80 border-b border-blue-100/60 md:hidden flex items-center justify-between text-xs text-[#007AFF]">
          <span className="font-medium">برای مشاهده و جابجایی محصولات، روی هر دسته ضربه بزنید</span>
          <ArrowRight size={14} className="rotate-180" />
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-none">
          {categories?.map((cat, catIdx) => {
            const isSelected = selectedCategoryId === cat.id;
            const catItemCount = itemsCountPerCategory.get(cat.id!) || 0;
            return (
              <div 
                key={cat.id}
                className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-150 active:scale-[0.99] border ${
                  isSelected 
                    ? 'bg-[#007AFF] text-white border-[#007AFF] shadow-[0_4px_16px_rgba(0,122,255,0.25)] font-semibold' 
                    : 'bg-white text-neutral-800 hover:bg-black/[0.02] border-black/[0.06] font-medium'
                }`}
                onClick={() => {
                  setSelectedCategoryId(cat.id!);
                  setMobileTab('items');
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-black/[0.04] text-neutral-500'}`}>
                    #{catIdx + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-bold truncate block">{cat.name}</span>
                    <span className={`text-[10px] block mt-0.5 ${isSelected ? 'text-white/80' : 'text-neutral-400'}`}>
                      {catItemCount} محصول در این گروه
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {can('menu_edit') && (
                    <>
                      <button 
                        type="button"
                        onClick={(e) => handleMoveCategoryStep(cat, -1, e)}
                        disabled={catIdx === 0}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-20 cursor-pointer ${isSelected ? 'text-white/80 hover:text-white hover:bg-white/20' : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/[0.05]'}`}
                        title="انتقال به بالاتر"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => handleMoveCategoryStep(cat, 1, e)}
                        disabled={catIdx === (categories.length - 1)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-20 cursor-pointer ${isSelected ? 'text-white/80 hover:text-white hover:bg-white/20' : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/[0.05]'}`}
                        title="انتقال به پایین‌تر"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all ${isSelected ? 'text-white/80 hover:text-white hover:bg-white/20' : 'text-neutral-500 hover:text-[#007AFF] hover:bg-black/[0.05]'}`}
                        title="ویرایش نام گروه"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id!); }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all ${isSelected ? 'text-white/80 hover:text-white hover:bg-white/20' : 'text-neutral-500 hover:text-[#FF3B30] hover:bg-black/[0.05]'}`}
                        title="حذف گروه"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                  {/* Chevron for mobile to clearly indicate tapping opens products */}
                  <div 
                    onClick={() => {
                      setSelectedCategoryId(cat.id!);
                      setMobileTab('items');
                    }}
                    className={`p-1.5 rounded-lg flex md:hidden items-center justify-center ${isSelected ? 'text-white bg-white/20' : 'text-[#007AFF] bg-[#007AFF]/10'}`}
                  >
                    <ChevronLeft size={16} />
                  </div>
                </div>
              </div>
            );
          })}
          {categories?.length === 0 && (
            <div className="text-center py-12 px-4">
              <p className="text-xs text-neutral-400 mb-3">هیچ گروهی ثبت نشده است.</p>
              {can('menu_edit') && (
                <button
                  onClick={() => setEditingCategory({ name: '' })}
                  className="px-4 py-2 bg-[#007AFF] text-white text-xs font-semibold rounded-xl"
                >
                  افزودن اولین دسته‌بندی
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Items Area (Full width on mobile when mobileTab === 'items', or beside sidebar on Desktop) */}
      <div className={`flex-1 flex-col bg-[#F5F5F7] overflow-hidden ${mobileTab === 'items' ? 'flex' : 'hidden md:flex'}`}>
        {selectedCategoryId ? (
          <>
            {/* Desktop Header */}
            <div className="hidden md:flex p-4 px-6 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 tracking-tight">
                  {categories?.find(c => c.id === selectedCategoryId)?.name}
                </h2>
                <p className="text-xs text-neutral-500 font-mono">{activeItems.length} آیتم در این گروه (جهت چیدمان و اولویت از دکمه‌های فلش یا جابجایی استفاده کنید)</p>
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

            {/* Mobile Top Navigation & Back Button */}
            <div className="flex md:hidden items-center justify-between p-3 px-4 bg-white border-b border-black/[0.06] shrink-0 sticky top-0 z-20 shadow-2xs">
              <button
                type="button"
                onClick={() => setMobileTab('categories')}
                className="flex items-center gap-1 text-[#007AFF] hover:bg-[#007AFF]/10 active:scale-95 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <ChevronRight size={18} />
                <span>همه گروه‌ها</span>
              </button>
              <div className="text-center truncate px-2">
                <div className="text-xs font-bold text-neutral-900 truncate">
                  {categories?.find(c => c.id === selectedCategoryId)?.name}
                </div>
                <div className="text-[10px] text-neutral-500 font-mono">
                  {activeItems.length} محصول
                </div>
              </div>
              {can('menu_edit') && (
                <button 
                  onClick={() => setEditingItem({ categoryId: selectedCategoryId, name: '', price: 0, isActive: true })}
                  className="w-8 h-8 rounded-xl bg-[#007AFF] text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm"
                  title="افزودن غذای جدید"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>

            {/* Mobile Category Switcher Carousel */}
            <div className="flex md:hidden items-center gap-1.5 p-2 px-3 bg-white/80 border-b border-black/[0.04] overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-300 scrollbar-track-transparent touch-pan-x shrink-0">
              {categories?.map(cat => {
                const isCur = cat.id === selectedCategoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id!)}
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                      isCur 
                        ? 'bg-[#007AFF] text-white shadow-xs' 
                        : 'bg-black/[0.04] text-neutral-700 hover:bg-black/[0.08]'
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span className={`text-[9px] font-mono px-1 rounded-full ${isCur ? 'bg-white/20 text-white' : 'bg-black/[0.05] text-neutral-500'}`}>
                      {itemsCountPerCategory.get(cat.id!) || 0}
                    </span>
                  </button>
                );
              })}
            </div>
            
            {/* Grid of Items */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 md:p-6 scrollbar-none">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
                {activeItems.map((item, idx) => {
                  const isDraggingThis = draggedItemId === item.id;
                  const isDragOverThis = dragOverItemId === item.id;
                  return (
                    <div 
                      key={item.id} 
                      draggable={can('menu_edit')}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', String(item.id));
                        setDraggedItemId(item.id!);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDragEnter={() => {
                        if (draggedItemId && draggedItemId !== item.id) {
                          setDragOverItemId(item.id!);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverItemId === item.id) setDragOverItemId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleItemDrop(item.id!);
                      }}
                      className={`bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border p-4 flex flex-col justify-between hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-200 relative group ${
                        isDragOverThis 
                          ? 'border-[#007AFF] ring-2 ring-[#007AFF]/30 bg-blue-50/30 scale-[1.01]' 
                          : isDraggingThis
                          ? 'opacity-40 border-dashed border-neutral-300'
                          : 'border-black/[0.06]'
                      }`}
                    >
                      <div>
                        {/* Header with Drag Handle, Position Badge and Reorder Up/Down */}
                        <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-black/[0.04]">
                          <div className="flex items-center gap-1.5">
                            {can('menu_edit') && (
                              <span 
                                className="p-1 text-neutral-400 hover:text-neutral-700 cursor-grab active:cursor-grabbing rounded-lg hover:bg-black/[0.04] transition-colors"
                                title="درگ کنید تا کالا جابجا شود"
                              >
                                <GripVertical size={16} />
                              </span>
                            )}
                            <span className="text-[11px] font-bold font-mono text-neutral-500 bg-black/[0.04] px-2 py-0.5 rounded-lg border border-black/[0.04]">
                              #{idx + 1}
                            </span>
                            
                            {/* Explicit Prominent Reorder Up & Down buttons in header */}
                            {can('menu_edit') && (
                              <div className="flex items-center gap-0.5 bg-neutral-100 p-0.5 rounded-xl border border-black/[0.04]">
                                <button
                                  type="button"
                                  onClick={(e) => handleMoveItemStep(item, -1, e)}
                                  disabled={idx === 0}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-600 hover:text-black hover:bg-white disabled:opacity-20 disabled:pointer-events-none transition-all active:scale-90 cursor-pointer shadow-2xs"
                                  title="انتقال یک پله بالاتر (جلوتر در منو)"
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleMoveItemStep(item, 1, e)}
                                  disabled={idx === activeItems.length - 1}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-600 hover:text-black hover:bg-white disabled:opacity-20 disabled:pointer-events-none transition-all active:scale-90 cursor-pointer shadow-2xs"
                                  title="انتقال یک پله پایین‌تر (عقب‌تر در منو)"
                                >
                                  <ArrowDown size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {can('menu_edit') && idx > 0 && (
                              <button
                                type="button"
                                onClick={(e) => handleMoveItemToTop(item, e)}
                                className="text-[10px] font-semibold text-[#007AFF] hover:bg-[#007AFF]/10 px-2 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                                title="انتقال به اول منو"
                              >
                                <ArrowUpToLine size={13} />
                                <span>به اول</span>
                              </button>
                            )}

                            {can('menu_edit') ? (
                              <button 
                                type="button"
                                onClick={() => toggleItemActive(item)} 
                                className="cursor-pointer active:scale-90 transition-all p-1"
                                title={item.isActive ? 'موجود' : 'ناموجود'}
                              >
                                {item.isActive ? (
                                  <CheckCircle2 className="text-[#34C759]" size={20} />
                                ) : (
                                  <Circle className="text-neutral-300" size={20} />
                                )}
                              </button>
                            ) : (
                              <span className="p-1">
                                {item.isActive ? (
                                  <CheckCircle2 className="text-[#34C759]" size={20} />
                                ) : (
                                  <Circle className="text-neutral-300" size={20} />
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {item.image ? (
                          <div className="w-full h-32 sm:h-36 rounded-2xl overflow-hidden mb-3 bg-neutral-100">
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-full h-20 sm:h-24 rounded-2xl overflow-hidden mb-3 bg-neutral-100/70 border border-black/[0.04] flex items-center justify-center text-neutral-300">
                            <ImageIcon size={26} />
                          </div>
                        )}
                        
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h3 className="font-bold text-sm text-neutral-900 leading-snug">{item.name}</h3>
                        </div>
                        <p className="text-[#007AFF] font-bold text-base font-mono">{formatCurrency(item.price)}</p>
                        {(() => {
                          const rec = recipes.find(r => r.menuItemId === item.id);
                          const ing = getMenuItemIngredients(item, rec);
                          return ing ? (
                            <p className="text-[11px] text-neutral-500 line-clamp-2 mt-1.5 leading-relaxed bg-black/[0.02] p-1.5 rounded-lg border border-black/[0.04]">
                              <span className="text-neutral-400 font-medium">ترکیبات: </span>
                              {ing}
                            </p>
                          ) : null;
                        })()}
                      </div>
                      
                      {can('menu_edit') && (
                        <div className="flex justify-between items-center mt-3.5 pt-3 border-t border-black/[0.04]">
                          {/* Reorder Buttons at bottom */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleMoveItemStep(item, -1, e)}
                              disabled={idx === 0}
                              className="px-2 py-1 text-xs text-neutral-600 hover:text-black hover:bg-black/[0.05] disabled:opacity-25 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-medium"
                              title="بالاتر"
                            >
                              <ArrowUp size={13} />
                              <span className="text-[10px]">بالاتر</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleMoveItemStep(item, 1, e)}
                              disabled={idx === activeItems.length - 1}
                              className="px-2 py-1 text-xs text-neutral-600 hover:text-black hover:bg-black/[0.05] disabled:opacity-25 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-medium"
                              title="پایین‌تر"
                            >
                              <ArrowDown size={13} />
                              <span className="text-[10px]">پایین‌تر</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button 
                              type="button"
                              onClick={() => setEditingItem(item)}
                              className="p-1.5 text-neutral-500 hover:bg-[#007AFF]/10 hover:text-[#007AFF] rounded-xl transition-all cursor-pointer active:scale-90"
                              title="ویرایش غذا"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleDeleteItem(item.id!)}
                              className="p-1.5 text-neutral-500 hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] rounded-xl transition-all cursor-pointer active:scale-90"
                              title="حذف غذا"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {activeItems.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-neutral-400">
                    <div className="w-16 h-16 rounded-3xl bg-black/[0.03] flex items-center justify-center mb-3 text-neutral-300">
                      <UtensilsCrossed size={32} />
                    </div>
                    <p className="text-sm font-medium text-neutral-600 mb-3">هنوز هیچ محصولی در این گروه ثبت نشده است.</p>
                    {can('menu_edit') && (
                      <button 
                        onClick={() => setEditingItem({ categoryId: selectedCategoryId, name: '', price: 0, isActive: true })}
                        className="px-4 py-2 bg-[#007AFF] text-white text-xs font-semibold rounded-xl active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
                      >
                        <Plus size={15} />
                        <span>افزودن اولین محصول</span>
                      </button>
                    )}
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
            <p className="text-sm font-semibold text-neutral-600 mb-2">برای مدیریت غذاها، ابتدا یک گروه را انتخاب کنید.</p>
            <button
              onClick={() => setMobileTab('categories')}
              className="md:hidden px-4 py-2 bg-[#007AFF] text-white text-xs font-semibold rounded-xl mt-2"
            >
              مشاهده دسته‌بندی‌ها
            </button>
          </div>
        )}
      </div>

      {/* Category Modal (Apple Sheet) */}
      {editingCategory !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in">
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
        <div 
          className="fixed inset-0 bg-black/45 backdrop-blur-md flex items-center justify-center z-[100] p-3 sm:p-4 animate-in fade-in select-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (!editingItem.description?.trim() || window.confirm('تغییرات ذخیره نشده است. آیا می‌خواهید پنجره بسته شود؟')) {
                setEditingItem(null);
                setItemError(null);
              }
            }
          }}
        >
          <div 
            className="bg-white/95 backdrop-blur-2xl w-full max-w-lg rounded-3xl shadow-2xl border border-black/[0.08] max-h-[88dvh] sm:max-h-[90dvh] overflow-hidden relative flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed Modal Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-black/[0.06] shrink-0 bg-white/95">
              <h3 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight">
                {editingItem.id ? 'ویرایش اطلاعات و ترکیبات غذا' : 'افزودن غذای جدید به منو'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setItemError(null);
                }}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-black/[0.05] rounded-xl transition-all cursor-pointer active:scale-90"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
                {itemError && (
                  <div className="p-3 bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-[#FF3B30] rounded-2xl text-xs flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{itemError}</span>
                  </div>
                )}

                {/* Category selector inside modal so item is never orphaned */}
                {categories && categories.length > 1 && (
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1.5">گروه منو</label>
                    <select
                      value={editingItem.categoryId || selectedCategoryId || categories[0]?.id}
                      onChange={e => setEditingItem({ ...editingItem, categoryId: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:border-[#007AFF] focus:bg-white outline-none text-xs text-neutral-900 transition-all font-medium"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Food Name (Without autoFocus to prevent cursor jumping from textarea) */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">نام غذا یا نوشیدنی *</label>
                  <input 
                    type="text"
                    value={editingItem.name || ''}
                    onChange={e => {
                      setEditingItem({ ...editingItem, name: e.target.value });
                      if (itemError) setItemError(null);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-xs text-neutral-900 transition-all"
                    placeholder="مثال: پیتزا مخصوص سرآشپز"
                    required
                  />
                </div>

                {/* Price */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-neutral-700">قیمت فروش (تومان) *</label>
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
                    value={editingItem.price !== undefined ? editingItem.price : ''}
                    onChange={e => {
                      setEditingItem({ ...editingItem, price: e.target.value === '' ? ('' as any) : Number(e.target.value) });
                      if (itemError) setItemError(null);
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-mono font-bold outline-none transition-all ${
                      editingItem.id && !can('menu_price_change')
                        ? 'bg-neutral-100 border-black/[0.06] text-neutral-400 cursor-not-allowed'
                        : 'bg-black/[0.03] border-black/[0.08] focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20'
                    }`}
                    placeholder="0"
                    dir="ltr"
                  />
                </div>

                {/* Ingredients / Description Textarea with Quick-insert Chips */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
                      <span>ترکیبات و مواد تشکیل‌دهنده (جهت نمایش به مشتری)</span>
                      <span className="text-[10px] text-[#007AFF] font-bold bg-[#007AFF]/10 px-2 py-0.5 rounded-full">ویژه مشتری</span>
                    </label>
                    <span className="text-[10px] text-neutral-400 font-normal">اختیاری</span>
                  </div>
                  <textarea 
                    rows={3}
                    value={editingItem.description || ''}
                    onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-xs text-neutral-900 transition-all resize-none leading-relaxed"
                    placeholder="مثال: پنیر موزارلا، قارچ تازه، فیله گوشت، فلفل دلمه‌ای، زیتون سیاه، سس مخصوص"
                  />

                  {/* Quick-insert Ingredient Chips */}
                  <div className="mt-2">
                    <span className="text-[10px] font-semibold text-neutral-400 block mb-1.5 flex items-center gap-1">
                      <Sparkles size={11} className="text-[#007AFF]" />
                      <span>افزودن سریع مواد متداول با یک کلیک:</span>
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-black/[0.02] rounded-xl border border-black/[0.04]">
                      {COMMON_INGREDIENT_CHIPS.map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleAppendIngredient(chip)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-[#007AFF]/10 hover:text-[#007AFF] hover:border-[#007AFF]/30 border border-black/[0.06] text-neutral-700 text-[10px] font-medium transition-all cursor-pointer active:scale-95 shadow-2xs"
                        >
                          + {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  <span className="text-[10px] text-neutral-400 mt-1.5 block leading-relaxed">
                    این مواد در منوی آنلاین مشتری و صندوق، زیر عنوان غذا نمایش داده می‌شوند (در صورت ثبت فرمول در انبار، خودکار خوانده می‌شود).
                  </span>
                </div>

                {/* Image Selection */}
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
                        onChange={e => setEditingItem({ ...editingItem, image: e.target.value })}
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
              </div>

              {/* Sticky Pinned Action Buttons Footer */}
              <div className="shrink-0 flex justify-end gap-2.5 px-5 sm:px-6 py-3.5 border-t border-black/[0.06] bg-white/95 backdrop-blur-md">
                <button 
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setItemError(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-neutral-600 text-xs font-semibold hover:bg-black/[0.05] active:scale-95 transition-all cursor-pointer"
                >
                  انصراف
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0062cc] text-white text-xs font-semibold active:scale-95 transition-all shadow-[0_2px_8px_rgba(0,122,255,0.25)] cursor-pointer flex items-center gap-1.5"
                >
                  <span>ذخیره آیتم</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
