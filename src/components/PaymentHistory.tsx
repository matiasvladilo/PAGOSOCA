import { useEffect, useState } from 'react';
import Icon from './Icon';
import type { HistoryPayment, Branch, PaymentStatus } from '../types';

const BRANCHES: Branch[] = ['PV', 'La Reina', 'PT', 'Bilbao'];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function formatCLP(amount: number): string {
  return `$${amount.toLocaleString('es-CL')}`;
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending:   'Pendiente',
  paid:      'Pagado',
  failed:    'Fallido',
  expired:   'Expirado',
  cancelled: 'Cancelado',
};

const STATUS_VARIANT: Record<PaymentStatus, string> = {
  pending:   'pending',
  paid:      'paid',
  failed:    'failed',
  expired:   'neutral',
  cancelled: 'neutral',
};

export default function PaymentHistory() {
  const [payments, setPayments] = useState<HistoryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { fetchPayments(); }, []);

  async function fetchPayments() {
    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/list-payments');
      if (!res.ok) throw new Error();
      setPayments(await res.json() as HistoryPayment[]);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = payments.filter((p) => {
    if (branchFilter !== 'all' && p.branch !== branchFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return <p className="history-state">Cargando historial…</p>;
  }

  return (
    <div>
      <div className="history-filters">
        <select
          className="select"
          aria-label="Filtrar por sucursal"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
        >
          <option value="all">Todas las sucursales</option>
          {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          className="select"
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="paid">Pagado</option>
          <option value="failed">Fallido</option>
          <option value="expired">Expirado</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <button className="btn-icon" aria-label="Actualizar historial" onClick={fetchPayments}>
          <Icon name="refresh" size={16} />
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="history-state">No hay pagos registrados hoy.</p>
      ) : (
        <div className="history-list">
          {filtered.map((p) => (
            <div key={p.id} className="payment-card">
              <div className="payment-card-header">
                <span className="payment-card-meta">{formatTime(p.created_at)} · {p.branch}</span>
                <span className={`badge badge--${STATUS_VARIANT[p.status]}`}>
                  {STATUS_LABELS[p.status]}
                </span>
              </div>
              <div className="payment-card-amounts">
                <div className="payment-card-total">{formatCLP(p.amount_charged)}</div>
                <div className="payment-card-detail">
                  Venta {formatCLP(p.sale_amount)} + comisión {formatCLP(p.customer_fee)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
