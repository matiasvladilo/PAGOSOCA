import crypto from 'crypto';

const KHIPU_API_BASE = 'https://khipu.com/api/2.0';

function buildSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  secret: string
): string {
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const stringToSign = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join('&');

  return crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');
}

export interface CreatePaymentParams {
  subject: string;
  amount: number;
  currency: string;
  transactionId: string;
  notifyUrl: string;
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
  const receiverId = process.env.KHIPU_RECEIVER_ID!;
  const secret = process.env.KHIPU_SECRET!;
  const url = `${KHIPU_API_BASE}/payments`;

  const bodyParams: Record<string, string> = {
    subject: params.subject,
    currency: params.currency,
    amount: String(params.amount),
    transaction_id: params.transactionId,
    notify_url: params.notifyUrl,
  };

  const signature = buildSignature('POST', url, bodyParams, secret);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `${receiverId}:${signature}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams(bodyParams).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Khipu API ${response.status}: ${text}`);
  }

  return response.json() as Promise<KhipuPaymentCreated>;
}

export interface KhipuPaymentStatus {
  payment_id: string;
  status: string; // 'pending' | 'verifying' | 'done' | 'expired' | 'failed'
  status_detail: string;
  amount: number;
  currency: string;
  transaction_id: string;
}

export async function getKhipuPaymentStatus(
  paymentId: string
): Promise<KhipuPaymentStatus> {
  const receiverId = process.env.KHIPU_RECEIVER_ID!;
  const secret = process.env.KHIPU_SECRET!;
  const url = `${KHIPU_API_BASE}/payments/${paymentId}`;

  const signature = buildSignature('GET', url, {}, secret);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `${receiverId}:${signature}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Khipu API ${response.status}: ${text}`);
  }

  return response.json() as Promise<KhipuPaymentStatus>;
}

// TODO: Implement proper webhook signature verification per official Khipu docs.
// Current approach: trust the notification token and verify by calling getKhipuPaymentStatus.
// When Khipu provides HMAC signature documentation, validate headers here.
export function verifyKhipuWebhookIfPossible(
  _payload: Record<string, string>,
  _headers: Record<string, string>
): boolean {
  return true;
}
