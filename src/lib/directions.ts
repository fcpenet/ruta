import type { LngLat } from '@/types';

import { request } from './api';

export type DirectionsMode = 'driving' | 'walking';

export interface SnappedPath {
  /** Path along roads through every tapped point. */
  path: LngLat[];
  km: number;
  /** Street name at each tapped point ('' when unnamed). */
  names: string[];
}

/** Snaps tapped points to roads (or footpaths for walking) via the API's OSRM service. */
export function snapToRoads(
  mode: DirectionsMode,
  points: LngLat[],
  signal?: AbortSignal
): Promise<SnappedPath> {
  const pts = points.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  return request<SnappedPath>(`/directions?mode=${mode}&points=${encodeURIComponent(pts)}`, {
    signal,
  });
}
