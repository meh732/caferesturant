import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  db, 
  RawMaterialCategory, 
  addRawMaterialCategory, 
  updateRawMaterialCategory, 
  deleteRawMaterialCategory, 
  reorderRawMaterialCategories,
  ensureDefaultRawMaterialCategories 
} from '../../lib/db';
import { 
  X, 
  Plus, 
  FolderPlus, 
  Edit2, 
  Trash2, 
  Check, 
  ArrowUp, 
  ArrowDown, 
  Layers, 
  RotateCcw, 
  AlertTriangle,
  Package
} from 'lucide-react';

interface RawMaterialCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCategory?: (categoryName: string) => void;
}

export default function RawMaterialCategoryModal({
  isOpen,
  onClose,
  onSelectCategory
}: RawMaterialCategoryModalProps) {
  const categories = useLiveQuery(
    () => db.rawMaterialCategories.toArray().then(cats => 
      cats.sort((a, b) => (a.order ?? a.id ?? 0) - (b.order ?? b.id ?? 0))
    ),
    []
  ) || [];

  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray(), []) || [];

  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Count items per category
  const itemCounts = rawMaterials.reduce<Record<string, number>>((acc, m) => {
    if (m.category) {
      acc[m.category] = (acc[m.category] || 0) + 1;
    }
    return acc;
  }, {});

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const trimmed = newCatName.trim();
    if (!trimmed) {
      setError('لطفا نام دسته‌بندی را وارد کنید.');
      return;
    }

    try {
      await addRawMaterialCategory(trimmed);
      setNewCatName('');
      setSuccessMsg(`دسته‌بندی «${trimmed}» با موفقیت افزوده شد.`);
      if (onSelectCategory) {
        onSelectCategory(trimmed);
      }
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'خطا در افزودن دسته‌بندی.');
    }
  };

  const handleStartEdit = (cat: RawMaterialCategory) => {
    setEditingId(cat.id!);
    setEditingName(cat.name);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (cat: RawMaterialCategory) => {
    if (!cat.id) return;
    setError(null);
    const trimmed = editingName.trim();
    if (!trimmed) {
      setError('نام دسته‌بندی نمی‌تواند خالی باشد.');
      return;
    }

    try {
      await updateRawMaterialCategory(cat.id, trimmed);
      setEditingId(null);
      setEditingName('');
      setSuccessMsg('دسته‌بندی و کالاهای مرتبط با موفقیت به‌روزرسانی شدند.');
      if (onSelectCategory) {
        onSelectCategory(trimmed);
      }
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'خطا در ویرایش دسته‌بندی.');
    }
  };

  const handleDelete = async (cat: RawMaterialCategory) => {
    if (!cat.id) return;
    setError(null);
    const count = itemCounts[cat.name] || 0;

    let confirmMsg = `آیا از حذف دسته‌بندی «${cat.name}» مطمئن هستید؟`;
    if (count > 0) {
      confirmMsg = `این دسته‌بندی شامل ${count} قلم کالا در انبار است.\nپس از حذف، این کالاها به دسته‌بندی «سایر اقلام مصرفی» منتقل می‌شوند تا اطلاعات انبار ناقص نشود.\n\nآیا تایید می‌کنید؟`;
    }

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      await deleteRawMaterialCategory(cat.id, 'سایر اقلام مصرفی');
      setSuccessMsg(`دسته‌بندی «${cat.name}» با موفقیت حذف گردید.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'خطا در حذف دسته‌بندی.');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const reordered = [...categories];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    await reorderRawMaterialCategories(reordered);
  };

  const handleRestoreDefaults = async () => {
    if (window.confirm('آیا مایل به بررسی و بازیابی دسته‌بندی‌های استاندارد پیش‌فرض مواد اولیه هستید؟ (دسته‌بندی‌های موجود حذف نخواهند شد)')) {
      await ensureDefaultRawMaterialCategories(false);
      setSuccessMsg('دسته‌بندی‌های استاندارد بررسی و تکمیل شدند.');
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 my-auto relative animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">مدیریت دسته‌بندی کالاهای انبار</h3>
              <p className="text-xs text-slate-400 mt-0.5">افزودن، ویرایش نام، چیدمان و حذف دسته‌بندی‌های مواد اولیه</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Add Category Form */}
        <form onSubmit={handleAdd} className="mb-5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
          <label className="block text-xs font-bold text-slate-700 mb-2">
            افزودن دسته‌بندی جدید به لیست
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="مثلا: نان و خمیر، زیتون و ترشیجات، سس و چاشنی..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 outline-none text-xs text-slate-800"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن</span>
            </button>
          </div>
        </form>

        {/* List of Categories */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2 px-1">
            <span>لیست دسته‌بندی‌ها ({categories.length})</span>
            <span className="text-[11px] font-normal text-slate-400">تعداد کالاها</span>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-0.5">
            {categories.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                دسته‌بندی تعریف نشده است.
              </div>
            ) : (
              categories.map((cat, index) => {
                const count = itemCounts[cat.name] || 0;
                const isEditing = editingId === cat.id;

                return (
                  <div
                    key={cat.id || cat.name}
                    className="p-2.5 rounded-xl border border-slate-200/80 bg-white hover:border-slate-300 transition-colors flex items-center justify-between gap-2"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-400 bg-amber-50/30 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveEdit(cat);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(cat)}
                          title="ذخیره تغییرات"
                          className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          title="انصراف"
                          className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs font-semibold text-slate-800 truncate" title={cat.name}>
                            {cat.name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                            <Package className="w-2.5 h-2.5 text-slate-400" />
                            {count} کالا
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Reorder Buttons */}
                          <button
                            type="button"
                            onClick={() => handleMove(index, 'up')}
                            disabled={index === 0}
                            title="انتقال به بالا"
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(index, 'down')}
                            disabled={index === categories.length - 1}
                            title="انتقال به پایین"
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(cat)}
                            title="ویرایش نام دسته"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDelete(cat)}
                            title="حذف دسته‌بندی"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="text-[11px] font-bold text-slate-500 hover:text-amber-600 flex items-center gap-1.5 hover:underline cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>بازیابی دسته‌های پیش‌فرض استاندارد</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            بستن پنجره
          </button>
        </div>

      </div>
    </div>
  );
}
