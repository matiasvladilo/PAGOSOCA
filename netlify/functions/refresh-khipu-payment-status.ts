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
  cancelled: 'cancelled',
  rejected: 'cancelled',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { payment_id } = JSON.parse(event.body ?? '{}');

    if (!payment_id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Falta payment_id' }) };
    }

    const rows = await sql`
      SELECT id, status, provider_payment_id, sale_amount, customer_fee, amount_charged, paid_at
      FROM payments
      WHERE id = ${payment_id}
    `;
    const payment = rows[0] as {
      id: string; status: string; provider_payment_id: string | null;
      sale_amount: number; customer_fee: number; amount_charged: number; paid_at: string | null;
    } | undefined;

    if (!payment) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Pago no encontrado' }) };
    }

    if (!payment.provider_payment_id) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(payment) };
    }

    const khipuStatus = await getKhipuPaymentStatus(payment.provider_payment_id);
    const internalStatus = KHIPU_TO_INTERNAL[khipuStatus.status] ?? payment.status;

    if (internalStatus !== payment.status) {
      if (internalStatus === 'paid' && khipuStatus.amount !== payment.amount_charged) {
        console.error(`Amount mismatch for payment ${payment.id}: expected ${payment.amount_charged}, got ${khipuStatus.amount}`);
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(payment) };
      }

      if (internalStatus === 'paid') {
        const paidAt = new Date().toISOString();
        await sql`UPDATE payments SET status = ${internalStatus}, paid_at = now() WHERE id = ${payment.id}`;
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ...payment, status: internalStatus, paid_at: paidAt }),
        };
      }

      await sql`UPDATE payments SET status = ${internalStatus} WHERE id = ${payment.id}`;
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ...payment, status: internalStatus }),
      };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(payment) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
  }
};
