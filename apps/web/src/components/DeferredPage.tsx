import React, { Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from '../i18n.js';

class PageErrorBoundary extends React.Component<React.PropsWithChildren<{ fallback: React.ReactNode }>, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export const DeferredPage: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { language } = useLanguage();
  const loading = <div role="status" className="ms-tab-enter flex items-center justify-center gap-3 py-12 text-sm text-slate-400">
    <RefreshCw className="h-5 w-5 animate-spin" />
    {language === 'ro' ? 'Se încarcă pagina…' : 'Loading page…'}
  </div>;
  // An older open tab may request a chunk removed by a new deployment.
  // Keep navigation usable and offer a full reload instead of a blank screen.
  const failure = <div role="alert" className="ms-tab-enter space-y-3 py-12 text-center text-sm text-slate-400">
    <p>{language === 'ro' ? 'Pagina nu a putut fi încărcată.' : 'The page could not be loaded.'}</p>
    <button onClick={() => window.location.reload()} className="ms-btn ms-btn--secondary">
      {language === 'ro' ? 'Reîncarcă aplicația' : 'Reload app'}
    </button>
  </div>;
  return <PageErrorBoundary fallback={failure}><Suspense fallback={loading}>{children}</Suspense></PageErrorBoundary>;
};
