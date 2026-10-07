import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, User } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lock, User as UserIcon, LogIn, ShieldCheck, KeyRound, AlertCircle } from 'lucide-react';

export default function LoginScreen() {
  const { login } = useAuth();
  const users = useLiveQuery(() => db.users.filter(u => u.isActive).toArray()) || [];
  
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const res = await login(username, password);
    if (!res.success) {
      setError(res.message || 'خطا در ورود به سیستم.');
      setIsSubmitting(false);
    }
  };

  const handleSelectUser = (u: User) => {
    setUsername(u.username);
    setPassword('');
    setError(null);
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-900 px-4 py-8 relative overflow-hidden select-none" dir="rtl">
      {/* Background Subtle Gradient & Glow */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 -left-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 sm:p-10 relative z-10">
        {/* Brand & Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-teal-500 p-1 shadow-lg shadow-blue-500/20 mb-4 flex items-center justify-center">
            <div className="w-full h-full bg-white rounded-xl flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-14 h-14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="logo-grad-login" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#0d9488" />
                  </linearGradient>
                </defs>
                <rect width="100" height="100" rx="20" fill="url(#logo-grad-login)" />
                <path d="M50 28 L68 68 H58 L50 48 L42 68 H32 L50 28 Z" fill="white" />
                <path d="M45 58 H55" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="50" cy="42" r="3" fill="#38bdf8" />
              </svg>
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-slate-800">سامانه مدیریت و فروش آرکا</h1>
          <p className="text-sm text-slate-500 mt-1.5 flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-teal-600" />
            ورود به سیستم و تعیین سطح دسترسی
          </p>
        </div>

        {/* Quick User Picker if multiple active users exist */}
        {users.length > 0 && (
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-500 mb-2">انتخاب سریع کاربر:</label>
            <div className="flex flex-wrap gap-2">
              {users.map(u => {
                const isSelected = username.toLowerCase() === u.username.toLowerCase();
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/30'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <UserIcon size={13} />
                    <span>{u.name}</span>
                    <span className={`text-[10px] px-1 py-0.5 rounded ${isSelected ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
                      {u.role === 'admin' ? 'مدیر' : u.role === 'accountant' ? 'حسابدار' : u.role === 'cashier' ? 'صندوق' : 'انبار'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2.5 animate-shake">
            <AlertCircle size={18} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">نام کاربری</label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="مثال: admin"
                className="w-full pl-4 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 text-sm transition-all"
                dir="ltr"
                required
              />
              <UserIcon size={18} className="absolute right-3.5 top-3.5 text-slate-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">کلمه عبور</label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="رمز عبور خود را وارد کنید"
                className="w-full pl-4 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 text-sm transition-all tracking-widest"
                dir="ltr"
                required
              />
              <KeyRound size={18} className="absolute right-3.5 top-3.5 text-slate-400" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-70"
          >
            <LogIn size={18} />
            <span>{isSubmitting ? 'در حال بررسی...' : 'ورود به حساب کاربری'}</span>
          </button>
        </form>

        {/* Helper Note for First Time / Admin */}
        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            نام کاربری پیش‌فرض مدیر: <span className="font-mono font-bold text-slate-600" dir="ltr">admin</span> و رمز عبور: <span className="font-mono font-bold text-slate-600" dir="ltr">1234</span>
            <br />
            (می‌توانید پس از ورود از بخش مدیریت کاربران اطلاعات را تغییر دهید)
          </p>
        </div>
      </div>
    </div>
  );
}
