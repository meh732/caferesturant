import { db, BankAccount, CashBox, Cheque, FinancialTransaction, Order, Expense, SalaryPayment } from './db';
import { triggerServerDbSync } from './serverSync';

/**
 * Generate a sequential or unique transaction number: TX-1001, TX-1002, ...
 */
export async function generateTransactionNumber(): Promise<string> {
  try {
    const lastTx = await db.financialTransactions.orderBy('id').last();
    const nextNum = (lastTx?.id || 0) + 1001;
    return `TX-${nextNum}`;
  } catch {
    return `TX-${Date.now().toString().slice(-6)}`;
  }
}

/**
 * Automatically records financial impacts when a customer order is paid at POS.
 * Updates bank or cashbox balance and logs a financial transaction.
 * If cheque, creates a received cheque in the cheque registry.
 */
export async function processOrderPayment(order: Order): Promise<void> {
  try {
    const now = new Date(order.createdAt || new Date());
    const txNum = await generateTransactionNumber();

    // 1. Payment via Card / Bank POS
    if (order.paymentMethod === 'card' || (!order.paymentMethod && !order.cashBoxId)) {
      let bank: BankAccount | undefined;
      if (order.bankAccountId) {
        bank = await db.bankAccounts.get(order.bankAccountId);
      }
      if (!bank) {
        bank = await db.bankAccounts.filter(b => b.isActive && b.isDefaultPos).first();
      }
      if (!bank) {
        bank = await db.bankAccounts.filter(b => b.isActive).first();
      }

      if (bank?.id) {
        const newBalance = (bank.balance || 0) + (order.total || 0);
        await db.bankAccounts.update(bank.id, { balance: newBalance });

        await db.financialTransactions.add({
          transactionNumber: txNum,
          type: 'income_sale',
          category: 'فروش صندوق (کارتخوان)',
          amount: order.total || 0,
          targetType: 'bank',
          targetId: bank.id,
          targetName: bank.bankName,
          orderId: order.id,
          trackingCode: order.posTrackingCode || `INV-${order.invoiceNumber}`,
          date: now,
          description: `دریافت وجه فاکتور فروش شماره ${order.invoiceNumber} از طریق دستگاه پوز ${bank.bankName}`,
          balanceAfter: newBalance,
          createdAt: now,
        });
      }
    }

    // 2. Payment via Cash Desk
    else if (order.paymentMethod === 'cash') {
      let cashbox: CashBox | undefined;
      if (order.cashBoxId) {
        cashbox = await db.cashBoxes.get(order.cashBoxId);
      }
      if (!cashbox) {
        cashbox = await db.cashBoxes.filter(c => c.isActive && c.isDefault).first();
      }
      if (!cashbox) {
        cashbox = await db.cashBoxes.filter(c => c.isActive).first();
      }

      if (cashbox?.id) {
        const newBalance = (cashbox.balance || 0) + (order.total || 0);
        await db.cashBoxes.update(cashbox.id, { balance: newBalance });

        await db.financialTransactions.add({
          transactionNumber: txNum,
          type: 'income_sale',
          category: 'فروش صندوق (نقدی)',
          amount: order.total || 0,
          targetType: 'cashbox',
          targetId: cashbox.id,
          targetName: cashbox.name,
          orderId: order.id,
          trackingCode: `INV-${order.invoiceNumber}`,
          date: now,
          description: `دریافت وجه نقد فاکتور فروش شماره ${order.invoiceNumber} به ${cashbox.name}`,
          balanceAfter: newBalance,
          createdAt: now,
        });
      }
    }

    // 3. Payment via Mixed (Card + Cash)
    else if (order.paymentMethod === 'mixed') {
      const cardAmt = order.cardAmount || 0;
      const cashAmt = order.cashAmount || 0;

      if (cardAmt > 0) {
        let bank = order.bankAccountId ? await db.bankAccounts.get(order.bankAccountId) : undefined;
        if (!bank) bank = await db.bankAccounts.filter(b => b.isActive && b.isDefaultPos).first() || await db.bankAccounts.filter(b => b.isActive).first();
        if (bank?.id) {
          const newBal = (bank.balance || 0) + cardAmt;
          await db.bankAccounts.update(bank.id, { balance: newBal });
          await db.financialTransactions.add({
            transactionNumber: `${txNum}-1`,
            type: 'income_sale',
            category: 'فروش صندوق (کارتخوان - ترکیبی)',
            amount: cardAmt,
            targetType: 'bank',
            targetId: bank.id,
            targetName: bank.bankName,
            orderId: order.id,
            trackingCode: order.posTrackingCode || `INV-${order.invoiceNumber}`,
            date: now,
            description: `دریافت بخش کارتخوان فاکتور فروش ${order.invoiceNumber} به حساب ${bank.bankName}`,
            balanceAfter: newBal,
            createdAt: now,
          });
        }
      }

      if (cashAmt > 0) {
        let cashbox = order.cashBoxId ? await db.cashBoxes.get(order.cashBoxId) : undefined;
        if (!cashbox) cashbox = await db.cashBoxes.filter(c => c.isActive && c.isDefault).first() || await db.cashBoxes.filter(c => c.isActive).first();
        if (cashbox?.id) {
          const newBal = (cashbox.balance || 0) + cashAmt;
          await db.cashBoxes.update(cashbox.id, { balance: newBal });
          await db.financialTransactions.add({
            transactionNumber: `${txNum}-2`,
            type: 'income_sale',
            category: 'فروش صندوق (نقدی - ترکیبی)',
            amount: cashAmt,
            targetType: 'cashbox',
            targetId: cashbox.id,
            targetName: cashbox.name,
            orderId: order.id,
            trackingCode: `INV-${order.invoiceNumber}`,
            date: now,
            description: `دریافت بخش نقدی فاکتور فروش ${order.invoiceNumber} به ${cashbox.name}`,
            balanceAfter: newBal,
            createdAt: now,
          });
        }
      }
    }

    // 4. Payment via Cheque (چک دریافتی)
    else if (order.paymentMethod === 'cheque' && order.chequeNumber) {
      const chequeId = await db.cheques.add({
        type: 'received',
        chequeNumber: order.chequeNumber,
        sayadNumber: order.chequeSayad,
        bankName: order.chequeBankName || 'بانک مشتری',
        amount: order.total || 0,
        issueDate: now,
        dueDate: order.chequeDueDate ? new Date(order.chequeDueDate) : now,
        drawerName: order.chequeDrawer || order.customerName || 'مشتری',
        recipientName: 'فروشگاه من',
        orderId: order.id,
        bankAccountId: order.bankAccountId,
        status: 'pending',
        notes: `چک دریافتی بابت تسویه فاکتور فروش شماره ${order.invoiceNumber}`,
        createdAt: now,
      });

      await db.financialTransactions.add({
        transactionNumber: txNum,
        type: 'cheque_deposit',
        category: 'چک صیادی دریافتی (در جریان وصول)',
        amount: order.total || 0,
        chequeId: chequeId as number,
        orderId: order.id,
        trackingCode: order.chequeSayad || order.chequeNumber,
        date: now,
        description: `ثبت چک صیادی دریافتی شماره ${order.chequeNumber} بابت فاکتور فروش ${order.invoiceNumber}`,
        createdAt: now,
      });
    }

    triggerServerDbSync(100);
  } catch (err) {
    console.error('Error in processOrderPayment:', err);
  }
}

