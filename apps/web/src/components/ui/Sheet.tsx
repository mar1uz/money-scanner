import React, { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  placement?: 'bottom' | 'rail';
  panelRef?: RefObject<HTMLDivElement>;
  children: React.ReactNode;
}
const CLOSE_MS = 320;

export const Sheet: React.FC<SheetProps> = ({ open, onClose, ariaLabel, placement = 'bottom', panelRef, children }) => {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<'open' | 'closed'>('closed');
  const rootRef = useRef<HTMLDivElement>(null);
  const localPanel = useRef<HTMLDivElement>(null);
  const panel = panelRef ?? localPanel;

  useEffect(() => {
    if (open) { setMounted(true); return; }
    setState('closed');
    const timer = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Commit the closed styles, force one reflow, then flip to open so the transition runs.
  useLayoutEffect(() => {
    if (!mounted || !open) return;
    rootRef.current?.getBoundingClientRect();
    setState('open');
    panel.current?.focus({ preventScroll: true });
  }, [mounted, open, panel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === 'undefined') return null;
  const host = document.getElementById('ms-overlays') ?? document.body;
  return createPortal(
    <div ref={rootRef} className="ms-sheet-root" data-state={state} data-placement={placement}>
      <div className="ms-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1} className="ms-sheet">
        <div className="ms-sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </div>,
    host
  );
};
