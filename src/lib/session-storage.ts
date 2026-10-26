import * as SecureStore from 'expo-secure-store';

/** Saved login (token + user) in the iOS Keychain / Android Keystore. */

const KEY = 'ruta.session';

export async function readSession(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function writeSession(value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, value);
  } catch {
    // Keychain unavailable: the session just won't survive a restart.
  }
}
