export type Branch = 'PV' | 'La Reina' | 'PT' | 'Bilbao';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';

export interface Payment {
  payment_id: string;
  sale_amount: number;
  customer_fee: number;
  amount_charged: number;
  payment_url: string;
}

export interface PaymentStatusResponse {
  id: string;
  status: PaymentStatus;
  sale_amount: number;
  customer_fee: number;
  amount_charged: number;
  paid_at: string | null;
}

export interface HistoryPayment {
  id: string;
  created_at: string;
  branch: string;
  cashier: string | null;
  sale_amount: number;
  customer_fee: number;
  amount_charged: number;
  status: PaymentStatus;
  paid_at: string | null;
}
