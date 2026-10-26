import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, User } from '../../lib/db';
import { initialTwoWaySync, pushLocalDbToServer } from '../../lib/serverSync';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lock, User as UserIcon, LogIn, ShieldCheck, KeyRound, AlertCircle, UserPlus, RefreshCw } from 'lucide-react';

export default function LoginScreen() {
  const { login } = useAuth();
  const users = useLiveQuery(() => db.users.filter(u => u.isActive).toArray());
  const [isInitialSyncing, setIsInitialSyncing] = useState(true);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // First time setup state (when database is 100% raw clean with 0 users)
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    let mounted = true;
    initialTwoWaySync()
      .catch(() => {})
      .finally(() => {
        if (mounted) setIsInitialSyncing(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

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

  const handleCreateFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUsername.trim() || !newPassword.trim()) {
      setError('لطفاً نام، نام کاربری و کلمه عبور مدیر را وارد کنید.');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      await db.users.add({
        name: newName.trim(),
        username: newUsername.trim().toLowerCase(),
        password: newPassword.trim(),
        role: 'admin',
        isActive: true,
        createdAt: new Date()
      });

      await pushLocalDbToServer().catch(() => {});

      const res = await login(newUsername, newPassword);
      if (!res.success) {
        setError(res.message || 'خطا در ورود به سیستم.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setError(`خطا در ایجاد اولین کاربر: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  const isRawCleanFirstUser = !isInitialSyncing && users !== undefined && users.length === 0;

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[#F5F5F7] px-4 py-8 relative overflow-hidden select-none font-sans" dir="rtl">
      {/* Background Subtle Gradient & Glow */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-[#007AFF]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 -left-20 w-96 h-96 bg-[#5856D6]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-black/[0.08] p-8 sm:p-10 relative z-10 animate-in fade-in">
        {/* Brand & Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-18 h-18 rounded-3xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] p-1 shadow-[0_4px_16px_rgba(0,122,255,0.25)] mb-4 flex items-center justify-center">
            <div className="w-full h-full bg-white rounded-2xl flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-12 h-12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="logo-grad-login" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#007AFF" />
                    <stop offset="100%" stopColor="#5856D6" />
                  </linearGradient>
                </defs>
                <rect width="100" height="100" rx="20" fill="url(#logo-grad-login)" />
                <path d="M50 28 L68 68 H58 L50 48 L42 68 H32 L50 28 Z" fill="white" />
                <path d="M45 58 H55" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="50" cy="42" r="3" fill="#60a5fa" />
              </svg>
            </div>
          </div>
          
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">سامانه رستورانی آرکا</h1>
          <p className="text-xs text-neutral-500 font-normal mt-1 flex items-center gap-1.5 justify-center">
            <ShieldCheck size={14} className="text-[#34C759]" />
            {isRawCleanFirstUser ? 'حالت خام مطلق - ثبت اولین مدیر کل' : 'ورود ایمن به حساب کاربری و تعیین سطح دسترسی'}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-5 p-3 bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-[#FF3B30] rounded-2xl text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isRawCleanFirstUser ? (
          /* First Time Admin Onboarding Form (Raw State) */
          <form onSubmit={handleCreateFirstAdmin} className="space-y-3.5">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-800 mb-2 leading-relaxed">
              دیتابیس کاملاً خام و خالی است. لطفاً مشخصات اولین کاربر مدیر (Admin) را جهت راه‌اندازی اولیه سیستم وارد کنید:
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">نام و نام خانوادگی مدیر</label>
              <div className="relative">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="مثلا: مدیر ارشد"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-2xl border border-black/[0.08] bg-black/[0.03] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] outline-none text-neutral-900 text-xs transition-all"
                  required
                />
                <UserIcon size={16} className="absolute right-3.5 top-3 text-neutral-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">نام کاربری ورود</label>
              <div className="relative">
                <input
                  type="text"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="نام کاربری دلخواه (مثلاً: manager)"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-2xl border border-black/[0.08] bg-black/[0.03] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] outline-none text-neutral-900 text-xs font-mono transition-all"
                  dir="ltr"
                  required
                />
                <UserIcon size={16} className="absolute right-3.5 top-3 text-neutral-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">کلمه عبور</label>
              <div className="relative">
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="کلمه عبور دلخواه"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-2xl border border-black/[0.08] bg-black/[0.03] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] outline-none text-neutral-900 text-xs font-mono transition-all tracking-widest"
                  dir="ltr"
                  required
                />
                <KeyRound size={16} className="absolute right-3.5 top-3 text-neutral-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-2xl bg-[#007AFF] hover:bg-[#0062cc] text-white font-semibold text-xs shadow-[0_2px_10px_rgba(0,122,255,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer mt-3 disabled:opacity-60"
            >
              <UserPlus size={16} />
              <span>{isSubmitting ? 'در حال ثبت...' : 'ایجاد حساب مدیر و ورود به سامانه'}</span>
            </button>
          </form>
        ) : (
          /* Normal Login Form */
          <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">نام کاربری</label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="نام کاربری"
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-2xl border border-black/[0.08] bg-black/[0.03] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] outline-none text-neutral-900 text-xs font-mono transition-all"
                    dir="ltr"
                    required
                  />
                  <UserIcon size={16} className="absolute right-3.5 top-3 text-neutral-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">کلمه عبور</label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="کلمه عبور"
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-2xl border border-black/[0.08] bg-black/[0.03] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] outline-none text-neutral-900 text-xs font-mono transition-all tracking-widest"
                    dir="ltr"
                    required
                  />
                  <KeyRound size={16} className="absolute right-3.5 top-3 text-neutral-400" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-2xl bg-[#007AFF] hover:bg-[#0062cc] text-white font-semibold text-xs shadow-[0_2px_10px_rgba(0,122,255,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer mt-3 disabled:opacity-60"
              >
                <LogIn size={16} />
                <span>{isSubmitting ? 'در حال بررسی...' : 'ورود به حساب کاربری'}</span>
              </button>
            </form>
        )}
      </div>
    </div>
  );
}
