const KHIPU_API_BASE = 'https://payment-api.khipu.com/v3';

function apiKey(): string {
  return process.env.KHIPU_API_KEY!;
}

export interface CreatePaymentParams {
  subject: string;
  amount: number;
  currency: string;
  transactionId: string;
  notifyUrl?: string;
}

export interface KhipuPaymentCreated {
  payment_id: string;
  payment_url: string;
  simplified_transfer_url: string;
  transfer_url: string;
  app_url: string;
  ready_for_terminal: boolean;
}

export async function createKhipuPayment(
  params: CreatePaymentParams
): Promise<KhipuPaymentCreated> {
  const url = `${KHIPU_API_BASE}/payments`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey(),
    },
    body: JSON.stringify({
      subject: params.subject,
      currency: params.currency,
      amount: params.amount,
      transaction_id: params.transactionId,
      ...(params.notifyUrl ? { notify_url: params.notifyUrl } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Khipu API ${response.status}: ${text}`);
  }

  return response.json() as Promise<KhipuPaymentCreated>;
}

export interface KhipuPaymentStatus {
  payment_id: string;
  status: string; // 'pending' | 'verifying' | 'done' | 'expired' | 'failed' | 'cancelled'
  status_detail: string;
  amount: number;
  currency: string;
  transaction_id: string;
  expires_date?: string;
}

export async function getKhipuPaymentStatus(
  paymentId: string
): Promise<KhipuPaymentStatus> {
  const url = `${KHIPU_API_BASE}/payments/${paymentId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey(),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Khipu API ${response.status}: ${text}`);
  }

  const data = await response.json() as KhipuPaymentStatus & { amount: string | number };
  return { ...data, amount: Number(data.amount) };
}

export function verifyKhipuWebhookIfPossible(
  _payload: Record<string, string>,
  _headers: Record<string, string>
): boolean {
  return true;
}
