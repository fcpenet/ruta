/**
 * HTTP client for the Ruta API (server/). Set EXPO_PUBLIC_API_URL to enable it;
 * without it the app runs on bundled routes only.
 */

export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: { path: string; message: string }[] = []
  ) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Session token sent as a bearer token on every request. */
export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Called when a logged-in request comes back 401 (session expired or revoked). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new ApiError('Community routes are not set up (no API URL).', 0);
  const sentToken = authToken;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && sentToken) onUnauthorized?.();
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.issues);
  return body as T;
}
