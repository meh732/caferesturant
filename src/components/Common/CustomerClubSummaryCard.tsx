import React from 'react';
import {
  User, Phone, Award, Wallet, MapPin, Hash, ShieldCheck,
  Receipt, Lock, Sparkles, Clock
} from 'lucide-react';
import { format as formatJalali } from 'date-fns-jalali';
import { NetworkOrder, Order } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { ResolvedOrderCustomer } from '../../lib/networkOrderGuard';

interface CustomerClubSummaryCardProps {
  customerInfo: ResolvedOrderCustomer;
  networkOrder?: NetworkOrder;
  finalOrder?: Order;
  alreadyInvoiced: boolean;
  invoiceNumber?: number;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wallet: 'کیف پول باشگاه',
  credit: 'نسیه / حساب مشتری',
  cash: 'نقدی',
  card: 'کارتخوان (POS)',
  cheque: 'چک',
  mixed: 'پرداخت ترکیبی',
  card_to_card: 'کارت به کارت',
  pos: 'کارتخوان (POS)',
  pay_at_pos: 'پرداخت در صندوق'
};

export default function CustomerClubSummaryCard({
  customerInfo,
  networkOrder,
  finalOrder,
  alreadyInvoiced,
  invoiceNumber
}: CustomerClubSummaryCardProps) {
  const paymentKey = finalOrder?.paymentMethod || networkOrder?.paymentMethod;
  const paymentLabel = paymentKey ? (PAYMENT_METHOD_LABELS[paymentKey] || 'پرداخت در صندوق') : '';
  const completedDate = finalOrder?.createdAt || networkOrder?.completedAt;
  const completedTimeStr = completedDate
    ? formatJalali(new Date(completedDate), 'yyyy/MM/dd HH:mm')
    : '';

  return (
    <div className="space-y-3" dir="rtl">
      {/* Finalized Invoice Lock Banner */}
      {alreadyInvoiced && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-900 font-black text-xs sm:text-sm">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Receipt size={15} />
              </div>
              <span>
                {invoiceNumber
                  ? `شماره فاکتور نهایی: #${invoiceNumber}`
                  : 'فاکتور نهایی ثبت و تسویه شده است'}
              </span>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
              <Lock size={11} />
              <span>قفل شده (عدم صدور مجدد)</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-emerald-800">
            {completedTimeStr && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock size={12} />
                <span>زمان ثبت فاکتور: {completedTimeStr}</span>
              </span>
            )}
            {paymentLabel && (
              <span className="font-bold">روش تسویه: {paymentLabel}</span>
            )}
          </div>

          <p className="text-[11px] text-emerald-700 bg-white/70 border border-emerald-200/80 rounded-xl px-2.5 py-1.5">
            این سفارش قبلاً در صندوق فاکتور شده است و برای جلوگیری از تولید سفارش تکراری، امکان صدور فاکتور مجدد برای آن غیرفعال است.
          </p>
        </div>
      )}

      {/* Customer & Loyalty Club Details Card */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-2.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/70">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <User size={14} className="text-blue-600" />
            <span>مشخصات مشتری و باشگاه مشتریان</span>
          </span>

          {customerInfo.isClubMember ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold">
              <ShieldCheck size={12} className="text-emerald-600" />
              <span>
                عضو باشگاه مشتریان
                {customerInfo.tierLabel ? ` • سطح ${customerInfo.tierLabel}` : ''}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-bold">
              {customerInfo.hasCustomer ? 'مشتری غیرعضو باشگاه' : 'سفارش بدون ثبت نام مشتری'}
            </span>
          )}
        </div>

        {customerInfo.hasCustomer ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {customerInfo.name && (
              <div className="bg-white rounded-xl border border-slate-200/70 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-slate-500">نام مشتری:</span>
                <span className="font-bold text-slate-900">{customerInfo.name}</span>
              </div>
            )}

            {customerInfo.phone && (
              <div className="bg-white rounded-xl border border-slate-200/70 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-slate-500 flex items-center gap-1">
                  <Phone size={12} className="text-blue-500" />
                  <span>موبایل:</span>
                </span>
                <span className="font-mono font-bold text-slate-900" dir="ltr">
                  {customerInfo.phone}
                </span>
              </div>
            )}

            {customerInfo.subscriptionCode && (
              <div className="bg-white rounded-xl border border-slate-200/70 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-slate-500 flex items-center gap-1">
                  <Hash size={12} className="text-amber-500" />
                  <span>کد اشتراک باشگاه:</span>
                </span>
                <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/80">
                  {customerInfo.subscriptionCode}
                </span>
              </div>
            )}

            {customerInfo.isClubMember && (
              <div className="bg-white rounded-xl border border-slate-200/70 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-slate-500 flex items-center gap-1">
                  <Wallet size={12} className="text-purple-600" />
                  <span>موجودی کیف پول:</span>
                </span>
                <span className="font-mono font-bold text-purple-700">
                  {formatCurrency(customerInfo.walletBalance)}
                </span>
              </div>
            )}

            {customerInfo.isClubMember && (customerInfo.loyaltyPoints > 0 || (customerInfo.cashbackPercent || 0) > 0) && (
              <div className="bg-white rounded-xl border border-slate-200/70 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-slate-500 flex items-center gap-1">
                  <Award size={12} className="text-indigo-600" />
                  <span>امتیاز / کش‌بک:</span>
                </span>
                <span className="font-mono font-bold text-indigo-700">
                  {customerInfo.loyaltyPoints.toLocaleString('fa-IR')} امتیاز
                  {customerInfo.cashbackPercent ? ` • ${customerInfo.cashbackPercent}% کش‌بک` : ''}
                </span>
              </div>
            )}

            {!alreadyInvoiced && paymentLabel && (
              <div className="bg-white rounded-xl border border-slate-200/70 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-slate-500 flex items-center gap-1">
                  <Sparkles size={12} className="text-blue-500" />
                  <span>روش پرداخت:</span>
                </span>
                <span className="font-bold text-blue-700">{paymentLabel}</span>
              </div>
            )}

            {customerInfo.address && (
              <div className="sm:col-span-2 bg-white rounded-xl border border-slate-200/70 px-3 py-2 flex items-start gap-2">
                <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-slate-500 ml-1">آدرس:</span>
                  <span className="font-semibold text-slate-800">{customerInfo.address}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px] text-slate-500 bg-white rounded-xl border border-slate-200/60 px-3 py-2">
            <span>اطلاعات مشتری برای این سفارش ثبت نشده است.</span>
            {!alreadyInvoiced && paymentLabel && (
              <span className="font-bold text-blue-700">{paymentLabel}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
