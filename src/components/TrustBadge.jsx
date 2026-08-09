import React from 'react';
import { trust } from '../opportunity.js';

// One badge, one meaning, used everywhere: card, detail, capture review.
// `why` is the honest reason list — shown as a tooltip, never invented.
export default function TrustBadge({ item, state, size = 'sm' }) {
  const t = state || trust(item);
  const why = t.reasons?.length ? `${t.label} — ${t.reasons.join('; ')}` : t.label;
  return (
    <span className={`trust trust-${t.level} ${size === 'lg' ? 'trust-lg' : ''}`} title={why}>
      <span className="trust-ico">{t.icon}</span>
      {size === 'lg' ? t.label : (t.short || t.label)}
    </span>
  );
}
