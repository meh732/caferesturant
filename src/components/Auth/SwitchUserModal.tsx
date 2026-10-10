import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, User } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, UserCheck, KeyRound, LogOut, ShieldCheck, AlertCircle } from 'lucide-react';

interface SwitchUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SwitchUserModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { currentUser, login, logout, getRoleLabel } = useAuth();
  const users = useLiveQuery(() => db.users.filter(u => u.isActive).toArray()) || [];

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      setError('لطفا کاربری که می‌خواهید به آن سوئیچ کنید را انتخاب نمایید.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await login(selectedUser.username, password);
    setLoading(false);

    if (res.success) {
      setPassword('');
      setSelectedUser(null);
      onClose();
    } else {
      setError(res.message || 'رمز عبور نادرست است.');
    }
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-md animate-in fade-in font-sans" dir="rtl">
      <div className="bg-white/95 backdrop-blur-2xl rounded-3xl max-w-md w-full p-6 shadow-2xl border border-black/[0.08] relative">
        <button
          onClick={onClose}
          className="absolute left-5 top-5 p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-black/[0.04] transition-all cursor-pointer active:scale-90"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center font-bold">
            <UserCheck size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900 tracking-tight">تغییر کاربر و قفل سیستم</h2>
            <p className="text-xs text-neutral-500 font-normal">
              کاربر فعال: <span className="font-semibold text-neutral-900">{currentUser?.name}</span> ({currentUser && getRoleLabel(currentUser.role)})
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-[#FF3B30] rounded-2xl text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSwitch} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-2">انتخاب کاربر مقصد:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5 scrollbar-none">
              {users.map(u => {
                const isCurrent = currentUser?.id === u.id;
                const isSelected = selectedUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      setError(null);
                    }}
                    className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-0.5 cursor-pointer active:scale-95 ${
                      isSelected
                        ? 'border-[#007AFF] bg-[#007AFF]/10 ring-2 ring-[#007AFF]/20'
                        : isCurrent
                        ? 'border-black/[0.04] bg-black/[0.02] text-neutral-500'
                        : 'border-black/[0.06] bg-black/[0.01] hover:border-black/[0.12] hover:bg-black/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-neutral-900">{u.name}</span>
                      {isCurrent && <span className="text-[9px] bg-black/[0.06] text-neutral-600 px-1.5 py-0.2 rounded-full font-bold">فعلی</span>}
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono" dir="ltr">@{u.username}</span>
                    <span className="text-[10px] text-[#007AFF] font-medium">{getRoleLabel(u.role).split('(')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedUser && (
            <div className="animate-in fade-in">
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                رمز عبور کاربر ({selectedUser.name})
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="رمز عبور را وارد کنید"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-2xl border border-black/[0.08] bg-black/[0.03] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] outline-none text-xs font-mono tracking-wider transition-all"
                  dir="ltr"
                  autoFocus
                  required
                />
                <KeyRound size={15} className="absolute right-3.5 top-3 text-neutral-400" />
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between gap-2.5 border-t border-black/[0.04]">
            <button
              type="button"
              onClick={handleLogout}
              className="py-2 px-3.5 rounded-xl text-[#FF3B30] hover:bg-[#FF3B30]/10 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <LogOut size={15} />
              <span>خروج کامل</span>
            </button>

            <button
              type="submit"
              disabled={loading || !selectedUser}
              className="py-2.5 px-5 rounded-2xl bg-[#007AFF] hover:bg-[#0062cc] disabled:bg-neutral-200 disabled:text-neutral-400 text-white font-semibold text-xs shadow-[0_2px_8px_rgba(0,122,255,0.25)] disabled:shadow-none transition-all cursor-pointer active:scale-95"
            >
              {loading ? 'در حال ورود...' : 'ورود به عنوان این کاربر'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
