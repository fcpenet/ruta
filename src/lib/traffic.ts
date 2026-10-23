import { pointToLineDistance } from '@turf/point-to-line-distance';
import { lineString, point } from '@turf/helpers';

import segmentsJson from '@/data/traffic-segments.json';
import type { LngLat, TrafficLevel, TrafficReading, TrafficSegment } from '@/types';

/**
 * Dummy traffic provider. Readings are deterministic for a given segment and
 * 5-minute window, so tests and screenshots are reproducible. Swap
 * `getTraffic` for a real feed (MMDA, TomTom, …) without touching callers.
 */

export const trafficSegments = segmentsJson as TrafficSegment[];

const MANILA_UTC_OFFSET_H = 8;
const WINDOW_MS = 5 * 60 * 1000;

/** Some roads are always worse than others. */
const SEGMENT_BIAS: Record<string, number> = {
  'edsa-cubao': 0.15,
  'aurora-cubao-gilmore': 0.1,
  legarda: 0.1,
  espana: 0.05,
  commonwealth: 0.05,
};

export const TRAFFIC_COLORS: Record<TrafficLevel, string> = {
  free: '#2DA44E',
  moderate: '#E3B341',
  heavy: '#D1242F',
  standstill: '#82071E',
};

export function manilaHour(date: Date): { hour: number; weekend: boolean } {
  const shifted = new Date(date.getTime() + MANILA_UTC_OFFSET_H * 3600_000);
  const day = shifted.getUTCDay();
  return {
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60,
    weekend: day === 0 || day === 6,
  };
}

/** 0..1 congestion from time of day: morning peak ~8 AM, evening peak ~6:30 PM. */
export function timeOfDayCongestion(hour: number, weekend: boolean): number {
  const bump = (center: number, width: number, height: number) =>
    height * Math.exp(-((hour - center) ** 2) / (2 * width ** 2));
  const base = 0.12 + bump(8, 1.1, 0.6) + bump(18.5, 1.4, 0.7) + bump(12.5, 1.5, 0.15);
  return weekend ? base * 0.6 : base;
}

/** Small, stable pseudo-random value in [-0.5, 0.5) from a string seed. */
function seededNoise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000 - 0.5;
}

export function levelFor(congestion: number): TrafficLevel {
  if (congestion < 0.35) return 'free';
  if (congestion < 0.6) return 'moderate';
  if (congestion < 0.8) return 'heavy';
  return 'standstill';
}

export function getTraffic(segmentId: string, date: Date): TrafficReading {
  const { hour, weekend } = manilaHour(date);
  const window = Math.floor(date.getTime() / WINDOW_MS);
  const congestion = Math.min(
    1,
    Math.max(
      0,
      timeOfDayCongestion(hour, weekend) +
        (SEGMENT_BIAS[segmentId] ?? 0) +
        seededNoise(`${segmentId}:${window}`) * 0.2
    )
  );
  return {
    segmentId,
    level: levelFor(congestion),
    multiplier: 1 + 2 * congestion,
  };
}

export function getAllTraffic(date: Date): TrafficReading[] {
  return trafficSegments.map((s) => getTraffic(s.id, date));
}

const MATCH_RADIUS_KM = 0.08;

/**
 * Average ETA multiplier over a ride path, sampling each vertex against the
 * nearest traffic segment. Vertices away from known roads count as free-flow.
 */
export function pathTraffic(
  path: LngLat[],
  date: Date
): { multiplier: number; level: TrafficLevel } {
  if (path.length === 0) return { multiplier: 1, level: 'free' };
  const lines = trafficSegments.map((s) => ({ id: s.id, line: lineString(s.coords) }));
  let sum = 0;
  let worst = 1;
  for (const p of path) {
    let best: { id: string; d: number } | null = null;
    for (const { id, line } of lines) {
      const d = pointToLineDistance(point(p), line, { units: 'kilometers' });
      if (d <= MATCH_RADIUS_KM && (!best || d < best.d)) best = { id, d };
    }
    const m = best ? getTraffic(best.id, date).multiplier : 1;
    sum += m;
    worst = Math.max(worst, m);
  }
  const multiplier = sum / path.length;
  return { multiplier, level: levelFor((worst - 1) / 2) };
}
