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

import { ReportErrorBoundary } from './ReportErrorBoundary';

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

        {/* Categorized Report Tabs */}
        <div className="bg-white/80 backdrop-blur-xl p-3 rounded-2xl border border-black/[0.06] shadow-sm space-y-3">
          
          {/* Group 1: Financial & Sales */}
          <div>
            <span className="text-[11px] font-bold text-neutral-400 px-2 block mb-1.5">
              📊 گزارشات فروش، سود و مالیات
            </span>
            <div className="flex overflow-x-auto gap-1.5 scrollbar-none pb-1">
              
              <button
                onClick={() => setReportTab('sales')}
                className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
                  reportTab === 'sales' 
                    ? 'bg-[#007AFF] text-white shadow-md font-bold' 
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                }`}
              >
                <TrendingUp size={16} />
                <span>گزارش جامع فروش ({filteredOrders.length})</span>
              </button>

              <button
                onClick={() => setReportTab('profit')}
                className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
                  reportTab === 'profit' 
                    ? 'bg-[#34C759] text-white shadow-md font-bold' 
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                }`}
              >
                <DollarSign size={16} />
                <span>سود و زیان (P&L)</span>
              </button>

              <button
                onClick={() => setReportTab('cogs')}
                className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
                  reportTab === 'cogs' 
                    ? 'bg-[#FF9500] text-white shadow-md font-bold' 
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                }`}
              >
                <Calculator size={16} />
                <span>قیمت تمام شده غذا و کالا</span>
              </button>

              <button
                onClick={() => setReportTab('cashier')}
                className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
                  reportTab === 'cashier' 
                    ? 'bg-[#5856D6] text-white shadow-md font-bold' 
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                }`}
              >
                <Wallet size={16} />
                <span>تحویل صندوق و نوبت کاری</span>
              </button>

            </div>
          </div>

          <div className="border-t border-black/[0.04] pt-2">
            <span className="text-[11px] font-bold text-neutral-400 px-2 block mb-1.5">
              📦 گزارشات انبار، پرسنل و مدیریتی
            </span>
            <div className="flex overflow-x-auto gap-1.5 scrollbar-none pb-0.5">

              <button
                onClick={() => setReportTab('inventory')}
                className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
                  reportTab === 'inventory' 
                    ? 'bg-neutral-900 text-white shadow-md font-bold' 
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                }`}
              >
                <Boxes size={16} />
                <span>موجودی انبارها و کسری/اضافی</span>
              </button>

              <button
                onClick={() => setReportTab('executive')}
                className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
                  reportTab === 'executive' 
                    ? 'bg-[#30B0C7] text-white shadow-md font-bold' 
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                }`}
              >
                <Building2 size={16} />
                <span>داشبورد خلاصه مدیریتی</span>
              </button>

              <button
                onClick={() => setReportTab('personnel')}
                className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
                  reportTab === 'personnel' 
                    ? 'bg-[#AF52DE] text-white shadow-md font-bold' 
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                }`}
              >
                <Users size={16} />
                <span>کارکرد پرسنل و حقوق</span>
              </button>

            </div>
          </div>

        </div>

        {/* Tab View Content Rendering with Error Boundary */}
        {reportTab === 'inventory' && (
          <ReportErrorBoundary reportName="گزارش موجودی انبارها">
            <WarehouseInventoryReport />
          </ReportErrorBoundary>
        )}

        {reportTab === 'sales' && (
          <ReportErrorBoundary reportName="گزارش فروش">
            <SalesReport 
              filteredOrders={filteredOrders} 
              dateRangeText={dateRangeText} 
            />
          </ReportErrorBoundary>
        )}

        {reportTab === 'cashier' && (
          <ReportErrorBoundary reportName="گزارش صندوق">
            <CashierDrawerReport 
              filteredOrders={filteredOrders}
              filteredExpenses={filteredExpenses}
              filteredSalaries={filteredSalaries}
              dateRangeText={dateRangeText}
            />
          </ReportErrorBoundary>
        )}

        {reportTab === 'profit' && (
          <ReportErrorBoundary reportName="گزارش سود و زیان">
            <ProfitLossReport 
              filteredOrders={filteredOrders}
              filteredExpenses={filteredExpenses}
              filteredSalaries={filteredSalaries}
              dateRangeText={dateRangeText}
            />
          </ReportErrorBoundary>
        )}

        {reportTab === 'cogs' && (
          <ReportErrorBoundary reportName="گزارش قیمت تمام شده کالا">
            <ProductCostReport />
          </ReportErrorBoundary>
        )}

        {reportTab === 'executive' && (
          <ReportErrorBoundary reportName="داشبورد کلی مدیریتی">
            <ExecutiveOverviewReport 
              filteredOrders={filteredOrders}
              filteredExpenses={filteredExpenses}
              filteredSalaries={filteredSalaries}
              rawMaterials={rawMaterials}
              warehouseStocks={warehouseStocks}
              dateRangeText={dateRangeText}
            />
          </ReportErrorBoundary>
        )}

        {reportTab === 'personnel' && (
          <ReportErrorBoundary reportName="گزارش پرسنل و دستمزد">
            <PersonnelReport 
              employees={employees}
              salaryPayments={salaryPayments}
              filteredSalaries={filteredSalaries}
              dateRangeText={dateRangeText}
            />
          </ReportErrorBoundary>
        )}

      </div>
    </div>
  );
}
