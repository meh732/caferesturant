import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Order, Expense, SalaryPayment, Employee } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns-jalali';
import { 
  Calendar, TrendingUp, TrendingDown, Receipt, Users, ShoppingBag, 
  DollarSign, FileText, ArrowDownRight, ArrowUpRight, BarChart3, Building,
  CheckCircle2, Clock
} from 'lucide-react';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';
type ReportTab = 'sales' | 'expenses' | 'profit' | 'personnel';

export default function ReportsScreen() {
  const [reportTab, setReportTab] = useState<ReportTab>('sales');
  const [preset, setPreset] = useState<DatePreset>('this_month');
  
  const [customRange, setCustomRange] = useState<DateObject[]>([
    new DateObject({ calendar: persian }).subtract(30, "days"),
    new DateObject({ calendar: persian })
  ]);

  const orders = useLiveQuery(() => db.orders.toArray()) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const salaryPayments = useLiveQuery(() => db.salaryPayments.toArray()) || [];
  const employees = useLiveQuery(() => db.employees.toArray()) || [];

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case 'today':
        return { startDate: startOfDay(now), endDate: endOfDay(now) };
      case 'yesterday': {
        const yesterday = subDays(now, 1);
        return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday) };
      }
      case 'this_week':
        return { startDate: startOfWeek(now), endDate: endOfWeek(now) };
      case 'this_month':
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
      case 'custom':
        if (customRange.length === 2 && customRange[0] && customRange[1]) {
          return {
            startDate: startOfDay(customRange[0].toDate()),
            endDate: endOfDay(customRange[1].toDate())
          };
        }
        return { startDate: new Date(0), endDate: new Date() };
      default:
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
    }
  }, [preset, customRange]);

  // Filtered dataset for active interval
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (order.status !== 'paid') return false;
      return isWithinInterval(new Date(order.createdAt), { start: startDate, end: endDate });
    });
  }, [orders, startDate, endDate]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      return isWithinInterval(new Date(expense.date), { start: startDate, end: endDate });
    });
  }, [expenses, startDate, endDate]);

  const filteredSalaries = useMemo(() => {
    return salaryPayments.filter(payment => {
      return isWithinInterval(new Date(payment.paymentDate), { start: startDate, end: endDate });
    });
  }, [salaryPayments, startDate, endDate]);

  // Calculations
  const totalRevenue = useMemo(() => filteredOrders.reduce((sum, order) => sum + order.total, 0), [filteredOrders]);
  const totalOrders = filteredOrders.length;
  
  const rawMaterialsCost = useMemo(() => {
    return filteredExpenses.filter(e => e.type === 'material').reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const operatingExpenses = useMemo(() => {
    return filteredExpenses.filter(e => e.type === 'general_expense').reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const salariesTotal = useMemo(() => {
    return filteredSalaries.reduce((sum, s) => sum + s.totalPaid, 0);
  }, [filteredSalaries]);

  const totalAllExpenses = rawMaterialsCost + operatingExpenses + salariesTotal;
  const netProfit = totalRevenue - totalAllExpenses;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';

  // Item breakdown for sales
  const itemSales = useMemo(() => {
    const counts: Record<string, { qty: number, revenue: number }> = {};
    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        if (!counts[item.name]) {
          counts[item.name] = { qty: 0, revenue: 0 };
        }
        counts[item.name].qty += item.quantity;
        counts[item.name].revenue += (item.price * item.quantity);
      });
    });
    return Object.entries(counts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty);
  }, [filteredOrders]);

  // Expense categories breakdown
  const expenseCategories = useMemo(() => {
    const cats: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      cats[e.category] = (cats[e.category] || 0) + e.amount;
    });
    if (salariesTotal > 0) {
      cats['حقوق و دستمزد پرسنل'] = salariesTotal;
    }
    return Object.entries(cats)
      .map(([cat, amount]) => ({ cat, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses, salariesTotal]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header & Date Filters */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BarChart3 size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">گزارشات جامع مدیریت</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                گزارش تفکیکی فروش، هزینه‌ها، سود و زیان و عملکرد پرسنل و طرف‌حساب‌ها
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['today', 'yesterday', 'this_week', 'this_month', 'custom'] as DatePreset[]).map(p => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  preset === p
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p === 'today' ? 'امروز' :
                 p === 'yesterday' ? 'دیروز' :
                 p === 'this_week' ? 'این هفته' :
                 p === 'this_month' ? 'این ماه' : 'بازه انتخابی'}
              </button>
            ))}

            {preset === 'custom' && (
              <div className="w-56">
                <DatePicker
                  range
                  calendar={persian}
                  locale={persian_fa}
                  value={customRange}
                  onChange={(d: any) => setCustomRange(d)}
                  inputClass="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* Report Sub-Tabs */}
        <div className="flex overflow-x-auto p-1.5 bg-white rounded-2xl border border-slate-200 shadow-xs gap-1">
          <button
            onClick={() => setReportTab('sales')}
            className={`py-2.5 px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportTab === 'sales' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <TrendingUp size={16} />
            <span>گزارش فروش ({filteredOrders.length})</span>
          </button>

          <button
            onClick={() => setReportTab('expenses')}
            className={`py-2.5 px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportTab === 'expenses' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Receipt size={16} />
            <span>گزارش هزینه‌ها ({filteredExpenses.length})</span>
          </button>

          <button
            onClick={() => setReportTab('profit')}
            className={`py-2.5 px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportTab === 'profit' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <DollarSign size={16} />
            <span>گزارش سود و زیان (P&L)</span>
          </button>

          <button
            onClick={() => setReportTab('personnel')}
            className={`py-2.5 px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportTab === 'personnel' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users size={16} />
            <span>گزارش پرسنل و اشخاص</span>
          </button>
        </div>

        {/* ---------------- 1. SALES REPORT TAB ---------------- */}
        {reportTab === 'sales' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">مجموع درآمد فروش</p>
                  <h3 className="text-xl font-bold text-slate-800">{formatCurrency(totalRevenue)}</h3>
                </div>
              </div>
              
              <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Receipt size={24} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">تعداد فاکتورهای فروش</p>
                  <h3 className="text-xl font-bold text-slate-800">{totalOrders} فاکتور</h3>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Users size={24} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">میانگین هر فاکتور</p>
                  <h3 className="text-xl font-bold text-slate-800">
                    {totalOrders > 0 ? formatCurrency(Math.round(totalRevenue / totalOrders)) : '۰ تومان'}
                  </h3>
                </div>
              </div>
            </div>

            {/* Detailed Sales */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Selling Items */}
              <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden flex flex-col h-96">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-800">پرفروش‌ترین اقلام</h2>
                  <span className="text-[11px] text-slate-500">{itemSales.length} قلم کالا</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <table className="w-full text-right text-xs">
                    <thead className="text-slate-500 sticky top-0 bg-white">
                      <tr>
                        <th className="py-2.5 px-3 font-bold">نام آیتم</th>
                        <th className="py-2.5 px-3 font-bold">تعداد</th>
                        <th className="py-2.5 px-3 font-bold">درآمد حاصل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itemSales.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-800">{item.name}</td>
                          <td className="py-2.5 px-3 text-slate-600 font-bold">{item.qty} عدد</td>
                          <td className="py-2.5 px-3 text-blue-600 font-bold">{formatCurrency(item.revenue)}</td>
                        </tr>
                      ))}
                      {itemSales.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-slate-400">داده‌ای برای نمایش وجود ندارد.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Invoices list */}
              <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden flex flex-col h-96">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h2 className="text-sm font-bold text-slate-800">فاکتورهای اخیر فروش</h2>
                  <span className="text-[11px] text-slate-500">{filteredOrders.length} فاکتور</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <table className="w-full text-right text-xs">
                    <thead className="text-slate-500 sticky top-0 bg-white">
                      <tr>
                        <th className="py-2.5 px-3 font-bold">شماره</th>
                        <th className="py-2.5 px-3 font-bold">زمان</th>
                        <th className="py-2.5 px-3 font-bold">مشتری</th>
                        <th className="py-2.5 px-3 font-bold">مبلغ کل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...filteredOrders].reverse().map(order => (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-800">#{order.invoiceNumber}</td>
                          <td className="py-2.5 px-3 text-slate-500" dir="ltr">
                            {format(new Date(order.createdAt), 'yyyy/MM/dd HH:mm')}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {order.customerName || 'عمومی'}
                          </td>
                          <td className="py-2.5 px-3 text-blue-600 font-bold">{formatCurrency(order.total)}</td>
                        </tr>
                      ))}
                      {filteredOrders.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">فاکتوری در این بازه یافت نشد.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- 2. EXPENSES REPORT TAB ---------------- */}
        {reportTab === 'expenses' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs text-amber-700 font-medium">خرید مواد اولیه و مصرفی</span>
                <h3 className="text-xl font-bold text-amber-800 mt-1">{formatCurrency(rawMaterialsCost)}</h3>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {filteredExpenses.filter(e => e.type === 'material').length} ثبت خرید انبار
                </span>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs text-rose-700 font-medium">هزینه‌های جاری، قبوض و کرایه</span>
                <h3 className="text-xl font-bold text-rose-800 mt-1">{formatCurrency(operatingExpenses)}</h3>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {filteredExpenses.filter(e => e.type === 'general_expense').length} ثبت هزینه اداری
                </span>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs text-teal-700 font-medium">حقوق و دستمزد پرسنل</span>
                <h3 className="text-xl font-bold text-teal-800 mt-1">{formatCurrency(salariesTotal)}</h3>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {filteredSalaries.length} فیش پرداختی
                </span>
              </div>
            </div>

            {/* Expense Categories Breakdown */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-base text-slate-800 mb-4">تفکیک هزینه‌ها بر اساس دسته‌بندی</h3>
              <div className="space-y-3">
                {expenseCategories.map((c, i) => {
                  const pct = totalAllExpenses > 0 ? Math.round((c.amount / totalAllExpenses) * 100) : 0;
                  return (
                    <div key={i} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div className="flex-1 mr-4">
                        <div className="flex justify-between items-center mb-1 text-xs">
                          <span className="font-bold text-slate-800">{c.cat}</span>
                          <span className="font-bold text-slate-600">{pct}% ({formatCurrency(c.amount)})</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {expenseCategories.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">هزینه‌ای در این بازه ثبت نشده است.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- 3. PROFIT REPORT TAB ---------------- */}
        {reportTab === 'profit' && (
          <div className="space-y-6">
            <div className={`p-6 rounded-3xl border shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 ${
              netProfit >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl text-white flex items-center justify-center shadow-lg ${
                  netProfit >= 0 ? 'bg-emerald-600 shadow-emerald-500/20' : 'bg-rose-600 shadow-rose-500/20'
                }`}>
                  {netProfit >= 0 ? <TrendingUp size={28} /> : <TrendingDown size={28} />}
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500">سود خالص نهایی دوره:</span>
                  <h3 className="text-2xl font-black">{formatCurrency(netProfit)}</h3>
                  <span className="text-xs opacity-80">حاشیه سود: {profitMargin}% از درآمد</span>
                </div>
              </div>

              <div className="bg-white/80 p-3 rounded-2xl border border-slate-200 text-xs">
                <span>کل خروجی مالی: </span>
                <span className="font-bold text-rose-700">{formatCurrency(totalAllExpenses)}</span>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
              <h3 className="font-bold text-base text-slate-800 border-b pb-3">جریان درآمد و هزینه بازه انتخابی</h3>
              <div className="flex justify-between items-center text-sm py-2">
                <span className="text-blue-700 font-bold">+ درآمد حاصل از فروش:</span>
                <span className="font-bold text-blue-700">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2 text-amber-700">
                <span>- بهای مواد اولیه و ملزومات مصرفی:</span>
                <span className="font-bold">- {formatCurrency(rawMaterialsCost)}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2 text-teal-700">
                <span>- هزینه‌های حقوق پرسنل:</span>
                <span className="font-bold">- {formatCurrency(salariesTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2 text-rose-700">
                <span>- هزینه‌های جاری و قبوض:</span>
                <span className="font-bold">- {formatCurrency(operatingExpenses)}</span>
              </div>
              <div className="flex justify-between items-center text-base pt-3 border-t font-black">
                <span>= سود خالص قابل برداشت:</span>
                <span className={netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {formatCurrency(netProfit)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- 4. PERSONNEL & PARTIES TAB ---------------- */}
        {reportTab === 'personnel' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-base text-slate-800 mb-4 flex items-center gap-2">
                <Users size={18} className="text-teal-600" />
                <span>لیست پرسنل و وضعیت حقوق</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b">
                    <tr>
                      <th className="py-3 px-3">نام و نام خانوادگی</th>
                      <th className="py-3 px-3">سمت شغلی</th>
                      <th className="py-3 px-3">حقوق پایه</th>
                      <th className="py-3 px-3">شماره تماس</th>
                      <th className="py-3 px-3">وضعیت فعالیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map(e => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-bold text-slate-800">{e.name}</td>
                        <td className="py-3 px-3 text-slate-600">{e.roleTitle}</td>
                        <td className="py-3 px-3 text-teal-700 font-bold">{formatCurrency(e.baseSalary)}</td>
                        <td className="py-3 px-3 text-slate-500 font-mono" dir="ltr">{e.phone || '-'}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            e.isActive ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {e.isActive ? 'فعال' : 'غیرفعال'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {employees.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">پرسنلی ثبت نشده است.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
