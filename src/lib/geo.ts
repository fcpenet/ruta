import { lineString, point } from '@turf/helpers';
import { distance as turfDistance } from '@turf/distance';
import { length as turfLength } from '@turf/length';
import { nearestPointOnLine } from '@turf/nearest-point-on-line';

import type { LngLat } from '@/types';

export function distanceM(a: LngLat, b: LngLat): number {
  return turfDistance(point(a), point(b), { units: 'meters' });
}

export function lengthKm(coords: LngLat[]): number {
  if (coords.length < 2) return 0;
  return turfLength(lineString(coords), { units: 'kilometers' });
}

export interface Snap {
  point: LngLat;
  /** Distance from the query point to the line, in meters. */
  offsetM: number;
  /** Distance along the line from its first vertex, in km. */
  alongKm: number;
}

export function snapToLine(line: LngLat[], pt: LngLat): Snap {
  const snapped = nearestPointOnLine(lineString(line), point(pt), { units: 'kilometers' });
  return {
    point: snapped.geometry.coordinates as LngLat,
    offsetM: (snapped.properties.dist ?? 0) * 1000,
    alongKm: snapped.properties.location ?? 0,
  };
}

/** Coordinates of `line` between two along-distances; reversed when `toKm < fromKm`. */
export function sliceAlong(line: LngLat[], fromKm: number, toKm: number): LngLat[] {
  if (fromKm > toKm) return sliceAlong(line, toKm, fromKm).reverse();
  const out: LngLat[] = [];
  let walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const seg = distanceM(a, b) / 1000;
    const segStart = walked;
    const segEnd = walked + seg;
    if (segEnd >= fromKm && segStart <= toKm && seg > 0) {
      const t0 = Math.max(0, (fromKm - segStart) / seg);
      const t1 = Math.min(1, (toKm - segStart) / seg);
      const p0 = lerp(a, b, t0);
      const p1 = lerp(a, b, t1);
      if (out.length === 0) out.push(p0);
      out.push(p1);
    }
    walked = segEnd;
  }
  return out;
}

export function isClosedLoop(line: LngLat[]): boolean {
  return line.length > 2 && distanceM(line[0], line[line.length - 1]) < 20;
}

function lerp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
