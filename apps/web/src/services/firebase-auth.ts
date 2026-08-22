import { getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User
} from 'firebase/auth';
import { UserProfile } from '@money-scanner/shared';

// Firebase web configuration is intentionally public. It identifies this web
// app; access is enforced by Firebase tokens and the server-side email allowlist.
const firebaseConfig = {
  apiKey: 'AIzaSyBe-zmPq_PaOcAOAd0on2YymBXJLFdn904',
  authDomain: 'gen-lang-client-0610749770.firebaseapp.com',
  projectId: 'gen-lang-client-0610749770',
  appId: '1:384051756749:web:33368c8908a42033073384',
  messagingSenderId: '384051756749'
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const requestCsrfToken = async () => {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Nu s-a putut pregăti sesiunea securizată.');
  const payload = await response.json() as { csrfToken?: string };
  if (!payload.csrfToken) throw new Error('Lipsește protecția CSRF pentru sesiune.');
  return payload.csrfToken;
};

const createServerSession = async (user: User): Promise<UserProfile> => {
  const [csrfToken, idToken] = await Promise.all([
    requestCsrfToken(),
    user.getIdToken(true)
  ]);
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ idToken })
  });
  const payload = await response.json().catch(() => ({})) as { user?: UserProfile; error?: string };
  if (!response.ok || !payload.user) {
    throw new Error(payload.error || 'Contul Google nu este autorizat pentru această aplicație.');
  }
  return payload.user;
};

const useRedirectOnMobile = () => window.matchMedia('(max-width: 767px)').matches;

export const beginGoogleSignIn = async (): Promise<UserProfile | null> => {
  await setPersistence(firebaseAuth, inMemoryPersistence);
  if (useRedirectOnMobile()) {
    await signInWithRedirect(firebaseAuth, googleProvider);
    return null;
  }

  const result = await signInWithPopup(firebaseAuth, googleProvider);
  try {
    return await createServerSession(result.user);
  } finally {
    await signOut(firebaseAuth);
  }
};

export const finishRedirectGoogleSignIn = async (): Promise<UserProfile | null> => {
  await setPersistence(firebaseAuth, inMemoryPersistence);
  const result = await getRedirectResult(firebaseAuth);
  if (!result?.user) return null;

  try {
    return await createServerSession(result.user);
  } finally {
    await signOut(firebaseAuth);
  }
};

export const getCurrentSession = async (): Promise<UserProfile | null> => {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Nu s-a putut verifica sesiunea.');
  const payload = await response.json() as { user?: UserProfile };
  return payload.user || null;
};

export const endCurrentSession = async () => {
  const csrfToken = await requestCsrfToken();
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-CSRF-Token': csrfToken }
  });
  if (!response.ok && response.status !== 401) throw new Error('Nu s-a putut închide sesiunea.');
  await signOut(firebaseAuth);
};
