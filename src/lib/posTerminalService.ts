import { BankAccount } from './db';

export type IranianPosDriver =
  | 'auto'
  | 'behpardakht'
  | 'sep_saman'
  | 'parsian_pec'
  | 'sadad_melli'
  | 'irankish'
  | 'pasargad'
  | 'fanava'
  | 'asan_pardakht'
  | 'novin'
  | 'mabna'
  | 'http_bridge';

export interface PosDriverPreset {
  id: IranianPosDriver;
  label: string;
  defaultPort: number;
  bankHints: string[];
}

export const POS_DRIVER_PRESETS: PosDriverPreset[] = [
  { id: 'auto', label: 'تشخیص خودکار استاندارد ایران (PC-POS)', defaultPort: 1197, bankHints: [] },
  { id: 'behpardakht', label: 'به‌پرداخت ملت (Behpardakht)', defaultPort: 1197, bankHints: ['ملت'] },
  { id: 'sep_saman', label: 'پرداخت الکترونیک سامان (SEP)', defaultPort: 1362, bankHints: ['سامان'] },
  { id: 'parsian_pec', label: 'تجارت الکترونیک پارسیان (PEC)', defaultPort: 1362, bankHints: ['پارسیان'] },
  { id: 'sadad_melli', label: 'سداد بانک ملی (Sadad)', defaultPort: 1197, bankHints: ['ملی'] },
  { id: 'irankish', label: 'ایران‌کیش (KICCC)', defaultPort: 1362, bankHints: ['تجارت', 'رفاه', 'ایران'] },
  { id: 'pasargad', label: 'پرداخت الکترونیک پاسارگاد (PEP)', defaultPort: 8888, bankHints: ['پاسارگاد'] },
  { id: 'fanava', label: 'فناوا کارت (Fanava)', defaultPort: 8888, bankHints: ['سپه', 'دی', 'شهر'] },
  { id: 'asan_pardakht', label: 'آسان پرداخت (Asan Pardakht)', defaultPort: 8888, bankHints: ['کشاورزی', 'مسکن'] },
  { id: 'novin', label: 'پرداخت نوین آرین', defaultPort: 5000, bankHints: ['اقتصاد نوین'] },
  { id: 'mabna', label: 'مبنا کارت آریا (صادرات)', defaultPort: 9000, bankHints: ['صادرات'] },
  { id: 'http_bridge', label: 'سرویس وب‌سرویس لوکال ویندوز (HTTP Bridge)', defaultPort: 8085, bankHints: [] },
];

export function suggestPosPresetForBank(bankName: string): PosDriverPreset {
  const clean = (bankName || '').trim();
  const match = POS_DRIVER_PRESETS.find((p) =>
    p.bankHints.some((hint) => clean.includes(hint))
  );
  return match || POS_DRIVER_PRESETS[0];
}

export function getPosDriverLabel(driver?: string): string {
  return POS_DRIVER_PRESETS.find((p) => p.id === driver)?.label || 'کارتخوان شبکه (PC-POS)';
}

/**
 * Convert app currency amount (Toman or Rial) into Rials required by Iranian Shaparak POS terminals.
 */
export function convertAmountToPosRials(
  amount: number,
  appCurrency: 'toman' | 'rial' = 'toman',
  posUnit: 'rial' | 'toman' = 'rial'
): number {
  const base = Math.max(0, Math.round(Number(amount) || 0));
  if (posUnit === 'toman') return base;
  return appCurrency === 'rial' ? base : base * 10;
}

export interface DiscoveredPosCandidate {
  ip: string;
  port: number;
  latencyMs: number;
  suggestedDriver: IranianPosDriver;
}

export async function scanLanPosTerminals(customSubnetBase?: string): Promise<{
  ok: boolean;
  scannedSubnets: string[];
  discovered: DiscoveredPosCandidate[];
  error?: string;
}> {
  const res = await fetch('/api/pos-terminal/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customSubnetBase }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'خطا در جستجوی کارتخوان در شبکه');
  }
  return data;
}

export async function testPosTerminal(config: {
  mode: 'tcp_direct' | 'http_bridge';
  driver: IranianPosDriver;
  ip?: string;
  port?: number;
  bridgeUrl?: string;
}): Promise<{ ok: boolean; reachable: boolean; latencyMs?: number; message: string }> {
  const res = await fetch('/api/pos-terminal/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok && !data?.message) {
    throw new Error(data?.error || 'خطا در تست اتصال کارتخوان');
  }
  return data;
}

export interface PosPayDispatchResult {
  ok: boolean;
  status: 'approved' | 'sent' | 'declined' | 'error';
  amountRial: number;
  trackingCode?: string;
  cardMask?: string;
  responseCode?: string;
  message: string;
}

export async function dispatchAmountToBankPos(
  bank: BankAccount,
  amountInAppCurrency: number,
  invoiceRef: string,
  appCurrency: 'toman' | 'rial' = 'toman'
): Promise<PosPayDispatchResult> {
  const amountRial = convertAmountToPosRials(
    amountInAppCurrency,
    appCurrency,
    bank.posCurrencyUnit || 'rial'
  );

  const res = await fetch('/api/pos-terminal/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: bank.posConnectionMode || 'tcp_direct',
      driver: bank.posDriver || 'auto',
      ip: bank.posIp,
      port: bank.posPort,
      bridgeUrl: bank.posBridgeUrl,
      terminalId: bank.posTerminalId,
      merchantId: bank.posMerchantId,
      amountRial,
      invoiceRef,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || data?.message || 'خطا در ارسال مبلغ به کارتخوان');
  }
  return data;
}
