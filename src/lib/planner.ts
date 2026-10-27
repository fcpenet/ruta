import { lineIntersect } from '@turf/line-intersect';
import { lineString } from '@turf/helpers';

import { computeFare } from '@/lib/fare';
import { distanceM, isClosedLoop, lengthKm, sliceAlong, snapToLine } from '@/lib/geo';
import { pathTraffic } from '@/lib/traffic';
import type {
  DiscountType,
  Landmark,
  Leg,
  LngLat,
  PlaceLabel,
  RideLeg,
  TransitRoute,
  Trip,
  VehicleType,
  WalkLeg,
} from '@/types';

export interface PlanOptions {
  routes: TransitRoute[];
  landmarks: Landmark[];
  discount?: DiscountType;
  /** Used for traffic-adjusted ride times. */
  at?: Date;
  walkRadiusM?: number;
  transferRadiusM?: number;
  maxResults?: number;
}

const WALK_M_PER_MIN = 75;
/** Straight-line walking distance understates real streets. */
const WALK_DETOUR = 1.3;
const SPEED_KMH: Record<VehicleType, number> = { jeep: 18, modern_jeep: 20, tricycle: 15 };
const TRANSFER_PENALTY_MIN = 5;
/** Prefer confirmed routes when an unverified one is only slightly faster. */
const UNVERIFIED_PENALTY_MIN = 3;
const MIN_RIDE_KM = 0.3;
/** Walking the whole way is offered when it's shorter than this. */
const WALK_ONLY_MAX_M = 1200;

/** Most vehicles in one trip (so at most two transfers), and most segments including walk links. */
const MAX_RIDES = 3;
const MAX_SEGMENTS = 5;
/** Bounds the search on dense networks; plenty for Metro Manila-sized data. */
const MAX_EXPANSIONS = 5000;

/** A route or walk link the planner can travel along. */
interface Segment {
  route: TransitRoute;
  coords: LngLat[];
  walk: boolean;
  bbox: [number, number, number, number];
}

/** A place to switch from one segment to another, as along-distances on each. */
interface Transfer {
  to: number;
  fromKm: number;
  toKm: number;
  fromPoint: LngLat;
  toPoint: LngLat;
}

interface Ride {
  path: LngLat[];
  km: number;
}

/** A partial trip: standing on `seg` at `alongKm`, having travelled `legs`. */
interface Label {
  seg: number;
  alongKm: number;
  legs: Leg[];
  cost: number;
  rides: number;
  used: number[];
}

/**
 * Plans trips from `origin` to `destination`. Trips chain up to three vehicles and any
 * walk links commuters have drawn between them (footbridges, alleys, mall walkways).
 * Jeepneys and tricycles stop anywhere along their line, so boarding and alighting
 * points are the nearest points on the route line, not fixed stops.
 */
export function planTrips(origin: LngLat, destination: LngLat, opts: PlanOptions): Trip[] {
  const {
    routes,
    landmarks,
    discount = 'regular',
    at = new Date(),
    walkRadiusM = 400,
    transferRadiusM = 150,
    maxResults = 5,
  } = opts;

  // Commuters reported these as wrong or no longer running.
  const segments: Segment[] = routes
    .filter((r) => r.properties.status !== 'disputed' && r.properties.status !== 'unavailable')
    .map((route) => {
      const coords = route.geometry.coordinates as LngLat[];
      return { route, coords, walk: route.properties.type === 'walk', bbox: bboxOf(coords) };
    });
  const transfers = transferIndex(segments, transferRadiusM);
  const ctx: LegContext = { landmarks, discount, at };

  const near = (pt: LngLat) =>
    segments.flatMap((s, i) => {
      const snap = snapToLine(s.coords, pt);
      return snap.offsetM <= walkRadiusM ? [{ seg: i, snap }] : [];
    });
  const toSnaps = new Map(near(destination).map((c) => [c.seg, c.snap]));

  // Best-first search over (segment, position) states, cheapest partial trip first.
  const queue: Label[] = near(origin).map(({ seg, snap }) => {
    const walk = walkLeg(origin, snap.point, ctx, segments[seg].route);
    return { seg, alongKm: snap.alongKm, legs: [walk], cost: walk.minutes, rides: 0, used: [seg] };
  });
  const best = new Map<string, number>();
  const trips: Trip[] = [];

  for (let n = 0; queue.length && n < MAX_EXPANSIONS && trips.length < maxResults * 4; n++) {
    queue.sort((x, y) => x.cost - y.cost);
    const label = queue.shift()!;
    const key = `${label.seg}:${Math.round(label.alongKm * 20)}`;
    if ((best.get(key) ?? Infinity) <= label.cost) continue;
    best.set(key, label.cost);

    const seg = segments[label.seg];
    const along = (toKm: number) => {
      const ride = rideBetween(seg.route, seg.coords, label.alongKm, toKm);
      return ride && (seg.walk || ride.km >= MIN_RIDE_KM) ? ride : null;
    };
    const travel = (ride: Ride) =>
      seg.walk ? linkLeg(seg.route, ride, ctx) : rideLeg(seg.route, ride, ctx);

    // Finish: this segment passes near the destination.
    const end = toSnaps.get(label.seg);
    const finish = end && along(end.alongKm);
    if (end && finish) {
      trips.push(assemble([...label.legs, travel(finish), walkLeg(end.point, destination, ctx)]));
    }

    // Continue: get off here and switch to another segment.
    if (label.used.length >= MAX_SEGMENTS) continue;
    for (const t of transfers[label.seg]) {
      const next = segments[t.to];
      if (label.used.includes(t.to)) continue;
      if (!next.walk && label.rides >= MAX_RIDES) continue;
      const ride = along(t.fromKm);
      if (!ride) continue;
      const legs = [...label.legs, travel(ride), walkLeg(t.fromPoint, t.toPoint, ctx, next.route)];
      const penalty = !next.walk && label.rides + (seg.walk ? 0 : 1) >= 1 ? TRANSFER_PENALTY_MIN : 0;
      queue.push({
        seg: t.to,
        alongKm: t.toKm,
        legs,
        cost: label.cost + legs[legs.length - 2].minutes + legs[legs.length - 1].minutes + penalty
          + (isUnverified(legs[legs.length - 2]) ? UNVERIFIED_PENALTY_MIN : 0),
        rides: label.rides + (seg.walk ? 0 : 1),
        used: [...label.used, t.to],
      });
    }
  }

  // Transferring never beats staying on a vehicle that already goes all the way.
  const directIds = new Set(
    trips.filter((t) => t.transfers === 0 && rideIds(t).length === 1).map((t) => rideIds(t)[0])
  );
  const sensible = trips.filter(
    (t) => rideIds(t).length < 2 || !rideIds(t).some((id) => directIds.has(id))
  );

  const direct = distanceM(origin, destination);
  if (direct <= WALK_ONLY_MAX_M) {
    sensible.push(assemble([walkLeg(origin, destination, ctx)]));
  }

  return dedupe(sensible)
    .sort((x, y) => score(x) - score(y) || x.totalFare - y.totalFare)
    .slice(0, maxResults);
}

