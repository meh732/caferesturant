import { Order, Expense, SalaryPayment, Recipe, RawMaterial, WarehouseStock, computeIngredientCostAndQty, normalizePersianText } from './db';

export interface FinancialMetrics {
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  totalInvoices: number;
  avgInvoiceValue: number;

  // COGS / Food Cost
  cogs: number;
  foodCostPercentage: number;
  grossProfit: number;
  grossMarginPercentage: number;

  // Capital / Inventory Acquisitions (Current Assets & Outflows)
  totalPurchases: number; // جمع کل خریدهای دوره (خروج نقدینگی / تأمین)
  inventoryValuation: number; // ارزش ریالی کل موجودی انبار (دارایی جاری)

  // Operating Expenses
  laborCosts: number;
  operatingExpenses: number;
  totalOperationalCosts: number;

  // Final Net Results
  netProfit: number;
  netProfitMarginPercentage: number;

  // Inventory Risks
  negativeStockCount: number;
}

/**
 * Calculates complete, standardized P&L and financial metrics for a given evaluation period.
 * Strict Accounting Rule: Material purchase invoices are capital inventory acquisitions (Assets),
 * and MUST NOT be subtracted directly in Profit & Loss. Only COGS (consumed ingredients in sold items)
 * is subtracted as cost of sales.
 */
export function calculateFinancialMetrics(params: {
  orders: Order[];
  expenses: Expense[];
  salaries: SalaryPayment[];
  recipes: Recipe[];
  rawMaterials: RawMaterial[];
  warehouseStocks: WarehouseStock[];
}): FinancialMetrics {
  const { orders, expenses, salaries, recipes, rawMaterials, warehouseStocks } = params;

  // Filter only paid orders
  const paidOrders = orders.filter(o => o.status === 'paid');

  // 1. Revenue Calculations
  const grossSales = paidOrders.reduce((sum, o) => sum + (o.subtotal || o.total), 0);
  const totalDiscounts = paidOrders.reduce((sum, o) => sum + (o.discountValue || 0), 0);
  const netSales = paidOrders.reduce((sum, o) => sum + o.total, 0);
  const totalInvoices = paidOrders.length;
  const avgInvoiceValue = totalInvoices > 0 ? Math.round(netSales / totalInvoices) : 0;

  // 2. COGS Calculation based EXCLUSIVELY on ingredients consumed in sold menu items (BOM / Recipes)
  const cogs = paidOrders.reduce((sum, order) => {
    if (order.cogsAmount && order.cogsAmount > 0) {
      return sum + order.cogsAmount;
    }

    // Fallback per-item calculation if order.cogsAmount was not stored at order time
    let orderCogs = 0;
    (order.items || []).forEach(item => {
      const cleanName = normalizePersianText(item.name || '');
      const recipe = recipes.find(r => 
        Number(r.menuItemId) === Number(item.menuItemId) || 
        normalizePersianText(r.menuItemName) === cleanName ||
        normalizePersianText(r.menuItemName).includes(cleanName)
      );

      if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
        let singleItemCost = 0;
        recipe.ingredients.forEach(ing => {
          const mat = rawMaterials.find(m => m.id === ing.materialId);
          const unitPrice = mat ? (mat.weightedAveragePrice || mat.unitPrice || ing.unitCost || 0) : (ing.unitCost || 0);
          const { totalCost } = computeIngredientCostAndQty(ing.quantity, ing.unit, unitPrice, mat?.unit);
          singleItemCost += totalCost;
        });
        singleItemCost += (recipe.overheadCost || 0);
        orderCogs += (singleItemCost * item.quantity);
      } else {
        // Fallback estimate (25% estimated COGS for sold items without explicitly mapped recipes)
        orderCogs += ((item.price || 0) * (item.quantity || 1) * 0.25);
      }
    });

    return sum + Math.round(orderCogs);
  }, 0);

  // Food Cost % and Gross Profit
  const foodCostPercentage = netSales > 0 ? (cogs / netSales) * 100 : 0;
  const grossProfit = netSales - cogs;
  const grossMarginPercentage = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

  // 3. Raw Material Purchase Invoices in this period (Liquidity outflow / Procurement monitoring - CURRENT ASSET)
  const totalPurchases = expenses
    .filter(e => e.type === 'material')
    .reduce((sum, e) => sum + e.amount, 0);

  // 4. Valuation of total physical goods currently in stock across all warehouses (CURRENT ASSET)
  const inventoryValuation = rawMaterials.reduce((sum, mat) => {
    if (!mat.id) return sum;
    const stocks = warehouseStocks.filter(s => s.materialId === mat.id);
    const currentQty = stocks.reduce((acc, s) => acc + s.quantity, 0);
    const unitPrice = mat.weightedAveragePrice || mat.unitPrice || 0;
    // Only count positive physical stock for asset valuation
    if (currentQty > 0 && unitPrice > 0) {
      return sum + Math.round(currentQty * unitPrice);
    }
    return sum;
  }, 0);

  // 5. Labor Costs
  const laborCosts = salaries.reduce((sum, s) => sum + s.totalPaid, 0);

  // 6. Operating Expenses (rent, utilities, packaging, admin)
  const operatingExpenses = expenses
    .filter(e => e.type === 'general_expense')
    .reduce((sum, e) => sum + e.amount, 0);

  // 7. Total Operational Costs
  const totalOperationalCosts = cogs + laborCosts + operatingExpenses;

  // 8. Net Profit
  const netProfit = netSales - totalOperationalCosts;
  const netProfitMarginPercentage = netSales > 0 ? (netProfit / netSales) * 100 : 0;

  // 9. Critical Stock Deficit Count
  let negativeStockCount = 0;
  rawMaterials.forEach(mat => {
    if (!mat.id) return;
    const stocks = warehouseStocks.filter(s => s.materialId === mat.id);
    const totalQty = stocks.reduce((sum, s) => sum + s.quantity, 0);
    const minAlert = mat.minStockAlert || 0;
    if (totalQty < 0 || (minAlert > 0 && totalQty <= minAlert)) {
      negativeStockCount++;
    }
  });

  return {
    grossSales,
    totalDiscounts,
    netSales,
    totalInvoices,
    avgInvoiceValue,
    cogs,
    foodCostPercentage,
    grossProfit,
    grossMarginPercentage,
    totalPurchases,
    inventoryValuation,
    laborCosts,
    operatingExpenses,
    totalOperationalCosts,
    netProfit,
    netProfitMarginPercentage,
    negativeStockCount,
  };
}
