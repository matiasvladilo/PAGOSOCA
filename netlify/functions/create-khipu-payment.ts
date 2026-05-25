import type { Handler } from '@netlify/functions';
import { supabase } from './_shared/supabase.js';
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

    // Create pending record
    const { data: payment, error: insertError } = await supabase
      .from('payments')
      .insert({ sale_amount, customer_fee, amount_charged, branch, cashier: cashier ?? null })
      .select()
      .single();

    if (insertError || !payment) {
      throw new Error(`Supabase error: ${insertError?.message}`);
    }

    const notifyUrl =
      process.env.KHIPU_NOTIFICATION_URL ??
      `${process.env.APP_BASE_URL}/.netlify/functions/khipu-webhook`;

    const khipu = await createKhipuPayment({
      subject: `Pago en tienda - ${branch}`,
      amount: amount_charged,
      currency: 'CLP',
      transactionId: payment.id,
      notifyUrl,
    });

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        provider_payment_id: khipu.payment_id,
        payment_url: khipu.payment_url,
        raw_create_response: khipu,
      })
      .eq('id', payment.id);

    if (updateError) {
      throw new Error(`Failed to update payment with Khipu data: ${updateError.message}`);
    }

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
