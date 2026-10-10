import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel, printReportPDF } from '../../lib/reportExporter';
import { 
  Boxes, AlertTriangle, ArrowDownRight, ArrowUpRight, MinusCircle, 
  Search, Filter, Download, Printer, CheckCircle2, PackageX, Warehouse, RefreshCw
} from 'lucide-react';

type StockFilterType = 'all' | 'positive' | 'negative' | 'zero' | 'low_stock';

export default function WarehouseInventoryReport() {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<StockFilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const warehouses = useLiveQuery(() => db.warehouses.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const warehouseStocks = useLiveQuery(() => db.warehouseStocks.toArray()) || [];

  // Map of warehouse ID to name
  const warehouseMap = useMemo(() => {
    const map = new Map<number, string>();
    warehouses.forEach(w => {
      if (w.id) map.set(w.id, w.name);
    });
    return map;
  }, [warehouses]);

  // Combined inventory data rows
  const inventoryRows = useMemo(() => {
    const rows: Array<{
      materialId: number;
      code: string;
      name: string;
      category: string;
      unit: string;
      unitPrice: number;
      minStockAlert: number;
      warehouseId: number;
      warehouseName: string;
      quantity: number;
      totalValue: number;
      isNegative: boolean;
      isPositive: boolean;
      isZero: boolean;
      isLowStock: boolean;
    }> = [];

    // If a specific warehouse is selected
    if (selectedWarehouseId !== 'all') {
      const whId = Number(selectedWarehouseId);
      const whName = warehouseMap.get(whId) || 'انبار ناشناخته';

      rawMaterials.forEach(mat => {
        if (!mat.id) return;
        const stockRecord = warehouseStocks.find(s => s.warehouseId === whId && s.materialId === mat.id);
        const qty = stockRecord ? stockRecord.quantity : 0;
        const price = mat.unitPrice || mat.weightedAveragePrice || 0;
        const totalVal = qty * price;

        rows.push({
          materialId: mat.id,
          code: mat.code || `RM-${mat.id}`,
          name: mat.name,
          category: mat.category || 'عمومی',
          unit: mat.unit || 'عدد',
          unitPrice: price,
          minStockAlert: mat.minStockAlert || 0,
          warehouseId: whId,
          warehouseName: whName,
          quantity: qty,
          totalValue: totalVal,
          isNegative: qty < 0,
          isPositive: qty > 0,
          isZero: qty === 0,
          isLowStock: qty <= (mat.minStockAlert || 0) && qty >= 0,
        });
      });
    } else {
      // Aggregate total across all warehouses or breakdown by item & warehouse
      rawMaterials.forEach(mat => {
        if (!mat.id) return;
        // Sum across all warehouses for this material
        let totalQty = 0;
        const matStocks = warehouseStocks.filter(s => s.materialId === mat.id);
        if (matStocks.length > 0) {
          matStocks.forEach(s => { totalQty += s.quantity; });
        } else {
          totalQty = 0;
        }

        const price = mat.unitPrice || mat.weightedAveragePrice || 0;
        const totalVal = totalQty * price;

        rows.push({
          materialId: mat.id,
          code: mat.code || `RM-${mat.id}`,
          name: mat.name,
          category: mat.category || 'عمومی',
          unit: mat.unit || 'عدد',
          unitPrice: price,
          minStockAlert: mat.minStockAlert || 0,
          warehouseId: 0,
          warehouseName: 'مجموع کل انبارها',
          quantity: totalQty,
          totalValue: totalVal,
          isNegative: totalQty < 0,
          isPositive: totalQty > 0,
          isZero: totalQty === 0,
          isLowStock: totalQty <= (mat.minStockAlert || 0) && totalQty >= 0,
        });
      });
    }

    return rows;
  }, [rawMaterials, warehouseStocks, selectedWarehouseId, warehouseMap]);

  // Filtered rows based on stock status and search query
  const filteredRows = useMemo(() => {
    return inventoryRows.filter(row => {
      // Stock Status Filter
      if (stockFilter === 'positive' && !row.isPositive) return false;
      if (stockFilter === 'negative' && !row.isNegative) return false;
      if (stockFilter === 'zero' && !row.isZero) return false;
      if (stockFilter === 'low_stock' && !row.isLowStock) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = row.name.toLowerCase().includes(q);
        const matchCode = row.code.toLowerCase().includes(q);
        const matchCategory = row.category.toLowerCase().includes(q);
        return matchName || matchCode || matchCategory;
      }

      return true;
    });
  }, [inventoryRows, stockFilter, searchQuery]);

  // KPI Calculations
  const totalItemsCount = inventoryRows.length;
  const positiveStockCount = inventoryRows.filter(r => r.isPositive).length;
  const negativeStockCount = inventoryRows.filter(r => r.isNegative).length;
  const zeroStockCount = inventoryRows.filter(r => r.isZero).length;
  const lowStockCount = inventoryRows.filter(r => r.isLowStock).length;

  const totalInventoryValuation = useMemo(() => {
    return inventoryRows.reduce((sum, r) => sum + (r.quantity > 0 ? r.totalValue : 0), 0);
  }, [inventoryRows]);

  const totalNegativeDeficitValuation = useMemo(() => {
    return inventoryRows.reduce((sum, r) => sum + (r.quantity < 0 ? Math.abs(r.totalValue) : 0), 0);
  }, [inventoryRows]);

  // Excel Export Handler
  const handleExportExcel = () => {
    const excelData = filteredRows.map((r, index) => ({
      'ردیف': index + 1,
      'کد کالا': r.code,
      'نام کالا / ماده اولیه': r.name,
      'دسته بندی': r.category,
      'نام انبار': r.warehouseName,
      'واحد سنجش': r.unit,
      'موجودی زنده': r.quantity,
      'حداقل موجودی (هشدار)': r.minStockAlert,
      'آخرین نرخ خرید (تومان)': r.unitPrice,
      'ارزش ریالی کل (تومان)': r.totalValue,
      'وضعیت موجودی': r.isNegative ? 'کسری / موجودی منفی' : r.isLowStock ? 'هشدار کسر موجودی' : r.isZero ? 'موجودی صفر' : 'نرمال / مازاد',
    }));

    exportToExcel(excelData, `گزارش_موجودی_انبار_${new Date().toLocaleDateString('fa-IR')}`);
  };

  // PDF Export Handler
  const handlePrintPDF = () => {
    const whTitle = selectedWarehouseId === 'all' ? 'کل انبارها' : warehouseMap.get(Number(selectedWarehouseId)) || 'انبار انتخابی';
    const statusTitle = stockFilter === 'positive' ? 'موجودی مثبت' : stockFilter === 'negative' ? 'موجودی منفی و کسری' : stockFilter === 'zero' ? 'موجودی صفر' : stockFilter === 'low_stock' ? 'هشدار حداقل موجودی' : 'تمامی موجودی‌ها';

    const summaryCards = [
      { label: 'انبار مورد بررسی', value: whTitle },
      { label: 'کل عناوین کالا', value: `${totalItemsCount} قلم` },
      { label: 'ارزش کل دارایی موجودی', value: formatCurrency(totalInventoryValuation) },
      { label: 'عناوین دارای موجودی منفی', value: `${negativeStockCount} کالا (${formatCurrency(totalNegativeDeficitValuation)} کسری)` },
    ];

    const sections = [
      {
        title: `لیست تفکیکی موجودی کالاها (${statusTitle})`,
        headers: ['ردیف', 'کد کالا', 'نام کالا', 'انبار', 'واحد', 'موجودی زنده', 'نرخ واحد', 'ارزش کل (تومان)', 'وضعیت'],
        rows: filteredRows.map((r, i) => [
          i + 1,
          r.code,
          r.name,
          r.warehouseName,
          r.unit,
          r.quantity,
          formatCurrency(r.unitPrice),
          formatCurrency(r.totalValue),
          r.isNegative ? 'کسری / منفی' : r.isLowStock ? 'در آستانه اتمام' : r.isZero ? 'صفر' : 'مثبت'
        ])
      }
    ];

    printReportPDF(
      'گزارش جامع موجودی و ارزش ریالی انبارها',
      `وضعیت: ${statusTitle} | انبار: ${whTitle}`,
      summaryCards,
      sections
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* Filters & Control Bar */}
      <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          
          {/* Warehouse Selector */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-neutral-100/80 px-3 py-1.5 rounded-2xl border border-black/[0.04]">
              <Warehouse size={16} className="text-[#007AFF]" />
              <span className="text-xs font-semibold text-neutral-700">انتخاب انبار:</span>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="bg-transparent text-xs font-bold text-neutral-900 outline-none cursor-pointer"
              >
                <option value="all">همه انبارها (تجمیعی)</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی نام کالا، کد یا دسته..."
                className="w-full pr-9 pl-3 py-1.5 bg-neutral-100/80 border border-black/[0.04] rounded-2xl text-xs text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-[#007AFF] transition-all"
              />
            </div>
          </div>

          {/* Action Export Buttons */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 bg-[#34C759]/10 hover:bg-[#34C759]/20 text-[#34C759] rounded-2xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <Download size={15} />
              <span>خروجی اکسل (.xlsx)</span>
            </button>

            <button
              onClick={handlePrintPDF}
              className="px-4 py-2 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Printer size={15} />
              <span>چاپ و خروجی PDF</span>
            </button>
          </div>
        </div>

        {/* Stock Status Filter Tabs */}
        <div className="flex items-center gap-2 pt-2 border-t border-black/[0.04] overflow-x-auto scrollbar-none">
          <span className="text-xs font-semibold text-neutral-500 shrink-0">فیلتر وضعیت موجودی:</span>
          
          <button
            onClick={() => setStockFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              stockFilter === 'all'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            کل کالاها ({inventoryRows.length})
          </button>

          <button
            onClick={() => setStockFilter('positive')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              stockFilter === 'positive'
                ? 'bg-[#34C759] text-white shadow-sm'
                : 'bg-[#34C759]/10 text-[#28a745] hover:bg-[#34C759]/20'
            }`}
          >
            <CheckCircle2 size={13} />
            <span>موجودی مثبت ({positiveStockCount})</span>
          </button>

          <button
            onClick={() => setStockFilter('negative')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              stockFilter === 'negative'
                ? 'bg-[#FF3B30] text-white shadow-sm'
                : 'bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/20'
            }`}
          >
            <AlertTriangle size={13} />
            <span>موجودی منفی و کسری ({negativeStockCount})</span>
          </button>

          <button
            onClick={() => setStockFilter('low_stock')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              stockFilter === 'low_stock'
                ? 'bg-[#FF9500] text-white shadow-sm'
                : 'bg-[#FF9500]/10 text-[#d97706] hover:bg-[#FF9500]/20'
            }`}
          >
            <Boxes size={13} />
            <span>هشدار حداقل موجودی ({lowStockCount})</span>
          </button>

          <button
            onClick={() => setStockFilter('zero')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              stockFilter === 'zero'
                ? 'bg-neutral-700 text-white shadow-sm'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
            }`}
          >
            <MinusCircle size={13} />
            <span>موجودی صفر ({zeroStockCount})</span>
          </button>
        </div>
      </div>

      {/* Top Stat Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Valuation */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between">
          <div>
            <span className="text-xs text-neutral-500 font-medium block">ارزش کل موجودی مثبت</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-1 font-mono">{formatCurrency(totalInventoryValuation)}</h3>
            <span className="text-[11px] text-neutral-400 mt-1 block">بر اساس آخرین نرخ خرید</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#34C759]/10 text-[#34C759] flex items-center justify-center shrink-0">
            <Boxes size={22} />
          </div>
        </div>

        {/* Card 2: Negative Stock Deficit */}
        <div className={`bg-white/90 backdrop-blur-xl p-5 rounded-2xl border shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between ${
          negativeStockCount > 0 ? 'border-[#FF3B30]/30 bg-[#FF3B30]/[0.02]' : 'border-black/[0.06]'
        }`}>
          <div>
            <span className="text-xs font-semibold text-[#FF3B30] block">کسری ریالی موجودی منفی</span>
            <h3 className="text-xl font-bold text-[#FF3B30] mt-1 font-mono">{formatCurrency(totalNegativeDeficitValuation)}</h3>
            <span className="text-[11px] text-neutral-500 mt-1 block">{negativeStockCount} قلم کالا با موجودی منفی</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FF3B30]/10 text-[#FF3B30] flex items-center justify-center shrink-0">
            <AlertTriangle size={22} />
          </div>
        </div>

        {/* Card 3: Total Items */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between">
          <div>
            <span className="text-xs text-neutral-500 font-medium block">تعداد عناوین کالا</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-1 font-mono">{totalItemsCount} <span className="text-xs font-normal text-neutral-500">کالا</span></h3>
            <span className="text-[11px] text-neutral-400 mt-1 block">{positiveStockCount} کالا دارای موجودی</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0">
            <PackageX size={22} />
          </div>
        </div>

        {/* Card 4: Low Stock Alert */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#FF9500] font-semibold block">هشدار حداقل موجودی</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-1 font-mono">{lowStockCount} <span className="text-xs font-normal text-neutral-500">کالا</span></h3>
            <span className="text-[11px] text-neutral-400 mt-1 block">نیاز به ثبت سفارش خرید</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FF9500]/10 text-[#FF9500] flex items-center justify-center shrink-0">
            <RefreshCw size={22} />
          </div>
        </div>

      </div>

      {/* Main Inventory Data Table */}
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-black/[0.04] bg-neutral-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes size={18} className="text-[#007AFF]" />
            <h3 className="font-bold text-sm text-neutral-900">جدول موجودی زنده و ارزیابی ریالی انبارها</h3>
          </div>
          <span className="text-xs text-neutral-500 font-mono font-semibold">
            نمایش {filteredRows.length} از {totalItemsCount} کالا
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-neutral-100/70 text-neutral-600 font-semibold border-b border-black/[0.06]">
              <tr>
                <th className="py-3 px-4">کد کالا</th>
                <th className="py-3 px-4">نام کالا / ماده اولیه</th>
                <th className="py-3 px-4">دسته‌بندی</th>
                <th className="py-3 px-4">انبار</th>
                <th className="py-3 px-4">واحد</th>
                <th className="py-3 px-4 text-center">موجودی زنده</th>
                <th className="py-3 px-4 text-center">حد هشدار</th>
                <th className="py-3 px-4">نرخ واحد (تومان)</th>
                <th className="py-3 px-4">ارزش کل (تومان)</th>
                <th className="py-3 px-4 text-center">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {filteredRows.map((row) => (
                <tr 
                  key={`${row.materialId}-${row.warehouseId}`} 
                  className={`hover:bg-neutral-50 transition-colors ${
                    row.isNegative ? 'bg-[#FF3B30]/[0.03]' : row.isLowStock ? 'bg-[#FF9500]/[0.03]' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-mono text-neutral-500 font-bold">{row.code}</td>
                  <td className="py-3 px-4 font-bold text-neutral-900">{row.name}</td>
                  <td className="py-3 px-4 text-neutral-600">{row.category}</td>
                  <td className="py-3 px-4 text-neutral-700 font-medium">{row.warehouseName}</td>
                  <td className="py-3 px-4 text-neutral-500">{row.unit}</td>

                  {/* Quantity Display with Badges */}
                  <td className="py-3 px-4 text-center font-bold font-mono text-sm">
                    <span className={`px-2.5 py-1 rounded-xl inline-block ${
                      row.isNegative 
                        ? 'bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/20' 
                        : row.isLowStock 
                        ? 'bg-[#FF9500]/15 text-[#d97706] border border-[#FF9500]/20' 
                        : row.isZero 
                        ? 'bg-neutral-100 text-neutral-500' 
                        : 'bg-[#34C759]/15 text-[#28a745]'
                    }`}>
                      {row.quantity} {row.unit}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-center font-mono text-neutral-400">
                    {row.minStockAlert} {row.unit}
                  </td>

                  <td className="py-3 px-4 font-mono text-neutral-700">
                    {formatCurrency(row.unitPrice)}
                  </td>

                  <td className={`py-3 px-4 font-mono font-bold ${
                    row.isNegative ? 'text-[#FF3B30]' : 'text-neutral-900'
                  }`}>
                    {formatCurrency(row.totalValue)}
                  </td>

                  {/* Status Tag */}
                  <td className="py-3 px-4 text-center">
                    {row.isNegative ? (
                      <span className="px-2.5 py-1 bg-[#FF3B30]/10 text-[#FF3B30] rounded-full text-[10px] font-bold inline-flex items-center gap-1">
                        <AlertTriangle size={12} />
                        کسری / منفی
                      </span>
                    ) : row.isLowStock ? (
                      <span className="px-2.5 py-1 bg-[#FF9500]/10 text-[#d97706] rounded-full text-[10px] font-bold inline-flex items-center gap-1">
                        <Boxes size={12} />
                        در آستانه اتمام
                      </span>
                    ) : row.isZero ? (
                      <span className="px-2.5 py-1 bg-neutral-100 text-neutral-500 rounded-full text-[10px] font-bold">
                        اتمام موجودی
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-[#34C759]/10 text-[#28a745] rounded-full text-[10px] font-bold inline-flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        نرمال / مثبت
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-neutral-400 font-medium">
                    هیچ کالایی با فیلترهای انتخاب‌شده یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
