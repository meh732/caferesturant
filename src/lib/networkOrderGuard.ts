import { db, Customer, NetworkOrder, Order } from './db';

export const CUSTOMER_TIER_LABELS: Record<NonNullable<Customer['tier']>, string> = {
  bronze: 'برنزی',
  silver: 'نقره‌ای',
  gold: 'طلایی',
  vip: 'VIP ویژه'
};

export function normalizePhoneDigits(value?: string | null): string {
  if (!value) return '';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return String(value)
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[\s\-()]/g, '')
    .trim();
}

export function findFinalizedOrderForNetwork(
  netOrder: NetworkOrder | undefined | null,
  allOrders: Order[]
): Order | undefined {
  if (!netOrder || !Array.isArray(allOrders) || allOrders.length === 0) return undefined;

  const activeOrders = allOrders.filter((o) => o && o.status !== 'cancelled');

  if (netOrder.completedOrderId) {
    const byId = activeOrders.find((o) => o.id === netOrder.completedOrderId);
    if (byId) return byId;
  }

  if (netOrder.tempId) {
    const byTemp = activeOrders.find(
      (o) => o.networkOrderTempId && o.networkOrderTempId === netOrder.tempId
    );
    if (byTemp) return byTemp;
  }

  if (netOrder.completedInvoiceNumber) {
    const byInv = activeOrders.find((o) => o.invoiceNumber === netOrder.completedInvoiceNumber);
    if (byInv) return byInv;
  }

  return undefined;
}

export function isNetworkOrderInvoiced(
  netOrder: NetworkOrder | undefined | null,
  finalOrder?: Order | null
): boolean {
  if (finalOrder && finalOrder.status !== 'cancelled') return true;
  if (!netOrder) return false;
  return (
    netOrder.status === 'completed' ||
    !!netOrder.completedOrderId ||
    !!netOrder.completedInvoiceNumber
  );
}

export function getFinalInvoiceNumber(
  netOrder: NetworkOrder | undefined | null,
  finalOrder?: Order | null
): number | undefined {
  return finalOrder?.invoiceNumber || netOrder?.completedInvoiceNumber || undefined;
}

export interface ResolvedOrderCustomer {
  hasCustomer: boolean;
  isClubMember: boolean;
  name: string;
  phone: string;
  subscriptionCode: string;
  address: string;
  tier?: Customer['tier'];
  tierLabel?: string;
  walletBalance: number;
  loyaltyPoints: number;
  cashbackPercent?: number;
  orderCount: number;
  customer?: Customer;
}

export function resolveCustomerDetailsForOrder(
  netOrder: NetworkOrder | undefined | null,
  finalOrder: Order | undefined | null,
  customers: Customer[] = []
): ResolvedOrderCustomer {
  const rawPhone = (finalOrder?.customerPhone || netOrder?.customerPhone || '').trim();
  const normPhone = normalizePhoneDigits(rawPhone);
  const rawSub = (finalOrder?.customerSubscriptionCode || netOrder?.customerSubscriptionCode || '').trim();
  const rawName = (finalOrder?.customerName || netOrder?.customerName || '').trim();
  const rawAddress = (finalOrder?.customerAddress || '').trim();

  let matched: Customer | undefined;
  if (finalOrder?.customerId) {
    matched = customers.find((c) => c.id === finalOrder.customerId);
  }
  if (!matched && normPhone) {
    matched = customers.find((c) => normalizePhoneDigits(c.phone) === normPhone);
  }
  if (!matched && rawSub) {
    matched = customers.find(
      (c) => c.subscriptionCode && c.subscriptionCode.trim().toLowerCase() === rawSub.toLowerCase()
    );
  }

  const name = matched?.name || rawName || '';
  const phone = matched?.phone || rawPhone || '';
  const subscriptionCode = matched?.subscriptionCode || rawSub || '';
  const address = matched?.address || rawAddress || '';
  const isClubMember = Boolean(matched);
  const hasCustomer = Boolean(matched || name || phone || subscriptionCode || address);
  const tier = matched?.tier;

  return {
    hasCustomer,
    isClubMember,
    name,
    phone,
    subscriptionCode,
    address,
    tier,
    tierLabel: tier ? CUSTOMER_TIER_LABELS[tier] : undefined,
    walletBalance: Number(matched?.walletBalance || 0),
    loyaltyPoints: Number(matched?.loyaltyPoints || 0),
    cashbackPercent: matched?.cashbackPercent,
    orderCount: Number(matched?.orderCount ?? matched?.OrderCount ?? 0),
    customer: matched
  };
}

export async function checkNetworkOrderInvoicedInDb(
  tempId?: string,
  netId?: number
): Promise<{
  alreadyInvoiced: boolean;
  invoiceNumber?: number;
  finalOrder?: Order;
  networkOrder?: NetworkOrder;
}> {
  if (!tempId && !netId) {
    return { alreadyInvoiced: false };
  }

  let networkOrder: NetworkOrder | undefined;
  try {
    if (tempId) {
      networkOrder = await db.networkOrders.where('tempId').equals(tempId).first();
    }
    if (!networkOrder && netId) {
      networkOrder = await db.networkOrders.get(netId);
    }
  } catch {}

  let finalOrder: Order | undefined;
  try {
    const allOrders = await db.orders.toArray();
    if (networkOrder) {
      finalOrder = findFinalizedOrderForNetwork(networkOrder, allOrders);
    } else if (tempId) {
      finalOrder = allOrders.find(
        (o) => o && o.status !== 'cancelled' && o.networkOrderTempId === tempId
      );
    }
  } catch {}

  const alreadyInvoiced = isNetworkOrderInvoiced(networkOrder, finalOrder);
  const invoiceNumber = getFinalInvoiceNumber(networkOrder, finalOrder);

  return {
    alreadyInvoiced,
    invoiceNumber,
    finalOrder,
    networkOrder
  };
}
