import { 
  db, ChartOfAccount, JournalEntry, JournalEntryLine, AccountLevel, AccountNature,
  Order, Expense, Cheque, SalaryPayment, Employee, BankAccount, CashBox
} from './db';
import { formatCurrency } from './utils';
import * as XLSX from 'xlsx';

// ============================================================================
// 1. CHART OF ACCOUNTS (کدینگ حساب‌ها)
// ============================================================================

export interface AccountTreeNode extends ChartOfAccount {
  children?: AccountTreeNode[];
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

/**
 * دریافت لیست کامل سرفصل‌های حسابداری با مانده تجمیعی لحظه‌ای
 */
export async function getChartOfAccountsWithBalances(): Promise<ChartOfAccount[]> {
  const accounts = await db.chartOfAccounts.toArray();
  return accounts.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/**
 * افزودن حساب جدید در کدینگ حسابداری
 */
export async function addAccount(params: {
  parentCode?: string;
  code: string;
  name: string;
  level: AccountLevel;
  nature: AccountNature;
  description?: string;
}): Promise<number> {
  const existing = await db.chartOfAccounts.where('code').equals(params.code.trim()).first();
  if (existing) {
    throw new Error(`حسابی با کد ${params.code} قبلاً در سیستم ثبت شده است.`);
  }

  const id = await db.chartOfAccounts.add({
    code: params.code.trim(),
    name: params.name.trim(),
    level: params.level,
    parentCode: params.parentCode ? params.parentCode.trim() : undefined,
    nature: params.nature,
    description: params.description?.trim(),
    isSystem: false,
    isActive: true,
    createdAt: new Date()
  });

  return id as number;
}

/**
 * ویرایش مشخصات حساب
 */
export async function updateAccount(id: number, params: {
  name: string;
  nature: AccountNature;
  description?: string;
  isActive?: boolean;
}): Promise<void> {
  const acc = await db.chartOfAccounts.get(id);
  if (!acc) throw new Error('حساب مورد نظر یافت نشد.');

  await db.chartOfAccounts.update(id, {
    name: params.name.trim(),
    nature: params.nature,
    description: params.description?.trim(),
    isActive: params.isActive !== undefined ? params.isActive : acc.isActive
  });
}

/**
 * حذف حساب با بررسی عدم استفاده در اسناد مالی
 */
export async function deleteAccount(id: number): Promise<void> {
  const acc = await db.chartOfAccounts.get(id);
  if (!acc) throw new Error('حساب مورد نظر یافت نشد.');

  if (acc.isSystem) {
    throw new Error('سرفصل‌های سیستمی و پایه قابل حذف نیستند.');
  }

  // بررسی فرزندان در درخت
  const childrenCount = await db.chartOfAccounts.where('parentCode').equals(acc.code).count();
  if (childrenCount > 0) {
    throw new Error('این حساب دارای زیرمجموعه است؛ ابتدا زیرمجموعه‌های آن را حذف یا جابجا فرمایید.');
  }

  // بررسی استفاده در آرتیکل اسناد
  const allEntries = await db.journalEntries.toArray();
  const isUsed = allEntries.some(entry => 
    entry.lines.some(l => l.accountCode === acc.code)
  );

  if (isUsed) {
    throw new Error(`حساب «${acc.name}» در اسناد حسابداری دارای گردش مالی است و امکان حذف آن وجود ندارد.`);
  }

  await db.chartOfAccounts.delete(id);
}

// ============================================================================
// 2. JOURNAL ENTRIES & ENGINE (موتور اسناد مالی دوبل)
// ============================================================================

/**
 * دریافت شماره سند حسابداری بعدی
 */
export async function getNextJournalEntryNumber(): Promise<number> {
  const last = await db.journalEntries.orderBy('entryNumber').last();
  return last ? (last.entryNumber + 1) : 1;
}

/**
 * اعتبارسنجی تراز بودن سند حسابداری
 */
export function validateJournalLines(lines: JournalEntryLine[]): { isValid: boolean; diff: number; error?: string } {
  if (!lines || lines.length < 2) {
    return { isValid: false, diff: 0, error: 'سند حسابداری باید حداقل دارای ۲ آرتیکل (یک بدهکار و یک بستانکار) باشد.' };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    if (!line.accountCode || !line.accountName) {
      return { isValid: false, diff: 0, error: 'تمامی ردیف‌ها باید دارای کد و عنوان حساب معتبر باشند.' };
    }
    totalDebit += (Number(line.debit) || 0);
    totalCredit += (Number(line.credit) || 0);
  }

  const diff = Math.round(totalDebit - totalCredit);
  if (Math.abs(diff) > 0) {
    return { 
      isValid: false, 
      diff, 
      error: `سند تراز نیست! اختلاف بدهکار و بستانکار: ${formatCurrency(Math.abs(diff))} تومان` 
    };
  }

  if (totalDebit <= 0) {
    return { isValid: false, diff: 0, error: 'مبلغ سند باید بیشتر از صفر باشد.' };
  }

  return { isValid: true, diff: 0 };
}

/**
 * ثبت سند دستی حسابداری با کنترل توازن
 */
export async function createManualJournalEntry(params: {
  date: Date;
  description: string;
  lines: JournalEntryLine[];
  status?: 'draft' | 'permanent';
  createdBy?: string;
}): Promise<number> {
  const val = validateJournalLines(params.lines);
  if (!val.isValid) {
    throw new Error(val.error);
  }

  const entryNumber = await getNextJournalEntryNumber();
  const totalDebit = params.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = params.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  const id = await db.journalEntries.add({
    entryNumber,
    date: params.date,
    description: params.description.trim(),
    status: params.status || 'permanent',
    referenceType: 'manual',
    createdBy: params.createdBy || 'حسابدار',
    totalDebit,
    totalCredit,
    lines: params.lines.map((l, idx) => ({
      ...l,
      id: l.id || `line_${idx}_${Date.now()}`,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0
    })),
    createdAt: new Date()
  });

  return id as number;
}

/**
 * ویرایش سند حسابداری
 */
export async function updateJournalEntry(id: number, params: {
  date: Date;
  description: string;
  lines: JournalEntryLine[];
  status?: 'draft' | 'permanent';
}): Promise<void> {
  const val = validateJournalLines(params.lines);
  if (!val.isValid) {
    throw new Error(val.error);
  }

  const totalDebit = params.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = params.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  await db.journalEntries.update(id, {
    date: params.date,
    description: params.description.trim(),
    status: params.status || 'permanent',
    totalDebit,
    totalCredit,
    lines: params.lines.map((l, idx) => ({
      ...l,
      id: l.id || `line_${idx}_${Date.now()}`,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0
    }))
  });
}

/**
 * حذف سند حسابداری
 */
export async function deleteJournalEntry(id: number): Promise<void> {
  await db.journalEntries.delete(id);
}

// ============================================================================
// 3. AUTO-JOURNAL ENGINE FOR OPERATIONAL EVENTS
// ============================================================================

/**
 * حذف سند حسابداری مرتبط با فاکتور فروش
 */
export async function deleteSaleJournalEntry(orderId: number): Promise<void> {
  const existingEntries = await db.journalEntries.where('referenceType').equals('pos')
    .and(e => e.referenceId === orderId || e.referenceId === String(orderId)).toArray();
  for (const entry of existingEntries) {
    if (entry.id) {
      await db.journalEntries.delete(entry.id);
    }
  }
}

/**
 * صدور یا بروزرسانی خودکار سند حسابداری دوبل برای فاکتور فروش
 */
export async function recordSaleJournalEntry(order: Order): Promise<number | null> {
  if (!order || order.status === 'cancelled') {
    if (order?.id) {
      await deleteSaleJournalEntry(order.id);
    }
    return null;
  }

  const existing = await db.journalEntries.where('referenceType').equals('pos')
    .and(e => e.referenceId === order.id || e.referenceId === String(order.id)).first();

  const total = order.total || 0;
  if (total <= 0) {
    if (existing?.id) await db.journalEntries.delete(existing.id);
    return null;
  }

  const lines: JournalEntryLine[] = [];
  const taxAmount = order.taxAmount || 0;
  const discountAmount = order.discountType === 'amount' 
    ? (order.discountValue || 0) 
    : (order.discountType === 'percent' ? Math.round(((order.subtotal || total) * (order.discountValue || 0)) / 100) : 0);

  // بدهکار: تسویه وجه (بانک، صندوق، یا حساب مشتری)
  if (order.paymentMethod === 'card') {
    lines.push({
      accountCode: '1002',
      accountName: 'حساب‌های بانکی و پوز',
      debit: total,
      credit: 0,
      description: `دریافت وجه فاکتور فروش #${order.invoiceNumber} از طریق کارتخوان`,
      detailName: order.bankAccountName || 'دستگاه پوز'
    });
  } else if (order.paymentMethod === 'cash') {
    lines.push({
      accountCode: '1001',
      accountName: 'صندوق‌های فروشگاه و سالن',
      debit: total,
      credit: 0,
      description: `دریافت نقدی وجه فاکتور فروش #${order.invoiceNumber}`,
      detailName: order.cashBoxName || 'صندوق سالن'
    });
  } else if (order.paymentMethod === 'mixed') {
    const cardAmt = order.cardAmount || 0;
    const cashAmt = order.cashAmount || 0;
    if (cardAmt > 0) {
      lines.push({
        accountCode: '1002',
        accountName: 'حساب‌های بانکی و پوز',
        debit: cardAmt,
        credit: 0,
        description: `بخش کارتخوان فاکتور فروش #${order.invoiceNumber}`,
        detailName: order.bankAccountName || 'دستگاه پوز'
      });
    }
    if (cashAmt > 0) {
      lines.push({
        accountCode: '1001',
        accountName: 'صندوق‌های فروشگاه و سالن',
        debit: cashAmt,
        credit: 0,
        description: `بخش نقدی فاکتور فروش #${order.invoiceNumber}`,
        detailName: order.cashBoxName || 'صندوق سالن'
      });
    }
  } else if (order.paymentMethod === 'wallet') {
    lines.push({
      accountCode: '3301',
      accountName: 'پیش‌دریافت سفارشات و بیعانه',
      debit: total,
      credit: 0,
      description: `کسر از کیف پول باشگاه مشتریان بابت فاکتور فروش #${order.invoiceNumber}`,
      detailName: order.customerName || order.customerPhone || 'عضو باشگاه مشتریان'
    });
  } else if (order.paymentMethod === 'cheque') {
    lines.push({
      accountCode: '1101',
      accountName: 'چک‌های دریافتنی در جریان وصول',
      debit: total,
      credit: 0,
      description: `چک صیادی دریافتی بابت فاکتور فروش #${order.invoiceNumber}`,
      detailName: order.chequeDrawer || order.customerName || 'مشتری'
    });
  } else {
    // نسیه یا حساب دفتری مشتری
    lines.push({
      accountCode: '1201',
      accountName: 'بستانکاری و مطالبات از خریداران و مشتریان',
      debit: total,
      credit: 0,
      description: `حساب دفتری (نسیه) فاکتور فروش #${order.invoiceNumber}`,
      detailName: order.customerName || order.customerPhone || 'مشتری آزاد'
    });
  }

  // بدهکار: تخفیف (در صورت وجود)
  if (discountAmount > 0) {
    lines.push({
      accountCode: '5002',
      accountName: 'تخفیفات اعطایی به مشتریان (کاهنده)',
      debit: discountAmount,
      credit: 0,
      description: `تخفیف فاکتور فروش #${order.invoiceNumber}`
    });
  }

  // بستانکار: مالیات ارزش افزوده (در صورت وجود)
  if (taxAmount > 0) {
    lines.push({
      accountCode: '3202',
      accountName: 'مالیات بر ارزش افزوده پرداختنی',
      debit: 0,
      credit: taxAmount,
      description: `مالیات ارزش افزوده فاکتور #${order.invoiceNumber}`
    });
  }

  // بستانکار: درآمد فروش غذا و سفارشات
  const netSalesRevenue = total + discountAmount - taxAmount;
  lines.push({
    accountCode: '5001',
    accountName: 'درآمد حاصل از فروش غذا و سفارشات',
    debit: 0,
    credit: netSalesRevenue,
    description: `فروش فاکتور #${order.invoiceNumber} (${order.tableNumber ? `میز ${order.tableNumber}` : 'بیرون‌بر'})`
  });

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  if (existing && existing.id) {
    await db.journalEntries.update(existing.id, {
      date: new Date(order.createdAt),
      description: `فروش فاکتور #${order.invoiceNumber} (${order.customerName ? `مشتری: ${order.customerName}` : 'مشتری حضوری'})`,
      totalDebit,
      totalCredit,
      lines
    });
    return existing.id;
  }

  const entryNumber = await getNextJournalEntryNumber();
  const id = await db.journalEntries.add({
    entryNumber,
    date: new Date(order.createdAt),
    description: `فروش فاکتور #${order.invoiceNumber} (${order.customerName ? `مشتری: ${order.customerName}` : 'مشتری حضوری'})`,
    status: 'permanent',
    referenceType: 'pos',
    referenceId: order.id,
    createdBy: 'صندوق فروش',
    totalDebit,
    totalCredit,
    lines,
    createdAt: new Date()
  });

  return id as number;
}

/**
 * حذف سند حسابداری مرتبط با فاکتور هزینه و خرید
 */
export async function deleteExpenseJournalEntry(expenseId: number): Promise<void> {
  const existingEntries = await db.journalEntries.where('referenceType').equals('expense')
    .and(e => e.referenceId === expenseId || e.referenceId === String(expenseId)).toArray();
  for (const entry of existingEntries) {
    if (entry.id) {
      await db.journalEntries.delete(entry.id);
    }
  }
}

/**
 * حذف اسناد حسابداری مرتبط با چک
 */
export async function deleteChequeJournalEntries(chequeId: number): Promise<void> {
  const existingEntries = await db.journalEntries.where('referenceType').equals('cheque')
    .and(e => e.referenceId === chequeId || e.referenceId === String(chequeId)).toArray();
  for (const entry of existingEntries) {
    if (entry.id) {
      await db.journalEntries.delete(entry.id);
    }
  }
}

/**
 * صدور یا بروزرسانی خودکار سند حسابداری دوبل برای فاکتور هزینه و خرید
 */
export async function recordExpenseJournalEntry(expense: Expense): Promise<number | null> {
  if (!expense || expense.amount <= 0) return null;

  const existing = await db.journalEntries.where('referenceType').equals('expense')
    .and(e => e.referenceId === expense.id || e.referenceId === String(expense.id)).first();

  const lines: JournalEntryLine[] = [];

  // ۱. بدهکار: سرفصل هزینه یا موجودی انبار بر اساس نوع
  let debitAccountCode = '7501';
  let debitAccountName = 'سایر هزینه‌های جاری و استهلاک';

  if (expense.type === 'material' || expense.materialId) {
    debitAccountCode = '1301';
    debitAccountName = 'موجودی انبار مرکزی و تدارکات';
  } else if (expense.category?.includes('حقوق') || expense.category?.includes('دستمزد')) {
    debitAccountCode = '7001';
    debitAccountName = 'حقوق و دستمزد پایه پرسنل';
  } else if (expense.category?.includes('اجاره')) {
    debitAccountCode = '7101';
    debitAccountName = 'هزینه اجاره محل کسب';
  } else if (expense.category?.includes('قبض') || expense.category?.includes('برق') || expense.category?.includes('گاز')) {
    debitAccountCode = '7201';
    debitAccountName = 'قبوض آب، برق، گاز و اینترنت';
  } else if (expense.category?.includes('تبلیغ')) {
    debitAccountCode = '7301';
    debitAccountName = 'تبلیغات آنلاین و محیطی و منو';
  } else if (expense.category?.includes('پیک') || expense.category?.includes('حمل')) {
    debitAccountCode = '7401';
    debitAccountName = 'هزینه پیک موتوری و حمل سفارشات';
  }

  lines.push({
    accountCode: debitAccountCode,
    accountName: debitAccountName,
    debit: expense.amount,
    credit: 0,
    description: expense.title || expense.note || `هزینه ${expense.category}`,
    detailName: expense.supplierOrPerson
  });

  // ۲. بستانکار: منبع پرداخت (بانک، صندوق، یا بستانکاران تجاری)
  if (expense.status === 'paid' && expense.paymentMethod === 'card') {
    lines.push({
      accountCode: '1002',
      accountName: 'حساب‌های بانکی و پوز',
      debit: 0,
      credit: expense.amount,
      description: `پرداخت هزینه از حساب بانکی`,
      detailName: expense.bankAccountName
    });
  } else if (expense.status === 'paid' && expense.paymentMethod === 'cash') {
    lines.push({
      accountCode: '1001',
      accountName: 'صندوق‌های فروشگاه و سالن',
      debit: 0,
      credit: expense.amount,
      description: `پرداخت نقدی هزینه از صندوق`,
      detailName: expense.cashBoxName
    });
  } else if (expense.paymentMethod === 'cheque') {
    lines.push({
      accountCode: '3101',
      accountName: 'چک‌های صادره سررسیدنشده',
      debit: 0,
      credit: expense.amount,
      description: `صدور چک بابت ${expense.title || expense.category}`,
      detailName: expense.supplierOrPerson
    });
  } else {
    // نسیه / بستانکاران تجاری
    lines.push({
      accountCode: '3001',
      accountName: 'بستانکاران تجاری و فروشندگان مواد اولیه',
      debit: 0,
      credit: expense.amount,
      description: `بستانکاری تأمین‌کننده بابت ${expense.title || expense.category}`,
      detailName: expense.supplierOrPerson
    });
  }

  if (existing && existing.id) {
    await db.journalEntries.update(existing.id, {
      date: new Date(expense.date),
      description: `سند هزینه/خرید #${expense.id}: ${expense.title || expense.category} (${expense.supplierOrPerson || 'عمومی'})`,
      totalDebit: expense.amount,
      totalCredit: expense.amount,
      lines
    });
    return existing.id;
  }

  const entryNumber = await getNextJournalEntryNumber();
  const id = await db.journalEntries.add({
    entryNumber,
    date: new Date(expense.date),
    description: `سند هزینه/خرید #${expense.id}: ${expense.title || expense.category} (${expense.supplierOrPerson || 'عمومی'})`,
    status: 'permanent',
    referenceType: 'expense',
    referenceId: expense.id,
    createdBy: 'ثبت هزینه',
    totalDebit: expense.amount,
    totalCredit: expense.amount,
    lines,
    createdAt: new Date()
  });

  return id as number;
}

/**
 * صدور خودکار سند حسابداری دوبل برای چک‌های دریافتی / وصولی / واگذاری / برگشتی
 */
export async function recordChequeJournalEntry(cheque: Cheque, event: 'received' | 'cleared' | 'transferred' | 'bounced'): Promise<number | null> {
  if (!cheque || cheque.amount <= 0) return null;

  const lines: JournalEntryLine[] = [];
  let description = '';

  if (event === 'received') {
    // بدهکار: چک‌های در جریان وصول | بستانکار: مشتریان
    lines.push({
      accountCode: '1101',
      accountName: 'چک‌های دریافتنی در جریان وصول',
      debit: cheque.amount,
      credit: 0,
      description: `دریافت چک صیادی #${cheque.chequeNumber} از ${cheque.drawerName}`,
      detailName: cheque.drawerName
    });
    lines.push({
      accountCode: '1201',
      accountName: 'بستانکاری و مطالبات از خریداران و مشتریان',
      debit: 0,
      credit: cheque.amount,
      description: `تسویه با چک صیادی #${cheque.chequeNumber}`,
      detailName: cheque.drawerName
    });
    description = `دریافت چک صیادی #${cheque.chequeNumber} به سررسید ${new Date(cheque.dueDate).toLocaleDateString('fa-IR')}`;
  } else if (event === 'cleared') {
    // بدهکار: بانک | بستانکار: چک‌های در جریان وصول
    lines.push({
      accountCode: '1002',
      accountName: 'حساب‌های بانکی و پوز',
      debit: cheque.amount,
      credit: 0,
      description: `وصول چک صیادی #${cheque.chequeNumber} به حساب بانکی`,
      detailName: cheque.bankName
    });
    lines.push({
      accountCode: '1101',
      accountName: 'چک‌های دریافتنی در جریان وصول',
      debit: 0,
      credit: cheque.amount,
      description: `خروج از جریان وصول چک #${cheque.chequeNumber}`,
      detailName: cheque.drawerName
    });
    description = `وصول چک صیادی #${cheque.chequeNumber} در بانک ${cheque.bankName}`;
  } else if (event === 'transferred') {
    // بدهکار: بستانکاران تجاری (خرج چک به تأمین‌کننده) | بستانکار: چک‌های در جریان وصول
    lines.push({
      accountCode: '3001',
      accountName: 'بستانکاران تجاری و فروشندگان مواد اولیه',
      debit: cheque.amount,
      credit: 0,
      description: `واگذاری و خرج چک #${cheque.chequeNumber} به ${cheque.transferredTo}`,
      detailName: cheque.transferredTo
    });
    lines.push({
      accountCode: '1101',
      accountName: 'چک‌های دریافتنی در جریان وصول',
      debit: 0,
      credit: cheque.amount,
      description: `خروج چک واگذارشده #${cheque.chequeNumber}`,
      detailName: cheque.drawerName
    });
    description = `خرج و واگذاری چک صیادی #${cheque.chequeNumber} به ${cheque.transferredTo}`;
  } else if (event === 'bounced') {
    // بدهکار: چک‌های برگشتی | بستانکار: چک‌های در جریان وصول
    lines.push({
      accountCode: '1103',
      accountName: 'چک‌های دریافتنی واخواست‌شده / برگشتی',
      debit: cheque.amount,
      credit: 0,
      description: `برگشت چک #${cheque.chequeNumber} (علت: ${cheque.bounceReason || 'کسری موجودی'})`,
      detailName: cheque.drawerName
    });
    lines.push({
      accountCode: '1101',
      accountName: 'چک‌های دریافتنی در جریان وصول',
      debit: 0,
      credit: cheque.amount,
      description: `برگشت چک از جریان وصول`,
      detailName: cheque.drawerName
    });
    description = `اعلام برگشت چک صیادی #${cheque.chequeNumber} (${cheque.bounceReason || 'کسری موجودی'})`;
  }

  const entryNumber = await getNextJournalEntryNumber();
  const id = await db.journalEntries.add({
    entryNumber,
    date: new Date(),
    description,
    status: 'permanent',
    referenceType: 'cheque',
    referenceId: cheque.id,
    createdBy: 'گردش چک',
    totalDebit: cheque.amount,
    totalCredit: cheque.amount,
    lines,
    createdAt: new Date()
  });

  return id as number;
}

/**
 * همگام‌سازی و صدور اسناد برای تمامی تراکنش‌های تاریخی که سند دوبل ندارند
 */
export async function syncHistoricalJournalEntries(): Promise<{ generatedCount: number }> {
  let count = 0;

  // ۱. فاکتورهای فروش
  const orders = await db.orders.toArray();
  for (const order of orders) {
    if (order.status !== 'cancelled' && (order.total || 0) > 0) {
      const existing = await db.journalEntries.where('referenceType').equals('pos')
        .and(e => e.referenceId === order.id || e.referenceId === String(order.id)).first();
      if (!existing) {
        await recordSaleJournalEntry(order);
        count++;
      }
    }
  }

  // ۲. هزینه‌ها
  const expenses = await db.expenses.toArray();
  for (const exp of expenses) {
    if (exp.amount > 0) {
      const existing = await db.journalEntries.where('referenceType').equals('expense')
        .and(e => e.referenceId === exp.id || e.referenceId === String(exp.id)).first();
      if (!existing) {
        await recordExpenseJournalEntry(exp);
        count++;
      }
    }
  }

  // ۳. چک‌ها
  const cheques = await db.cheques.toArray();
  for (const ch of cheques) {
    if (ch.type === 'received') {
      const existing = await db.journalEntries.where('referenceType').equals('cheque')
        .and(e => e.referenceId === ch.id || e.referenceId === String(ch.id)).first();
      if (!existing) {
        await recordChequeJournalEntry(ch, ch.status === 'cleared' ? 'cleared' : ch.status === 'transferred' ? 'transferred' : ch.status === 'bounced' ? 'bounced' : 'received');
        count++;
      }
    }
  }

  return { generatedCount: count };
}

// ============================================================================
// 4. FINANCIAL STATEMENTS REPORTING ENGINE
// ============================================================================

export interface TrialBalanceRow {
  code: string;
  name: string;
  level: AccountLevel;
  parentCode?: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  nature: AccountNature;
}

/**
 * تراز آزمایشی استاندارد (۴ ستونی و ۶ ستونی)
 */
export async function getTrialBalance(params?: {
  fromDate?: Date;
  toDate?: Date;
  level?: AccountLevel;
}): Promise<{
  rows: TrialBalanceRow[];
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  isBalanced: boolean;
}> {
  const accounts = await db.chartOfAccounts.toArray();
  const entries = await db.journalEntries.toArray();

  const fromTime = params?.fromDate ? params.fromDate.getTime() : 0;
  const toTime = params?.toDate ? params.toDate.getTime() : Infinity;

  // تجمیع بدهکار و بستانکار به تفکیک کد حساب
  const accountTotals = new Map<string, {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
  }>();

  for (const acc of accounts) {
    accountTotals.set(acc.code, { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0 });
  }

  for (const entry of entries) {
    const entryTime = new Date(entry.date).getTime();
    const isPrior = entryTime < fromTime;
    const isCurrent = entryTime >= fromTime && entryTime <= toTime;

    for (const line of entry.lines) {
      const code = line.accountCode;
      const d = line.debit || 0;
      const c = line.credit || 0;

      // تخصیص به حساب معین و والدین آن در درخت
      const codesToUpdate = [
        code,
        code.slice(0, 4), // معین
        code.slice(0, 2), // کل
        code.slice(0, 1)  // گروه
      ].filter((v, idx, arr) => arr.indexOf(v) === idx && accountTotals.has(v));

      for (const targetCode of codesToUpdate) {
        const item = accountTotals.get(targetCode)!;
        if (isPrior) {
          item.openingDebit += d;
          item.openingCredit += c;
        } else if (isCurrent) {
          item.periodDebit += d;
          item.periodCredit += c;
        }
      }
    }
  }

  const rows: TrialBalanceRow[] = [];
  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;

  for (const acc of accounts) {
    if (params?.level && acc.level !== params.level) continue;

    const data = accountTotals.get(acc.code) || { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0 };
    
    // محاسبه مانده نهایی
    const netBalance = (data.openingDebit - data.openingCredit) + (data.periodDebit - data.periodCredit);
    const closingDebit = netBalance > 0 ? netBalance : 0;
    const closingCredit = netBalance < 0 ? Math.abs(netBalance) : 0;

    // فقط در صورتی که حساب گردش داشته باشد یا کل باشد
    if (data.openingDebit > 0 || data.openingCredit > 0 || data.periodDebit > 0 || data.periodCredit > 0 || acc.level === 'group') {
      rows.push({
        code: acc.code,
        name: acc.name,
        level: acc.level,
        parentCode: acc.parentCode,
        openingDebit: data.openingDebit,
        openingCredit: data.openingCredit,
        periodDebit: data.periodDebit,
        periodCredit: data.periodCredit,
        closingDebit,
        closingCredit,
        nature: acc.nature
      });

      if (acc.level === 'group') {
        totalOpeningDebit += data.openingDebit;
        totalOpeningCredit += data.openingCredit;
        totalPeriodDebit += data.periodDebit;
        totalPeriodCredit += data.periodCredit;
        totalClosingDebit += closingDebit;
        totalClosingCredit += closingCredit;
      }
    }
  }

  // مرتب‌سازی عددی
  rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const isBalanced = Math.abs(totalPeriodDebit - totalPeriodCredit) < 1;

  return {
    rows,
    totalOpeningDebit,
    totalOpeningCredit,
    totalPeriodDebit,
    totalPeriodCredit,
    totalClosingDebit,
    totalClosingCredit,
    isBalanced
  };
}

/**
 * ترازنامه استاندارد مالی (Balance Sheet)
 * معادله اساسی: دارایی‌ها = بدهی‌ها + حقوق صاحبان سهام و سرمایه
 */
export async function getBalanceSheet(asOfDate?: Date): Promise<{
  currentAssets: { code: string; name: string; amount: number }[];
  totalCurrentAssets: number;
  nonCurrentAssets: { code: string; name: string; amount: number }[];
  totalNonCurrentAssets: number;
  totalAssets: number;

  currentLiabilities: { code: string; name: string; amount: number }[];
  totalCurrentLiabilities: number;

  equityItems: { code: string; name: string; amount: number }[];
  currentPeriodProfit: number;
  totalEquity: number;

  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}> {
  const trial = await getTrialBalance({ toDate: asOfDate, level: 'ledger' });
  const pAndL = await getProfitAndLossStatement({ toDate: asOfDate });

  const currentAssets: { code: string; name: string; amount: number }[] = [];
  let totalCurrentAssets = 0;

  const nonCurrentAssets: { code: string; name: string; amount: number }[] = [];
  let totalNonCurrentAssets = 0;

  const currentLiabilities: { code: string; name: string; amount: number }[] = [];
  let totalCurrentLiabilities = 0;

  const equityItems: { code: string; name: string; amount: number }[] = [];
  let totalEquityBase = 0;

  for (const row of trial.rows) {
    const net = row.closingDebit - row.closingCredit;
    if (Math.abs(net) === 0) continue;

    if (row.code.startsWith('1')) {
      // دارایی جاری
      currentAssets.push({ code: row.code, name: row.name, amount: net });
      totalCurrentAssets += net;
    } else if (row.code.startsWith('2')) {
      // دارایی غیرجاری
      nonCurrentAssets.push({ code: row.code, name: row.name, amount: net });
      totalNonCurrentAssets += net;
    } else if (row.code.startsWith('3')) {
      // بدهی جاری (ماهیت بستانکار: منفی خالص = مثبت بدهی)
      const liabAmount = Math.abs(net);
      currentLiabilities.push({ code: row.code, name: row.name, amount: liabAmount });
      totalCurrentLiabilities += liabAmount;
    } else if (row.code.startsWith('4')) {
      // حقوق صاحبان سهام
      const eqAmount = Math.abs(net);
      equityItems.push({ code: row.code, name: row.name, amount: eqAmount });
      totalEquityBase += eqAmount;
    }
  }

  const currentPeriodProfit = pAndL.netProfit;
  const totalEquity = totalEquityBase + currentPeriodProfit;
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
  const totalLiabilitiesAndEquity = totalCurrentLiabilities + totalEquity;

  const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 100;

  return {
    currentAssets,
    totalCurrentAssets,
    nonCurrentAssets,
    totalNonCurrentAssets,
    totalAssets,
    currentLiabilities,
    totalCurrentLiabilities,
    equityItems,
    currentPeriodProfit,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced
  };
}

/**
 * صورت سود و زیان چندمرحله‌ای استاندارد (Profit & Loss / Income Statement)
 */
export async function getProfitAndLossStatement(params?: {
  fromDate?: Date;
  toDate?: Date;
}): Promise<{
  grossSales: number;
  salesDiscounts: number;
  netRevenue: number;

  cogsDirectMaterials: number;
  cogsWastage: number;
  totalCogs: number;

  grossProfit: number;
  grossMarginPercent: number;

  salariesExpense: number;
  rentExpense: number;
  utilitiesExpense: number;
  marketingExpense: number;
  deliveryExpense: number;
  otherOperatingExpenses: number;
  totalOperatingExpenses: number;

  operatingProfit: number;
  operatingMarginPercent: number;

  nonOperatingIncome: number;
  nonOperatingExpenses: number;
  netNonOperating: number;

  netProfit: number;
  netMarginPercent: number;
}> {
  const trial = await getTrialBalance({ fromDate: params?.fromDate, toDate: params?.toDate, level: 'subsidiary' });

  let grossSales = 0;
  let salesDiscounts = 0;
  let cogsDirectMaterials = 0;
  let cogsWastage = 0;
  let salariesExpense = 0;
  let rentExpense = 0;
  let utilitiesExpense = 0;
  let marketingExpense = 0;
  let deliveryExpense = 0;
  let otherOperatingExpenses = 0;
  let nonOperatingIncome = 0;
  let nonOperatingExpenses = 0;

  for (const r of trial.rows) {
    const net = r.periodDebit - r.periodCredit;

    if (r.code === '5001') {
      grossSales += r.periodCredit;
    } else if (r.code === '5002') {
      salesDiscounts += r.periodDebit;
    } else if (r.code === '6001') {
      cogsDirectMaterials += r.periodDebit;
    } else if (r.code === '6002') {
      cogsWastage += r.periodDebit;
    } else if (r.code.startsWith('70')) {
      salariesExpense += r.periodDebit;
    } else if (r.code.startsWith('71')) {
      rentExpense += r.periodDebit;
    } else if (r.code.startsWith('72')) {
      utilitiesExpense += r.periodDebit;
    } else if (r.code.startsWith('73')) {
      marketingExpense += r.periodDebit;
    } else if (r.code.startsWith('74')) {
      deliveryExpense += r.periodDebit;
    } else if (r.code.startsWith('75')) {
      otherOperatingExpenses += r.periodDebit;
    } else if (r.code === '8001') {
      nonOperatingIncome += r.periodCredit;
    } else if (r.code === '8002') {
      nonOperatingExpenses += r.periodDebit;
    }
  }

  const netRevenue = Math.max(0, grossSales - salesDiscounts);
  const totalCogs = cogsDirectMaterials + cogsWastage;
  const grossProfit = netRevenue - totalCogs;
  const grossMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  const totalOperatingExpenses = 
    salariesExpense + rentExpense + utilitiesExpense + 
    marketingExpense + deliveryExpense + otherOperatingExpenses;

  const operatingProfit = grossProfit - totalOperatingExpenses;
  const operatingMarginPercent = netRevenue > 0 ? (operatingProfit / netRevenue) * 100 : 0;

  const netNonOperating = nonOperatingIncome - nonOperatingExpenses;
  const netProfit = operatingProfit + netNonOperating;
  const netMarginPercent = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  return {
    grossSales,
    salesDiscounts,
    netRevenue,
    cogsDirectMaterials,
    cogsWastage,
    totalCogs,
    grossProfit,
    grossMarginPercent,
    salariesExpense,
    rentExpense,
    utilitiesExpense,
    marketingExpense,
    deliveryExpense,
    otherOperatingExpenses,
    totalOperatingExpenses,
    operatingProfit,
    operatingMarginPercent,
    nonOperatingIncome,
    nonOperatingExpenses,
    netNonOperating,
    netProfit,
    netMarginPercent
  };
}

/**
 * دفتر کل و دفتر معین برای یک حساب معین
 */
export async function getGeneralLedger(params: {
  accountCode: string;
  fromDate?: Date;
  toDate?: Date;
}): Promise<{
  account: ChartOfAccount | null;
  openingBalance: number;
  articles: Array<{
    entryId: number;
    entryNumber: number;
    date: Date;
    description: string;
    debit: number;
    credit: number;
    runningBalance: number;
    status: 'debtor' | 'creditor' | 'settled';
    detailName?: string;
  }>;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  closingBalance: number;
}> {
  const account = await db.chartOfAccounts.where('code').equals(params.accountCode).first() || null;
  const allEntries = await db.journalEntries.orderBy('date').toArray();

  const fromTime = params.fromDate ? params.fromDate.getTime() : 0;
  const toTime = params.toDate ? params.toDate.getTime() : Infinity;

  let openingBalance = 0;
  const periodArticles: Array<{
    entryId: number;
    entryNumber: number;
    date: Date;
    description: string;
    debit: number;
    credit: number;
    runningBalance: number;
    status: 'debtor' | 'creditor' | 'settled';
    detailName?: string;
  }> = [];

  let sumDebit = 0;
  let sumCredit = 0;

  for (const entry of allEntries) {
    const entryTime = new Date(entry.date).getTime();
    const isPrior = entryTime < fromTime;
    const isCurrent = entryTime >= fromTime && entryTime <= toTime;

    for (const line of entry.lines) {
      // تطابق با کد یا پیشوند (برای حساب‌های کل)
      if (line.accountCode === params.accountCode || line.accountCode.startsWith(params.accountCode)) {
        const d = line.debit || 0;
        const c = line.credit || 0;

        if (isPrior) {
          openingBalance += (d - c);
        } else if (isCurrent) {
          periodArticles.push({
            entryId: entry.id!,
            entryNumber: entry.entryNumber,
            date: new Date(entry.date),
            description: line.description || entry.description,
            debit: d,
            credit: c,
            runningBalance: 0,
            status: 'settled',
            detailName: line.detailName
          });
          sumDebit += d;
          sumCredit += c;
        }
      }
    }
  }

  // محاسبه مانده خط به خط
  let currentBalance = openingBalance;
  const articles = periodArticles.map(art => {
    currentBalance += (art.debit - art.credit);
    const status: 'debtor' | 'creditor' | 'settled' = 
      currentBalance > 0 ? 'debtor' : currentBalance < 0 ? 'creditor' : 'settled';

    return {
      ...art,
      runningBalance: Math.abs(currentBalance),
      status
    };
  });

  return {
    account,
    openingBalance,
    articles,
    totalPeriodDebit: sumDebit,
    totalPeriodCredit: sumCredit,
    closingBalance: currentBalance
  };
}

// ============================================================================
// 5. EXCEL EXPORT HELPER (XLSX با UTF-8 و فرمول‌های محاسباتی)
// ============================================================================

/**
 * خروجی اکسل کامل گزارشات مالی
 */
export function exportFinancialStatementToExcel(params: {
  reportTitle: string;
  headers: string[];
  rows: (string | number)[][];
  fileName: string;
  sheetName?: string;
}): void {
  const wsData = [
    [params.reportTitle],
    [`تاریخ تولید گزارش: ${new Date().toLocaleDateString('fa-IR')} - سامانه حسابداری آرکا`],
    [],
    params.headers,
    ...params.rows
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // تنظیم RTL برای نمایش استاندارد در اکسل فارسی
  ws['!views'] = [{ rightToLeft: true }];

  XLSX.utils.book_append_sheet(wb, ws, params.sheetName || 'گزارش مالی');
  XLSX.writeFile(wb, `${params.fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
