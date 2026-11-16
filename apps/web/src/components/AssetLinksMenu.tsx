import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AssetExternalLinks } from './AssetExternalLinks.js';
export function AssetLinksMenu({ symbol, marketClass }: { symbol: string; marketClass?: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" aria-haspopup="dialog" aria-expanded={open} className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-xs" onClick={() => setOpen(true)}>Links</button>
    {open && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 ms-scrim-enter" onClick={() => setOpen(false)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-label={`${symbol} links`} className="ms-dialog-enter w-80 max-w-[90vw] rounded-xl border border-[var(--t-line)] bg-[var(--t-surface)] p-3 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2"><strong>{symbol} · Links</strong><button autoFocus type="button" className="px-3" onClick={() => setOpen(false)} aria-label="Close links">Close</button></div>
        <AssetExternalLinks symbol={symbol} marketClass={marketClass} showNarrative={false} layout="menu" />
      </div></div>, document.body)}</>;
}
