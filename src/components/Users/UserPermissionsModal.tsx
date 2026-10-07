import React, { useState } from 'react';
import { db, User } from '../../lib/db';
import { 
  PermissionKey, 
  PERMISSION_CATEGORIES, 
  PERMISSION_DEFINITIONS, 
  ROLE_DEFAULT_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  getUserEffectivePermissions,
  PermissionCategory
} from '../../lib/permissions';
import { 
  X, Shield, Check, RotateCcw, CheckSquare, Square, 
  Info, Sparkles, Save, AlertCircle, LayoutGrid, ShoppingBag, 
  Receipt, Building2, Utensils, Calculator, Settings, CheckCircle2 
} from 'lucide-react';

interface UserPermissionsModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function UserPermissionsModal({
  user,
  isOpen,
  onClose,
  onSaved,
}: UserPermissionsModalProps) {
  // If user already has permissions array, start with that; otherwise start with role defaults
  const initialPermissions = React.useMemo(() => {
    return getUserEffectivePermissions(user as any);
  }, [user]);

  const [selectedPermissions, setSelectedPermissions] = useState<PermissionKey[]>(initialPermissions);
  const [activeCategory, setActiveCategory] = useState<PermissionCategory | 'all'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state if user changes
  React.useEffect(() => {
    setSelectedPermissions(getUserEffectivePermissions(user as any));
    setSaveSuccess(false);
  }, [user]);

  if (!isOpen) return null;

  const isSuperAdmin = user.role === 'admin';

  const handleToggle = (key: PermissionKey) => {
    if (isSuperAdmin) return; // Super admin has full permissions always
    setSelectedPermissions(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleSelectAll = () => {
    if (isSuperAdmin) return;
    setSelectedPermissions([...ALL_PERMISSION_KEYS]);
  };

  const handleDeselectAll = () => {
    if (isSuperAdmin) return;
    setSelectedPermissions([]);
  };

  const handleResetToRoleDefault = () => {
    if (isSuperAdmin) return;
    const defaults = ROLE_DEFAULT_PERMISSIONS[user.role] || [];
    setSelectedPermissions([...defaults]);
  };

  const handleToggleCategory = (cat: PermissionCategory) => {
    if (isSuperAdmin) return;
    const catKeys = PERMISSION_DEFINITIONS.filter(p => p.category === cat).map(p => p.key);
    const allSelected = catKeys.every(k => selectedPermissions.includes(k));

    if (allSelected) {
      // Remove all in this category
      setSelectedPermissions(prev => prev.filter(k => !catKeys.includes(k)));
    } else {
      // Add missing in this category
      setSelectedPermissions(prev => Array.from(new Set([...prev, ...catKeys])));
    }
  };

  const handleSave = async () => {
    if (!user.id) return;
    setIsSaving(true);
    try {
      // Save custom permissions on user object
      await db.users.update(user.id, {
        permissions: selectedPermissions,
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setIsSaving(false);
        if (onSaved) onSaved();
        onClose();
      }, 700);
    } catch (err) {
      console.error('Error saving user permissions', err);
      alert('خطا در ذخیره دسترسی‌های کاربر');
      setIsSaving(false);
    }
  };

  // Category Icon helper
  const getCategoryIcon = (catId: PermissionCategory) => {
    switch (catId) {
      case 'nav': return <LayoutGrid size={18} className="text-blue-600" />;
      case 'pos': return <ShoppingBag size={18} className="text-emerald-600" />;
      case 'purchase': return <Receipt size={18} className="text-amber-600" />;
      case 'warehouse': return <Building2 size={18} className="text-teal-600" />;
      case 'recipe': return <Utensils size={18} className="text-indigo-600" />;
      case 'accounting': return <Calculator size={18} className="text-purple-600" />;
      case 'management': return <Settings size={18} className="text-slate-600" />;
    }
  };

  const filteredCategories = activeCategory === 'all' 
    ? PERMISSION_CATEGORIES 
    : PERMISSION_CATEGORIES.filter(c => c.id === activeCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs select-none" dir="rtl">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in">
        
        {/* Top Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
              <Shield size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">
                  سطح‌بندی و تنظیم دقیق دسترسی‌های کاربر
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  {user.name} (@{user.username})
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                تعیین دقیق مجوزهای مشاهده منوها، ثبت فاکتور خرید و فروش، ورود و خروج انبار، حواله، تعدیل، فرمول تولید و ویرایش‌ها
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Super admin notice */}
        {isSuperAdmin && (
          <div className="mx-6 mt-4 p-3.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl text-xs flex items-center gap-2.5">
            <Sparkles size={18} className="text-indigo-600 shrink-0" />
            <span>
              کاربر دارای نقش <strong>مدیر کل</strong> می‌باشد و به صورت پیش‌فرض به تمام امکانات، عملیات و منوهای سیستم دسترسی نامحدود دارد.
            </span>
          </div>
        )}

        {/* Action Toolbar */}
        {!isSuperAdmin && (
          <div className="px-6 py-3 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">اقدامات سریع:</span>
              <button
                type="button"
                onClick={handleSelectAll}
                className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CheckSquare size={14} className="text-blue-600" />
                <span>انتخاب همه ({ALL_PERMISSION_KEYS.length})</span>
              </button>

              <button
                type="button"
                onClick={handleResetToRoleDefault}
                className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={14} className="text-amber-600" />
                <span>بازنشانی به پیش‌فرض نقش ({ROLE_DEFAULT_PERMISSIONS[user.role]?.length || 0})</span>
              </button>

              <button
                type="button"
                onClick={handleDeselectAll}
                className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Square size={14} className="text-slate-400" />
                <span>لغو همه</span>
              </button>
            </div>

            {/* Active counter */}
            <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl border border-blue-200">
              <CheckCircle2 size={15} />
              <span>
                {selectedPermissions.length} از {ALL_PERMISSION_KEYS.length} مجوز فعال است
              </span>
            </div>
          </div>
        )}

        {/* Category Filter Chips */}
        <div className="px-6 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveCategory('all')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            همه بخش‌ها ({PERMISSION_DEFINITIONS.length})
          </button>
          {PERMISSION_CATEGORIES.map(cat => {
            const countInCat = PERMISSION_DEFINITIONS.filter(p => p.category === cat.id).length;
            const activeInCat = PERMISSION_DEFINITIONS.filter(p => p.category === cat.id && selectedPermissions.includes(p.key)).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === cat.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{cat.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeCategory === cat.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {activeInCat}/{countInCat}
                </span>
              </button>
            );
          })}
        </div>

        {/* Permissions List / Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {filteredCategories.map(cat => {
            const catPerms = PERMISSION_DEFINITIONS.filter(p => p.category === cat.id);
            const allSelectedInCat = catPerms.every(p => selectedPermissions.includes(p.key));
            const someSelectedInCat = catPerms.some(p => selectedPermissions.includes(p.key));

            return (
              <div key={cat.id} className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 sm:p-5 space-y-3">
                {/* Category Header with Select All toggle */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white rounded-xl shadow-xs border border-slate-100">
                      {getCategoryIcon(cat.id)}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-800">{cat.label}</h3>
                      <span className="text-[11px] text-slate-500">
                        {catPerms.filter(p => selectedPermissions.includes(p.key)).length} مورد از {catPerms.length} فعال
                      </span>
                    </div>
                  </div>

                  {!isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(cat.id)}
                      className="py-1 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer bg-white border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600"
                    >
                      {allSelectedInCat ? 'لغو انتخاب این بخش' : 'انتخاب کل این بخش'}
                    </button>
                  )}
                </div>

                {/* Permissions items inside category */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {catPerms.map(perm => {
                    const isChecked = isSuperAdmin || selectedPermissions.includes(perm.key);

                    return (
                      <div
                        key={perm.key}
                        onClick={() => handleToggle(perm.key)}
                        className={`p-3.5 rounded-xl border transition-all flex items-start gap-3 select-none ${
                          isSuperAdmin 
                            ? 'bg-white border-slate-200 opacity-90' 
                            : isChecked
                            ? 'bg-white border-blue-500 ring-2 ring-blue-500/10 shadow-xs cursor-pointer'
                            : 'bg-white/80 border-slate-200/80 hover:border-slate-300 hover:bg-white cursor-pointer'
                        }`}
                      >
                        <div className="pt-0.5 shrink-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isSuperAdmin}
                            onChange={() => handleToggle(perm.key)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer pointer-events-none"
                          />
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isChecked ? 'text-blue-950 font-black' : 'text-slate-700'}`}>
                              {perm.label}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 font-normal">
                              {perm.key}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            {perm.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {isSuperAdmin ? (
              <span>این کاربر دسترسی کامل مدیریتی دارد.</span>
            ) : (
              <span>تغییرات بلافاصله پس از ذخیره روی نشست کاری کاربر اعمال خواهد شد.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer"
            >
              انصراف
            </button>

            {!isSuperAdmin && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-300" />
                    <span>ذخیره شد!</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>ذخیره سطح دسترسی‌ها</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
