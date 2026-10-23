import { lineIntersect } from '@turf/line-intersect';
import { lineString } from '@turf/helpers';

import { computeFare } from '@/lib/fare';
import { distanceM, isClosedLoop, lengthKm, sliceAlong, snapToLine, type Snap } from '@/lib/geo';
import { pathTraffic } from '@/lib/traffic';
import type {
  DiscountType,
  Landmark,
  Leg,
  LngLat,
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
const MIN_RIDE_KM = 0.3;
/** Walking the whole way is offered when it's shorter than this. */
const WALK_ONLY_MAX_M = 1200;

interface Candidate {
  route: TransitRoute;
  coords: LngLat[];
  snap: Snap;
}

interface Ride {
  path: LngLat[];
  km: number;
}

/**
 * Plans trips from `origin` to `destination` using at most one transfer.
 * Jeepneys and tricycles stop anywhere along their line, so boarding and
 * alighting points are the nearest points on the route line, not fixed stops.
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

  const near = (pt: LngLat): Map<string, Candidate> => {
    const out = new Map<string, Candidate>();
    for (const route of routes) {
      const coords = route.geometry.coordinates as LngLat[];
      const snap = snapToLine(coords, pt);
      if (snap.offsetM <= walkRadiusM) out.set(route.properties.id, { route, coords, snap });
    }
    return out;
  };

  const fromCands = near(origin);
  const toCands = near(destination);
  const ctx: LegContext = { landmarks, discount, at };
  const trips: Trip[] = [];

  // Direct trips: one route serves both ends.
  for (const [id, from] of fromCands) {
    const to = toCands.get(id);
    if (!to) continue;
    const ride = rideBetween(from.route, from.coords, from.snap.alongKm, to.snap.alongKm);
    if (!ride || ride.km < MIN_RIDE_KM) continue;
    trips.push(
      assemble([
        walkLeg(origin, from.snap.point, ctx, from.route),
        rideLeg(from.route, ride, ctx),
        walkLeg(to.snap.point, destination, ctx),
      ])
    );
  }

  // One-transfer trips: route A from the origin, route B to the destination.
  for (const [idA, a] of fromCands) {
    for (const [idB, b] of toCands) {
      if (idA === idB) continue;
      let best: Trip | null = null;
      for (const t of transferPoints(a.coords, b.coords, transferRadiusM)) {
        const onA = snapToLine(a.coords, t);
        const onB = snapToLine(b.coords, t);
        const rideA = rideBetween(a.route, a.coords, a.snap.alongKm, onA.alongKm);
        const rideB = rideBetween(b.route, b.coords, onB.alongKm, b.snap.alongKm);
        if (!rideA || !rideB || rideA.km < MIN_RIDE_KM || rideB.km < MIN_RIDE_KM) continue;
        const trip = assemble([
          walkLeg(origin, a.snap.point, ctx, a.route),
          rideLeg(a.route, rideA, ctx),
          walkLeg(onA.point, onB.point, ctx, b.route),
          rideLeg(b.route, rideB, ctx),
          walkLeg(b.snap.point, destination, ctx),
        ]);
        if (!best || score(trip) < score(best)) best = trip;
      }
      if (best) trips.push(best);
    }
  }

  const direct = distanceM(origin, destination);
  if (direct <= WALK_ONLY_MAX_M) {
    trips.push(assemble([walkLeg(origin, destination, ctx)]));
  }

  return dedupe(trips)
    .sort((x, y) => score(x) - score(y) || x.totalFare - y.totalFare)
    .slice(0, maxResults);
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

function rideLeg(route: TransitRoute, ride: Ride, ctx: LegContext): RideLeg {
  const p = route.properties;
  const board = ride.path[0];
  const alight = ride.path[ride.path.length - 1];
  const traffic = pathTraffic(ride.path, ctx.at);
  return {
    kind: 'ride',
    routeId: p.id,
    routeName: p.name,
    vehicle: p.type,
    signboard: p.signboard,
    color: p.color,
    board,
    alight,
    boardName: placeName(board, ctx.landmarks, route),
    alightName: placeName(alight, ctx.landmarks, route),
    km: ride.km,
    minutes: (ride.km / SPEED_KMH[p.type]) * 60 * traffic.multiplier,
    fare: computeFare(p.type, ride.km, ctx.discount, p.city),
    path: ride.path,
    trafficLevel: traffic.level,
  };
}

/** Name a point after the closest landmark or loading point, e.g. "Legarda" or "near Gilmore". */
export function placeName(pt: LngLat, landmarks: Landmark[], route?: TransitRoute): string {
  const named = [
    ...landmarks.map((l) => ({ name: l.name, coord: l.coord })),
    ...(route?.properties.loadingPoints ?? []),
  ];
  let best = { name: 'your destination', d: Infinity };
  for (const n of named) {
    const d = distanceM(pt, n.coord);
    if (d < best.d) best = { name: n.name, d };
  }
  if (best.d <= 150) return best.name;
  if (best.d <= 800) return `near ${best.name}`;
  return 'the marked point';
}

function assemble(rawLegs: Leg[]): Trip {
  // Drop negligible walks (already standing on the route).
  const legs = rawLegs.filter((l) => l.kind === 'ride' || l.meters >= 20 || rawLegs.length === 1);
  const rides = legs.filter((l): l is RideLeg => l.kind === 'ride');
  const walks = legs.filter((l): l is WalkLeg => l.kind === 'walk');
  return {
    id: rides.length ? rides.map((r) => r.routeId).join('>') : 'walk',
    legs,
    totalMinutes: legs.reduce((s, l) => s + l.minutes, 0),
    totalFare: rides.reduce((s, r) => s + r.fare, 0),
    transfers: Math.max(0, rides.length - 1),
    walkMeters: walks.reduce((s, w) => s + w.meters, 0),
  };
}

function score(t: Trip): number {
  return t.totalMinutes + t.transfers * TRANSFER_PENALTY_MIN;
}

function dedupe(trips: Trip[]): Trip[] {
  const byId = new Map<string, Trip>();
  for (const t of trips) {
    const prev = byId.get(t.id);
    if (!prev || score(t) < score(prev)) byId.set(t.id, t);
  }
  return [...byId.values()];
}