/**
 * Automatically records financial impacts when an expense or purchase invoice is saved.
 */
export async function processExpensePayment(expense: Expense): Promise<void> {
  try {
    const now = new Date(expense.date || new Date());
    const txNum = await generateTransactionNumber();

    // If paid via Card / Bank
    if (expense.status === 'paid' && expense.paymentMethod === 'card' && expense.bankAccountId) {
      const bank = await db.bankAccounts.get(expense.bankAccountId);
      if (bank?.id) {
        const newBalance = (bank.balance || 0) - expense.amount;
        await db.bankAccounts.update(bank.id, { balance: newBalance });

        await db.financialTransactions.add({
          transactionNumber: txNum,
          type: 'expense_purchase',
          category: expense.type === 'material' ? 'خرید مواد اولیه' : 'هزینه جاری / اداری',
          amount: expense.amount,
          sourceType: 'bank',
          sourceId: bank.id,
          sourceName: bank.bankName,
          expenseId: expense.id,
          trackingCode: expense.invoiceNumber || undefined,
          date: now,
          description: `پرداخت فاکتور ${expense.title} (طرف‌حساب: ${expense.supplierOrPerson || 'نامشخص'}) از حساب ${bank.bankName}`,
          balanceAfter: newBalance,
          createdAt: now,
        });
      }
    }

    // If paid via Cash Desk
    else if (expense.status === 'paid' && expense.paymentMethod === 'cash' && expense.cashBoxId) {
      const cashbox = await db.cashBoxes.get(expense.cashBoxId);
      if (cashbox?.id) {
        const newBalance = (cashbox.balance || 0) - expense.amount;
        await db.cashBoxes.update(cashbox.id, { balance: newBalance });

        await db.financialTransactions.add({
          transactionNumber: txNum,
          type: 'expense_purchase',
          category: expense.type === 'material' ? 'خرید مواد اولیه' : 'هزینه جاری / اداری',
          amount: expense.amount,
          sourceType: 'cashbox',
          sourceId: cashbox.id,
          sourceName: cashbox.name,
          expenseId: expense.id,
          trackingCode: expense.invoiceNumber || undefined,
          date: now,
          description: `پرداخت نقدی فاکتور ${expense.title} (طرف‌حساب: ${expense.supplierOrPerson || 'نامشخص'}) از ${cashbox.name}`,
          balanceAfter: newBalance,
          createdAt: now,
        });
      }
    }

    // If paid via Cheque (چک پرداختی)
    else if (expense.paymentMethod === 'cheque' && expense.chequeNumber) {
      const chequeId = await db.cheques.add({
        type: 'paid',
        chequeNumber: expense.chequeNumber,
        sayadNumber: expense.chequeSayad,
        bankName: expense.chequeBankName || 'حساب جاری فروشگاه',
        bankAccountId: expense.bankAccountId,
        amount: expense.amount,
        issueDate: now,
        dueDate: expense.chequeDueDate ? new Date(expense.chequeDueDate) : now,
        drawerName: 'فروشگاه من',
        recipientName: expense.supplierOrPerson || 'تأمین‌کننده',
        expenseId: expense.id,
        status: 'pending',
        notes: `چک صادره بابت فاکتور ${expense.title}`,
        createdAt: now,
      });

      await db.financialTransactions.add({
        transactionNumber: txNum,
        type: 'cheque_payment',
        category: 'چک صیادی پرداختی (نزد تأمین‌کننده)',
        amount: expense.amount,
        chequeId: chequeId as number,
        expenseId: expense.id,
        trackingCode: expense.chequeSayad || expense.chequeNumber,
        date: now,
        description: `صدور چک صیادی شماره ${expense.chequeNumber} در وجه ${expense.supplierOrPerson || 'تأمین‌کننده'} بابت ${expense.title}`,
        createdAt: now,
      });
    }

    triggerServerDbSync(100);
  } catch (err) {
    console.error('Error in processExpensePayment:', err);
  }
}

