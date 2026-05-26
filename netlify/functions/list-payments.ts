import type { Handler } from '@netlify/functions';
import { sql } from './_shared/db.js';
import { getKhipuPaymentStatus } from './_shared/khipu.js';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const KHIPU_TO_INTERNAL: Record<string, string> = {
  done: 'paid',
  expired: 'expired',
  failed: 'failed',
};

async function refreshPendingPayment(payment: {
  id: string;
  provider_payment_id: string;
  amount_charged: number;
}): Promise<string> {
  try {
    const khipu = await getKhipuPaymentStatus(payment.provider_payment_id);
    const newStatus = KHIPU_TO_INTERNAL[khipu.status];
    if (!newStatus) return 'pending';

    if (newStatus === 'paid' && Number(khipu.amount) !== payment.amount_charged) return 'pending';

    if (newStatus === 'paid') {
      await sql`UPDATE payments SET status = 'paid', paid_at = now() WHERE id = ${payment.id}`;
    } else {
      await sql`UPDATE payments SET status = ${newStatus} WHERE id = ${payment.id}`;
    }
    return newStatus;
  } catch {
    return 'pending';
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const now = new Date();
    const chileOffsetMs = 4 * 60 * 60 * 1000;
    const chileNow = new Date(now.getTime() - chileOffsetMs);
    const startOfDay = new Date(Date.UTC(chileNow.getUTCFullYear(), chileNow.getUTCMonth(), chileNow.getUTCDate()) + chileOffsetMs);

    const rows = await sql`
      SELECT id, created_at, branch, cashier, sale_amount, customer_fee, amount_charged, status, paid_at, provider_payment_id
      FROM payments
      WHERE created_at >= ${startOfDay.toISOString()}
      ORDER BY created_at DESC
    ` as Array<{
      id: string; created_at: string; branch: string; cashier: string | null;
      sale_amount: number; customer_fee: number; amount_charged: number;
      status: string; paid_at: string | null; provider_payment_id: string | null;
    }>;

    const pending = rows.filter(p => p.status === 'pending' && p.provider_payment_id);
    if (pending.length > 0) {
      await Promise.all(pending.map(p =>
        refreshPendingPayment({ id: p.id, provider_payment_id: p.provider_payment_id!, amount_charged: p.amount_charged })
          .then(newStatus => { p.status = newStatus; })
      ));
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(rows.map(({ provider_payment_id: _, ...rest }) => rest)),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
  }
};
