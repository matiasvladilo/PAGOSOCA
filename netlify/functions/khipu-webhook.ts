import type { Handler } from '@netlify/functions';
import { supabase } from './_shared/supabase.js';
import { verifyKhipuWebhookIfPossible, getKhipuPaymentStatus } from './_shared/khipu.js';

function parseBody(body: string, contentType: string): Record<string, string> {
  if (contentType.includes('application/json')) {
    return JSON.parse(body) as Record<string, string>;
  }
  return Object.fromEntries(new URLSearchParams(body));
}

const KHIPU_TO_INTERNAL: Record<string, string> = {
  done: 'paid',
  expired: 'expired',
  failed: 'failed',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let payload: Record<string, string> = {};

  try {
    const rawBody = event.body ?? '';
    const contentType = (event.headers['content-type'] ?? '').toLowerCase();
    payload = parseBody(rawBody, contentType);

    const providerPaymentId = payload['payment_id'] ?? null;
    const transactionId = payload['transaction_id'] ?? null;

    // Save event always — even if processing fails below
    const { data: eventRecord } = await supabase
      .from('payment_events')
      .insert({
        provider: 'khipu',
        provider_payment_id: providerPaymentId,
        event_type: 'notification',
        payload,
      })
      .select('id')
      .single();

    const verified = verifyKhipuWebhookIfPossible(payload, event.headers as Record<string, string>);
    if (!verified) {
      return { statusCode: 200, body: 'ok' };
    }

    if (!providerPaymentId) {
      return { statusCode: 200, body: 'ok' };
    }

    // Find payment: prefer transaction_id (our uuid), fall back to provider_payment_id
    const { data: payment } = transactionId
      ? await supabase
          .from('payments')
          .select('id, status, amount_charged')
          .eq('id', transactionId)
          .maybeSingle()
      : await supabase
          .from('payments')
          .select('id, status, amount_charged')
          .eq('provider_payment_id', providerPaymentId)
          .maybeSingle();

    if (!payment) {
      return { statusCode: 200, body: 'ok' };
    }

    // Idempotent: already in terminal state
    if (['paid', 'failed', 'expired', 'cancelled'].includes(payment.status)) {
      if (eventRecord?.id) {
        await supabase
          .from('payment_events')
          .update({ processed_at: new Date().toISOString(), payment_id: payment.id })
          .eq('id', eventRecord.id);
      }
      return { statusCode: 200, body: 'ok' };
    }

    // Verify with Khipu before updating
    const khipuStatus = await getKhipuPaymentStatus(providerPaymentId);
    const internalStatus = KHIPU_TO_INTERNAL[khipuStatus.status];

    if (!internalStatus) {
      // Still pending — do nothing
      return { statusCode: 200, body: 'ok' };
    }

    if (internalStatus === 'paid' && khipuStatus.amount !== payment.amount_charged) {
      console.error(`Amount mismatch for payment ${payment.id}: expected ${payment.amount_charged}, got ${khipuStatus.amount}`);
      return { statusCode: 200, body: 'ok' };
    }

    const updateData: Record<string, unknown> = { status: internalStatus };
    if (internalStatus === 'paid') {
      updateData.paid_at = new Date().toISOString();
    }

    await supabase.from('payments').update(updateData).eq('id', payment.id);

    if (eventRecord?.id) {
      await supabase
        .from('payment_events')
        .update({ processed_at: new Date().toISOString(), payment_id: payment.id })
        .eq('id', eventRecord.id);
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    // Always return 200 to Khipu — prevents infinite retries
    console.error('Webhook processing error:', err);
    return { statusCode: 200, body: 'ok' };
  }
};
