import React, { useState, useMemo } from 'react';
import { db, MenuItem, Recipe, RawMaterial, calculateRecipeCost } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { 
  Utensils, Plus, Edit2, Trash2, Search, CheckCircle2, AlertCircle, 
  TrendingUp, DollarSign, Percent, ChevronDown, ChevronUp, Layers, Sparkles 
} from 'lucide-react';

interface ProductionRecipesTabProps {
  onOpenRecipeModal: (recipe?: Recipe | null, menuItemId?: number | null) => void;
}

export default function ProductionRecipesTab({
  onOpenRecipeModal,
}: ProductionRecipesTabProps) {
  const { can } = useAuth();
  const menuItems = useLiveQuery(() => db.menuItems.toArray()) || [];
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'has_recipe' | 'no_recipe'>('all');
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  // Materials lookup
  const materialsMap = useMemo(() => {
    const map = new Map<number, RawMaterial>();
    rawMaterials.forEach(m => {
      if (m.id) map.set(m.id, m);
    });
    return map;
  }, [rawMaterials]);

  // Recipes lookup: menuItemId -> Recipe
  const recipesMap = useMemo(() => {
    const map = new Map<number, Recipe>();
    recipes.forEach(r => map.set(r.menuItemId, r));
    return map;
  }, [recipes]);

  // Categories lookup
  const categoriesMap = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach(c => {
      if (c.id) map.set(c.id, c.name);
    });
    return map;
  }, [categories]);

  // Computed data for each menu item
  const itemsAnalysis = useMemo(() => {
    return menuItems.map(item => {
      const recipe = item.id ? recipesMap.get(item.id) : undefined;
      let cogs = 0;
      let overhead = 0;
      let breakdown: any[] = [];

      if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
        const costData = calculateRecipeCost(recipe, materialsMap);
        cogs = costData.totalCost;
        overhead = costData.overheadCost;
        breakdown = costData.breakdown;
      }

      const sellingPrice = item.price;
      const profit = Math.max(0, sellingPrice - cogs);
      const margin = sellingPrice > 0 && cogs > 0
        ? parseFloat(((profit / sellingPrice) * 100).toFixed(1))
        : 0;

      return {
        item,
        recipe,
        hasRecipe: Boolean(recipe && recipe.ingredients && recipe.ingredients.length > 0),
        cogs,
        overhead,
        breakdown,
        profit,
        margin
      };
    });
  }, [menuItems, recipesMap, materialsMap]);

  // Filtered items
  const filteredAnalysis = useMemo(() => {
    return itemsAnalysis.filter(data => {
      if (filterStatus === 'has_recipe' && !data.hasRecipe) return false;
      if (filterStatus === 'no_recipe' && data.hasRecipe) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = data.item.name.toLowerCase().includes(q);
        const catName = categoriesMap.get(data.item.categoryId)?.toLowerCase() || '';
        return matchesName || catName.includes(q);
      }

      return true;
    });
  }, [itemsAnalysis, filterStatus, searchQuery, categoriesMap]);

  // Overall Stats
  const itemsWithRecipeCount = itemsAnalysis.filter(i => i.hasRecipe).length;
  const avgMargin = useMemo(() => {
    const valid = itemsAnalysis.filter(i => i.hasRecipe && i.margin > 0);
    if (valid.length === 0) return 0;
    const sum = valid.reduce((acc, v) => acc + v.margin, 0);
    return (sum / valid.length).toFixed(1);
  }, [itemsAnalysis]);

  const handleDeleteRecipe = async (recipeId?: number) => {
    if (!recipeId) return;
    if (window.confirm('آیا از حذف این فرمول ساخت اطمینان دارید؟')) {
      await db.recipes.delete(recipeId);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">پوشش فرمول تولید</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {itemsWithRecipeCount} از {menuItems.length} غذا
            </h3>
            <span className="text-[11px] text-indigo-600 font-bold mt-1 block">
              {menuItems.length > 0 ? `${Math.round((itemsWithRecipeCount / menuItems.length) * 100)}% منو دارای فرمول دقیق` : 'منو خالی'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Utensils size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">میانگین حاشیه سود ناخالص</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              %{avgMargin}
            </h3>
            <span className="text-[11px] text-emerald-600 font-bold mt-1 block">
              بر اساس قیمت روز خرید مواد
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Percent size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">کسر اتوماتیک از انبار</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
              فعال و هوشمند
            </h3>
            <span className="text-[11px] text-teal-600 font-bold mt-1 block">
              کسر لحظه‌ای مواد با صدور فاکتور
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Sparkles size={24} />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجوی نام غذا یا دسته‌بندی..."
              className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
            />
            <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
          </div>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none"
          >
            <option value="all">همه غذاهای منو</option>
            <option value="has_recipe">دارای فرمول ساخت ({itemsWithRecipeCount})</option>
            <option value="no_recipe">فاقد فرمول ساخت ({menuItems.length - itemsWithRecipeCount})</option>
          </select>
        </div>

        {can('recipe_manage') && (
          <button
            onClick={() => onOpenRecipeModal(null, null)}
            className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>تعریف فرمول تولید جدید</span>
          </button>
        )}
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">غذا / نوشیدنی منو</th>
                <th className="py-3.5 px-4">دسته‌بندی منو</th>
                <th className="py-3.5 px-4 text-left">قیمت فروش منو</th>
                <th className="py-3.5 px-4 text-center">وضعیت فرمول ساخت</th>
                <th className="py-3.5 px-4 text-left">بهای تمام‌شده واقعی (COGS)</th>
                <th className="py-3.5 px-4 text-left">سود ناخالص هر پرس</th>
                <th className="py-3.5 px-4 text-center">حاشیه سود</th>
                <th className="py-3.5 px-4 text-center w-28">عملیات فرمول</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAnalysis.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    هیچ غذایی با شرایط انتخابی یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredAnalysis.map(data => {
                  const { item, recipe, hasRecipe, cogs, profit, margin, breakdown } = data;
                  const isExpanded = expandedItemId === item.id;

                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-3">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-10 h-10 rounded-xl object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                              <Utensils size={18} />
                            </div>
                          )}
                          <div>
                            <span className="block text-sm font-bold text-slate-900">{item.name}</span>
                            {hasRecipe && (
                              <button
                                onClick={() => setExpandedItemId(isExpanded ? null : item.id!)}
                                className="text-[10px] text-blue-600 font-bold flex items-center gap-0.5 mt-0.5 hover:underline cursor-pointer"
                              >
                                <span>{isExpanded ? 'بستن ریز اقلام' : `مشاهده ${recipe?.ingredients.length} قلم مواد`}</span>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-slate-600 font-medium">
                          {categoriesMap.get(item.categoryId) || '-'}
                        </td>

                        <td className="py-3 px-4 text-left font-mono font-bold text-slate-900">
                          {formatCurrency(item.price)}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {hasRecipe ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center gap-1 w-max mx-auto">
                              <CheckCircle2 size={13} />
                              <span>دارای فرمول تولید</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => onOpenRecipeModal(null, item.id)}
                              className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors flex items-center justify-center gap-1 w-max mx-auto cursor-pointer"
                            >
                              <Plus size={13} />
                              <span>تعریف فرمول ساخت</span>
                            </button>
                          )}
                        </td>

                        <td className="py-3 px-4 text-left font-mono font-bold">
                          {hasRecipe ? (
                            <span className="text-amber-900">{formatCurrency(cogs)}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-left font-mono font-bold">
                          {hasRecipe ? (
                            <span className="text-emerald-900">{formatCurrency(profit)}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {hasRecipe ? (
                            <span className={`px-2 py-0.5 rounded-md font-mono font-black text-xs ${
                              margin >= 45 ? 'bg-emerald-100 text-emerald-800' :
                              margin >= 25 ? 'bg-blue-100 text-blue-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              %{margin}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {can('recipe_manage') ? (
                              <>
                                <button
                                  onClick={() => onOpenRecipeModal(recipe, item.id)}
                                  title={hasRecipe ? "ویرایش فرمول تولید" : "تعریف فرمول تولید"}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Edit2 size={16} />
                                </button>
                                {hasRecipe && recipe?.id && (
                                  <button
                                    onClick={() => handleDeleteRecipe(recipe.id)}
                                    title="حذف فرمول"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-400">فقط مشاهده</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Accordion: Recipe Ingredients Breakdown */}
                      {isExpanded && hasRecipe && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={8} className="p-4 border-t border-slate-200">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                              <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                                <span>مواد اولیه مصرفی در ۱ پرس «{item.name}»:</span>
                                <span className="text-slate-500">
                                  سربار پخت و بسته‌بندی: <strong>{formatCurrency(data.overhead)}</strong>
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {breakdown.map((ing, bIdx) => (
                                  <div key={bIdx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                                    <div>
                                      <span className="font-bold text-slate-800 block">{ing.materialName}</span>
                                      <span className="text-[11px] text-slate-500">{ing.quantity} {ing.unit}</span>
                                    </div>
                                    <span className="font-mono font-bold text-slate-900">{formatCurrency(ing.total)}</span>
                                  </div>
                                ))}
                              </div>
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
