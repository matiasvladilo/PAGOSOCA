import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Payment, PaymentStatus as Status } from '../types';

interface Props {
  payment: Payment;
  onComplete: (status: Status) => void;
}

const TERMINAL: Status[] = ['paid', 'failed', 'expired', 'cancelled'];

export default function PaymentStatus({ payment, onComplete }: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/.netlify/functions/payment-status?id=${payment.payment_id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (TERMINAL.includes(data.status)) {
          clearInterval(intervalRef.current!);
          onComplete(data.status);
        }
      } catch {
        // Keep polling silently
      }
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [payment.payment_id, onComplete]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(payment.payment_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/.netlify/functions/refresh-khipu-payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: payment.payment_id }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (TERMINAL.includes(data.status)) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onComplete(data.status);
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="status-card">
      <div className="qr-container">
        <QRCodeSVG value={payment.payment_url} size={220} />
      </div>

      <div className="payment-link-row">
        <button className="payment-link" onClick={handleCopy}>
          {copied ? '✓ Link copiado' : payment.payment_url}
        </button>
        <p className="copy-hint">Toca para copiar el link</p>
      </div>

      <div className="status-waiting">
        ⚠️ Esperando pago... No entregar todavía.
      </div>

      <button className="btn-secondary" onClick={handleRefresh} disabled={refreshing}>
        {refreshing ? 'Consultando...' : 'Revisar estado del pago'}
      </button>
    </div>
  );
}
