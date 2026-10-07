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
    } catch (err) {
      console.error(err);
      setFormError('خطا در ذخیره اطلاعات کاربر.');
    }
  };

  const handleDelete = async (user: User) => {
    if (!user.id) return;

    if (user.id === currentUser?.id) {
      alert('نمی‌توانید حساب کاربری جاری خود را حذف کنید!');
      return;
    }

    const adminCount = users.filter(u => u.role === 'admin' && u.isActive).length;
    if (user.role === 'admin' && adminCount <= 1) {
      alert('حداقل یک مدیر فعال باید در سیستم باقی بماند.');
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
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Banner */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">مدیریت کاربران و سطوح دسترسی</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                تعریف پرسنل، نام کاربری، کلمه عبور و تعیین نقش و محدوده‌های دسترسی نرم‌افزار
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="py-3 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <UserPlus size={18} />
            <span>تعریف کاربر جدید</span>
          </button>
        </div>

        {/* Roles Guide Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-indigo-600" />
              <h3 className="font-bold text-xs text-slate-800">مدیر کل (Admin)</h3>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              دسترسی نامحدود به تمام بخش‌ها اعم از فروشگاه، منو، حسابداری، گزارش سود، کاربران و تنظیمات.
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-emerald-600" />
              <h3 className="font-bold text-xs text-slate-800">حسابدار (Accountant)</h3>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              دسترسی به بخش حسابداری، ثبت خرید و هزینه، پرسنل و حقوق، گزارش‌های مالی و اشخاص.
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-blue-600" />
              <h3 className="font-bold text-xs text-slate-800">صندوق‌دار (Cashier)</h3>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              دسترسی اختصاصی به میز فروش (POS)، ثبت سفارش، چاپ فاکتور و مشتریان (بدون دسترسی به سود و تنظیمات).
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-amber-600" />
              <h3 className="font-bold text-xs text-slate-800">انبار و تدارکات (Stock)</h3>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              دسترسی به مدیریت اقلام منو و ثبت خرید مواد اولیه جهت ورود فاکتورهای تامین‌کنندگان.
            </p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-slate-600" />
              <h2 className="font-bold text-base text-slate-800">لیست کاربران سیستم</h2>
            </div>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold">
              {users.length} کاربر
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-bold border-b border-slate-100">
                <tr>
                  <th className="py-3.5 px-4">نام و نام خانوادگی</th>
                  <th className="py-3.5 px-4">نام کاربری</th>
                  <th className="py-3.5 px-4">سطح و نقش پایه</th>
                  <th className="py-3.5 px-4">مجوزها و دسترسی‌ها</th>
                  <th className="py-3.5 px-4">رمز عبور</th>
                  <th className="py-3.5 px-4">وضعیت</th>
                  <th className="py-3.5 px-4">تاریخ تعریف</th>
                  <th className="py-3.5 px-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => {
                  const isCurrent = currentUser?.id === u.id;
                  const effectivePerms = getUserEffectivePermissions(u as any);
                  const isCustom = Array.isArray(u.permissions) && u.permissions.length > 0;
                  const isSuperAdmin = u.role === 'admin';

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                          {(u.name || u.username || 'ک').charAt(0)}
                        </div>
                        <div>
                          <span>{u.name}</span>
                          {isCurrent && (
                            <span className="mr-2 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.2 rounded-md">
                              حساب جاری شما
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 font-bold text-xs" dir="ltr">
                        @{u.username}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${
                          u.role === 'admin'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : u.role === 'accountant'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : u.role === 'stock'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {ROLE_LABELS[u.role].split('(')[0]}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenPermissions(u)}
                            className={`py-1 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                              isSuperAdmin
                                ? 'bg-indigo-50/80 text-indigo-800 border-indigo-200'
                                : isCustom
                                ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300'
                            }`}
                            title="مشاهده و تغییر دقیق دسترسی‌های این کاربر"
                          >
                            <SlidersHorizontal size={13} className={isCustom ? 'text-amber-600' : 'text-slate-500'} />
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
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-xs" dir="ltr">
                        ••••••••
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                            u.isActive
                              ? 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                              : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                          }`}
                        >
                          {u.isActive ? (
                            <>
                              <CheckCircle2 size={14} />
                              <span>فعال</span>
                            </>
                          ) : (
                            <>
                              <XCircle size={14} />
                              <span>غیرفعال</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {u.createdAt ? format(new Date(u.createdAt), 'yyyy/MM/dd') : '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPermissions(u)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="سطح‌بندی و تفکیک دسترسی‌ها"
                          >
                            <Shield size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="ویرایش و تغییر رمز"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(u)}
                            disabled={isCurrent}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                            title="حذف کاربر"
                          >
                            <Trash2 size={16} />
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

        {/* Modal Add / Edit User */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    {editingUser?.id ? 'ویرایش کاربر سیستم' : 'تعریف کاربر جدید'}
                  </h2>
                  <p className="text-xs text-slate-500">مشخصات، نام کاربری و سطح دسترسی را وارد کنید.</p>
                </div>
              </div>

              {formError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نام و نام خانوادگی</label>
                  <input
                    type="text"
                    value={editingUser?.name || ''}
                    onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                    placeholder="مثال: علی رضایی"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">نام کاربری (لاتین)</label>
                    <input
                      type="text"
                      value={editingUser?.username || ''}
                      onChange={e => setEditingUser({ ...editingUser, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                      placeholder="مثال: cashier1"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono transition-all"
                      dir="ltr"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">کلمه عبور</label>
                    <input
                      type="text"
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      placeholder="حداقل ۴ کاراکتر"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono transition-all"
                      dir="ltr"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">سطح دسترسی و نقش در سیستم</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(['admin', 'cashier', 'accountant', 'stock'] as UserRole[]).map(r => {
                      const isSelected = editingUser?.role === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setEditingUser({ ...editingUser, role: r })}
                          className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20 font-bold'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="text-xs">{ROLE_LABELS[r].split('(')[0]}</div>
                            <div className="text-[10px] text-slate-500 font-normal">
                              {r === 'admin' ? 'دسترسی کامل' : r === 'cashier' ? 'میز فروش و سفارش' : r === 'accountant' ? 'حسابداری و سود' : 'انبار و مواد اولیه'}
                            </div>
                          </div>
                          {isSelected && <Check size={16} className="text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editingUser?.isActive ?? true}
                      onChange={e => setEditingUser({ ...editingUser, isActive: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-slate-700">حساب کاربری فعال باشد</span>
                  </label>

                  {editingUser?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetUser = users.find(u => u.id === editingUser.id);
                        if (targetUser) handleOpenPermissions(targetUser);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <SlidersHorizontal size={14} />
                      <span>تنظیم دقیق دسترسی‌ها (تفکیک‌شده)</span>
                    </button>
                  )}
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
                  >
                    <Save size={16} />
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
