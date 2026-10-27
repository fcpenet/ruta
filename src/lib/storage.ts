import * as SecureStore from 'expo-secure-store';

/**
 * Small persistent key-value storage: iOS Keychain / Android Keystore here, localStorage
 * on web (storage.web.ts). Failures are swallowed; callers treat missing values as defaults.
 * Keys: letters, digits, '.', '-' and '_' only (a SecureStore rule).
 */

export async function getItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Keychain unavailable: the value just won't survive a restart.
  }
}