const rideIds = (t: Trip) => t.legs.flatMap((l) => (l.kind === 'ride' ? [l.routeId] : []));

const isUnverified = (l: Leg) => (l.kind === 'ride' ? l.unverified : !!l.link?.unverified);

let transferCache: { key: string; index: Transfer[][] } | null = null;

/**
 * For each segment, the places to switch to every other segment. Cached because the
 * planner reruns on every traffic tick while routes rarely change.
 */
function transferIndex(segments: Segment[], radiusM: number): Transfer[][] {
  const key = `${radiusM}|${segments.map((s) => `${s.route.properties.id}:${s.coords.length}`).join('|')}`;
  if (transferCache?.key === key) return transferCache.index;

  const pad = radiusM / 111_000;
  const index: Transfer[][] = segments.map(() => []);
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      if (
        a.bbox[0] - pad > b.bbox[2] ||
        b.bbox[0] - pad > a.bbox[2] ||
        a.bbox[1] - pad > b.bbox[3] ||
        b.bbox[1] - pad > a.bbox[3]
      ) {
        continue;
      }
      // One transfer per ~100 m stretch of A, keeping the shortest walk in each.
      const byStretch = new Map<number, Transfer & { gap: number }>();
      for (const pt of transferPoints(a.coords, b.coords, radiusM)) {
        const onA = snapToLine(a.coords, pt);
        const onB = snapToLine(b.coords, pt);
        const gap = distanceM(onA.point, onB.point);
        const stretch = Math.round(onA.alongKm * 10);
        const prev = byStretch.get(stretch);
        if (!prev || gap < prev.gap) {
          byStretch.set(stretch, {
            to: j,
            fromKm: onA.alongKm,
            toKm: onB.alongKm,
            fromPoint: onA.point,
            toPoint: onB.point,
            gap,
          });
        }
      }
      for (const t of byStretch.values()) {
        index[i].push({ to: j, fromKm: t.fromKm, toKm: t.toKm, fromPoint: t.fromPoint, toPoint: t.toPoint });
        index[j].push({ to: i, fromKm: t.toKm, toKm: t.fromKm, fromPoint: t.toPoint, toPoint: t.fromPoint });
      }
    }
  }
  transferCache = { key, index };
  return index;
}

function bboxOf(coords: LngLat[]): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}

/** Ride along `route` between two along-distances, honouring one-way direction and loops. */
function rideBetween(
  route: TransitRoute,
  coords: LngLat[],
  fromKm: number,
  toKm: number
): Ride | null {
  const oneway = route.properties.direction === 'oneway';
  if (!oneway || toKm >= fromKm) {
    const path = sliceAlong(coords, fromKm, toKm);
    return { path, km: Math.abs(toKm - fromKm) };
  }
  // One-way going "backwards" only works by riding around a loop.
  if (!isClosedLoop(coords)) return null;
  const total = lengthKm(coords);
  const path = [...sliceAlong(coords, fromKm, total), ...sliceAlong(coords, 0, toKm).slice(1)];
  return { path, km: total - fromKm + toKm };
}

