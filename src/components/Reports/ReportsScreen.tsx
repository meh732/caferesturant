import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { 
  format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, isWithinInterval 
} from 'date-fns-jalali';
import { 
  BarChart3, TrendingUp, Receipt, DollarSign, Users, Boxes, 
  Wallet, Building2, Calendar, Calculator
} from 'lucide-react';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

// Sub-components
import WarehouseInventoryReport from './WarehouseInventoryReport';
import SalesReport from './SalesReport';
import CashierDrawerReport from './CashierDrawerReport';
import ProfitLossReport from './ProfitLossReport';
import ExecutiveOverviewReport from './ExecutiveOverviewReport';
import PersonnelReport from './PersonnelReport';
import ProductCostReport from './ProductCostReport';

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';
type ReportTab = 'inventory' | 'sales' | 'cashier' | 'profit' | 'cogs' | 'executive' | 'personnel';

export default function ReportsScreen() {
  const [reportTab, setReportTab] = useState<ReportTab>('inventory');
  const [preset, setPreset] = useState<DatePreset>('this_month');
  
  const [customRange, setCustomRange] = useState<DateObject[]>([
    new DateObject({ calendar: persian }).subtract(30, "days"),
    new DateObject({ calendar: persian })
  ]);

  // Dexie Live Queries
  const orders = useLiveQuery(() => db.orders.toArray()) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const salaryPayments = useLiveQuery(() => db.salaryPayments.toArray()) || [];
  const employees = useLiveQuery(() => db.employees.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const warehouseStocks = useLiveQuery(() => db.warehouseStocks.toArray()) || [];

  // Date Interval Range Calculation
  const { startDate, endDate, dateRangeText } = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case 'today':
        return { 
          startDate: startOfDay(now), 
          endDate: endOfDay(now),
          dateRangeText: 'امروز'
        };
      case 'yesterday': {
        const yesterday = subDays(now, 1);
        return { 
          startDate: startOfDay(yesterday), 
          endDate: endOfDay(yesterday),
          dateRangeText: 'دیروز'
        };
      }
      case 'this_week':
        return { 
          startDate: startOfWeek(now), 
          endDate: endOfWeek(now),
          dateRangeText: 'این هفته'
        };
      case 'this_month':
        return { 
          startDate: startOfMonth(now), 
          endDate: endOfMonth(now),
          dateRangeText: 'این ماه'
        };
      case 'custom':
        if (customRange.length === 2 && customRange[0] && customRange[1]) {
          return {
            startDate: startOfDay(customRange[0].toDate()),
            endDate: endOfDay(customRange[1].toDate()),
            dateRangeText: `${customRange[0].format('YYYY/MM/DD')} الی ${customRange[1].format('YYYY/MM/DD')}`
          };
        }
        return { 
          startDate: new Date(0), 
          endDate: new Date(),
          dateRangeText: 'کل دوره'
        };
      default:
        return { 
          startDate: startOfMonth(now), 
          endDate: endOfMonth(now),
          dateRangeText: 'این ماه'
        };
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

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#F5F5F7] font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Date Preset Filters Card */}
        <div className="bg-white/85 backdrop-blur-xl p-5 sm:p-6 rounded-3xl border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center shadow-md shrink-0">
              <BarChart3 size={26} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
                سامانه گزارشات تخصصی و مدیریتی
              </h1>
              <p className="text-xs sm:text-sm text-neutral-500 font-normal mt-0.5">
                گزارشات دقیق انبارداری، مانده مثبت/منفی، فروش، صندوق، سود و زیان و خروجی اکسل و PDF
              </p>
            </div>
          </div>

          {/* Date Selector Segmented Control */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-1 bg-black/[0.05] rounded-2xl border border-black/[0.04] text-xs font-semibold">
              {(['today', 'yesterday', 'this_week', 'this_month', 'custom'] as DatePreset[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={`px-3 py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-95 ${
                    preset === p
                      ? 'bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] font-bold'
                      : 'text-neutral-500 hover:text-neutral-800 font-medium'
                  }`}
                >
                  {p === 'today' ? 'امروز' :
                   p === 'yesterday' ? 'دیروز' :
                   p === 'this_week' ? 'این هفته' :
                   p === 'this_month' ? 'این ماه' : 'بازه سفارشی'}
                </button>
              ))}
            </div>

            {preset === 'custom' && (
              <div className="w-56">
                <DatePicker
                  range
                  calendar={persian}
                  locale={persian_fa}
                  value={customRange}
                  onChange={(d: any) => setCustomRange(d)}
                  inputClass="w-full px-3 py-1.5 rounded-xl border border-black/[0.08] bg-white text-xs text-neutral-800 outline-none focus:border-[#007AFF]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Main Navigation Sub-Tabs (Cupertino Segmented Bar) */}
        <div className="flex overflow-x-auto p-1.5 bg-black/[0.05] rounded-2xl border border-black/[0.04] gap-1 scrollbar-none">
          
          {/* 1. Inventory Report */}
          <button
            onClick={() => setReportTab('inventory')}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
              reportTab === 'inventory' 
                ? 'bg-white text-neutral-900 shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-bold' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Boxes size={17} className={reportTab === 'inventory' ? 'text-[#007AFF]' : 'text-neutral-400'} />
            <span>گزارش موجودی انبارها (مانده / کسری)</span>
          </button>

          {/* 2. Sales Report */}
          <button
            onClick={() => setReportTab('sales')}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
              reportTab === 'sales' 
                ? 'bg-white text-neutral-900 shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-bold' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <TrendingUp size={17} className={reportTab === 'sales' ? 'text-[#34C759]' : 'text-neutral-400'} />
            <span>گزارش فروش ({filteredOrders.length})</span>
          </button>

          {/* 3. Cashier & Drawer Report */}
          <button
            onClick={() => setReportTab('cashier')}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
              reportTab === 'cashier' 
                ? 'bg-white text-neutral-900 shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-bold' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Wallet size={17} className={reportTab === 'cashier' ? 'text-[#FF9500]' : 'text-neutral-400'} />
            <span>گزارش صندوق و تسویه</span>
          </button>

          {/* 4. Profit & Loss Report */}
          <button
            onClick={() => setReportTab('profit')}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
              reportTab === 'profit' 
                ? 'bg-white text-neutral-900 shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-bold' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <DollarSign size={17} className={reportTab === 'profit' ? 'text-[#34C759]' : 'text-neutral-400'} />
            <span>گزارش سود و زیان (P&L)</span>
          </button>

          {/* 5. Cost of Goods Sold (COGS) Report */}
          <button
            onClick={() => setReportTab('cogs')}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
              reportTab === 'cogs' 
                ? 'bg-white text-neutral-900 shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-bold' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Calculator size={17} className={reportTab === 'cogs' ? 'text-[#FF9500]' : 'text-neutral-400'} />
            <span>قیمت تمام شده کالا (COGS)</span>
          </button>

          {/* 6. Executive Overview */}
          <button
            onClick={() => setReportTab('executive')}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
              reportTab === 'executive' 
                ? 'bg-white text-neutral-900 shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-bold' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Building2 size={17} className={reportTab === 'executive' ? 'text-[#007AFF]' : 'text-neutral-400'} />
            <span>گزارش کلی و مدیریتی</span>
          </button>

          {/* 7. Personnel Report */}
          <button
            onClick={() => setReportTab('personnel')}
            className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
              reportTab === 'personnel' 
                ? 'bg-white text-neutral-900 shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-bold' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Users size={17} className={reportTab === 'personnel' ? 'text-[#5856D6]' : 'text-neutral-400'} />
            <span>گزارش پرسنل و دستمزد</span>
          </button>

        </div>

        {/* Tab View Content Rendering */}
        {reportTab === 'inventory' && (
          <WarehouseInventoryReport />
        )}

        {reportTab === 'sales' && (
          <SalesReport 
            filteredOrders={filteredOrders} 
            dateRangeText={dateRangeText} 
          />
        )}

        {reportTab === 'cashier' && (
          <CashierDrawerReport 
            filteredOrders={filteredOrders}
            filteredExpenses={filteredExpenses}
            filteredSalaries={filteredSalaries}
            dateRangeText={dateRangeText}
          />
        )}

        {reportTab === 'profit' && (
          <ProfitLossReport 
            filteredOrders={filteredOrders}
            filteredExpenses={filteredExpenses}
            filteredSalaries={filteredSalaries}
            dateRangeText={dateRangeText}
          />
        )}

        {reportTab === 'cogs' && (
          <ProductCostReport />
        )}

        {reportTab === 'executive' && (
          <ExecutiveOverviewReport 
            filteredOrders={filteredOrders}
            filteredExpenses={filteredExpenses}
            filteredSalaries={filteredSalaries}
            rawMaterials={rawMaterials}
            warehouseStocks={warehouseStocks}
            dateRangeText={dateRangeText}
          />
        )}

        {reportTab === 'personnel' && (
          <PersonnelReport 
            employees={employees}
            salaryPayments={salaryPayments}
            filteredSalaries={filteredSalaries}
            dateRangeText={dateRangeText}
          />
        )}

      </div>
    </div>
  );
}
