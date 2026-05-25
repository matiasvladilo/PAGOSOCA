import type { Handler } from '@netlify/functions';
import { supabase } from './_shared/supabase.js';
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

    const { data: payment, error } = await supabase
      .from('payments')
      .select('id, status, provider_payment_id, sale_amount, customer_fee, amount_charged, paid_at')
      .eq('id', payment_id)
      .single();

    if (error || !payment) {
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

      const updateData: Record<string, unknown> = { status: internalStatus };
      if (internalStatus === 'paid') updateData.paid_at = new Date().toISOString();

      await supabase.from('payments').update(updateData).eq('id', payment.id);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ...payment, status: internalStatus, paid_at: updateData.paid_at ?? payment.paid_at }),
      };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(payment) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
  }
};
