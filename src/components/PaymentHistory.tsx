import { useEffect, useState } from 'react';
import type { HistoryPayment, Branch, PaymentStatus } from '../types';

const BRANCHES: Branch[] = ['PV', 'La Reina', 'PT', 'Bilbao'];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function formatCLP(amount: number): string {
  return `$${amount.toLocaleString('es-CL')}`;
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending:   '⏳ Pendiente',
  paid:      '✅ Pagado',
  failed:    '❌ Fallido',
  expired:   '⏱ Expirado',
  cancelled: '🚫 Cancelado',
};

const STATUS_CLASS: Record<PaymentStatus, string> = {
  pending:   'badge-pending',
  paid:      'badge-paid',
  failed:    'badge-failed',
  expired:   'badge-expired',
  cancelled: 'badge-expired',
};

export default function PaymentHistory() {
  const [payments, setPayments] = useState<HistoryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchPayments();
  }, []);

  async function fetchPayments() {
    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/list-payments');
      if (!res.ok) throw new Error('Error al cargar historial');
      const data = await res.json();
      setPayments(data as HistoryPayment[]);
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
    return <p style={{ color: '#6b7280', marginTop: '1rem' }}>Cargando historial...</p>;
  }

  return (
    <div>
      <div className="history-filters">
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="all">Todas las sucursales</option>
          {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="paid">Pagado</option>
          <option value="failed">Fallido</option>
          <option value="expired">Expirado</option>
          <option value="cancelled">Cancelado</option>
        </select>

        <button className="btn-refresh" onClick={fetchPayments} title="Actualizar">
          🔄 Actualizar
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="history-empty">No hay pagos registrados hoy.</p>
      ) : (
        <div className="history-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Sucursal</th>
                <th>Cajero</th>
                <th>Venta</th>
                <th>Comisión</th>
                <th>Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{formatTime(p.created_at)}</td>
                  <td>{p.branch}</td>
                  <td>{p.cashier ?? '—'}</td>
                  <td>{formatCLP(p.sale_amount)}</td>
                  <td>{formatCLP(p.customer_fee)}</td>
                  <td>{formatCLP(p.amount_charged)}</td>
                  <td>
                    <span className={STATUS_CLASS[p.status]}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}