/**
 * Automatically records financial impacts when a salary payment is made.
 */
export async function processSalaryPayment(payment: SalaryPayment): Promise<void> {
  try {
    const now = new Date(payment.paymentDate || new Date());
    const txNum = await generateTransactionNumber();

    if (payment.paymentMethod === 'card' && payment.bankAccountId) {
      const bank = await db.bankAccounts.get(payment.bankAccountId);
      if (bank?.id) {
        const newBalance = (bank.balance || 0) - payment.totalPaid;
        await db.bankAccounts.update(bank.id, { balance: newBalance });

        await db.financialTransactions.add({
          transactionNumber: txNum,
          type: 'salary_payment',
          category: 'حقوق و دستمزد پرسنل',
          amount: payment.totalPaid,
          sourceType: 'bank',
          sourceId: bank.id,
          sourceName: bank.bankName,
          salaryPaymentId: payment.id,
          trackingCode: payment.trackingNumber || undefined,
          date: now,
          description: `پرداخت ${payment.periodMonth} آقای/خانم ${payment.employeeName} از حساب ${bank.bankName}`,
          balanceAfter: newBalance,
          createdAt: now,
        });
      }
    } else if (payment.paymentMethod === 'cash' && payment.cashBoxId) {
      const cashbox = await db.cashBoxes.get(payment.cashBoxId);
      if (cashbox?.id) {
        const newBalance = (cashbox.balance || 0) - payment.totalPaid;
        await db.cashBoxes.update(cashbox.id, { balance: newBalance });

        await db.financialTransactions.add({
          transactionNumber: txNum,
          type: 'salary_payment',
          category: 'حقوق و دستمزد پرسنل',
          amount: payment.totalPaid,
          sourceType: 'cashbox',
          sourceId: cashbox.id,
          sourceName: cashbox.name,
          salaryPaymentId: payment.id,
          trackingCode: payment.trackingNumber || undefined,
          date: now,
          description: `پرداخت نقدی ${payment.periodMonth} آقای/خانم ${payment.employeeName} از ${cashbox.name}`,
          balanceAfter: newBalance,
          createdAt: now,
        });
      }
    }

    triggerServerDbSync(100);
  } catch (err) {
    console.error('Error in processSalaryPayment:', err);
  }
}

