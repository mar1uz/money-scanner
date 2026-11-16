import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** Positions a pill under the child marked data-active="true" by writing
 * --pill-x/-y/-w/-h on the container. Snaps on first measure and on resize;
 * glides only when `activeKey` changes after mount. */
export function useSlidingPill(containerRef: RefObject<HTMLElement>, activeKey: string | number | null | undefined): void {
  const mounted = useRef(false);
  useIsoLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let last = '';
    const measure = (glide: boolean) => {
      const active = container.querySelector<HTMLElement>('[data-active="true"]');
      if (!active || active.offsetWidth === 0) { container.removeAttribute('data-pill'); last = ''; return; }
      const key = `${active.offsetLeft},${active.offsetTop},${active.offsetWidth},${active.offsetHeight}`;
      if (key === last) return;
      last = key;
      container.dataset.pillGlide = glide && container.dataset.pill === 'ready' ? 'true' : 'false';
      container.style.setProperty('--pill-x', `${active.offsetLeft}px`);
      container.style.setProperty('--pill-y', `${active.offsetTop}px`);
      container.style.setProperty('--pill-w', `${active.offsetWidth}px`);
      container.style.setProperty('--pill-h', `${active.offsetHeight}px`);
      container.dataset.pill = 'ready';
    };
    measure(mounted.current);
    mounted.current = true;
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(container);
    const active = container.querySelector<HTMLElement>('[data-active="true"]');
    if (active) observer.observe(active);
    return () => observer.disconnect();
  }, [containerRef, activeKey]);
}
