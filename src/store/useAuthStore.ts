import { create } from 'zustand';

import { setAuthToken, setUnauthorizedHandler } from '@/lib/api';
import { fetchMe, logIn, logOut, signUp, type Session, type User } from '@/lib/auth';
import { readSession, writeSession } from '@/lib/session-storage';

import { useAppStore } from './useAppStore';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Loads the saved session on app start, then checks it with the server. */
  restore: () => Promise<void>;
  logIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

function clearLocal() {
  setAuthToken(null);
  writeSession(null);
  // Confirmations are per account.
  useAppStore.setState({ confirmedIds: [] });
  useAuthStore.setState({ status: 'signedOut', user: null });
}

async function start(session: Session) {
  setAuthToken(session.token);
  await writeSession(JSON.stringify(session));
  useAppStore.setState({ confirmedIds: [] });
  useAuthStore.setState({ status: 'signedIn', user: session.user });
}

setUnauthorizedHandler(clearLocal);

export const useAuthStore = create<AuthState>(() => ({
  status: 'loading',
  user: null,

  restore: async () => {
    const raw = await readSession();
    let saved: Session | null = null;
    try {
      saved = raw ? (JSON.parse(raw) as Session) : null;
    } catch {}
    if (!saved?.token || !saved.user) {
      useAuthStore.setState({ status: 'signedOut' });
      return;
    }
    // Trust the saved user right away so the app works offline; the server check below
    // signs out (via the 401 handler) if the session has expired.
    setAuthToken(saved.token);
    useAuthStore.setState({ status: 'signedIn', user: saved.user });
    await fetchMe()
      .then((user) => useAuthStore.setState({ user }))
      .catch(() => {});
  },
  logIn: async (username, password) => start(await logIn(username, password)),
  signUp: async (username, password) => start(await signUp(username, password)),
  logOut: async () => {
    // Revoke on the server when we can, but always forget the session locally.
    await logOut().catch(() => {});
    clearLocal();
  },
}));
