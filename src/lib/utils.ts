import { db } from './db';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('fa-IR').format(amount) + ' تومان';
};

export const exportDB = async (): Promise<string> => {
  const data = {
    categories: await db.categories.toArray(),
    menuItems: await db.menuItems.toArray(),
    orders: await db.orders.toArray(),
    settings: await db.settings.toArray(),
    customers: await db.customers.toArray(),
    users: await db.users.toArray(),
    expenses: await db.expenses.toArray(),
    employees: await db.employees.toArray(),
    salaryPayments: await db.salaryPayments.toArray(),
  };
  return JSON.stringify(data);
};

export const importDB = async (jsonString: string): Promise<void> => {
  try {
    const data = JSON.parse(jsonString);
    await db.transaction('rw', [
      db.categories,
      db.menuItems,
      db.orders,
      db.settings,
      db.customers,
      db.users,
      db.expenses,
      db.employees,
      db.salaryPayments
    ], async () => {
      // Clear existing
      await db.categories.clear();
      await db.menuItems.clear();
      await db.orders.clear();
      await db.settings.clear();
      await db.customers.clear();
      await db.users.clear();
      await db.expenses.clear();
      await db.employees.clear();
      await db.salaryPayments.clear();

      // Import new
      if (data.categories) await db.categories.bulkAdd(data.categories);
      if (data.menuItems) await db.menuItems.bulkAdd(data.menuItems);
      if (data.orders) await db.orders.bulkAdd(data.orders);
      if (data.settings) await db.settings.bulkAdd(data.settings);
      if (data.customers) await db.customers.bulkAdd(data.customers);
      if (data.users) await db.users.bulkAdd(data.users);
      if (data.expenses) await db.expenses.bulkAdd(data.expenses);
      if (data.employees) await db.employees.bulkAdd(data.employees);
      if (data.salaryPayments) await db.salaryPayments.bulkAdd(data.salaryPayments);
    });
  } catch (err) {
    console.error('Failed to import database', err);
    throw new Error('فرمت فایل بکاپ نامعتبر است.');
  }
};
