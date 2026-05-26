import type { Handler } from '@netlify/functions';
import { sql } from './_shared/db.js';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const id = event.queryStringParameters?.id;

    if (!id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Falta id' }) };
    }

    const rows = await sql`
      SELECT id, status, sale_amount, customer_fee, amount_charged, paid_at
      FROM payments
      WHERE id = ${id}
    `;
    const payment = rows[0];

    if (!payment) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Pago no encontrado' }) };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(payment) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
  }
};
