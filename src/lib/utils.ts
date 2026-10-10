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

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

export const numberToPersianWords = (num: number): string => {
  if (isNaN(num) || num === 0) return 'صفر تومان';
  const isNegative = num < 0;
  let absNum = Math.floor(Math.abs(num));

  const chunks: number[] = [];
  while (absNum > 0) {
    chunks.push(absNum % 1000);
    absNum = Math.floor(absNum / 1000);
  }

  const chunkToWords = (n: number): string => {
    const parts: string[] = [];
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (h > 0) parts.push(HUNDREDS[h]);
    if (r > 0) {
      if (r < 10) {
        parts.push(ONES[r]);
      } else if (r >= 10 && r < 20) {
        parts.push(TEENS[r - 10]);
      } else {
        const t = Math.floor(r / 10);
        const u = r % 10;
        parts.push(TENS[t]);
        if (u > 0) parts.push(ONES[u]);
      }
    }
    return parts.join(' و ');
  };

  const words: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (chunk === 0) continue;
    const chunkWord = chunkToWords(chunk);
    const scale = SCALES[i];
    if (scale) {
      words.push(`${chunkWord} ${scale}`);
    } else {
      words.push(chunkWord);
    }
  }

  return (isNegative ? 'منفی ' : '') + words.join(' و ') + ' تومان';
};
