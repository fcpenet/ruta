import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

import type { NewCommunityRoute, TransitRoute } from '@/types';

/**
 * Client for the community routes API (server/). Set EXPO_PUBLIC_API_URL to
 * enable it; without it the app runs on bundled routes only.
 */

export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;

const DEVICE_KEY = 'ruta.deviceId';
let deviceIdPromise: Promise<string> | null = null;

/** Anonymous per-install ID used to attribute submissions and dedupe confirmations. */
export function getDeviceId(): Promise<string> {
  deviceIdPromise ??= (async () => {
    try {
      const existing = await AsyncStorage.getItem(DEVICE_KEY);
      if (existing) return existing;
      const id = randomUUID();
      await AsyncStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch {
      // Storage unavailable (e.g. private browsing): use a session-only ID.
      return randomUUID();
    }
  })();
  return deviceIdPromise;
}

export class CommunityApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: { path: string; message: string }[] = []
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new CommunityApiError('Community routes are not set up (no API URL).', 0);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': await getDeviceId(),
        ...init?.headers,
      },
    });
  } catch {
    throw new CommunityApiError('No connection. Check your internet and try again.', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new CommunityApiError(body.error ?? `Request failed (${res.status})`, res.status, body.issues);
  return body as T;
}

export async function fetchCommunityRoutes(): Promise<TransitRoute[]> {
  const { routes } = await request<{ routes: TransitRoute[] }>('/routes');
  return routes;
}

export async function submitRoute(route: NewCommunityRoute): Promise<TransitRoute> {
  const { route: created } = await request<{ route: TransitRoute }>('/routes', {
    method: 'POST',
    body: JSON.stringify(route),
  });
  return created;
}

export async function confirmRoute(id: string): Promise<TransitRoute> {
  const { route } = await request<{ route: TransitRoute }>(`/routes/${id}/confirm`, { method: 'POST' });
  return route;
}
