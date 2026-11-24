import { useState } from 'react';
import NewPayment from './components/NewPayment';
import PaymentHistory from './components/PaymentHistory';
import './App.css';

type Tab = 'new' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'new', label: 'Nuevo cobro' },
  { id: 'history', label: 'Historial' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('new');

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <img
            className="app-header-wordmark"
            src="/brand/la-oca-wordmark.png"
            width={1536}
            height={364}
            alt="La Oca"
          />
        </div>
      </header>

      <div className="subbar">
        <div className="subbar-inner">
          <h1 className="subbar-title">PagosOca</h1>
          <nav className="subbar-actions" aria-label="Secciones">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`chip${activeTab === tab.id ? ' chip--active' : ''}`}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="app-content">
        {activeTab === 'new' && <NewPayment />}
        {activeTab === 'history' && <PaymentHistory />}
      </main>
    </div>
  );
}
