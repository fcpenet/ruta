/** Road snapping for drawn routes, backed by OSRM (routing/ on Fly). */

export type DirectionsMode = 'driving' | 'walking';

export interface DirectionsResult {
  /** The path along roads through every waypoint, as [lng, lat]. */
  path: [number, number][];
  km: number;
  /** Street name at each waypoint ('' when unnamed). */
  names: string[];
}

/** Resolves null when there's no road connecting the waypoints. */
export type Directions = (mode: DirectionsMode, waypoints: [number, number][]) => Promise<DirectionsResult | null>;

export class DirectionsUnavailable extends Error {}

interface OsrmResponse {
  code: string;
  routes?: { distance: number; geometry: { coordinates: [number, number][] } }[];
  waypoints?: { name: string }[];
}

/**
 * OSRM's /route API; `urls` are the osrm-routed base URLs per mode. No turning around at taps:
 * an off-road tap then loops a block (easy to spot and undo) instead of adding a fake spur.
 */
export function osrmDirections(urls: Record<DirectionsMode, string>, fetchImpl: typeof fetch = fetch): Directions {
  return async (mode, waypoints) => {
    const coords = waypoints.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
    const url = `${urls[mode].replace(/\/$/, '')}/route/v1/${mode}/${coords}?overview=full&geometries=geojson`;
    let body: OsrmResponse;
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': 'ruta-api (community jeepney routes)' },
        signal: AbortSignal.timeout(10_000),
      });
      body = (await res.json()) as OsrmResponse;
    } catch (e) {
      throw new DirectionsUnavailable(`OSRM request failed: ${(e as Error).message}`);
    }
    if (body.code === 'NoRoute' || body.code === 'NoSegment') return null;
    const route = body.routes?.[0];
    if (body.code !== 'Ok' || !route) throw new DirectionsUnavailable(`OSRM returned ${body.code}`);
    return {
      path: route.geometry.coordinates,
      km: route.distance / 1000,
      names: (body.waypoints ?? []).map((w) => w.name ?? ''),
    };
  };
}
