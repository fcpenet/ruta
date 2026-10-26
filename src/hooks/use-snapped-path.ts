import { useEffect, useState } from 'react';

import { API_URL, ApiError } from '@/lib/api';
import { snapToRoads, type DirectionsMode } from '@/lib/directions';
import type { LngLat } from '@/types';

export type SnapStatus = 'off' | 'idle' | 'loading' | 'ok' | 'noRoad' | 'unavailable';

const DEBOUNCE_MS = 250;

/**
 * Follows the roads (or footpaths) between tapped points via the API's OSRM service.
 * Falls back to straight lines between taps while loading, when snapping is off, or
 * when the service can't route them.
 */
export function useSnappedPath(points: LngLat[], mode: DirectionsMode, enabled: boolean) {
  const key = `${mode}|${points.map((p) => p.join(',')).join(';')}`;
  const active = enabled && !!API_URL && points.length >= 2;
  const [result, setResult] = useState<{ key: string; path: LngLat[]; names: string[] } | null>(
    null
  );
  const [failure, setFailure] = useState<{ key: string; status: SnapStatus } | null>(null);

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      snapToRoads(mode, points, ctrl.signal)
        .then((r) => setResult({ key, path: r.path, names: r.names }))
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          const noRoad = e instanceof ApiError && e.status === 422;
          setFailure({ key, status: noRoad ? 'noRoad' : 'unavailable' });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [active, key, mode, points]);

  const current = active && result?.key === key ? result : null;
  const status: SnapStatus = !enabled
    ? 'off'
    : !active
      ? 'idle'
      : current
        ? 'ok'
        : failure?.key === key
          ? failure.status
          : 'loading';
  return { path: current?.path ?? points, names: current?.names ?? [], status };
}