/**
 * Transfers funds between accounts/cashboxes (انتقال وجه بین حساب‌ها و صندوق‌ها)
 */
export async function transferFunds(params: {
  sourceType: 'bank' | 'cashbox';
  sourceId: number;
  targetType: 'bank' | 'cashbox';
  targetId: number;
  amount: number;
  date: Date;
  trackingCode?: string;
  description?: string;
}): Promise<void> {
  const { sourceType, sourceId, targetType, targetId, amount, date, trackingCode, description } = params;
  if (amount <= 0) throw new Error('مبلغ انتقال باید بیشتر از صفر باشد.');
  if (sourceType === targetType && sourceId === targetId) throw new Error('حساب مبدأ و مقصد نمی‌توانند یکسان باشند.');

  // Fetch source
  let sourceName = '';
  let sourceBal = 0;
  if (sourceType === 'bank') {
    const b = await db.bankAccounts.get(sourceId);
    if (!b) throw new Error('حساب بانکی مبدأ یافت نشد.');
    sourceName = b.bankName;
    sourceBal = b.balance || 0;
    await db.bankAccounts.update(sourceId, { balance: sourceBal - amount });
  } else {
    const c = await db.cashBoxes.get(sourceId);
    if (!c) throw new Error('صندوق مبدأ یافت نشد.');
    sourceName = c.name;
    sourceBal = c.balance || 0;
    await db.cashBoxes.update(sourceId, { balance: sourceBal - amount });
  }

  // Fetch target
  let targetName = '';
  let targetBal = 0;
  if (targetType === 'bank') {
    const b = await db.bankAccounts.get(targetId);
    if (!b) throw new Error('حساب بانکی مقصد یافت نشد.');
    targetName = b.bankName;
    targetBal = b.balance || 0;
    await db.bankAccounts.update(targetId, { balance: targetBal + amount });
  } else {
    const c = await db.cashBoxes.get(targetId);
    if (!c) throw new Error('صندوق مقصد یافت نشد.');
    targetName = c.name;
    targetBal = c.balance || 0;
    await db.cashBoxes.update(targetId, { balance: targetBal + amount });
  }

  const txNum = await generateTransactionNumber();
  const desc = description?.trim() || `انتقال وجه از ${sourceName} به ${targetName}`;

  await db.financialTransactions.add({
    transactionNumber: txNum,
    type: 'transfer',
    category: 'انتقال بین حساب‌ها',
    amount,
    sourceType,
    sourceId,
    sourceName,
    targetType,
    targetId,
    targetName,
    trackingCode: trackingCode?.trim() || undefined,
    date,
    description: desc,
    balanceAfter: targetBal + amount,
    createdAt: new Date(),
  });

  triggerServerDbSync(100);
}

/**
 * Manual deposit or withdrawal (واریز یا برداشت دستی متفرقه)
 */
