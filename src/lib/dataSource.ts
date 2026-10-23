import bundledRoutes from '@/data/routes.ncr.json';
import bundledLandmarks from '@/data/landmarks.ncr.json';
import type { Landmark, RouteDataset } from '@/types';

/**
 * Single entry point for route data. Today it returns the dataset bundled with
 * the app; set EXPO_PUBLIC_ROUTES_URL to a JSON file with the same shape and a
 * higher `version` to ship route updates without an app release.
 */

const bundled = bundledRoutes as RouteDataset;

export const landmarks = bundledLandmarks as Landmark[];

export function getBundledRoutes(): RouteDataset {
  return bundled;
}

export async function loadRoutes(): Promise<RouteDataset> {
  const url = process.env.EXPO_PUBLIC_ROUTES_URL;
  if (!url) return bundled;
  try {
    const res = await fetch(url);
    if (!res.ok) return bundled;
    const remote = (await res.json()) as RouteDataset;
    return Array.isArray(remote.routes) && remote.version > bundled.version ? remote : bundled;
  } catch {
    return bundled;
  }
}

export function searchLandmarks(query: string, limit = 6): Landmark[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return landmarks
    .filter(
      (l) => l.name.toLowerCase().includes(q) || l.aliases?.some((a) => a.includes(q))
    )
    .slice(0, limit);
}
