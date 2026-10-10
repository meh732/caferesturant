import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MenuItem, Recipe, RawMaterial, Category } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel, printReportPDF } from '../../lib/reportExporter';
import { 
  Calculator, Search, Download, Printer, Filter, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, TrendingUp, DollarSign, Utensils, PieChart, Info
} from 'lucide-react';

export default function ProductCostReport() {
  const menuItems = useLiveQuery(() => db.menuItems.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
  const [costStatusFilter, setCostStatusFilter] = useState<'all' | 'high_cost' | 'missing_recipe' | 'healthy'>('all');
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  // Map category names
  const categoryMap = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach(c => {
      if (c.id) map.set(c.id, c.name);
    });
    return map;
  }, [categories]);

  // Map raw materials for live pricing lookup
  const rawMaterialMap = useMemo(() => {
    const map = new Map<number, RawMaterial>();
    rawMaterials.forEach(rm => {
      if (rm.id) map.set(rm.id, rm);
    });
    return map;
  }, [rawMaterials]);

  // Map recipes by menuItemId
  const recipeMap = useMemo(() => {
    const map = new Map<number, Recipe>();
    recipes.forEach(r => {
      if (r.isActive) {
        map.set(r.menuItemId, r);
      }
    });
    return map;
  }, [recipes]);

  // Detailed Cost Calculation per Menu Item
  const itemCostDetails = useMemo(() => {
    return menuItems.map(item => {
      const recipe = item.id ? recipeMap.get(item.id) : undefined;
      let rawMaterialCost = 0;
      let overheadCost = 0;
      let totalCogs = 0;
      let ingredientDetails: {
        name: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        totalCost: number;
      }[] = [];

      if (recipe && recipe.ingredients.length > 0) {
        overheadCost = recipe.overheadCost || 0;
        const yieldQty = recipe.yieldQuantity || 1;

        ingredientDetails = recipe.ingredients.map(ing => {
          const matchedMaterial = rawMaterialMap.get(ing.materialId);
          // Prefer weighted average price, then unitPrice, then ingredient.unitCost
          const activeUnitPrice = matchedMaterial
            ? (matchedMaterial.weightedAveragePrice || matchedMaterial.unitPrice || ing.unitCost || 0)
            : (ing.unitCost || 0);

          const totalCost = ing.quantity * activeUnitPrice;
          rawMaterialCost += totalCost;

          return {
            name: ing.materialName || matchedMaterial?.name || 'ماده اولیه',
            quantity: ing.quantity,
            unit: ing.unit || matchedMaterial?.unit || 'واحد',
            unitPrice: activeUnitPrice,
            totalCost
          };
        });

        // Normalize per yield
        rawMaterialCost = rawMaterialCost / yieldQty;
        overheadCost = overheadCost / yieldQty;
        totalCogs = rawMaterialCost + overheadCost;
      } else {
        // Fallback if recipe cost was pre-calculated or estimated
        totalCogs = 0;
      }

      const sellingPrice = item.price || 0;
      const grossProfit = sellingPrice - totalCogs;
      const foodCostPercentage = sellingPrice > 0 && totalCogs > 0
        ? (totalCogs / sellingPrice) * 100
        : 0;

      const grossMarginPercentage = sellingPrice > 0
        ? (grossProfit / sellingPrice) * 100
        : 0;

      const categoryName = item.categoryId ? (categoryMap.get(item.categoryId) || 'بدون دسته‌بندی') : 'بدون دسته‌بندی';

      return {
        item,
        recipe,
        categoryName,
        sellingPrice,
        rawMaterialCost,
        overheadCost,
        totalCogs,
        grossProfit,
        foodCostPercentage,
        grossMarginPercentage,
        hasRecipe: !!recipe && recipe.ingredients.length > 0,
        ingredientDetails
      };
    });
  }, [menuItems, recipeMap, rawMaterialMap, categoryMap]);

  // Filtered List
  const filteredDetails = useMemo(() => {
    return itemCostDetails.filter(detail => {
      // Search
      const matchesSearch = detail.item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            detail.categoryName.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Category
      if (selectedCategory !== 'all' && detail.item.categoryId !== selectedCategory) {
        return false;
      }

      // Cost Status Filter
      if (costStatusFilter === 'high_cost') {
        return detail.hasRecipe && detail.foodCostPercentage > 35;
      }
      if (costStatusFilter === 'missing_recipe') {
        return !detail.hasRecipe;
      }
      if (costStatusFilter === 'healthy') {
        return detail.hasRecipe && detail.foodCostPercentage <= 30;
      }

      return true;
    });
  }, [itemCostDetails, searchQuery, selectedCategory, costStatusFilter]);

  // Executive Stats Summary
  const stats = useMemo(() => {
    const totalItems = itemCostDetails.length;
    const itemsWithRecipe = itemCostDetails.filter(d => d.hasRecipe);
    const missingRecipeCount = totalItems - itemsWithRecipe.length;
    const highCostCount = itemsWithRecipe.filter(d => d.foodCostPercentage > 35).length;

    const avgFoodCost = itemsWithRecipe.length > 0
      ? itemsWithRecipe.reduce((sum, d) => sum + d.foodCostPercentage, 0) / itemsWithRecipe.length
      : 0;

    let highestProfitItem = itemsWithRecipe.length > 0
      ? itemsWithRecipe.reduce((max, d) => d.grossProfit > max.grossProfit ? d : max, itemsWithRecipe[0])
      : null;

    let lowestFoodCostItem = itemsWithRecipe.length > 0
      ? itemsWithRecipe.reduce((min, d) => d.foodCostPercentage < min.foodCostPercentage ? d : min, itemsWithRecipe[0])
      : null;

    return {
      totalItems,
      itemsWithRecipeCount: itemsWithRecipe.length,
      missingRecipeCount,
      highCostCount,
      avgFoodCost,
      highestProfitItem,
      lowestFoodCostItem
    };
  }, [itemCostDetails]);

  // Excel Export Handler
  const handleExportExcel = () => {
    const excelData = filteredDetails.map(d => ({
      'کد کالا': d.item.id || '-',
      'نام کالا': d.item.name,
      'دسته‌بندی': d.categoryName,
      'قیمت فروش (تومان)': d.sellingPrice,
      'هزینه مواد اولیه (تومان)': Math.round(d.rawMaterialCost),
      'هزینه سربار (تومان)': Math.round(d.overheadCost),
      'بهای تمام شده کل (تومان)': Math.round(d.totalCogs),
      'سود ناخالص هر پرس (تومان)': Math.round(d.grossProfit),
      'درصد Food Cost': `${d.foodCostPercentage.toFixed(1)}%`,
      'حاشیه سود %': `${d.grossMarginPercentage.toFixed(1)}%`,
      'وضعیت فرمول ساخت': d.hasRecipe ? 'ثبت شده' : 'فاقد فرمول'
    }));

    exportToExcel(
      excelData,
      'گزارش_قیمت_تمام_شده_کالاها_COGS',
      'قیمت تمام شده'
    );
  };

  // PDF / Print Handler
  const handlePrintPDF = () => {
    const headers = [
      'نام کالا', 'دسته', 'قیمت فروش', 'قیمت تمام شده (COGS)', 
      'سود ناخالص', 'Food Cost %', 'حاشیه سود %', 'وضعیت رسپی'
    ];

    const rows = filteredDetails.map(d => [
      d.item.name,
      d.categoryName,
      formatCurrency(d.sellingPrice),
      d.hasRecipe ? formatCurrency(Math.round(d.totalCogs)) : 'نامشخص',
      d.hasRecipe ? formatCurrency(Math.round(d.grossProfit)) : 'نامشخص',
      d.hasRecipe ? `${d.foodCostPercentage.toFixed(1)}%` : '-',
      d.hasRecipe ? `${d.grossMarginPercentage.toFixed(1)}%` : '-',
      d.hasRecipe ? 'کامل' : 'نیازمند فرمول'
    ]);

    printReportPDF(
      'گزارش آنالیز بهای تمام شده اقلام منو (Cost of Goods Sold - COGS)',
      'گزارش تخصصی قیمت تمام شده مواد اولیه، سود ناخالص و درصد Food Cost کالاهای منو',
      [
        { label: 'کل اقلام بررسی شده', value: `${filteredDetails.length} کالا` },
        { label: 'میانگین درصد هزینه مواد (Food Cost)', value: `${stats.avgFoodCost.toFixed(1)}%` },
        { label: 'کالاهای با Food Cost بحرانی (>۳۵٪)', value: `${stats.highCostCount} کالا` },
        { label: 'اقلام فاقد رسپی رسمی', value: `${stats.missingRecipeCount} کالا` }
      ],
      [
        {
          title: 'لیست قیمت تمام شده و حاشیه سود کالاهای منو',
          headers,
          rows
        }
      ]
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Menu Items */}
        <div className="bg-white/85 backdrop-blur-xl p-5 rounded-3xl border border-black/[0.06] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-neutral-500">تعداد اقلام منو</span>
            <div className="text-2xl font-black text-neutral-900 mt-1">{stats.totalItems}</div>
            <p className="text-[10px] text-neutral-400 mt-0.5">
              {stats.itemsWithRecipeCount} کالا دارای رسپی و فرمول پخت
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0">
            <Utensils size={22} />
          </div>
        </div>

        {/* Avg Food Cost % */}
        <div className="bg-white/85 backdrop-blur-xl p-5 rounded-3xl border border-black/[0.06] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-neutral-500">میانگین Food Cost منو</span>
            <div className={`text-2xl font-black mt-1 ${
              stats.avgFoodCost > 35 ? 'text-[#FF3B30]' : stats.avgFoodCost <= 30 ? 'text-[#34C759]' : 'text-[#FF9500]'
            }`}>
              {stats.avgFoodCost.toFixed(1)}%
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">
              هدف استاندارد رستوران: ۲۵٪ الی ۳۵٪
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#34C759]/10 text-[#34C759] flex items-center justify-center shrink-0">
            <PieChart size={22} />
          </div>
        </div>

        {/* High Cost Risk Alert */}
        <div className="bg-white/85 backdrop-blur-xl p-5 rounded-3xl border border-black/[0.06] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-neutral-500">اقلام با هزینه بالا (&gt;۳۵٪)</span>
            <div className="text-2xl font-black text-[#FF3B30] mt-1">{stats.highCostCount}</div>
            <p className="text-[10px] text-[#FF3B30] font-medium mt-0.5">
              نیازمند بازنگری قیمت یا اصلاح فرمول
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FF3B30]/10 text-[#FF3B30] flex items-center justify-center shrink-0">
            <AlertTriangle size={22} />
          </div>
        </div>

        {/* Highest Profit Item */}
        <div className="bg-white/85 backdrop-blur-xl p-5 rounded-3xl border border-black/[0.06] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-neutral-500">سودآورترین آیتم منو</span>
            <div className="text-base font-bold text-neutral-900 mt-1 truncate max-w-[150px]">
              {stats.highestProfitItem ? stats.highestProfitItem.item.name : '—'}
            </div>
            <p className="text-[10px] text-[#34C759] font-semibold mt-0.5">
              {stats.highestProfitItem ? `سود هر پرس: ${formatCurrency(Math.round(stats.highestProfitItem.grossProfit))}` : 'نیازمند فرمول'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#5856D6]/10 text-[#5856D6] flex items-center justify-center shrink-0">
            <TrendingUp size={22} />
          </div>
        </div>

      </div>

      {/* Filters & Export Toolbar */}
      <div className="bg-white/85 backdrop-blur-xl p-4 sm:p-5 rounded-3xl border border-black/[0.06] shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Left: Search & Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجوی نام کالا یا دسته‌بندی..."
              className="w-full pl-3 pr-9 py-2 rounded-xl bg-black/[0.03] border border-black/[0.06] text-xs text-neutral-800 outline-none focus:border-[#007AFF] focus:bg-white transition-all"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-2 rounded-xl bg-black/[0.03] border border-black/[0.06] text-xs text-neutral-800 outline-none focus:border-[#007AFF] cursor-pointer"
          >
            <option value="all">همه دسته‌ها ({categories.length})</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Cost Status Filter */}
          <select
            value={costStatusFilter}
            onChange={e => setCostStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-black/[0.03] border border-black/[0.06] text-xs text-neutral-800 outline-none focus:border-[#007AFF] cursor-pointer"
          >
            <option value="all">همه وضعیت‌های هزینه</option>
            <option value="high_cost">هزینه بالا (&gt;۳۵٪)</option>
            <option value="healthy">استاندارد و سودآور (&le;۳۰٪)</option>
            <option value="missing_recipe">فاقد رسپی و فرمول ساخت</option>
          </select>
        </div>

        {/* Right: Export Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl bg-[#34C759]/10 hover:bg-[#34C759]/20 text-[#34C759] text-xs font-semibold border border-[#34C759]/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Download size={15} />
            <span>خروجی اکسل</span>
          </button>

          <button
            onClick={handlePrintPDF}
            className="px-3.5 py-2 rounded-xl bg-[#007AFF] hover:bg-[#007AFF]/90 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Printer size={15} />
            <span>چاپ و PDF</span>
          </button>
        </div>

      </div>

      {/* Main Table Card */}
      <div className="bg-white/85 backdrop-blur-xl rounded-3xl border border-black/[0.06] shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-black/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator size={18} className="text-[#007AFF]" />
            <h2 className="text-sm sm:text-base font-bold text-neutral-900">
              جدول محاسباتی قیمت تمام شده کالاها (COGS)
            </h2>
          </div>
          <span className="text-xs text-neutral-500 font-medium">
            نمایش {filteredDetails.length} از {itemCostDetails.length} کالا
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-black/[0.02] border-b border-black/[0.06] text-neutral-600 font-bold">
                <th className="p-3.5 pr-5">کالا و دسته</th>
                <th className="p-3.5">قیمت فروش (تومان)</th>
                <th className="p-3.5">هزینه مواد اولیه</th>
                <th className="p-3.5">هزینه سربار</th>
                <th className="p-3.5">قیمت تمام شده کل</th>
                <th className="p-3.5">سود ناخالص هر پرس</th>
                <th className="p-3.5">Food Cost %</th>
                <th className="p-3.5">حاشیه سود %</th>
                <th className="p-3.5 pl-5 text-center">جزئیات فرمول</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {filteredDetails.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-neutral-400">
                    هیچ کالایی با فیلترهای انتخابی یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredDetails.map(detail => {
                  const isExpanded = expandedItemId === detail.item.id;
                  
                  return (
                    <React.Fragment key={detail.item.id}>
                      <tr className="hover:bg-black/[0.015] transition-colors">
                        
                        {/* Item Name & Category */}
                        <td className="p-3.5 pr-5">
                          <div className="flex items-center gap-2.5">
                            {detail.item.image ? (
                              <img 
                                src={detail.item.image} 
                                alt={detail.item.name}
                                className="w-8 h-8 rounded-lg object-cover border border-black/[0.08]" 
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-black/[0.04] flex items-center justify-center text-neutral-500 font-bold text-[10px]">
                                {detail.item.name.charAt(0)}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-neutral-900">{detail.item.name}</div>
                              <div className="text-[10px] text-neutral-400">{detail.categoryName}</div>
                            </div>
                          </div>
                        </td>

                        {/* Selling Price */}
                        <td className="p-3.5 font-bold text-neutral-900">
                          {formatCurrency(detail.sellingPrice)}
                        </td>

                        {/* Raw Material Cost */}
                        <td className="p-3.5 text-neutral-700">
                          {detail.hasRecipe ? formatCurrency(Math.round(detail.rawMaterialCost)) : '—'}
                        </td>

                        {/* Overhead Cost */}
                        <td className="p-3.5 text-neutral-500">
                          {detail.hasRecipe ? formatCurrency(Math.round(detail.overheadCost)) : '—'}
                        </td>

                        {/* Total COGS */}
                        <td className="p-3.5 font-black text-neutral-900">
                          {detail.hasRecipe ? (
                            <span className="text-[#FF9500]">
                              {formatCurrency(Math.round(detail.totalCogs))}
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-[10px]">بدون رسپی</span>
                          )}
                        </td>

                        {/* Gross Profit */}
                        <td className="p-3.5 font-bold">
                          {detail.hasRecipe ? (
                            <span className={detail.grossProfit > 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}>
                              {formatCurrency(Math.round(detail.grossProfit))}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>

                        {/* Food Cost % Badge */}
                        <td className="p-3.5">
                          {detail.hasRecipe ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                              detail.foodCostPercentage > 38 
                                ? 'bg-[#FF3B30]/10 text-[#FF3B30]' 
                                : detail.foodCostPercentage > 30 
                                  ? 'bg-[#FF9500]/10 text-[#FF9500]' 
                                  : 'bg-[#34C759]/10 text-[#34C759]'
                            }`}>
                              {detail.foodCostPercentage.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-[10px]">—</span>
                          )}
                        </td>

                        {/* Profit Margin % */}
                        <td className="p-3.5 font-bold text-neutral-800">
                          {detail.hasRecipe ? `${detail.grossMarginPercentage.toFixed(1)}%` : '—'}
                        </td>

                        {/* Expand Details Button */}
                        <td className="p-3.5 pl-5 text-center">
                          {detail.hasRecipe ? (
                            <button
                              onClick={() => setExpandedItemId(isExpanded ? null : (detail.item.id || null))}
                              className="px-2.5 py-1 rounded-lg bg-black/[0.04] hover:bg-black/[0.08] text-neutral-700 text-[11px] font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isExpanded ? 'بستن' : 'ترکیبات'}</span>
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#FF3B30] text-[10px] font-medium bg-[#FF3B30]/10 px-2 py-0.5 rounded-md">
                              <AlertTriangle size={11} />
                              <span>ثبت فرمول</span>
                            </span>
                          )}
                        </td>

                      </tr>

                      {/* Expandable Ingredients Breakdown Row */}
                      {isExpanded && detail.hasRecipe && (
                        <tr className="bg-[#007AFF]/[0.02]">
                          <td colSpan={9} className="p-4 pr-12 pl-6">
                            <div className="bg-white rounded-2xl p-4 border border-black/[0.08] shadow-2xs space-y-3">
                              <div className="flex items-center justify-between text-xs font-bold text-neutral-800 pb-2 border-b border-black/[0.06]">
                                <span>ریز آنالیز مواد اولیه فرمول پخت ({detail.item.name})</span>
                                <span className="text-[10px] text-neutral-500">
                                  بازدهی فرمول: {detail.recipe?.yieldQuantity || 1} پرس
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {detail.ingredientDetails.map((ing, idx) => (
                                  <div key={idx} className="p-2.5 rounded-xl bg-black/[0.02] border border-black/[0.04] flex items-center justify-between text-xs">
                                    <div>
                                      <div className="font-semibold text-neutral-900">{ing.name}</div>
                                      <div className="text-[10px] text-neutral-500">
                                        مقدار: {ing.quantity} {ing.unit} &bull; نرخ: {formatCurrency(ing.unitPrice)}
                                      </div>
                                    </div>
                                    <div className="font-bold text-[#007AFF] text-[11px]">
                                      {formatCurrency(Math.round(ing.totalCost))}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {detail.overheadCost > 0 && (
                                <div className="text-[11px] text-neutral-500 pt-1 flex items-center gap-1">
                                  <Info size={13} className="text-[#007AFF]" />
                                  <span>
                                    هزینه سربار متغیر (بسته‌بندی، ظروف، گاز و انرژی): {formatCurrency(Math.round(detail.overheadCost))}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}

                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