export async function manualDepositOrWithdrawal(params: {
  action: 'deposit' | 'withdrawal';
  accountType: 'bank' | 'cashbox';
  accountId: number;
  amount: number;
  category: string;
  date: Date;
  trackingCode?: string;
  description: string;
}): Promise<void> {
  const { action, accountType, accountId, amount, category, date, trackingCode, description } = params;
  if (amount <= 0) throw new Error('مبلغ باید بیشتر از صفر باشد.');

  let accountName = '';
  let newBalance = 0;

  if (accountType === 'bank') {
    const b = await db.bankAccounts.get(accountId);
    if (!b) throw new Error('حساب بانکی یافت نشد.');
    accountName = b.bankName;
    newBalance = action === 'deposit' ? (b.balance || 0) + amount : (b.balance || 0) - amount;
    await db.bankAccounts.update(accountId, { balance: newBalance });
  } else {
    const c = await db.cashBoxes.get(accountId);
    if (!c) throw new Error('صندوق یافت نشد.');
    accountName = c.name;
    newBalance = action === 'deposit' ? (c.balance || 0) + amount : (c.balance || 0) - amount;
    await db.cashBoxes.update(accountId, { balance: newBalance });
  }

  const txNum = await generateTransactionNumber();

  await db.financialTransactions.add({
    transactionNumber: txNum,
    type: action === 'deposit' ? 'deposit_manual' : 'withdrawal_manual',
    category: category || (action === 'deposit' ? 'واریز متفرقه' : 'برداشت متفرقه'),
    amount,
    ...(action === 'deposit'
      ? { targetType: accountType, targetId: accountId, targetName: accountName }
      : { sourceType: accountType, sourceId: accountId, sourceName: accountName }),
    trackingCode: trackingCode?.trim() || undefined,
    date,
    description: description.trim() || `${action === 'deposit' ? 'واریز به' : 'برداشت از'} ${accountName}`,
    balanceAfter: newBalance,
    createdAt: new Date(),
  });

  triggerServerDbSync(100);
}

/**
 * Changes status of a cheque and performs corresponding accounting adjustments
 * E.g., when a received cheque is cleared ('cleared'), it credits the bank account!
 * When an issued cheque is cleared, it debits the bank account!
 */
export async function updateChequeStatus(
  chequeId: number,
  newStatus: Cheque['status'],
  targetBankAccountId?: number
): Promise<void> {
  const cheque = await db.cheques.get(chequeId);
  if (!cheque) throw new Error('چک مورد نظر یافت نشد.');

  const prevStatus = cheque.status;
  if (prevStatus === newStatus) return;

  const now = new Date();
  const bankId = targetBankAccountId || cheque.bankAccountId;

  // Case 1: Received cheque changed to CLEARED (وصول چک دریافتی به حساب بانکی)
  if (cheque.type === 'received' && newStatus === 'cleared' && prevStatus !== 'cleared') {
    if (!bankId) throw new Error('لطفا حساب بانکی مقصد جهت واریز وجه چک را انتخاب کنید.');
    const bank = await db.bankAccounts.get(bankId);
    if (!bank) throw new Error('حساب بانکی مقصد یافت نشد.');

    const newBal = (bank.balance || 0) + cheque.amount;
    await db.bankAccounts.update(bank.id!, { balance: newBal });

    const txNum = await generateTransactionNumber();
    await db.financialTransactions.add({
      transactionNumber: txNum,
      type: 'cheque_deposit',
      category: 'وصول چک صیادی',
      amount: cheque.amount,
      targetType: 'bank',
      targetId: bank.id,
      targetName: bank.bankName,
      chequeId: cheque.id,
      orderId: cheque.orderId,
      trackingCode: cheque.sayadNumber || cheque.chequeNumber,
      date: now,
      description: `وصول چک شماره ${cheque.chequeNumber} (صادرکننده: ${cheque.drawerName}) به حساب ${bank.bankName}`,
      balanceAfter: newBal,
      createdAt: now,
    });
  }

  // Case 2: Issued cheque changed to CLEARED (پاس شدن چک پرداختی از حساب بانکی)
  if (cheque.type === 'paid' && newStatus === 'cleared' && prevStatus !== 'cleared') {
    if (!bankId) throw new Error('لطفا حساب بانکی جهت کسر وجه چک را مشخص کنید.');
    const bank = await db.bankAccounts.get(bankId);
    if (!bank) throw new Error('حساب بانکی یافت نشد.');

    const newBal = (bank.balance || 0) - cheque.amount;
    await db.bankAccounts.update(bank.id!, { balance: newBal });

    const txNum = await generateTransactionNumber();
    await db.financialTransactions.add({
      transactionNumber: txNum,
      type: 'cheque_payment',
      category: 'پاس شدن چک صیادی',
      amount: cheque.amount,
      sourceType: 'bank',
      sourceId: bank.id,
      sourceName: bank.bankName,
      chequeId: cheque.id,
      expenseId: cheque.expenseId,
      trackingCode: cheque.sayadNumber || cheque.chequeNumber,
      date: now,
      description: `پاس شدن چک شماره ${cheque.chequeNumber} در وجه ${cheque.recipientName || 'تأمین‌کننده'} از حساب ${bank.bankName}`,
      balanceAfter: newBal,
      createdAt: now,
    });
  }

  await db.cheques.update(chequeId, {
    status: newStatus,
    clearedDate: newStatus === 'cleared' ? now : undefined,
    bankAccountId: bankId,
  });

  triggerServerDbSync(100);
}

