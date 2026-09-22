import { useLayoutEffect } from 'react';

/** Keep the dock above browser chrome/keyboard without double-counting
 * browsers that already resize the fixed-position viewport. */
export function useMobileViewport(): void {
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;bottom:0;left:0;width:0;height:0;pointer-events:none;visibility:hidden';
    probe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(probe);
    const root = document.documentElement;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // Preserve normal pinch zoom behavior; a magnified viewport is not chrome.
      const visibleHeight = viewport?.scale === 1 ? viewport.height : window.innerHeight;
      const visibleBottom = visibleHeight + (viewport?.scale === 1 ? viewport.offsetTop : 0);
      const inset = Math.max(0, probe.getBoundingClientRect().bottom - visibleBottom);
      root.style.setProperty('--mobile-viewport-inset', `${inset}px`);
      root.style.setProperty('--mobile-visible-height', `${visibleHeight}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('pageshow', schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('pageshow', schedule);
      probe.remove();
      root.style.removeProperty('--mobile-viewport-inset');
      root.style.removeProperty('--mobile-visible-height');
    };
  }, []);
}
