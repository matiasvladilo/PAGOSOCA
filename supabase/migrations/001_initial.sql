-- Apply this migration in Supabase SQL Editor:
-- Project → SQL Editor → paste this file → Run

create table payments (
  id uuid primary key default gen_random_uuid(),
  sale_amount integer not null,
  customer_fee integer not null,
  amount_charged integer not null,
  branch text not null,
  cashier text,
  provider text default 'khipu',
  provider_payment_id text,
  payment_url text,
  status text default 'pending',
  created_at timestamptz default now(),
  paid_at timestamptz,
  expires_at timestamptz,
  raw_create_response jsonb
);

create index on payments (provider_payment_id);
create index on payments (status);
create index on payments (created_at);

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments(id),
  provider text default 'khipu',
  provider_payment_id text,
  event_type text,
  payload jsonb,
  received_at timestamptz default now(),
  processed_at timestamptz
);

create index on payment_events (payment_id);
create index on payment_events (provider_payment_id);
