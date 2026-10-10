import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, User, UserRole } from '../../lib/db';
import { useAuth, ROLE_LABELS } from '../../context/AuthContext';
import { 
  Users, UserPlus, Shield, KeyRound, CheckCircle2, XCircle, 
  Trash2, Edit2, AlertCircle, X, Save, Lock, Check, SlidersHorizontal,
  Layers, CheckSquare, Sparkles
} from 'lucide-react';
import { format } from 'date-fns-jalali';
import UserPermissionsModal from './UserPermissionsModal';
import { 
  getUserEffectivePermissions, 
  ALL_PERMISSION_KEYS, 
  ROLE_DEFAULT_PERMISSIONS,
  PermissionKey 
} from '../../lib/permissions';

export default function UsersScreen() {
  const { currentUser, refreshCurrentUser } = useAuth();
  const users = useLiveQuery(() => db.users.toArray()) || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Granular Permissions Modal state
  const [userForPermissionsModal, setUserForPermissionsModal] = useState<User | null>(null);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);

  const handleOpenAdd = () => {
    setEditingUser({
      name: '',
      username: '',
      role: 'cashier',
      isActive: true,
      permissions: undefined,
    });
    setPasswordInput('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setPasswordInput(user.password);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenPermissions = (user: User) => {
    setUserForPermissionsModal(user);
    setIsPermissionsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!editingUser?.name?.trim()) {
      setFormError('لطفا نام و نام خانوادگی کاربر را وارد کنید.');
      return;
    }

    const cleanUsername = (editingUser.username || '').trim().toLowerCase();
    if (!cleanUsername) {
      setFormError('لطفا نام کاربری را وارد کنید.');
      return;
    }

    if (!passwordInput.trim()) {
      setFormError('لطفا رمز عبور کاربر را وارد کنید.');
      return;
    }

    // Check username uniqueness
    const existing = await db.users.where('username').equalsIgnoreCase(cleanUsername).first();
    if (existing && existing.id !== editingUser.id) {
      setFormError('این نام کاربری قبلا ثبت شده است. نام کاربری دیگری انتخاب کنید.');
      return;
    }

    const userData: User = {
      name: editingUser.name.trim(),
      username: cleanUsername,
      password: passwordInput.trim(),
      role: (editingUser.role as UserRole) || 'cashier',
      isActive: editingUser.isActive ?? true,
      createdAt: editingUser.createdAt || new Date(),
      permissions: editingUser.permissions,
    };

    try {
      if (editingUser.id) {
        await db.users.put({ ...userData, id: editingUser.id });
      } else {
        await db.users.add(userData);
      }
      setIsModalOpen(false);
      setEditingUser(null);
      await refreshCurrentUser();
    } catch (err: any) {
      setFormError('خطا در ذخیره‌سازی اطلاعات: ' + (err?.message || 'نامشخص'));
    }
  };

  const handleDelete = async (user: User) => {
    if (!user.id) return;
    if (user.id === currentUser?.id) {
      alert('شما نمی‌توانید حساب کاربری فعال خودتان را حذف کنید!');
      return;
    }

    if (window.confirm(`آیا از حذف کاربر "${user.name}" مطمئن هستید؟`)) {
      await db.users.delete(user.id);
      await refreshCurrentUser();
    }
  };

  const handleToggleActive = async (user: User) => {
    if (!user.id) return;
    if (user.id === currentUser?.id) {
      alert('نمی‌توانید حساب کاربری فعال خود را غیرفعال کنید!');
      return;
    }

    await db.users.update(user.id, { isActive: !user.isActive });
    await refreshCurrentUser();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#F5F5F7] font-sans" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Banner (Apple Translucent Card) */}
        <div className="bg-white/85 backdrop-blur-xl p-5 sm:p-6 rounded-3xl border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center shadow-sm">
              <Shield size={26} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">مدیریت کاربران و سطوح دسترسی</h1>
              <p className="text-xs sm:text-sm text-neutral-500 font-normal mt-0.5">
                تعریف پرسنل، نام کاربری، کلمه عبور و تعیین نقش و محدوده‌های دسترسی نرم‌افزار
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="py-2.5 px-5 rounded-2xl bg-[#007AFF] hover:bg-[#0062cc] active:scale-[0.98] text-white text-xs font-semibold shadow-[0_2px_8px_rgba(0,122,255,0.25)] flex items-center gap-2 transition-all cursor-pointer"
          >
            <UserPlus size={16} />
            <span>تعریف کاربر جدید</span>
          </button>
        </div>

        {/* Roles Guide Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/90 backdrop-blur-xl p-4.5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#5856D6]" />
              <h3 className="font-bold text-xs text-neutral-900">مدیر کل (Admin)</h3>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed font-normal">
              دسترسی نامحدود به تمام بخش‌ها اعم از فروشگاه، منو، حسابداری، گزارش سود، کاربران و تنظیمات.
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl p-4.5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#34C759]" />
              <h3 className="font-bold text-xs text-neutral-900">حسابدار (Accountant)</h3>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed font-normal">
              دسترسی به بخش حسابداری، ثبت خرید و هزینه، پرسنل و حقوق، گزارش‌های مالی و اشخاص.
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl p-4.5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#007AFF]" />
              <h3 className="font-bold text-xs text-neutral-900">صندوق‌دار (Cashier)</h3>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed font-normal">
              دسترسی اختصاصی به میز فروش (POS)، ثبت سفارش، چاپ فاکتور و مشتریان (بدون دسترسی به سود و تنظیمات).
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl p-4.5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF9500]" />
              <h3 className="font-bold text-xs text-neutral-900">انبار و تدارکات (Stock)</h3>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed font-normal">
              دسترسی به مدیریت اقلام منو و ثبت خرید مواد اولیه جهت ورود فاکتورهای تامین‌کنندگان.
            </p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-black/[0.06] overflow-hidden">
          <div className="p-4 px-6 border-b border-black/[0.04] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-neutral-500" />
              <h2 className="font-bold text-sm text-neutral-900">لیست کاربران سیستم</h2>
            </div>
            <span className="text-xs bg-black/[0.04] text-neutral-600 px-3 py-1 rounded-full font-mono font-semibold">
              {users.length} کاربر
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-neutral-50/70 text-neutral-500 font-semibold border-b border-black/[0.04]">
                <tr>
                  <th className="py-3.5 px-5">نام و نام خانوادگی</th>
                  <th className="py-3.5 px-4">نام کاربری</th>
                  <th className="py-3.5 px-4">سطح و نقش پایه</th>
                  <th className="py-3.5 px-4">مجوزها و دسترسی‌ها</th>
                  <th className="py-3.5 px-4">رمز عبور</th>
                  <th className="py-3.5 px-4">وضعیت</th>
                  <th className="py-3.5 px-4">تاریخ تعریف</th>
                  <th className="py-3.5 px-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {users.map(u => {
                  const isCurrent = currentUser?.id === u.id;
                  const effectivePerms = getUserEffectivePermissions(u as any);
                  const isCustom = Array.isArray(u.permissions) && u.permissions.length > 0;
                  const isSuperAdmin = u.role === 'admin';

                  return (
                    <tr key={u.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-neutral-900 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white font-semibold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                          {(u.name || u.username || 'ک').charAt(0)}
                        </div>
                        <div>
                          <span>{u.name}</span>
                          {isCurrent && (
                            <span className="mr-2 text-[10px] bg-[#007AFF]/10 text-[#007AFF] px-2 py-0.5 rounded-full font-bold">
                              حساب جاری شما
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-neutral-600 font-bold text-xs" dir="ltr">
                        @{u.username}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          u.role === 'admin'
                            ? 'bg-[#5856D6]/10 text-[#5856D6]'
                            : u.role === 'accountant'
                            ? 'bg-[#34C759]/10 text-[#34C759]'
                            : u.role === 'stock'
                            ? 'bg-[#FF9500]/10 text-[#FF9500]'
                            : 'bg-[#007AFF]/10 text-[#007AFF]'
                        }`}>
                          {ROLE_LABELS[u.role].split('(')[0]}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenPermissions(u)}
                            className={`py-1 px-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border active:scale-95 ${
                              isSuperAdmin
                                ? 'bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/20'
                                : isCustom
                                ? 'bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/30 hover:bg-[#FF9500]/15'
                                : 'bg-black/[0.03] text-neutral-700 border-black/[0.06] hover:bg-[#007AFF]/10 hover:text-[#007AFF] hover:border-[#007AFF]/30'
                            }`}
                            title="مشاهده و تغییر دقیق دسترسی‌های این کاربر"
                          >
                            <SlidersHorizontal size={12} className={isCustom ? 'text-[#FF9500]' : 'text-neutral-400'} />
                            <span>
                              {isSuperAdmin
                                ? 'دسترسی کامل (۲۶)'
                                : isCustom
                                ? `سفارشی (${effectivePerms.length} از ۲۶)`
                                : `پیش‌فرض (${effectivePerms.length} از ۲۶)`}
                            </span>
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-neutral-400 text-xs" dir="ltr">
                        ••••••••
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
                            u.isActive
                              ? 'bg-[#34C759]/10 text-[#34C759] hover:bg-[#34C759]/20'
                              : 'bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/20'
                          }`}
                        >
                          {u.isActive ? (
                            <>
                              <CheckCircle2 size={12} />
                              <span>فعال</span>
                            </>
                          ) : (
                            <>
                              <XCircle size={12} />
                              <span>غیرفعال</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-neutral-500 font-mono">
                        {u.createdAt ? format(new Date(u.createdAt), 'yyyy/MM/dd') : '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenPermissions(u)}
                            className="p-1.5 text-neutral-400 hover:text-[#5856D6] hover:bg-[#5856D6]/10 rounded-xl transition-all cursor-pointer active:scale-90"
                            title="سطح‌بندی و تفکیک دسترسی‌ها"
                          >
                            <Shield size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 text-neutral-400 hover:text-[#007AFF] hover:bg-[#007AFF]/10 rounded-xl transition-all cursor-pointer active:scale-90"
                            title="ویرایش و تغییر رمز"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(u)}
                            disabled={isCurrent}
                            className="p-1.5 text-neutral-400 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-xl transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none active:scale-90"
                            title="حذف کاربر"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Add / Edit User (Apple Sheet) */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-md animate-in fade-in" dir="rtl">
            <div className="bg-white/95 backdrop-blur-2xl rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-black/[0.08] relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute left-6 top-6 p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-black/[0.04] transition-all cursor-pointer active:scale-90"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-11 h-11 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center">
                  <UserPlus size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-neutral-900 tracking-tight">
                    {editingUser?.id ? 'ویرایش کاربر سیستم' : 'تعریف کاربر جدید'}
                  </h2>
                  <p className="text-xs text-neutral-500 font-normal">مشخصات، نام کاربری و سطح دسترسی را وارد کنید.</p>
                </div>
              </div>

              {formError && (
                <div className="mb-4 p-3 bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-[#FF3B30] rounded-2xl text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">نام و نام خانوادگی</label>
                  <input
                    type="text"
                    value={editingUser?.name || ''}
                    onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                    placeholder="مثال: علی رضایی"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-xs text-neutral-900 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1.5">نام کاربری (لاتین)</label>
                    <input
                      type="text"
                      value={editingUser?.username || ''}
                      onChange={e => setEditingUser({ ...editingUser, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                      placeholder="cashier1"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-xs font-mono transition-all"
                      dir="ltr"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1.5">کلمه عبور</label>
                    <input
                      type="text"
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      placeholder="حداقل ۴ کاراکتر"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.08] focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 outline-none text-xs font-mono transition-all"
                      dir="ltr"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-2">سطح دسترسی و نقش در سیستم</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(['admin', 'cashier', 'accountant', 'stock'] as UserRole[]).map(r => {
                      const isSelected = editingUser?.role === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setEditingUser({ ...editingUser, role: r })}
                          className={`p-3 rounded-2xl border text-right transition-all flex items-center justify-between cursor-pointer active:scale-95 ${
                            isSelected
                              ? 'border-[#007AFF] bg-[#007AFF]/10 text-neutral-900 ring-2 ring-[#007AFF]/20 font-bold'
                              : 'border-black/[0.06] bg-black/[0.02] text-neutral-700 hover:bg-black/[0.04]'
                          }`}
                        >
                          <div>
                            <div className="text-xs">{ROLE_LABELS[r].split('(')[0]}</div>
                            <div className="text-[10px] text-neutral-500 font-normal">
                              {r === 'admin' ? 'دسترسی کامل' : r === 'cashier' ? 'میز فروش و سفارش' : r === 'accountant' ? 'حسابداری و سود' : 'انبار و مواد اولیه'}
                            </div>
                          </div>
                          {isSelected && <Check size={15} className="text-[#007AFF] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-black/[0.04]">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editingUser?.isActive ?? true}
                      onChange={e => setEditingUser({ ...editingUser, isActive: e.target.checked })}
                      className="w-4 h-4 rounded text-[#007AFF] focus:ring-[#007AFF]"
                    />
                    <span className="text-xs font-semibold text-neutral-800">حساب کاربری فعال باشد</span>
                  </label>

                  {editingUser?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetUser = users.find(u => u.id === editingUser.id);
                        if (targetUser) handleOpenPermissions(targetUser);
                      }}
                      className="text-xs text-[#007AFF] hover:text-[#0062cc] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <SlidersHorizontal size={13} />
                      <span>تنظیم دقیق دسترسی‌ها</span>
                    </button>
                  )}
                </div>

                <div className="pt-3.5 flex items-center justify-end gap-2.5 border-t border-black/[0.04]">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="py-2 px-4 rounded-xl text-neutral-600 hover:bg-black/[0.05] font-semibold text-xs transition-all cursor-pointer active:scale-95"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-5 rounded-2xl bg-[#007AFF] hover:bg-[#0062cc] text-white font-semibold text-xs shadow-[0_2px_8px_rgba(0,122,255,0.25)] flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  >
                    <Save size={15} />
                    <span>ذخیره اطلاعات کاربر</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Granular User Permissions Modal */}
        {userForPermissionsModal && (
          <UserPermissionsModal
            user={userForPermissionsModal}
            isOpen={isPermissionsModalOpen}
            onClose={() => {
              setIsPermissionsModalOpen(false);
              setUserForPermissionsModal(null);
            }}
            onSaved={async () => {
              await refreshCurrentUser();
            }}
          />
        )}

      </div>
    </div>
  );
}
