import React, { ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, LockKeyhole, LogIn, Loader2, ShieldCheck } from 'lucide-react';
import { UserProfile } from '@money-scanner/shared';
import {
  beginGoogleSignIn,
  endCurrentSession,
  getCurrentSession
} from '../services/firebase-auth.js';

interface AuthGateProps {
  children: (user: UserProfile, logout: () => Promise<void>) => ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  // Public surface rule (Marius, 2026-09-22): the logged-out experience is
  // public and defaults to English. A stored preference from the in-app
  // language toggle always wins.
  const [storedLanguage] = useState<string | null>(() => {
    try { return localStorage.getItem('money_scanner_language'); } catch { return null; }
  });
  const language: 'ro' | 'en' = storedLanguage === 'ro' ? 'ro' : 'en';
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSession = async () => {
    const activeUser = await getCurrentSession();
    setUser(activeUser);
    return activeUser;
  };

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const sessionUser = await loadSession();
        if (active) setUser(sessionUser);
      } catch (restoreError) {
        if (active) setError(restoreError instanceof Error ? restoreError.message : language === 'ro' ? 'Autentificarea nu a putut fi finalizată.' : 'Sign-in could not be completed.');
      } finally {
        if (active) setChecking(false);
      }
    };
    void restoreSession();
    return () => { active = false; };
  }, []);

  const login = async () => {
    setSigningIn(true);
    setError(null);
    try {
      const signedInUser = await beginGoogleSignIn();
      if (signedInUser) setUser(signedInUser);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : language === 'ro' ? 'Google Login nu a putut fi pornit.' : 'Google sign-in could not be started.');
    } finally {
      setSigningIn(false);
    }
  };

  const logout = async () => {
    await endCurrentSession();
    setUser(null);
  };

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--t-surface-raised)] text-slate-300">
        <div className="flex items-center gap-3 font-mono text-sm"><Loader2 className="h-5 w-5 animate-spin text-cyan-400" />{language === 'ro' ? 'Verific sesiunea securizată…' : 'Checking the secure session…'}</div>
      </div>
    );
  }

  if (user) return <>{children(user, logout)}</>;

  const copy = language === 'ro'
    ? {
        title: 'Acces securizat Market Scanner',
        description: 'Conectează-te cu contul Google autorizat pentru a vedea datele de piață, semnalele Money Line și alertele.',
        login: 'Continuă cu Google',
        private: 'Sesiune securizată · Datele API sunt protejate'
      }
    : {
        title: 'Secure Market Scanner access',
        description: 'Sign in with an authorized Google account to access market data, Money Line signals, and alerts.',
        login: 'Continue with Google',
        private: 'Secure session · API data is protected'
      };

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--t-surface-raised)] px-5 py-10 text-slate-100">
      <div className="pointer-events-none fixed inset-0 opacity-50" style={{ background: 'radial-gradient(circle at 50% 28%, rgba(200,241,105,0.14), transparent 31%), radial-gradient(circle at 15% 90%, rgba(61,220,151,0.08), transparent 28%)' }} />
      <section className="relative mx-auto flex min-h-[78vh] max-w-md flex-col items-center justify-center text-center">
        <div className="mb-7 grid h-20 w-20 place-items-center rounded-[32px] border border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_45px_rgba(205,238,127,0.18)]">
          <ShieldCheck className="h-10 w-10 text-cyan-300" />
        </div>
        <div className="mb-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.22em] text-cyan-300"><LockKeyhole className="h-4 w-4" />Market Scanner 360</div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{copy.title}</h1>
        <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">{copy.description}</p>

        {error && (
          <div className="mt-6 flex w-full items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-left text-xs leading-5 text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void login()}
          disabled={signingIn}
          className="mt-7 flex w-full items-center justify-center gap-3 rounded-[30px] border border-white/15 bg-white px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-cyan-50 disabled:cursor-wait disabled:opacity-65"
        >
          {signingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
          {copy.login}
        </button>
        <p className="mt-4 text-[11px] font-mono text-slate-500">{copy.private}</p>
      </section>
    </main>
  );
};
