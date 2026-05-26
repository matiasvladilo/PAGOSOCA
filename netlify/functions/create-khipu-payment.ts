import type { Handler } from '@netlify/functions';
import { sql } from './_shared/db.js';
import { calculateKhipuGrossAmount, calculateCustomerFee } from './_shared/fee.js';
import { createKhipuPayment } from './_shared/khipu.js';

const VALID_BRANCHES = ['PV', 'La Reina', 'PT', 'Bilbao'] as const;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body ?? '{}');
    const { sale_amount, branch, cashier } = body;

    if (!Number.isInteger(sale_amount) || sale_amount <= 0) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'sale_amount debe ser un número entero positivo' }),
      };
    }

    if (!VALID_BRANCHES.includes(branch)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `branch debe ser uno de: ${VALID_BRANCHES.join(', ')}` }),
      };
    }

    const amount_charged = calculateKhipuGrossAmount(sale_amount);
    const customer_fee = calculateCustomerFee(sale_amount);

    const rows = await sql`
      INSERT INTO payments (sale_amount, customer_fee, amount_charged, branch, cashier)
      VALUES (${sale_amount}, ${customer_fee}, ${amount_charged}, ${branch}, ${cashier ?? null})
      RETURNING *
    `;
    const payment = rows[0] as { id: string };

    if (!payment) {
      throw new Error('Failed to insert payment record');
    }

    const baseUrl = process.env.KHIPU_NOTIFICATION_URL ?? process.env.APP_BASE_URL ?? '';
    const notifyUrl = baseUrl.startsWith('http://localhost')
      ? undefined
      : `${baseUrl}/.netlify/functions/khipu-webhook`;

    const khipu = await createKhipuPayment({
      subject: `Pago en tienda - ${branch}`,
      amount: amount_charged,
      currency: 'CLP',
      transactionId: payment.id,
      notifyUrl,
    });

    await sql`
      UPDATE payments
      SET provider_payment_id = ${khipu.payment_id},
          payment_url = ${khipu.payment_url},
          raw_create_response = ${JSON.stringify(khipu)}::jsonb
      WHERE id = ${payment.id}
    `;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        payment_id: payment.id,
        sale_amount,
        customer_fee,
        amount_charged,
        payment_url: khipu.payment_url,
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
  }
};
