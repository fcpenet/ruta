/** Saved login (token + user) in localStorage; expo-secure-store has no web support. */

const KEY = 'ruta.session';

export async function readSession(): Promise<string | null> {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function writeSession(value: string | null): Promise<void> {
  try {
    if (value === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked (e.g. private browsing): the session just won't survive a reload.
  }
}
