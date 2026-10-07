import React, { useState, useEffect, useMemo } from 'react';
import { db, MenuItem, RawMaterial, Recipe, RecipeIngredient, calculateRecipeCost } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Utensils, Plus, Trash2, Save, AlertCircle, TrendingUp, DollarSign, Percent, PieChart, Sparkles } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRecipe?: Recipe | null;
  targetMenuItemId?: number | null;
}

export default function RecipeModal({
  isOpen,
  onClose,
  initialRecipe,
  targetMenuItemId,
}: RecipeModalProps) {
  const menuItems = useLiveQuery(() => db.menuItems.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const existingRecipes = useLiveQuery(() => db.recipes.toArray()) || [];

  const [menuItemId, setMenuItemId] = useState<number | undefined>(undefined);
  const [overheadCost, setOverheadCost] = useState<number>(0);
  const [ingredients, setIngredients] = useState<Array<{
    materialId: number;
    quantity: number;
    notes?: string;
  }>>([]);
  const [error, setError] = useState<string | null>(null);

  // Materials lookup map
  const materialsMap = useMemo(() => {
    const map = new Map<number, RawMaterial>();
    rawMaterials.forEach(m => {
      if (m.id) map.set(m.id, m);
    });
    return map;
  }, [rawMaterials]);

  // Selected Menu Item
  const selectedMenuItem = useMemo(() => {
    return menuItems.find(m => m.id === menuItemId);
  }, [menuItems, menuItemId]);

  useEffect(() => {
    if (initialRecipe) {
      setMenuItemId(initialRecipe.menuItemId);
      setOverheadCost(initialRecipe.overheadCost || 0);
      setIngredients(
        initialRecipe.ingredients.map(ing => ({
          materialId: ing.materialId,
          quantity: ing.quantity,
          notes: ing.notes
        }))
      );
    } else if (targetMenuItemId) {
      setMenuItemId(targetMenuItemId);
      const existing = existingRecipes.find(r => r.menuItemId === targetMenuItemId);
      if (existing) {
        setOverheadCost(existing.overheadCost || 0);
        setIngredients(
          existing.ingredients.map(ing => ({
            materialId: ing.materialId,
            quantity: ing.quantity,
            notes: ing.notes
          }))
        );
      } else {
        setOverheadCost(5000);
        setIngredients([]);
      }
    } else {
      if (menuItems.length > 0) {
        // Pick first menu item without recipe, or first
        const recipeMenuIds = new Set(existingRecipes.map(r => r.menuItemId));
        const itemWithoutRecipe = menuItems.find(m => m.id && !recipeMenuIds.has(m.id));
        setMenuItemId(itemWithoutRecipe?.id || menuItems[0]?.id);
      }
      setOverheadCost(5000);
      setIngredients([]);
    }
    setError(null);
  }, [initialRecipe, targetMenuItemId, isOpen, menuItems.length]);

  if (!isOpen) return null;

  const handleAddIngredientRow = () => {
    const usedIds = new Set(ingredients.map(i => i.materialId));
    const available = rawMaterials.find(m => m.id && !usedIds.has(m.id));
    if (available && available.id) {
      setIngredients([...ingredients, { materialId: available.id, quantity: 0.1 }]);
    } else if (rawMaterials.length > 0 && rawMaterials[0].id) {
      setIngredients([...ingredients, { materialId: rawMaterials[0].id, quantity: 0.1 }]);
    }
  };

  const handleUpdateIngredient = (index: number, updates: Partial<{ materialId: number; quantity: number; notes: string }>) => {
    setIngredients(ingredients.map((item, idx) => idx === index ? { ...item, ...updates } : item));
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, idx) => idx !== index));
  };

  // Real-time calculation of costs
  const calculatedIngredients: RecipeIngredient[] = ingredients.map(ing => {
    const mat = materialsMap.get(ing.materialId);
    const unitCost = mat ? (mat.weightedAveragePrice || mat.unitPrice || 0) : 0;
    const qty = Number(ing.quantity) || 0;
    return {
      materialId: ing.materialId,
      materialName: mat ? mat.name : 'ماده اولیه نامشخص',
      quantity: qty,
      unit: mat ? mat.unit : 'کیلوگرم',
      unitCost,
      itemTotalCost: Math.round(qty * unitCost),
      notes: ing.notes
    };
  });

  const rawIngredientsCost = calculatedIngredients.reduce((sum, i) => sum + i.itemTotalCost, 0);
  const totalRecipeCost = Math.round(rawIngredientsCost + (Number(overheadCost) || 0));
  const sellingPrice = selectedMenuItem ? selectedMenuItem.price : 0;
  const grossProfit = Math.max(0, sellingPrice - totalRecipeCost);
  const profitMarginPercent = sellingPrice > 0 ? ((grossProfit / sellingPrice) * 100).toFixed(1) : '0';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!menuItemId || !selectedMenuItem) {
      setError('لطفا غذای منو را انتخاب کنید.');
      return;
    }

    if (calculatedIngredients.length === 0) {
      setError('لطفا حداقل یک ماده اولیه برای فرمول تولید تعریف کنید.');
      return;
    }

    try {
      const existing = await db.recipes.where('menuItemId').equals(menuItemId).first();

      const recipeData: Omit<Recipe, 'id'> = {
        menuItemId,
        menuItemName: selectedMenuItem.name,
        yieldQuantity: 1,
        ingredients: calculatedIngredients,
        overheadCost: Number(overheadCost) || 0,
        totalCost: totalRecipeCost,
        isActive: true,
        updatedAt: new Date(),
      };

      if (existing?.id) {
        await db.recipes.update(existing.id, recipeData);
      } else {
        await db.recipes.add(recipeData as Recipe);
      }

      onClose();
    } catch (err) {
      console.error(err);
      setError('خطا در ذخیره‌سازی فرمول تولید.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto relative max-h-[92vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Utensils size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              فرمول تولید و محاسبه قیمت تمام‌شده (BOM)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تعریف مواد اولیه مصرفی هر پرس غذا جهت کسر خودکار از انبار پخت و محاسبه سود ناخالص واقعی
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 shrink-0">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden gap-4">
          
          {/* Top Selection & Live KPI Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">انتخاب غذا یا نوشیدنی منو *</label>
              <select
                value={menuItemId || ''}
                onChange={e => setMenuItemId(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-bold outline-none"
                required
              >
                {menuItems.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({formatCurrency(item.price)})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 grid grid-cols-3 gap-2 text-center">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block">قیمت فروش منو</span>
                <span className="text-xs sm:text-sm font-bold text-slate-800 font-mono">
                  {formatCurrency(sellingPrice)}
                </span>
              </div>

              <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                <span className="text-[10px] text-amber-800 font-bold block">قیمت تمام‌شده (COGS)</span>
                <span className="text-xs sm:text-sm font-bold text-amber-900 font-mono">
                  {formatCurrency(totalRecipeCost)}
                </span>
              </div>

              <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                <span className="text-[10px] text-emerald-800 font-bold block">
                  سود ناخالص ({profitMarginPercent}%)
                </span>
                <span className="text-xs sm:text-sm font-bold text-emerald-900 font-mono">
                  {formatCurrency(grossProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* Recipe Ingredients Header */}
          <div className="flex items-center justify-between shrink-0 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">مواد اولیه مصرفی در هر ۱ پرس</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                {ingredients.length} قلم
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddIngredientRow}
              className="py-1.5 px-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus size={15} />
              <span>افزودن ماده اولیه</span>
            </button>
          </div>

          {/* Ingredients Table (Scrollable) */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl min-h-[160px]">
            {ingredients.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <Utensils size={36} className="mb-2 text-slate-300" />
                <p className="text-xs font-medium">هنوز هیچ ماده اولیه‌ای به فرمول تولید اضافه نشده است.</p>
                <button
                  type="button"
                  onClick={handleAddIngredientRow}
                  className="mt-3 py-1.5 px-4 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-sm hover:bg-indigo-700 cursor-pointer"
                >
                  افزودن اولین ماده اولیه
                </button>
              </div>
            ) : (
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">نام ماده اولیه (از انبار)</th>
                    <th className="p-3 text-center">مقدار مصرف در پرس</th>
                    <th className="p-3 text-center">واحد</th>
                    <th className="p-3 text-center">نرخ خرید هر واحد</th>
                    <th className="p-3 text-left">هزینه در پرس</th>
                    <th className="p-3 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ingredients.map((item, idx) => {
                    const mat = materialsMap.get(item.materialId);
                    const calcItem = calculatedIngredients[idx];

                    return (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3">
                          <select
                            value={item.materialId}
                            onChange={e => handleUpdateIngredient(idx, { materialId: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-xs outline-none"
                          >
                            {rawMaterials.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.code})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0.001"
                            value={item.quantity || ''}
                            onChange={e => handleUpdateIngredient(idx, { quantity: parseFloat(e.target.value) || 0 })}
                            placeholder="0.2"
                            className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-center font-bold text-xs outline-none"
                            dir="ltr"
                            required
                          />
                        </td>
                        <td className="p-3 text-center text-slate-500 font-medium">
                          {mat?.unit || '-'}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-600">
                          {formatCurrency(calcItem?.unitCost || 0)}
                        </td>
                        <td className="p-3 text-left font-mono text-slate-800 font-bold">
                          {formatCurrency(calcItem?.itemTotalCost || 0)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom Bar: Variable Overhead Cost & Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0 p-3 bg-slate-50 rounded-2xl border border-slate-200 items-center">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                هزینه سربار متغیر پخت، بسته‌بندی، گاز و ظروف در هر پرس (تومان)
              </label>
              <input
                type="number"
                value={overheadCost || ''}
                onChange={e => setOverheadCost(parseFloat(e.target.value) || 0)}
                placeholder="مثال: 8000"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono outline-none"
                dir="ltr"
              />
            </div>

            <div className="text-left space-y-1">
              <div className="flex justify-between text-xs text-slate-600">
                <span>مجموع هزینه مواد اولیه:</span>
                <span className="font-mono font-bold">{formatCurrency(rawIngredientsCost)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-800 font-bold pt-1 border-t border-slate-200">
                <span>قیمت تمام‌شده کل هر پرس:</span>
                <span className="font-mono text-amber-900">{formatCurrency(totalRecipeCost)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={ingredients.length === 0}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-indigo-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Save size={16} />
              <span>ذخیره فرمول تولید</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
