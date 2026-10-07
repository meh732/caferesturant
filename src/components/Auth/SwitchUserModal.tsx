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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute left-5 top-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <UserCheck size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">تغییر کاربر و قفل سیستم</h2>
            <p className="text-xs text-slate-500">کاربر فعلی: <span className="font-bold text-blue-600">{currentUser?.name}</span> ({currentUser && getRoleLabel(currentUser.role)})</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSwitch} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">انتخاب کاربر مقصد:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
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
                    className={`p-3 rounded-xl border text-right transition-all flex flex-col gap-1 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20'
                        : isCurrent
                        ? 'border-slate-200 bg-slate-50 text-slate-500'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800">{u.name}</span>
                      {isCurrent && <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">فعلی</span>}
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono" dir="ltr">@{u.username}</span>
                    <span className="text-[10px] text-blue-600 font-medium">{getRoleLabel(u.role).split('(')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedUser && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                رمز عبور کاربر ({selectedUser.name})
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="رمز عبور را وارد کنید"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm tracking-wider"
                  dir="ltr"
                  autoFocus
                  required
                />
                <KeyRound size={16} className="absolute right-3.5 top-3 text-slate-400" />
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="py-2.5 px-4 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut size={16} />
              <span>خروج کامل</span>
            </button>

            <button
              type="submit"
              disabled={!selectedUser || loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck size={16} />
              <span>{loading ? 'در حال ورود...' : 'ورود با این کاربر'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
