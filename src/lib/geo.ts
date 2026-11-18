import { lineString, point } from '@turf/helpers';
import { length as turfLength } from '@turf/length';
import { nearestPointOnLine } from '@turf/nearest-point-on-line';

import type { LngLat } from '@/types';

/** Turf's earth radius, so results match @turf/distance exactly. */
const EARTH_RADIUS_M = 6371008.8;
const rad = (deg: number) => ((deg % 360) * Math.PI) / 180;

/**
 * Haversine distance, the same operations in the same order as @turf/distance (so
 * results are bit-identical) but without building two GeoJSON points per call —
 * this runs in the planner's hot loops.
 */
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.pow(Math.sin(dLat / 2), 2) +
    Math.pow(Math.sin(dLon / 2), 2) * Math.cos(rad(a[1])) * Math.cos(rad(b[1]));
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * EARTH_RADIUS_M;
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
  const snapped = nearestPointOnLine(lineString(line), point(pt), {
    units: 'kilometers',
  });
  return {
    point: snapped.geometry.coordinates as LngLat,
    offsetM: (snapped.properties.dist ?? 0) * 1000,
    alongKm: snapped.properties.location ?? 0,
  };
}

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG_EQUATOR = 111_320;
/** ~220 m cells: a 150–400 m query touches only a handful. */
const CELL_DEG = 0.002;

/**
 * Grid index over a polyline's segments for "nearest point within r meters"
 * queries. Snapping against a whole road-snapped route (thousands of vertices)
 * once per vertex of another route is quadratic; this only looks at segments
 * in nearby cells. Along-distances use the same haversine edge lengths as
 * sliceAlong, so they line up with ride slicing.
 */
export class LineIndex {
  private readonly cumKm: number[] = [0];
  private readonly grid = new Map<number, number[]>();
  private readonly kx: number;

  constructor(readonly coords: LngLat[]) {
    for (let i = 0; i < coords.length - 1; i++) {
      this.cumKm.push(this.cumKm[i] + distanceM(coords[i], coords[i + 1]) / 1000);
      const [ax, ay] = coords[i];
      const [bx, by] = coords[i + 1];
      for (let cx = cell(Math.min(ax, bx)); cx <= cell(Math.max(ax, bx)); cx++) {
        for (let cy = cell(Math.min(ay, by)); cy <= cell(Math.max(ay, by)); cy++) {
          const key = cellKey(cx, cy);
          const list = this.grid.get(key);
          if (list) list.push(i);
          else this.grid.set(key, [i]);
        }
      }
    }
    const meanLat = coords.reduce((s, c) => s + c[1], 0) / Math.max(1, coords.length);
    this.kx = M_PER_DEG_LNG_EQUATOR * Math.cos(meanLat * (Math.PI / 180));
  }

  /** Vertex `k` as a snap onto this line. */
  vertex(k: number): Snap {
    return { point: this.coords[k], offsetM: 0, alongKm: this.cumKm[k] };
  }

  /** Nearest point on the line if it's within `maxM` of `pt`, else null. */
  snapWithin(pt: LngLat, maxM: number): Snap | null {
    const dx = maxM / this.kx;
    const dy = maxM / M_PER_DEG_LAT;
    const seen = new Set<number>();
    let best: { i: number; t: number; d2: number } | null = null;
    for (let cx = cell(pt[0] - dx); cx <= cell(pt[0] + dx); cx++) {
      for (let cy = cell(pt[1] - dy); cy <= cell(pt[1] + dy); cy++) {
        for (const i of this.grid.get(cellKey(cx, cy)) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          // Local planar projection around `pt`, in meters.
          const ax = (this.coords[i][0] - pt[0]) * this.kx;
          const ay = (this.coords[i][1] - pt[1]) * M_PER_DEG_LAT;
          const bx = (this.coords[i + 1][0] - pt[0]) * this.kx;
          const by = (this.coords[i + 1][1] - pt[1]) * M_PER_DEG_LAT;
          const ex = bx - ax;
          const ey = by - ay;
          const len2 = ex * ex + ey * ey;
          const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * ex + ay * ey) / len2)) : 0;
          const px = ax + t * ex;
          const py = ay + t * ey;
          const d2 = px * px + py * py;
          if (!best || d2 < best.d2) best = { i, t, d2 };
        }
      }
    }
    if (!best) return null;
    const a = this.coords[best.i];
    const b = this.coords[best.i + 1];
    const point = lerp(a, b, best.t);
    const offsetM = distanceM(pt, point);
    if (offsetM > maxM) return null;
    const segKm = this.cumKm[best.i + 1] - this.cumKm[best.i];
    return { point, offsetM, alongKm: this.cumKm[best.i] + best.t * segKm };
  }
}

const cell = (deg: number) => Math.floor(deg / CELL_DEG);
const cellKey = (cx: number, cy: number) => cx * 1_000_000 + cy;

/** Coordinates of `line` between two along-distances; reversed when `toKm < fromKm`. */
export function sliceAlong(line: LngLat[], fromKm: number, toKm: number): LngLat[] {
  if (fromKm > toKm) return sliceAlong(line, toKm, fromKm).reverse();
  const { cum, seg: segKm } = edgeLengths(line);
  // First edge that ends at or after fromKm (cum is non-decreasing).
  let lo = 0;
  let hi = line.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid + 1] >= fromKm) hi = mid;
    else lo = mid + 1;
  }
  const out: LngLat[] = [];
  for (let i = lo; i < line.length - 1 && cum[i] <= toKm; i++) {
    const a = line[i];
    const b = line[i + 1];
    const segStart = cum[i];
    const seg = segKm[i];
    if (seg > 0) {
      const t0 = Math.max(0, (fromKm - segStart) / seg);
      const t1 = Math.min(1, (toKm - segStart) / seg);
      const p0 = lerp(a, b, t0);
      const p1 = lerp(a, b, t1);
      if (out.length === 0) out.push(p0);
      out.push(p1);
    }
  }
  return out;
}

/** Route lines are long-lived arrays, so their edge lengths are computed once. */
const edgeCache = new WeakMap<LngLat[], { cum: number[]; seg: number[] }>();

/** Distance in km from the first vertex to each vertex (cached per line). */
export function cumulativeKm(line: LngLat[]): number[] {
  return edgeLengths(line).cum;
}

/** Each edge's length in km, and the distance from the first vertex to each vertex. */
function edgeLengths(line: LngLat[]): { cum: number[]; seg: number[] } {
  let hit = edgeCache.get(line);
  if (!hit) {
    hit = { cum: [0], seg: [] };
    for (let i = 0; i < line.length - 1; i++) {
      const seg = distanceM(line[i], line[i + 1]) / 1000;
      hit.seg.push(seg);
      hit.cum.push(hit.cum[i] + seg);
    }
    edgeCache.set(line, hit);
  }
  return hit;
}

export function isClosedLoop(line: LngLat[]): boolean {
  return line.length > 2 && distanceM(line[0], line[line.length - 1]) < 20;
}

function lerp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
