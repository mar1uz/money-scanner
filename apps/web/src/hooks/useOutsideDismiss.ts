import { useEffect, type RefObject } from 'react';

export function useOutsideDismiss(open: boolean, onDismiss: () => void, refs: RefObject<HTMLElement>[]) {
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      const path = event.composedPath();
      if (refs.some(ref => ref.current && (path.includes(ref.current) || ref.current.contains(event.target as Node)))) return;
      onDismiss();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onDismiss(); };
    // Capture handles taps even when an outside control stops propagation.
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', key);
    };
  }, [open, onDismiss, refs]);
}