/** Where two routes cross, plus vertices where they pass within `radiusM` of each other. */
function transferPoints(a: LngLat[], b: LngLat[], radiusM: number): LngLat[] {
  const points: LngLat[] = lineIntersect(lineString(a), lineString(b)).features.map(
    (f) => f.geometry.coordinates as LngLat
  );
  for (const v of b) {
    if (snapToLine(a, v).offsetM <= radiusM) points.push(v);
  }
  for (const v of a) {
    if (snapToLine(b, v).offsetM <= radiusM) points.push(v);
  }
  return points;
}

interface LegContext {
  landmarks: Landmark[];
  discount: DiscountType;
  at: Date;
}

function walkLeg(from: LngLat, to: LngLat, ctx: LegContext, toward?: TransitRoute): WalkLeg {
  const meters = distanceM(from, to) * WALK_DETOUR;
  return {
    kind: 'walk',
    from,
    to,
    meters,
    minutes: meters / WALK_M_PER_MIN,
    toName: placeName(to, ctx.landmarks, toward),
  };
}

/** Walking along a commuter-drawn walk link: real path, no detour factor, no fare. */
function linkLeg(route: TransitRoute, ride: Ride, ctx: LegContext): WalkLeg {
  const p = route.properties;
  const to = ride.path[ride.path.length - 1];
  const meters = ride.km * 1000;
  return {
    kind: 'walk',
    from: ride.path[0],
    to,
    meters,
    minutes: meters / WALK_M_PER_MIN,
    toName: placeName(to, ctx.landmarks, route),
    link: {
      id: p.id,
      name: p.name,
      path: ride.path,
      unverified: p.source === 'community' && p.status !== 'verified',
    },
  };
}

function rideLeg(route: TransitRoute, ride: Ride, ctx: LegContext): RideLeg {
  const p = route.properties;
  // Only called for vehicle segments; walk links go through linkLeg.
  const vehicle = p.type as VehicleType;
  const board = ride.path[0];
  const alight = ride.path[ride.path.length - 1];
  const traffic = pathTraffic(ride.path, ctx.at);
  return {
    kind: 'ride',
    routeId: p.id,
    routeName: p.name,
    vehicle,
    signboard: p.signboard,
    color: p.color,
    board,
    alight,
    boardName: placeName(board, ctx.landmarks, route),
    alightName: placeName(alight, ctx.landmarks, route),
    km: ride.km,
    minutes: (ride.km / SPEED_KMH[vehicle]) * 60 * traffic.multiplier,
    fare: computeFare(vehicle, ride.km, ctx.discount, p.city, p.fare),
    path: ride.path,
    trafficLevel: traffic.level,
    unverified: p.source === 'community' && p.status !== 'verified',
  };
}

/** Name a point after the closest landmark or loading point: at "Legarda", near "Gilmore". */
export function placeName(pt: LngLat, landmarks: Landmark[], route?: TransitRoute): PlaceLabel {
  const named = [
    ...landmarks.map((l) => ({ name: l.name, coord: l.coord })),
    ...(route?.properties.loadingPoints ?? []),
  ];
  let best: { name: string; d: number } | null = null;
  for (const n of named) {
    const d = distanceM(pt, n.coord);
    if (!best || d < best.d) best = { name: n.name, d };
  }
  if (best && best.d <= 150) return { name: best.name, near: false };
  if (best && best.d <= 800) return { name: best.name, near: true };
  return null;
}

function assemble(rawLegs: Leg[]): Trip {
  // Drop negligible walks (already standing on the route).
  const legs = rawLegs.filter(
    (l) => l.kind === 'ride' || l.link || l.meters >= 20 || rawLegs.length === 1
  );
  const rides = legs.filter((l): l is RideLeg => l.kind === 'ride');
  const walks = legs.filter((l): l is WalkLeg => l.kind === 'walk');
  const segmentIds = legs.flatMap((l) =>
    l.kind === 'ride' ? [l.routeId] : l.link ? [l.link.id] : []
  );
  return {
    id: segmentIds.length ? segmentIds.join('>') : 'walk',
    legs,
    totalMinutes: legs.reduce((s, l) => s + l.minutes, 0),
    totalFare: rides.reduce((s, r) => s + r.fare, 0),
    transfers: Math.max(0, rides.length - 1),
    walkMeters: walks.reduce((s, w) => s + w.meters, 0),
  };
}

function score(t: Trip): number {
  const unverified = t.legs.filter(isUnverified).length;
  return t.totalMinutes + t.transfers * TRANSFER_PENALTY_MIN + unverified * UNVERIFIED_PENALTY_MIN;
}

function dedupe(trips: Trip[]): Trip[] {
  const byId = new Map<string, Trip>();
  for (const t of trips) {
    const prev = byId.get(t.id);
    if (!prev || score(t) < score(prev)) byId.set(t.id, t);
  }
  return [...byId.values()];
}
