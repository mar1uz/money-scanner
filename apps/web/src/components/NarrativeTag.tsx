import React from 'react';

// Main narrative label on every coin (Marius, 2026-09-23): DeFi, L1, Meme,
// RWA, Liquid Staking... with "Crypto" as the generic fallback.
export const NarrativeTag: React.FC<{ narrative?: string; className?: string }> = ({ narrative, className = '' }) => (
  <span translate="no" className={`inline-flex items-center rounded-md border border-fuchsia-500/25 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-200 ${className}`}>
    {narrative || 'Crypto'}
  </span>
);
