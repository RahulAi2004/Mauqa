import React from 'react';

const PLANS = [
  {
    name: 'Free', price: 'Rs 0', tag: 'For getting started', cta: 'Current Plan', current: true,
    feats: ['Unlimited reminders', 'Quick add + AI capture', 'Browser notifications', 'Calendar export (.ics)', 'CSV / JSON export'],
  },
  {
    name: 'Premium', price: 'Rs 499', tag: 'For power users', cta: 'Coming soon', popular: true,
    feats: ['Everything in Free', 'WhatsApp reminders', 'Push notifications (app closed)', 'Weekly digest email', 'Priority support'],
  },
  {
    name: 'Premium Plus', price: 'Rs 999', tag: 'For teams', cta: 'Coming soon',
    feats: ['Everything in Premium', 'Shared calendars', 'AI study/work suggestions', 'File attachments', 'Early access to new features'],
  },
];

export default function PremiumPage({ onToast }) {
  return (
    <div className="page">
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: '1.6rem' }}>👑</div>
        <h2 style={{ margin: '4px 0' }}>Go Premium</h2>
        <p className="muted">Premium is on the roadmap — pricing shown is a preview, nothing is charged today.</p>
      </div>
      <div className="price-grid">
        {PLANS.map((p) => (
          <div key={p.name} className={`card price-card ${p.popular ? 'popular' : ''}`}>
            {p.popular && <span className="pop-tag">Most Popular</span>}
            <h3 style={{ marginBottom: 0 }}>{p.name}</h3>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>{p.tag}</p>
            <p className="price">{p.price} <span>/month</span></p>
            <button
              className={`btn wide ${p.popular ? 'primary' : ''}`}
              disabled={p.current}
              onClick={() => !p.current && onToast('Premium abhi roadmap par hai 🚀 — free version fully working hai!')}
            >{p.cta}</button>
            <ul className="feat-list">
              {p.feats.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="muted" style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: 16 }}>🛡 Cancel anytime · No hidden fees · Your data stays yours (export anytime)</p>
    </div>
  );
}
