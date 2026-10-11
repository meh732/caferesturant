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
