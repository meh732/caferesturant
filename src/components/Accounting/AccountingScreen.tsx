import React, { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Expense, Employee, SalaryPayment, Order, Warehouse, RawMaterial, WarehouseTransfer, Recipe } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { 
  Calculator, Plus, ShoppingBag, Receipt, Users, TrendingUp, TrendingDown,
  DollarSign, Calendar, Search, Filter, CheckCircle2, Clock, Trash2, Edit2,
  FileText, ArrowDownRight, ArrowUpRight, Wallet, Printer, Download, Eye,
  Building, UserCheck, AlertCircle, Percent, Building2, Layers, ArrowLeftRight,
  Utensils, FileSpreadsheet, Package, ClipboardCheck, Sparkles
} from 'lucide-react';
import PurchaseExpenseModal from './PurchaseExpenseModal';
import EmployeeModal from './EmployeeModal';
import SalaryPaymentModal from './SalaryPaymentModal';
import WarehouseModal from './WarehouseModal';
import RawMaterialModal from './RawMaterialModal';
import WarehouseTransferModal from './WarehouseTransferModal';
import TransferReceiptModal from './TransferReceiptModal';
import RecipeModal from './RecipeModal';
import WarehouseStockAdjustModal from './WarehouseStockAdjustModal';
import WarehousesInventoryTab from './WarehousesInventoryTab';
import WarehouseTransfersTab from './WarehouseTransfersTab';
import ProductionRecipesTab from './ProductionRecipesTab';
import StockKardexTab from './StockKardexTab';
import { 
  format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, isWithinInterval 
} from 'date-fns-jalali';
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

import { useAuth } from '../../context/AuthContext';

export type AccountingSubTab = 
  | 'warehouses_inventory'
  | 'transfers'
  | 'production_recipes'
  | 'purchases_expenses'
  | 'stock_kardex'
  | 'profit_loss'
  | 'staff_payroll'
  | 'parties_report';

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

