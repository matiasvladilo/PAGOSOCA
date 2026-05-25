# PAGOSOCA — Diseño del Sistema

**Fecha:** 2026-05-25  
**Stack:** React + Vite + TypeScript · Netlify Functions · Supabase · Khipu

---

## Problema

Cuando un cliente paga por transferencia, el dueño debe revisar manualmente el banco para confirmar si el dinero llegó. El trabajador no tiene forma de saber si el pago fue real sin llamar al dueño o revisar un comprobante manual.

## Objetivo

Eliminar la verificación manual. El sistema genera un QR de pago Khipu, recibe la confirmación automática por webhook y muestra "Pago aprobado" solo cuando Khipu lo confirma. El trabajador nunca valida comprobantes ni pantallazos.

---

## Cálculo de comisión Khipu

Modalidad: 0,69% + IVA (19%)  
Comisión total sobre el monto cobrado: `0.0069 × 1.19 = 0.008211`

```ts
const KHIPU_RATE = 0.0069;
const IVA = 0.19;
const TOTAL_FEE_RATE = KHIPU_RATE * (1 + IVA); // 0.008211

grossAmount = Math.ceil(netAmount / (1 - TOTAL_FEE_RATE));
customerFee = grossAmount - netAmount;
```

Ejemplos:
| Venta | Total cobrado | Comisión cliente |
|-------|--------------|-----------------|
| $1.500 | $1.513 | $13 |
| $3.000 | $3.025 | $25 |
| $5.000 | $5.042 | $42 |
| $10.000 | $10.083 | $83 |

---

## Estructura del proyecto

