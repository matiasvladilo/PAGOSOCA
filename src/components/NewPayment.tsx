import { useState } from 'react';
import { calculateKhipuGrossAmount, calculateCustomerFee } from '../utils/fee';
import PaymentStatus from './PaymentStatus';
import Icon from './Icon';
import type { Branch, Payment, PaymentStatus as Status } from '../types';

const BRANCHES: Branch[] = ['PV', 'La Reina', 'PT', 'Bilbao'];

function formatCLP(amount: number): string {
  return amount > 0 ? `$${amount.toLocaleString('es-CL')}` : '—';
}

type Phase = 'form' | 'waiting' | 'result';

export default function NewPayment() {
  const [branch, setBranch] = useState<Branch>('PV');
  const [saleInput, setSaleInput] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [finalStatus, setFinalStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const saleAmount = parseInt(saleInput.replace(/\D/g, ''), 10) || 0;
  const grossAmount = saleAmount > 0 ? calculateKhipuGrossAmount(saleAmount) : 0;
  const customerFee = saleAmount > 0 ? calculateCustomerFee(saleAmount) : 0;

  async function handleGenerate() {
    if (!saleAmount || saleAmount <= 0) {
      setError('Ingresa un monto válido');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/create-khipu-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_amount: saleAmount, branch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al generar el cobro');
      setPayment(data as Payment);
      setPhase('waiting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar el cobro');
    } finally {
      setLoading(false);
    }
  }

  function handleComplete(status: Status) {
    setFinalStatus(status);
    setPhase('result');
  }

  function handleReset() {
    setPhase('form');
    setPayment(null);
    setFinalStatus(null);
    setSaleInput('');
    setError(null);
  }

  if (phase === 'waiting' && payment) {
    return <PaymentStatus payment={payment} onComplete={handleComplete} />;
  }

  if (phase === 'result') {
    if (finalStatus === 'paid') {
      return (
        <div className="result result--paid">
          <div className="result-icon">
            <Icon name="check" size={32} />
          </div>
          <h2>Pago aprobado</h2>
          <p>Puedes entregar el producto.</p>
          <button className="btn-primary" onClick={handleReset}>
            Nuevo cobro
          </button>
        </div>
      );
    }
    return (
      <div className="result result--failed">
        <div className="result-icon">
          <Icon name="x" size={32} />
        </div>
        <h2>Pago no confirmado</h2>
        <p>No entregar el producto.</p>
        <button className="btn-primary" onClick={handleReset}>
          Generar nuevo cobro
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="notice">
        <Icon name="alert" size={16} />
        <span>
          <strong>Entrega solo con el pago aprobado.</strong> El comprobante del cliente no es
          confirmación.
        </span>
      </div>

      <div className="form-group">
        <label htmlFor="branch">Sucursal</label>
        <select
          id="branch"
          className="select select-branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value as Branch)}
        >
          {BRANCHES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="sale">Monto de venta</label>
        <div className="amount-input-wrapper">
          <span className="amount-prefix">$</span>
          <input
            id="sale"
            className="amount-input"
            type="text"
            inputMode="numeric"
            value={saleInput}
            onChange={(e) => setSaleInput(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {saleAmount > 0 && (
        <div className="fee-summary">
          <div className="fee-row">
            <span>Monto venta</span>
            <span>{formatCLP(saleAmount)}</span>
          </div>
          <div className="fee-row">
            <span>Cargo transferencia</span>
            <span>{formatCLP(customerFee)}</span>
          </div>
          <div className="fee-row fee-row--total">
            <span>Total a cobrar al cliente</span>
            <span>{formatCLP(grossAmount)}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="error-msg" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      )}

      <button
        className="btn-primary"
        onClick={handleGenerate}
        disabled={loading || saleAmount <= 0}
      >
        {loading ? 'Generando…' : 'Generar QR de pago'}
        {!loading && <Icon name="arrow-right" size={16} />}
      </button>
    </div>
  );
}
