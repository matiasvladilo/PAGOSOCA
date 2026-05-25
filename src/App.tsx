import { useState } from 'react';
import NewPayment from './components/NewPayment';
import PaymentHistory from './components/PaymentHistory';
import './App.css';

type Tab = 'new' | 'history';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('new');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Cobro por transferencia automática</h1>
        <div className="warning-banner">
          ⚠️ Solo entregar producto cuando el pago esté aprobado.
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab${activeTab === 'new' ? ' tab--active' : ''}`}
          onClick={() => setActiveTab('new')}
        >
          Nuevo Cobro
        </button>
        <button
          className={`tab${activeTab === 'history' ? ' tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Historial
        </button>
      </nav>

      <main className="app-content">
        {activeTab === 'new' && <NewPayment />}
        {activeTab === 'history' && <PaymentHistory />}
      </main>
    </div>
  );
}