/**
 * Endorse / Transfer a received cheque to a vendor or third-party (خرج کردن چک)
 */
export async function transferReceivedCheque(params: {
  chequeId: number;
  transferredTo: string;
  transferredDate: Date;
  notes?: string;
}): Promise<void> {
  const cheque = await db.cheques.get(params.chequeId);
  if (!cheque) throw new Error('چک مورد نظر یافت نشد.');
  if (cheque.type !== 'received') throw new Error('فقط چک‌های دریافتی قابل خرج و واگذاری به غیر هستند.');
  if (cheque.status !== 'pending') throw new Error('تنها چک‌های در جریان وصول (نزد صندوق) قابل واگذاری هستند.');
  if (!params.transferredTo.trim()) throw new Error('لطفاً نام شخص یا تأمین‌کننده دریافت‌کننده چک را مشخص کنید.');

  const txNum = await generateTransactionNumber();

  await db.financialTransactions.add({
    transactionNumber: txNum,
    type: 'cheque_transfer',
    category: 'خرج چک دریافتی',
    amount: cheque.amount,
    sourceType: 'other',
    sourceName: `صندوق چک (صادرکننده: ${cheque.drawerName})`,
    targetType: 'supplier',
    targetName: params.transferredTo.trim(),
    chequeId: cheque.id,
    trackingCode: cheque.sayadNumber || cheque.chequeNumber,
    date: params.transferredDate,
    description: `خرج و واگذاری چک دریافتی شماره ${cheque.chequeNumber} (${cheque.bankName}) به ${params.transferredTo.trim()}${params.notes ? ` - ${params.notes}` : ''}`,
    createdAt: new Date(),
  });

  await db.cheques.update(params.chequeId, {
    status: 'transferred',
    transferredTo: params.transferredTo.trim(),
    transferredDate: params.transferredDate,
    notes: params.notes ? `${cheque.notes || ''} | واگذار شد به ${params.transferredTo.trim()}: ${params.notes}`.trim() : cheque.notes,
  });

  triggerServerDbSync(100);
}

/**
 * Marks a cheque as bounced (برگشت چک صیادی)
 */