export default function AccountingScreen() {
  const { can } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<AccountingSubTab>('warehouses_inventory');

  // Compute allowed subtabs for current user
  const permittedSubTabs = useMemo(() => {
    const list: AccountingSubTab[] = [];
    if (can('stock_view')) list.push('warehouses_inventory');
    if (can('stock_transfer')) list.push('transfers');
    if (can('recipe_view')) list.push('production_recipes');
    if (can('purchase_create') || can('expense_create') || can('purchase_edit')) list.push('purchases_expenses');
    if (can('stock_kardex')) list.push('stock_kardex');
    if (can('profit_loss_view')) list.push('profit_loss');
    if (can('payroll_manage')) list.push('staff_payroll');
    if (can('parties_report_view')) list.push('parties_report');
    return list;
  }, [can]);

  // Ensure activeSubTab is always permitted
  React.useEffect(() => {
    if (permittedSubTabs.length > 0 && !permittedSubTabs.includes(activeSubTab)) {
      setActiveSubTab(permittedSubTabs[0]);
    }
  }, [permittedSubTabs, activeSubTab]);

  // Queries from Dexie
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const employees = useLiveQuery(() => db.employees.toArray()) || [];
  const salaryPayments = useLiveQuery(() => db.salaryPayments.toArray()) || [];
  const orders = useLiveQuery(() => db.orders.toArray()) || [];
  const warehouses = useLiveQuery(() => db.warehouses.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const warehouseTransfers = useLiveQuery(() => db.warehouseTransfers.toArray()) || [];
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];

  // Modals state
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [purchaseDefaultType, setPurchaseDefaultType] = useState<'material' | 'general_expense'>('material');

  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [selectedEmpForSalary, setSelectedEmpForSalary] = useState<number | undefined>(undefined);

  // Warehouse & Inventory Modals state
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isTransferReceiptOpen, setIsTransferReceiptOpen] = useState(false);
  const [selectedTransferForReceipt, setSelectedTransferForReceipt] = useState<WarehouseTransfer | null>(null);

  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [recipeTargetMenuItemId, setRecipeTargetMenuItemId] = useState<number | null>(null);

  const [isStockAdjustModalOpen, setIsStockAdjustModalOpen] = useState(false);
  const [adjustWhId, setAdjustWhId] = useState<number | undefined>(undefined);
  const [adjustMatId, setAdjustMatId] = useState<number | undefined>(undefined);

  const [kardexMaterialId, setKardexMaterialId] = useState<number | undefined>(undefined);

  // Filters for Purchases & Expenses
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<'all' | 'material' | 'general_expense' | 'pending'>('all');
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');

  // Date Filters for Profit & Loss / General Reports
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  const [customRange, setCustomRange] = useState<DateObject[]>([
    new DateObject({ calendar: persian }).subtract(30, "days"),
    new DateObject({ calendar: persian })
  ]);

  // Compute active date interval
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
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
  }, [datePreset, customRange]);

  // Filtered dataset within active date interval
  const periodOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== 'paid') return false;
      return isWithinInterval(new Date(o.createdAt), { start: startDate, end: endDate });
    });
  }, [orders, startDate, endDate]);

  const periodExpenses = useMemo(() => {
    return expenses.filter(e => {
      return isWithinInterval(new Date(e.date), { start: startDate, end: endDate });
    });
  }, [expenses, startDate, endDate]);

  const periodSalaries = useMemo(() => {
    return salaryPayments.filter(s => {
      return isWithinInterval(new Date(s.paymentDate), { start: startDate, end: endDate });
    });
  }, [salaryPayments, startDate, endDate]);

  // Financial aggregates for the period
  const totalRevenue = useMemo(() => periodOrders.reduce((sum, o) => sum + o.total, 0), [periodOrders]);
  
  // Real Cost of Goods Sold from recipes and purchase prices
  const periodCOGS = useMemo(() => {
    return periodOrders.reduce((sum, o) => sum + (o.cogsAmount || 0), 0);
  }, [periodOrders]);

  const rawMaterialExpenses = useMemo(() => {
    return periodExpenses.filter(e => e.type === 'material').reduce((sum, e) => sum + e.amount, 0);
  }, [periodExpenses]);

  const generalExpenses = useMemo(() => {
    return periodExpenses.filter(e => e.type === 'general_expense').reduce((sum, e) => sum + e.amount, 0);
  }, [periodExpenses]);

  const totalSalariesPaid = useMemo(() => {
    return periodSalaries.reduce((sum, s) => sum + s.totalPaid, 0);
  }, [periodSalaries]);

  // If orders have recipes/COGS calculated, use exact COGS; otherwise fallback to raw material purchases
  const effectiveCostOfSales = periodCOGS > 0 ? periodCOGS : rawMaterialExpenses;
  const grossProfit = totalRevenue - effectiveCostOfSales; // سود ناخالص واقعی بر اساس بهای تمام شده
  const totalOverallExpenses = effectiveCostOfSales + generalExpenses + totalSalariesPaid;
  const netProfit = totalRevenue - totalOverallExpenses; // سود خالص نهایی
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';

  // Unsettled debts (payables) across all time
  const totalPendingPayables = useMemo(() => {
    return expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  // Filtered expenses list for Table view
  const displayExpenses = useMemo(() => {
    return expenses.filter(e => {
      // Type filter
      if (expenseTypeFilter === 'material' && e.type !== 'material') return false;
      if (expenseTypeFilter === 'general_expense' && e.type !== 'general_expense') return false;
      if (expenseTypeFilter === 'pending' && e.status !== 'pending') return false;

      // Search query
      if (expenseSearchQuery.trim()) {
        const q = expenseSearchQuery.trim().toLowerCase();
        const matchesTitle = e.title.toLowerCase().includes(q);
        const matchesSupplier = e.supplierOrPerson?.toLowerCase().includes(q);
        const matchesCat = e.category.toLowerCase().includes(q);
        const matchesInv = e.invoiceNumber?.toLowerCase().includes(q);
        return matchesTitle || matchesSupplier || matchesCat || matchesInv;
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, expenseTypeFilter, expenseSearchQuery]);

  // Parties & Suppliers aggregated stats
  const suppliersStats = useMemo(() => {
    const map = new Map<string, { totalPurchases: number; paidAmount: number; pendingAmount: number; count: number }>();
    expenses.forEach(e => {
      const name = e.supplierOrPerson?.trim() || 'فروشنده عمومی';
      if (!map.has(name)) {
        map.set(name, { totalPurchases: 0, paidAmount: 0, pendingAmount: 0, count: 0 });
      }
      const data = map.get(name)!;
      data.totalPurchases += e.amount;
      data.count += 1;
      if (e.status === 'paid') {
        data.paidAmount += e.amount;
      } else {
        data.pendingAmount += e.amount;
      }
    });
    return Array.from(map.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.totalPurchases - a.totalPurchases);
  }, [expenses]);

  // Staff summary aggregated stats
  const staffPayrollStats = useMemo(() => {
    const map = new Map<number, { totalPaid: number; count: number; lastDate?: Date }>();
    salaryPayments.forEach(s => {
      if (!map.has(s.employeeId)) {
        map.set(s.employeeId, { totalPaid: 0, count: 0 });
      }
      const item = map.get(s.employeeId)!;
      item.totalPaid += s.totalPaid;
      item.count += 1;
      if (!item.lastDate || new Date(s.paymentDate) > new Date(item.lastDate)) {
        item.lastDate = s.paymentDate;
      }
    });
    return map;
  }, [salaryPayments]);

  // Actions for Expenses
  const handleDeleteExpense = async (id?: number) => {
    if (!id) return;
    if (window.confirm('آیا از حذف این فاکتور / هزینه اطمینان دارید؟')) {
      await db.expenses.delete(id);
    }
  };

  const handleToggleExpenseStatus = async (expense: Expense) => {
    if (!expense.id) return;
    const newStatus = expense.status === 'paid' ? 'pending' : 'paid';
    await db.expenses.update(expense.id, { status: newStatus });
  };

  // Actions for Employees
  const handleDeleteEmployee = async (id?: number) => {
    if (!id) return;
    if (window.confirm('آیا از حذف این کارمند اطمینان دارید؟')) {
      await db.employees.delete(id);
    }
  };

  // Actions for Salary Payments
  const handleDeleteSalaryPayment = async (id?: number) => {
    if (!id) return;
    if (window.confirm('آیا از حذف این فیش پرداختی حقوق اطمینان دارید؟')) {
      await db.salaryPayments.delete(id);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#F5F5F7]" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header - Apple Glass Style */}
        <div className="bg-white/80 backdrop-blur-xl p-5 sm:p-6 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.02)] border border-black/[0.06] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[#30B0C7] to-[#007AFF] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(0,122,255,0.25)]">
              <Calculator size={26} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">حسابداری و مدیریت انبارها</h1>
              <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 font-normal">
                انبارداری چندگانه، حواله بین انبار، فرمول تولید و بهای تمام‌شده، کسر زنده و خودکار در فروش
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {can('purchase_create') && (
              <button
                onClick={() => {
                  setEditingExpense(null);
                  setPurchaseDefaultType('material');
                  setIsPurchaseModalOpen(true);
                }}
                className="py-2 px-3.5 rounded-xl bg-[#FF9500] hover:bg-[#e68600] text-white font-semibold text-xs shadow-[0_2px_8px_rgba(255,149,0,0.25)] flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
              >
                <ShoppingBag size={14} />
                <span>ثبت خرید مواد اولیه</span>
              </button>
            )}

            {can('stock_transfer') && (
              <button
                onClick={() => setIsTransferModalOpen(true)}
                className="py-2 px-3.5 rounded-xl bg-[#30B0C7] hover:bg-[#2899ad] text-white font-semibold text-xs shadow-[0_2px_8px_rgba(48,176,199,0.25)] flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
              >
                <ArrowLeftRight size={14} />
                <span>صدور حواله انتقال</span>
              </button>
            )}

            {can('recipe_manage') && (
              <button
                onClick={() => {
                  setEditingRecipe(null);
                  setRecipeTargetMenuItemId(null);
                  setIsRecipeModalOpen(true);
                }}
                className="py-2 px-3.5 rounded-xl bg-[#5856D6] hover:bg-[#4a48b8] text-white font-semibold text-xs shadow-[0_2px_8px_rgba(88,86,214,0.25)] flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
              >
                <Utensils size={14} />
                <span>فرمول تولید جدید</span>
              </button>
            )}

            {can('expense_create') && (
              <button
                onClick={() => {
                  setEditingExpense(null);
                  setPurchaseDefaultType('general_expense');
                  setIsPurchaseModalOpen(true);
                }}
                className="py-2 px-3.5 rounded-xl bg-[#FF3B30] hover:bg-[#e03429] text-white font-semibold text-xs shadow-[0_2px_8px_rgba(255,59,48,0.25)] flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
              >
                <Receipt size={14} />
                <span>ثبت هزینه جاری</span>
              </button>
            )}

            {can('payroll_manage') && (
              <button
                onClick={() => {
                  setSelectedEmpForSalary(undefined);
                  setIsSalaryModalOpen(true);
                }}
                className="py-2 px-3.5 rounded-xl bg-neutral-900 hover:bg-black text-white font-semibold text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
              >
                <DollarSign size={14} />
                <span>پرداخت حقوق</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-Tabs Navigation - Cupertino Segmented */}
        <div className="flex overflow-x-auto p-1 bg-black/[0.05] rounded-2xl border border-black/[0.04] gap-1 scrollbar-none">
          {can('stock_view') && (
            <button
              onClick={() => setActiveSubTab('warehouses_inventory')}
              className={`py-2 px-3.5 rounded-xl text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                activeSubTab === 'warehouses_inventory'
                  ? 'bg-white text-neutral-900 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <Building2 size={16} className={activeSubTab === 'warehouses_inventory' ? 'text-[#007AFF]' : ''} />
              <span>انبارداری و موجودی زنده</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeSubTab === 'warehouses_inventory' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-black/[0.05] text-neutral-600'}`}>
                {warehouses.length}
              </span>
            </button>
          )}

          {can('stock_transfer') && (
            <button
              onClick={() => setActiveSubTab('transfers')}
              className={`py-2 px-3.5 rounded-xl text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                activeSubTab === 'transfers'
                  ? 'bg-white text-neutral-900 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <ArrowLeftRight size={16} className={activeSubTab === 'transfers' ? 'text-[#30B0C7]' : ''} />
              <span>حواله بین انبارها</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeSubTab === 'transfers' ? 'bg-[#30B0C7]/15 text-[#30B0C7]' : 'bg-black/[0.05] text-neutral-600'}`}>
                {warehouseTransfers.length}
              </span>
            </button>
          )}

          {can('recipe_view') && (
            <button
              onClick={() => setActiveSubTab('production_recipes')}
              className={`py-2 px-3.5 rounded-xl text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                activeSubTab === 'production_recipes'
                  ? 'bg-white text-neutral-900 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <Utensils size={16} className={activeSubTab === 'production_recipes' ? 'text-[#5856D6]' : ''} />
              <span>فرمول تولید و بها</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeSubTab === 'production_recipes' ? 'bg-[#5856D6]/15 text-[#5856D6]' : 'bg-black/[0.05] text-neutral-600'}`}>
                {recipes.length}
              </span>
            </button>
          )}

          {(can('purchase_create') || can('expense_create') || can('purchase_edit')) && (
            <button
              onClick={() => setActiveSubTab('purchases_expenses')}
              className={`py-2 px-3.5 rounded-xl text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                activeSubTab === 'purchases_expenses'
                  ? 'bg-white text-neutral-900 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <ShoppingBag size={16} className={activeSubTab === 'purchases_expenses' ? 'text-[#FF9500]' : ''} />
              <span>خریدها و هزینه‌ها</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeSubTab === 'purchases_expenses' ? 'bg-[#FF9500]/15 text-[#FF9500]' : 'bg-black/[0.05] text-neutral-600'}`}>
                {expenses.length}
              </span>
            </button>
          )}

          {can('stock_kardex') && (
            <button
              onClick={() => setActiveSubTab('stock_kardex')}
              className={`py-2 px-3.5 rounded-xl text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                activeSubTab === 'stock_kardex'
                  ? 'bg-white text-neutral-900 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <FileSpreadsheet size={16} className={activeSubTab === 'stock_kardex' ? 'text-[#007AFF]' : ''} />
              <span>کاردکس کالا</span>
            </button>
          )}

          {can('profit_loss_view') && (
            <button
              onClick={() => setActiveSubTab('profit_loss')}
              className={`py-2 px-3.5 rounded-xl text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                activeSubTab === 'profit_loss'
                  ? 'bg-white text-neutral-900 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <TrendingUp size={16} className={activeSubTab === 'profit_loss' ? 'text-[#34C759]' : ''} />
              <span>سود و زیان (P&L)</span>
            </button>
          )}

          {can('payroll_manage') && (
            <button
              onClick={() => setActiveSubTab('staff_payroll')}
              className={`py-2 px-3.5 rounded-xl text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                activeSubTab === 'staff_payroll'
                  ? 'bg-white text-neutral-900 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <Users size={16} className={activeSubTab === 'staff_payroll' ? 'text-[#AF52DE]' : ''} />
              <span>پرسنل و حقوق</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeSubTab === 'staff_payroll' ? 'bg-[#AF52DE]/15 text-[#AF52DE]' : 'bg-black/[0.05] text-neutral-600'}`}>
                {employees.length}
              </span>
            </button>
          )}

          {can('parties_report_view') && (
            <button
              onClick={() => setActiveSubTab('parties_report')}
              className={`py-2 px-3.5 rounded-xl text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                activeSubTab === 'parties_report'
                  ? 'bg-white text-neutral-900 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <Building size={16} className={activeSubTab === 'parties_report' ? 'text-[#FF9500]' : ''} />
              <span>طرف‌حساب‌ها</span>
            </button>
          )}
        </div>

        {/* ----------------- SUB-TAB: WAREHOUSES & LIVE INVENTORY ----------------- */}
        {activeSubTab === 'warehouses_inventory' && (
          <WarehousesInventoryTab
            onOpenNewWarehouse={() => {
              setEditingWarehouse(null);
              setIsWarehouseModalOpen(true);
            }}
            onEditWarehouse={(wh) => {
              setEditingWarehouse(wh);
              setIsWarehouseModalOpen(true);
            }}
            onOpenNewMaterial={() => {
              setEditingMaterial(null);
              setIsMaterialModalOpen(true);
            }}
            onEditMaterial={(mat) => {
              setEditingMaterial(mat);
              setIsMaterialModalOpen(true);
            }}
            onOpenNewTransfer={() => {
              setIsTransferModalOpen(true);
            }}
            onOpenAdjustModal={(whId, matId) => {
              setAdjustWhId(whId);
              setAdjustMatId(matId);
              setIsStockAdjustModalOpen(true);
            }}
            onSelectKardexMaterial={(matId) => {
              setKardexMaterialId(matId);
              setActiveSubTab('stock_kardex');
            }}
          />
        )}

        {/* ----------------- SUB-TAB: WAREHOUSE TRANSFERS ----------------- */}
        {activeSubTab === 'transfers' && (
          <WarehouseTransfersTab
            onOpenNewTransfer={() => setIsTransferModalOpen(true)}
            onViewReceipt={(transfer) => {
              setSelectedTransferForReceipt(transfer);
              setIsTransferReceiptOpen(true);
            }}
          />
        )}

        {/* ----------------- SUB-TAB: PRODUCTION RECIPES & COGS ----------------- */}
        {activeSubTab === 'production_recipes' && (
          <ProductionRecipesTab
            onOpenRecipeModal={(recipe, menuItemId) => {
              setEditingRecipe(recipe || null);
              setRecipeTargetMenuItemId(menuItemId || null);
              setIsRecipeModalOpen(true);
            }}
          />
        )}

        {/* ----------------- SUB-TAB: STOCK KARDEX LEDGER ----------------- */}
        {activeSubTab === 'stock_kardex' && (
          <StockKardexTab initialMaterialId={kardexMaterialId} />
        )}

        {/* ----------------- SUB-TAB: PURCHASES & EXPENSES ----------------- */}
        {activeSubTab === 'purchases_expenses' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500">کل خریدها و هزینه‌ها</span>
                  <h3 className="text-xl font-bold text-slate-800 mt-1">
                    {formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}
                  </h3>
                  <span className="text-[11px] text-slate-400 mt-1 block">{expenses.length} فاکتور ثبت شده</span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Calculator size={22} />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-amber-700">خرید مواد اولیه و ملزومات</span>
                  <h3 className="text-xl font-bold text-amber-800 mt-1">
                    {formatCurrency(expenses.filter(e => e.type === 'material').reduce((s, e) => s + e.amount, 0))}
                  </h3>
                  <span className="text-[11px] text-amber-600/80 mt-1 block">
                    {expenses.filter(e => e.type === 'material').length} خرید انبار
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <ShoppingBag size={22} />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-rose-700">هزینه‌های اداری و جاری</span>
                  <h3 className="text-xl font-bold text-rose-800 mt-1">
                    {formatCurrency(expenses.filter(e => e.type === 'general_expense').reduce((s, e) => s + e.amount, 0))}
                  </h3>
                  <span className="text-[11px] text-rose-600/80 mt-1 block">قبوض، اجاره، تعمیرات و...</span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Receipt size={22} />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-orange-700">بدهی‌ها / نسیه‌های تسویه نشده</span>
                  <h3 className="text-xl font-bold text-orange-800 mt-1">
                    {formatCurrency(totalPendingPayables)}
                  </h3>
                  <span className="text-[11px] text-orange-600/80 mt-1 block">
                    {expenses.filter(e => e.status === 'pending').length} فاکتور معوق
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Clock size={22} />
                </div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-center gap-3">
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <button
                  onClick={() => setExpenseTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    expenseTypeFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  همه ثبت‌ها ({expenses.length})
                </button>
                <button
                  onClick={() => setExpenseTypeFilter('material')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    expenseTypeFilter === 'material' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  مواد اولیه ({expenses.filter(e => e.type === 'material').length})
                </button>
                <button
                  onClick={() => setExpenseTypeFilter('general_expense')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    expenseTypeFilter === 'general_expense' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                >
                  هزینه‌های جاری ({expenses.filter(e => e.type === 'general_expense').length})
                </button>
                <button
                  onClick={() => setExpenseTypeFilter('pending')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    expenseTypeFilter === 'pending' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                  }`}
                >
                  نسیه / بدهی تسویه نشده ({expenses.filter(e => e.status === 'pending').length})
                </button>
              </div>

              {/* Search input */}
              <div className="relative w-full md:w-72">
                <input
                  type="text"
                  value={expenseSearchQuery}
                  onChange={e => setExpenseSearchQuery(e.target.value)}
                  placeholder="جستجو کالا، فروشنده، دسته‌بندی..."
                  className="w-full pl-4 pr-9 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs outline-none"
                />
                <Search size={16} className="absolute right-3 top-2.5 text-slate-400" />
              </div>
            </div>

            {/* Table of Purchases & Expenses */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-3.5 px-4">نوع</th>
                      <th className="py-3.5 px-4">عنوان خرید / هزینه</th>
                      <th className="py-3.5 px-4">دسته‌بندی</th>
                      <th className="py-3.5 px-4">طرف‌حساب / تامین‌کننده</th>
                      <th className="py-3.5 px-4 text-center">انبار مقصد</th>
                      <th className="py-3.5 px-4">مقدار / واحد</th>
                      <th className="py-3.5 px-4">مبلغ (تومان)</th>
                      <th className="py-3.5 px-4">روش پرداخت</th>
                      <th className="py-3.5 px-4">وضعیت</th>
                      <th className="py-3.5 px-4">تاریخ</th>
                      <th className="py-3.5 px-4 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-400 text-xs">
                          هیچ موردی ثبت نشده است. از دکمه‌های بالا برای ثبت فاکتور استفاده کنید.
                        </td>
                      </tr>
                    ) : (
                      displayExpenses.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                              e.type === 'material'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}>
                              {e.type === 'material' ? <ShoppingBag size={12} /> : <Receipt size={12} />}
                              <span>{e.type === 'material' ? 'مواد اولیه' : 'هزینه جاری'}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-800">
                            <div>{e.title}</div>
                            {e.invoiceNumber && (
                              <span className="text-[10px] text-slate-400 font-mono">شماره: {e.invoiceNumber}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">{e.category}</td>
                          <td className="py-3.5 px-4 text-xs font-medium text-slate-700">{e.supplierOrPerson || '-'}</td>
                          <td className="py-3.5 px-4 text-center">
                            {e.type === 'material' ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                {e.warehouseName || 'انبار مرکزی'}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {e.quantity ? `${e.quantity} ${e.unit || ''}` : '-'}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-800 text-sm whitespace-nowrap">
                            {formatCurrency(e.amount)}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {e.paymentMethod === 'card' ? 'کارت / بانک' :
                             e.paymentMethod === 'cash' ? 'نقدی' :
                             e.paymentMethod === 'credit' ? 'نسیه' : 'چک'}
                          </td>
                          <td className="py-3.5 px-4">
                            <button
                              type="button"
                              onClick={() => handleToggleExpenseStatus(e)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                e.status === 'paid'
                                  ? 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                                  : 'bg-orange-50 text-orange-700 hover:bg-orange-100 animate-pulse'
                              }`}
                              title="کلیک برای تغییر وضعیت تسویه"
                            >
                              {e.status === 'paid' ? (
                                <>
                                  <CheckCircle2 size={13} />
                                  <span>تسویه شد</span>
                                </>
                              ) : (
                                <>
                                  <Clock size={13} />
                                  <span>نسیه / معوق</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                            {format(new Date(e.date), 'yyyy/MM/dd')}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingExpense(e);
                                  setPurchaseDefaultType(e.type);
                                  setIsPurchaseModalOpen(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="ویرایش"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(e.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="حذف"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- SUB-TAB 2: STAFF & PAYROLL ----------------- */}
        {activeSubTab === 'staff_payroll' && (
          <div className="space-y-6">
            {/* Top Bar for Staff Module */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">لیست پرسنل و سوابق حقوق و دستمزد</h2>
                <p className="text-xs text-slate-500 mt-1">
                  تعریف کارمندان، ثبت مبالغ واریزی حقوق ماهانه و شناسایی آنی هزینه در سود و زیان
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingEmployee(null);
                    setIsEmployeeModalOpen(true);
                  }}
                  className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus size={16} />
                  <span>ثبت پرسنل جدید</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedEmpForSalary(undefined);
                    setIsSalaryModalOpen(true);
                  }}
                  className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <DollarSign size={16} />
                  <span>ثبت فیش حقوقی جدید</span>
                </button>
              </div>
            </div>

            {/* Staff Cards Grid */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Users size={18} className="text-teal-600" />
                <span>پرسنل شاغل ({employees.length} نفر)</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {employees.length === 0 ? (
                  <div className="col-span-full bg-white p-8 rounded-3xl border border-slate-200 text-center text-slate-400 text-xs">
                    هنوز هیچ کارمندی تعریف نشده است. با زدن دکمه «ثبت پرسنل جدید» نخستین عضو تیم خود را اضافه کنید.
                  </div>
                ) : (
                  employees.map(emp => {
                    const stats = staffPayrollStats.get(emp.id!) || { totalPaid: 0, count: 0 };
                    return (
                      <div key={emp.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between gap-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 font-bold text-base flex items-center justify-center">
                              {(emp.name || 'ک').charAt(0)}
                            </div>
                            <div>
                              <h4 className="font-bold text-sm text-slate-800">{emp.name}</h4>
                              <span className="text-xs text-teal-600 font-medium">{emp.roleTitle}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEmployee(emp);
                                setIsEmployeeModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                              title="ویرایش"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEmployee(emp.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                          <div className="flex justify-between text-slate-500">
                            <span>حقوق پایه توافقی:</span>
                            <span className="font-bold text-slate-800">{formatCurrency(emp.baseSalary)}</span>
                          </div>
                          <div className="flex justify-between text-slate-500">
                            <span>شماره تماس:</span>
                            <span className="font-mono text-slate-700" dir="ltr">{emp.phone || '-'}</span>
                          </div>
                          <div className="flex justify-between text-slate-500">
                            <span>کل حقوق پرداختی تا کنون:</span>
                            <span className="font-bold text-emerald-700">{formatCurrency(stats.totalPaid)}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEmpForSalary(emp.id);
                            setIsSalaryModalOpen(true);
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <DollarSign size={14} />
                          <span>ثبت پرداخت حقوق به {emp.name.split(' ')[0]}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Salary Payments History Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={20} className="text-teal-600" />
                  <h3 className="font-bold text-base text-slate-800">تاریخچه پرداخت حقوق پرسنل</h3>
                </div>
                <span className="text-xs bg-teal-50 text-teal-700 font-bold px-3 py-1 rounded-full">
                  مجموع پرداخت‌ها: {formatCurrency(salaryPayments.reduce((s, p) => s + p.totalPaid, 0))}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-3.5 px-4">نام کارمند</th>
                      <th className="py-3.5 px-4">دوره / ماه حقوق</th>
                      <th className="py-3.5 px-4">حقوق پایه</th>
                      <th className="py-3.5 px-4">پاداش / اضافه</th>
                      <th className="py-3.5 px-4">کسورات / مساعده</th>
                      <th className="py-3.5 px-4">خالص پرداختی</th>
                      <th className="py-3.5 px-4">تاریخ پرداخت</th>
                      <th className="py-3.5 px-4">روش پرداخت</th>
                      <th className="py-3.5 px-4 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salaryPayments.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-slate-400 text-xs">
                          هنوز هیچ پرداختی حقوقی ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      salaryPayments.map(sp => (
                        <tr key={sp.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-800">{sp.employeeName}</td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">{sp.periodMonth}</td>
                          <td className="py-3.5 px-4 text-xs text-slate-700">{formatCurrency(sp.baseAmount)}</td>
                          <td className="py-3.5 px-4 text-xs text-emerald-600">
                            {sp.bonusAmount > 0 ? `+ ${formatCurrency(sp.bonusAmount)}` : '-'}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-rose-600">
                            {sp.deductionsAmount > 0 ? `- ${formatCurrency(sp.deductionsAmount)}` : '-'}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-emerald-700 text-sm whitespace-nowrap">
                            {formatCurrency(sp.totalPaid)}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                            {format(new Date(sp.paymentDate), 'yyyy/MM/dd')}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {sp.paymentMethod === 'card' ? 'کارت به کارت' : sp.paymentMethod === 'cash' ? 'نقدی' : 'چک'}
                            {sp.trackingNumber && <span className="block text-[10px] text-slate-400 font-mono">پیگیری: {sp.trackingNumber}</span>}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteSalaryPayment(sp.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- SUB-TAB 3: PROFIT & LOSS REPORT ----------------- */}
        {activeSubTab === 'profit_loss' && (
          <div className="space-y-6">
            {/* Filter Bar with Presets and Jalali Custom Date Range */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">صورت سود و زیان (ساده و کاربردی)</h2>
                <p className="text-xs text-slate-500 mt-1">
                  محاسبه درآمد فروش منهای کلیه خریدها، حقوق پرسنل و هزینه‌ها در بازه انتخابی
                </p>
              </div>

              {/* Date Presets */}
              <div className="flex flex-wrap items-center gap-2">
                {(['today', 'yesterday', 'this_week', 'this_month', 'custom'] as DatePreset[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setDatePreset(p)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      datePreset === p
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

                {datePreset === 'custom' && (
                  <div className="w-56">
                    <DatePicker
                      value={customRange}
                      onChange={(d: any) => setCustomRange(d)}
                      range
                      calendar={persian}
                      locale={persian_fa}
                      calendarPosition="bottom-right"
                      inputClass="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handlePrint}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  title="چاپ گزارش سود و زیان"
                >
                  <Printer size={18} />
                </button>
              </div>
            </div>

            {/* Profit / Loss Big Outcome Banner */}
            <div className={`p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 ${
              netProfit >= 0
                ? 'bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border-emerald-300'
                : 'bg-gradient-to-r from-rose-500/10 via-orange-500/10 to-transparent border-rose-300'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg ${
                  netProfit >= 0 ? 'bg-emerald-600 shadow-emerald-500/25' : 'bg-rose-600 shadow-rose-500/25'
                }`}>
                  {netProfit >= 0 ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500">
                    نتیجه عملکرد دوره ({datePreset === 'today' ? 'امروز' : datePreset === 'this_month' ? 'این ماه' : 'بازه مشخص شده'}):
                  </span>
                  <h3 className={`text-3xl font-black mt-1 ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {netProfit >= 0 ? 'سود خالص: ' : 'زیان دوره: '}
                    {formatCurrency(Math.abs(netProfit))}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    حاشیه سود خالص: <span className="font-bold text-slate-700">{profitMargin}%</span> از کل مبلغ فروش
                  </p>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-xs p-4 rounded-2xl border border-slate-200/80 text-xs space-y-1 min-w-[200px]">
                <div className="flex justify-between text-slate-600">
                  <span>تعداد فاکتورهای فروش:</span>
                  <span className="font-bold text-slate-800">{periodOrders.length} فاکتور</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>میانگین هر فاکتور:</span>
                  <span className="font-bold text-slate-800">
                    {periodOrders.length > 0 ? formatCurrency(Math.round(totalRevenue / periodOrders.length)) : '۰ تومان'}
                  </span>
                </div>
              </div>
            </div>

            {/* Income & Expense Breakdown Rows (The Financial Statement) */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
              <h3 className="font-bold text-base text-slate-800 border-b border-slate-100 pb-3">
                ریز محاسبات و تفکیک جریان مالی دوره
              </h3>

              {/* Step 1: Revenue */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-blue-50/60 rounded-2xl border border-blue-100 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                    +
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-blue-900">کل درآمد فروش (صندوق و سفارشات)</h4>
                    <p className="text-xs text-blue-700/70">مجموع فروش نقدی و کارتخوان فاکتورهای تسویه شده</p>
                  </div>
                </div>
                <span className="text-xl font-black text-blue-700">{formatCurrency(totalRevenue)}</span>
              </div>

              {/* Step 2: Cost of Raw Materials */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-amber-50/60 rounded-2xl border border-amber-100 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold">
                    -
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-amber-900">خرید مواد اولیه و مصرفی (بهای تمام شده)</h4>
                    <p className="text-xs text-amber-700/70">گوشت، برنج، لبنیات، نان، ظروف یکبارمصرف و ملزومات غذا</p>
                  </div>
                </div>
                <span className="text-xl font-black text-amber-700">- {formatCurrency(rawMaterialExpenses)}</span>
              </div>

              {/* Intermediate: Gross Profit */}
              <div className="flex items-center justify-between px-4 py-2 border-y border-dashed border-slate-200 text-xs">
                <span className="font-bold text-slate-600">= سود ناخالص عملیاتی (فروش منهای مواد اولیه):</span>
                <span className="font-black text-sm text-slate-800">{formatCurrency(grossProfit)}</span>
              </div>

              {/* Step 3: Staff Salaries */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-teal-50/60 rounded-2xl border border-teal-100 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
                    -
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-teal-900">حقوق و دستمزد پرسنل</h4>
                    <p className="text-xs text-teal-700/70">مجموع حقوق‌های پرداخت شده در این بازه زمانی</p>
                  </div>
                </div>
                <span className="text-xl font-black text-teal-700">- {formatCurrency(totalSalariesPaid)}</span>
              </div>

              {/* Step 4: Operating / General Expenses */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-rose-50/60 rounded-2xl border border-rose-100 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold">
                    -
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-rose-900">سایر هزینه‌های جاری و اداری</h4>
                    <p className="text-xs text-rose-700/70">اجاره بها، قبوض برق و گاز، تبلیغات، تعمیرات، ایاب و ذهاب</p>
                  </div>
                </div>
                <span className="text-xl font-black text-rose-700">- {formatCurrency(generalExpenses)}</span>
              </div>

              {/* Final Net Profit Bar */}
              <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 rounded-2xl border gap-2 ${
                netProfit >= 0 ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-rose-600 text-white border-rose-700'
              }`}>
                <div>
                  <h4 className="font-black text-base">
                    = سود خالص نهایی (قابل برداشت):
                  </h4>
                  <p className="text-xs opacity-90 mt-0.5">درآمد فروش منهای تمام هزینه‌ها و حقوق‌ها</p>
                </div>
                <span className="text-2xl font-black">{formatCurrency(netProfit)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- SUB-TAB 4: PARTIES & SUPPLIERS REPORT ----------------- */}
        {activeSubTab === 'parties_report' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">گزارش اشخاص، تامین‌کنندگان و پرسنل</h2>
                <p className="text-xs text-slate-500 mt-1">
                  مشاهده حساب و گردش مالی با طرف‌حساب‌ها، فروشندگان مواد اولیه و کارکنان
                </p>
              </div>

              <div className="text-xs bg-slate-100 text-slate-700 font-bold px-3 py-1.5 rounded-xl">
                تعداد تامین‌کنندگان فعال: {suppliersStats.length}
              </div>
            </div>

            {/* Suppliers & Vendors Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building size={20} className="text-amber-600" />
                  <h3 className="font-bold text-base text-slate-800">حساب تامین‌کنندگان و فروشندگان مواد اولیه</h3>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-3.5 px-4">نام شخص / فروشگاه</th>
                      <th className="py-3.5 px-4">تعداد فاکتورها</th>
                      <th className="py-3.5 px-4">مجموع خرید</th>
                      <th className="py-3.5 px-4">مبلغ پرداخت شده</th>
                      <th className="py-3.5 px-4">مانده بدهی (نسیه)</th>
                      <th className="py-3.5 px-4">وضعیت تسویه</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {suppliersStats.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                          هنوز خریدی از تامین‌کننده‌ای ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      suppliersStats.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs">
                              {(s.name || 'ت').charAt(0)}
                            </div>
                            <span>{s.name}</span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">{s.count} فاکتور</td>
                          <td className="py-3.5 px-4 font-bold text-slate-800">{formatCurrency(s.totalPurchases)}</td>
                          <td className="py-3.5 px-4 text-xs font-bold text-teal-700">{formatCurrency(s.paidAmount)}</td>
                          <td className="py-3.5 px-4 text-xs font-bold text-orange-700">
                            {s.pendingAmount > 0 ? formatCurrency(s.pendingAmount) : 'تسویه کامل'}
                          </td>
                          <td className="py-3.5 px-4">
                            {s.pendingAmount === 0 ? (
                              <span className="text-[11px] bg-teal-50 text-teal-700 font-bold px-2 py-0.5 rounded-md">
                                ✓ بدون بدهی
                              </span>
                            ) : (
                              <span className="text-[11px] bg-orange-50 text-orange-700 font-bold px-2 py-0.5 rounded-md">
                                ⏳ دارای مانده حساب
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Purchase / Expense Modal */}
        <PurchaseExpenseModal
          isOpen={isPurchaseModalOpen}
          onClose={() => setIsPurchaseModalOpen(false)}
          initialExpense={editingExpense}
          defaultType={purchaseDefaultType}
        />

        {/* Employee Modal */}
        <EmployeeModal
          isOpen={isEmployeeModalOpen}
          onClose={() => setIsEmployeeModalOpen(false)}
          initialEmployee={editingEmployee}
        />

        {/* Salary Payment Modal */}
        <SalaryPaymentModal
          isOpen={isSalaryModalOpen}
          onClose={() => setIsSalaryModalOpen(false)}
          preselectedEmployeeId={selectedEmpForSalary}
        />

        {/* Warehouse Modal */}
        <WarehouseModal
          isOpen={isWarehouseModalOpen}
          onClose={() => setIsWarehouseModalOpen(false)}
          initialWarehouse={editingWarehouse}
        />

        {/* Raw Material Modal */}
        <RawMaterialModal
          isOpen={isMaterialModalOpen}
          onClose={() => setIsMaterialModalOpen(false)}
          initialMaterial={editingMaterial}
        />

        {/* Warehouse Transfer Modal */}
        <WarehouseTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          onSuccess={(transferId) => {
            if (transferId) {
              db.warehouseTransfers.get(transferId).then(tr => {
                if (tr) {
                  setSelectedTransferForReceipt(tr);
                  setIsTransferReceiptOpen(true);
                }
              });
            }
          }}
        />

        {/* Transfer Receipt Modal */}
        <TransferReceiptModal
          isOpen={isTransferReceiptOpen}
          onClose={() => setIsTransferReceiptOpen(false)}
          transfer={selectedTransferForReceipt}
        />

        {/* Recipe Modal */}
        <RecipeModal
          isOpen={isRecipeModalOpen}
          onClose={() => setIsRecipeModalOpen(false)}
          initialRecipe={editingRecipe}
          targetMenuItemId={recipeTargetMenuItemId}
        />

        {/* Warehouse Stock Adjust Modal */}
        <WarehouseStockAdjustModal
          isOpen={isStockAdjustModalOpen}
          onClose={() => setIsStockAdjustModalOpen(false)}
          defaultWarehouseId={adjustWhId}
          defaultMaterialId={adjustMatId}
        />

      </div>
    </div>
  );
}
