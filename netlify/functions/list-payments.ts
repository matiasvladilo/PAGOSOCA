import type { Handler } from '@netlify/functions';
import { supabase } from './_shared/supabase.js';

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
    // Chile is UTC-4 (standard) / UTC-3 (summer). Use UTC-4 as conservative offset.
    const now = new Date();
    const chileOffsetMs = 4 * 60 * 60 * 1000;
    const chileNow = new Date(now.getTime() - chileOffsetMs);
    const startOfDay = new Date(Date.UTC(chileNow.getUTCFullYear(), chileNow.getUTCMonth(), chileNow.getUTCDate()) + chileOffsetMs);

    const { data, error } = await supabase
      .from('payments')
      .select('id, created_at, branch, cashier, sale_amount, customer_fee, amount_charged, status, paid_at')
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data ?? []) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
  }
};