export async function bounceCheque(params: {
  chequeId: number;
  bounceReason: string;
  bounceDate: Date;
  certificateNumber?: string;
  notes?: string;
}): Promise<void> {
  const cheque = await db.cheques.get(params.chequeId);
  if (!cheque) throw new Error('چک مورد نظر یافت نشد.');

  const prevStatus = cheque.status;
  const now = params.bounceDate || new Date();

  // If this cheque was previously marked as cleared in a bank, reverse the balance!
  if (prevStatus === 'cleared') {
    if (cheque.type === 'received' && cheque.bankAccountId) {
      const bank = await db.bankAccounts.get(cheque.bankAccountId);
      if (bank?.id) {
        const revBal = (bank.balance || 0) - cheque.amount;
        await db.bankAccounts.update(bank.id, { balance: revBal });
      }
    } else if (cheque.type === 'paid' && cheque.bankAccountId) {
      const bank = await db.bankAccounts.get(cheque.bankAccountId);
      if (bank?.id) {
        const revBal = (bank.balance || 0) + cheque.amount;
        await db.bankAccounts.update(bank.id, { balance: revBal });
      }
    }
  }

  const txNum = await generateTransactionNumber();

  await db.financialTransactions.add({
    transactionNumber: txNum,
    type: 'cheque_bounce',
    category: 'برگشت چک صیادی',
    amount: cheque.amount,
    sourceType: cheque.type === 'received' ? 'customer' : 'bank',
    sourceName: cheque.type === 'received' ? cheque.drawerName : cheque.bankName,
    targetType: cheque.type === 'received' ? 'other' : 'supplier',
    targetName: cheque.type === 'received' ? 'چک‌های برگشتی' : (cheque.recipientName || 'تأمین‌کننده'),
    chequeId: cheque.id,
    trackingCode: params.certificateNumber || cheque.sayadNumber || cheque.chequeNumber,
    date: now,
    description: `برگشت چک شماره ${cheque.chequeNumber} (${cheque.bankName}) - علت: ${params.bounceReason}${params.certificateNumber ? ` - گواهی عدم پرداخت: ${params.certificateNumber}` : ''}${params.notes ? ` - ${params.notes}` : ''}`,
    createdAt: new Date(),
  });

  await db.cheques.update(params.chequeId, {
    status: 'bounced',
    bounceReason: params.bounceReason,
    bounceDate: now,
    certificateNumber: params.certificateNumber,
  });

  triggerServerDbSync(100);
}

/**
 * Direct receipt or payment to/from a party (دریافت یا پرداخت وجه طرف‌حساب)
 */
export async function recordPartySettlement(params: {
  direction: 'receipt' | 'payment';
  partyName: string;
  amount: number;
  paymentMethod: 'card' | 'cash';
  bankAccountId?: number;
  cashBoxId?: number;
  date: Date;
  trackingCode?: string;
  description?: string;
}): Promise<void> {
  const { direction, partyName, amount, paymentMethod, bankAccountId, cashBoxId, date, trackingCode, description } = params;
  if (amount <= 0) throw new Error('مبلغ باید بیشتر از صفر باشد.');
  if (!partyName.trim()) throw new Error('نام طرف‌حساب الزامی است.');

  let accountName = '';
  let balanceAfter = 0;

  if (paymentMethod === 'card') {
    if (!bankAccountId) throw new Error('لطفاً حساب بانکی را انتخاب کنید.');
    const bank = await db.bankAccounts.get(bankAccountId);
    if (!bank) throw new Error('حساب بانکی یافت نشد.');
    accountName = bank.bankName;
    const newBal = direction === 'receipt' ? (bank.balance || 0) + amount : (bank.balance || 0) - amount;
    balanceAfter = newBal;
    await db.bankAccounts.update(bank.id!, { balance: newBal });
  } else {
    if (!cashBoxId) throw new Error('لطفاً صندوق نقدی را انتخاب کنید.');
    const cash = await db.cashBoxes.get(cashBoxId);
    if (!cash) throw new Error('صندوق یافت نشد.');
    accountName = cash.name;
    const newBal = direction === 'receipt' ? (cash.balance || 0) + amount : (cash.balance || 0) - amount;
    balanceAfter = newBal;
    await db.cashBoxes.update(cash.id!, { balance: newBal });
  }

  const txNum = await generateTransactionNumber();

  await db.financialTransactions.add({
    transactionNumber: txNum,
    type: 'party_settlement',
    category: direction === 'receipt' ? 'دریافت وجه از طرف‌حساب' : 'پرداخت وجه به طرف‌حساب',
    amount,
    sourceType: direction === 'receipt' ? 'customer' : (paymentMethod === 'card' ? 'bank' : 'cashbox'),
    sourceName: direction === 'receipt' ? partyName.trim() : accountName,
    targetType: direction === 'receipt' ? (paymentMethod === 'card' ? 'bank' : 'cashbox') : 'supplier',
    targetName: direction === 'receipt' ? accountName : partyName.trim(),
    trackingCode: trackingCode?.trim() || undefined,
    date,
    description: description?.trim() || (direction === 'receipt' 
      ? `دریافت وجه از ${partyName.trim()} به ${accountName}` 
      : `پرداخت وجه به ${partyName.trim()} از ${accountName}`),
    balanceAfter,
    createdAt: new Date(),
  });

  triggerServerDbSync(100);
}