```
PAGOSOCA/
├── src/
│   ├── components/
│   │   ├── NewPayment.tsx       # Orquesta las 3 fases del cobro (formulario → esperando → resultado)
│   │   ├── PaymentStatus.tsx    # Sub-componente fase 2: QR + polling + botón plan B
│   │   └── PaymentHistory.tsx   # Historial del día con filtros
│   ├── App.tsx                  # Tabs: Nuevo Cobro / Historial
│   ├── main.tsx
│   └── types.ts                 # Tipos compartidos frontend
├── netlify/
│   └── functions/
│       ├── _shared/
│       │   ├── khipu.ts         # createKhipuPayment(), getKhipuPaymentStatus(), verifyKhipuWebhookIfPossible()
│       │   ├── supabase.ts      # Cliente Supabase con service role key
│       │   └── fee.ts           # calculateKhipuGrossAmount(), calculateCustomerFee()
│       ├── create-khipu-payment.ts
│       ├── payment-status.ts
│       ├── khipu-webhook.ts
│       └── refresh-khipu-payment-status.ts
├── netlify.toml
├── .env.example
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Base de datos (Supabase)

### Tabla `payments`

```sql
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
```

Estados válidos: `pending`, `paid`, `failed`, `expired`, `cancelled`

### Tabla `payment_events`

```sql
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
```

---

## Backend — Netlify Functions

### `POST /.netlify/functions/create-khipu-payment`

**Entrada:**
```json
{ "sale_amount": 5000, "branch": "PV", "cashier": "Sofía" }
```

**Flujo:**
1. Validar `sale_amount` (entero positivo)
2. Validar `branch` ∈ `["PV", "La Reina", "PT", "Bilbao"]`
3. Calcular `customer_fee` y `amount_charged`
4. Crear registro `pending` en Supabase
5. Llamar a Khipu API v3 con `amount_charged`
6. Guardar `provider_payment_id`, `payment_url`, `raw_create_response`
7. Devolver al frontend:

```json
{
  "payment_id": "uuid",
  "sale_amount": 5000,
  "customer_fee": 42,
  "amount_charged": 5042,
  "payment_url": "https://khipu.com/..."
}
```

### `GET /.netlify/functions/payment-status?id=UUID`

Consulta Supabase y devuelve estado actual. Usado por el polling del frontend cada 2 segundos.

```json
{
  "id": "uuid",
  "status": "pending",
  "sale_amount": 5000,
  "customer_fee": 42,
  "amount_charged": 5042,
  "paid_at": null
}
```

### `POST /.netlify/functions/khipu-webhook`

**Flujo:**
1. Recibir payload de Khipu
2. Guardar en `payment_events` (siempre, incluso si falla lo siguiente)
3. Identificar `provider_payment_id` en el payload
4. Buscar pago en Supabase por `provider_payment_id`
5. Si ya está `paid` → responder 200 (idempotente)
6. Validar monto
7. Si pago exitoso → `status = 'paid'`, `paid_at = now()`
8. Si fallido/expirado/cancelado → actualizar estado correspondiente
9. Marcar `payment_events.processed_at = now()`
10. Responder 200 siempre (para que Khipu no reintente)

### `POST /.netlify/functions/refresh-khipu-payment-status`

**Entrada:** `{ "payment_id": "uuid" }`

Plan B manual. Consulta directamente a Khipu por `provider_payment_id`, sincroniza estado en Supabase, devuelve estado final.

### `_shared/khipu.ts`

Encapsula toda comunicación con Khipu:
- `createKhipuPayment(params)` — crea cobro vía API v3
- `getKhipuPaymentStatus(providerPaymentId)` — consulta estado
- `verifyKhipuWebhookIfPossible(payload, headers)` — **TODO**: implementar validación de firma según documentación oficial de Khipu

---

## Frontend

### Navegación

Una sola página con dos tabs:
- **Nuevo Cobro** (tab principal)
- **Historial** (tab secundario)

Sin React Router. Sin autenticación (app interna).

### Tab "Nuevo Cobro" — 3 fases

**Fase 1: Formulario**
- Selector de sucursal: PV / La Reina / PT / Bilbao
- Input cajero (texto libre)
- Input monto venta (número)
- Cálculo automático en tiempo real:
  - Monto venta
  - Cargo pago automático
  - Total a cobrar
- Botón "Generar QR Khipu"

**Fase 2: Esperando pago**
- QR grande generado con `qrcode.react`
- Link copiable
- Texto: "⚠️ Esperando pago... No entregar todavía."
- Polling silencioso cada 2 segundos a `payment-status`
- El polling se detiene automáticamente cuando el estado cambia a `paid`, `failed`, `expired` o `cancelled`
- Botón "Revisar estado del pago" (llama a `refresh-khipu-payment-status`)

**Fase 3: Resultado**
- Si `paid`: "✅ PAGO APROBADO — Puedes entregar el producto." + botón "Nuevo cobro"
- Si `failed/expired/cancelled`: "❌ Pago no confirmado. No entregar producto." + botón "Generar nuevo cobro"

### Tab "Historial"

Tabla con pagos del día:
- Columnas: Hora, Sucursal, Cajero, Monto venta, Comisión, Total cobrado, Estado
- Filtros: Sucursal, Estado
- Se actualiza al entrar al tab

### Advertencia operativa

Siempre visible en la parte superior:
> ⚠️ **Solo entregar producto cuando el pago esté aprobado.**

---

## Variables de entorno

Solo en Netlify/backend. Nunca en frontend.

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
KHIPU_RECEIVER_ID
KHIPU_API_KEY
KHIPU_SECRET
APP_BASE_URL
KHIPU_NOTIFICATION_URL
```

El archivo `.env.example` documenta estas variables sin valores.

---

## URL de notificación (webhook)

Una vez desplegado en Netlify:
```
https://NOMBRE-DEL-SITIO.netlify.app/.netlify/functions/khipu-webhook
```
Esta URL se configura manualmente en el panel de Khipu → "URL de notificación".

---

## Reglas de seguridad

1. Nunca exponer credentials en frontend
2. Todas las llamadas a Khipu desde Netlify Functions únicamente
3. Validar monto antes de marcar como pagado
4. Guardar todos los eventos de webhook en `payment_events`
5. El webhook es idempotente: si ya está `paid`, responder 200
6. Solo `payment.status === 'paid'` habilita entrega del producto
7. No confiar en datos del frontend para confirmar pagos
8. `try/catch` en todas las funciones serverless
9. Respuestas JSON consistentes en todos los endpoints

---

## Prioridades

1. Funcionalidad
2. Seguridad
3. Claridad para trabajadores no técnicos
4. Robustez ante errores
5. Diseño visual
