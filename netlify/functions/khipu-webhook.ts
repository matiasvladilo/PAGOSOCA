import type { Handler } from '@netlify/functions';
import { sql } from './_shared/db.js';
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
    const eventRows = await sql`
      INSERT INTO payment_events (provider, provider_payment_id, event_type, payload)
      VALUES ('khipu', ${providerPaymentId}, 'notification', ${JSON.stringify(payload)}::jsonb)
      RETURNING id
    `;
    const eventRecord = eventRows[0] as { id: string } | undefined;

    const verified = verifyKhipuWebhookIfPossible(payload, event.headers as Record<string, string>);
    if (!verified) {
      return { statusCode: 200, body: 'ok' };
    }

    if (!providerPaymentId) {
      return { statusCode: 200, body: 'ok' };
    }

    // Find payment: prefer transaction_id (our uuid), fall back to provider_payment_id
    const paymentRows = transactionId
      ? await sql`SELECT id, status, amount_charged FROM payments WHERE id = ${transactionId}`
      : await sql`SELECT id, status, amount_charged FROM payments WHERE provider_payment_id = ${providerPaymentId}`;

    const payment = paymentRows[0] as { id: string; status: string; amount_charged: number } | undefined;

    if (!payment) {
      return { statusCode: 200, body: 'ok' };
    }

    // Idempotent: already in terminal state
    if (['paid', 'failed', 'expired', 'cancelled'].includes(payment.status)) {
      if (eventRecord?.id) {
        await sql`
          UPDATE payment_events
          SET processed_at = now(), payment_id = ${payment.id}
          WHERE id = ${eventRecord.id}
        `;
      }
      return { statusCode: 200, body: 'ok' };
    }

    // Verify with Khipu before updating
    const khipuStatus = await getKhipuPaymentStatus(providerPaymentId);
    const internalStatus = KHIPU_TO_INTERNAL[khipuStatus.status];

    if (!internalStatus) {
      return { statusCode: 200, body: 'ok' };
    }

    if (internalStatus === 'paid' && khipuStatus.amount !== payment.amount_charged) {
      console.error(`Amount mismatch for payment ${payment.id}: expected ${payment.amount_charged}, got ${khipuStatus.amount}`);
      return { statusCode: 200, body: 'ok' };
    }

    if (internalStatus === 'paid') {
      await sql`UPDATE payments SET status = ${internalStatus}, paid_at = now() WHERE id = ${payment.id}`;
    } else {
      await sql`UPDATE payments SET status = ${internalStatus} WHERE id = ${payment.id}`;
    }

    if (eventRecord?.id) {
      await sql`
        UPDATE payment_events
        SET processed_at = now(), payment_id = ${payment.id}
        WHERE id = ${eventRecord.id}
      `;
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    // Always return 200 to Khipu — prevents infinite retries
    console.error('Webhook processing error:', err);
    return { statusCode: 200, body: 'ok' };
  }
};
