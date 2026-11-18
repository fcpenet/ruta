import { lineIntersect } from '@turf/line-intersect';
import { lineString } from '@turf/helpers';

import { computeFare } from '@/lib/fare';
import {
  cumulativeKm,
  distanceM,
  isClosedLoop,
  LineIndex,
  lengthKm,
  type Snap,
  sliceAlong,
  snapToLine,
} from '@/lib/geo';
import { pathTraffic, vertexMultipliers } from '@/lib/traffic';
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
const SPEED_KMH: Record<VehicleType, number> = {
  jeep: 18,
  modern_jeep: 20,
  tricycle: 15,
};
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
  /** Minutes to walk across, from fromPoint to toPoint. */
  walkMin: number;
}

interface Ride {
  path: LngLat[];
  km: number;
}

/**
 * A partial trip: standing on `seg` at `alongKm`. Only its cost is computed while
 * searching; legs are built from the `prev` chain for trips that finish, since
 * dense networks queue far more labels than ever become trips.
 */
interface Label {
  seg: number;
  alongKm: number;
  cost: number;
  rides: number;
  used: number[];
  /** The label this one transferred from, and where it got off its segment. */
  prev: { label: Label; offKm: number } | null;
  /** The walk onto `seg`: from the origin, or across the transfer. */
  walkFrom: LngLat;
  walkTo: LngLat;
  /** Push order; breaks cost ties so the heap pops in a stable order. */
  seq: number;
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
  const segments: Segment[] = distinctRoutes(
    routes.filter(
      (r) => r.properties.status !== 'disputed' && r.properties.status !== 'unavailable'
    )
  ).map((route) => {
    const coords = route.geometry.coordinates as LngLat[];
    return {
      route,
      coords,
      walk: route.properties.type === 'walk',
      bbox: bboxOf(coords),
    };
  });
  const transfers = transferIndex(segments, transferRadiusM);
  const ctx: LegContext = { landmarks, discount, at };

  const near = (pt: LngLat) =>
    segments.flatMap((s, i) => {
      const snap = snapToLine(s.coords, pt);
      return snap.offsetM <= walkRadiusM ? [{ seg: i, snap }] : [];
    });
  const toSnaps = new Map(near(destination).map((c) => [c.seg, c.snap]));

  const travelLeg = (segIdx: number, ride: Ride): Leg => {
    const s = segments[segIdx];
    return s.walk ? linkLeg(s.route, ride, ctx) : rideLeg(s.route, ride, ctx);
  };
  const rideOn = (segIdx: number, fromKm: number, toKm: number) => {
    const s = segments[segIdx];
    const ride = rideBetween(s.route, s.coords, fromKm, toKm);
    return ride && (s.walk || ride.km >= MIN_RIDE_KM) ? ride : null;
  };
  const legsOf = (l: Label): Leg[] => {
    const before = l.prev
      ? [
          ...legsOf(l.prev.label),
          travelLeg(
            l.prev.label.seg,
            rideOn(l.prev.label.seg, l.prev.label.alongKm, l.prev.offKm)!
          ),
        ]
      : [];
    return [...before, walkLeg(l.walkFrom, l.walkTo, ctx, segments[l.seg].route)];
  };

  // Ride costs while searching come from per-segment prefix sums, so trying a
  // transfer doesn't slice the path or match traffic vertex by vertex.
  const profiles: (SegProfile | undefined)[] = [];
  const profile = (i: number) => (profiles[i] ??= segProfile(segments[i], at));
  const rideCost = (segIdx: number, fromKm: number, toKm: number): number | null => {
    const s = segments[segIdx];
    const p = profile(segIdx);
    let km: number;
    let mult: { sum: number; n: number };
    if (s.route.properties.direction !== 'oneway' || toKm >= fromKm) {
      km = Math.abs(toKm - fromKm);
      mult = multiplierSum(p, Math.min(fromKm, toKm), Math.max(fromKm, toKm));
    } else {
      // One-way going "backwards" only works by riding around a loop.
      if (!p.closed) return null;
      km = p.totalKm - fromKm + toKm;
      const a = multiplierSum(p, fromKm, p.totalKm);
      const b = multiplierSum(p, 0, toKm);
      mult = { sum: a.sum + b.sum, n: a.n + b.n };
    }
    if (!s.walk && km < MIN_RIDE_KM) return null;
    if (s.walk) return (km * 1000) / WALK_M_PER_MIN;
    return rideMinutes(s.route.properties.type as VehicleType, km, mult.sum / mult.n);
  };

  // Best-first search over (segment, position) states, cheapest partial trip first.
  const queue = new MinHeap<Label>((x, y) => x.cost - y.cost || x.seq - y.seq);
  /** State key: segment and 50 m bucket along it. */
  const keyOf = (seg: number, alongKm: number) => seg * 10_000_000 + Math.round(alongKm * 20);
  /** Cheapest cost expanded per state. */
  const best = new Map<number, number>();
  /** Cheapest cost queued per state; anything no cheaper would be skipped when popped. */
  const queued = new Map<number, number>();
  let seq = 0;
  const push = (l: Omit<Label, 'seq'>) => {
    const key = keyOf(l.seg, l.alongKm);
    if ((queued.get(key) ?? Infinity) <= l.cost) return;
    queued.set(key, l.cost);
    queue.push({ ...l, seq: seq++ });
  };

  for (const { seg, snap } of near(origin)) {
    push({
      seg,
      alongKm: snap.alongKm,
      cost: walkMinutes(origin, snap.point),
      rides: 0,
      used: [seg],
      prev: null,
      walkFrom: origin,
      walkTo: snap.point,
    });
  }
  const trips: Trip[] = [];

  for (let n = 0; queue.size && n < MAX_EXPANSIONS && trips.length < maxResults * 4; n++) {
    const label = queue.pop()!;
    const key = keyOf(label.seg, label.alongKm);
    if ((best.get(key) ?? Infinity) <= label.cost) continue;
    best.set(key, label.cost);

    const seg = segments[label.seg];

    // Finish: this segment passes near the destination.
    const end = toSnaps.get(label.seg);
    const finish = end && rideOn(label.seg, label.alongKm, end.alongKm);
    if (end && finish) {
      trips.push(
        assemble([
          ...legsOf(label),
          travelLeg(label.seg, finish),
          walkLeg(end.point, destination, ctx),
        ])
      );
    }

    // Continue: get off here and switch to another segment.
    if (label.used.length >= MAX_SEGMENTS) continue;
    for (const t of transfers[label.seg]) {
      const next = segments[t.to];
      if (label.used.includes(t.to)) continue;
      if (!next.walk && label.rides >= MAX_RIDES) continue;
      // Costs only grow, so a state already queued this cheap can't improve.
      if ((queued.get(keyOf(t.to, t.toKm)) ?? Infinity) <= label.cost) continue;
      const rideMin = rideCost(label.seg, label.alongKm, t.fromKm);
      if (rideMin === null) continue;
      const penalty =
        !next.walk && label.rides + (seg.walk ? 0 : 1) >= 1 ? TRANSFER_PENALTY_MIN : 0;
      push({
        seg: t.to,
        alongKm: t.toKm,
        cost:
          label.cost +
          rideMin +
          t.walkMin +
          penalty +
          (isUnverifiedRoute(seg.route) ? UNVERIFIED_PENALTY_MIN : 0),
        rides: label.rides + (seg.walk ? 0 : 1),
        used: [...label.used, t.to],
        prev: { label, offKm: t.fromKm },
        walkFrom: t.fromPoint,
        walkTo: t.toPoint,
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

/**
 * Drops community routes whose line, vehicle and direction exactly repeat another
 * community route's (the same route submitted more than once). Each copy would offer
 * the same trip, and transfers between copies at every stretch multiply the search.
 * Keeps a verified copy if there is one, else the first listed. Copies of official
 * routes stay: they're shown, marked unverified, next to the official one.
 */
function distinctRoutes(routes: TransitRoute[]): TransitRoute[] {
  const byShape = new Map<string, TransitRoute>();
  for (const r of routes) {
    const p = r.properties;
    if (p.source !== 'community') continue;
    const shape = `${p.type}|${p.direction}|${r.geometry.coordinates.join(';')}`;
    const kept = byShape.get(shape);
    if (!kept || (p.status === 'verified' && kept.properties.status !== 'verified')) {
      byShape.set(shape, r);
    }
  }
  const keep = new Set(byShape.values());
  return routes.filter((r) => r.properties.source !== 'community' || keep.has(r));
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
  const lines = segments.map((s) => new LineIndex(s.coords));
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
      const byStretch = new Map<number, Omit<Transfer, 'walkMin'> & { gap: number }>();
      for (const { onA, onB } of transferPairs(lines[i], lines[j], radiusM)) {
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
        const walkMin = walkMinutes(t.fromPoint, t.toPoint);
        index[i].push({
          to: j,
          fromKm: t.fromKm,
          toKm: t.toKm,
          fromPoint: t.fromPoint,
          toPoint: t.toPoint,
          walkMin,
        });
        index[j].push({
          to: i,
          fromKm: t.toKm,
          toKm: t.fromKm,
          fromPoint: t.toPoint,
          toPoint: t.fromPoint,
          walkMin,
        });
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

/** Where two routes cross, plus vertices where they pass within `radiusM` of each other, snapped onto both. */
function transferPairs(a: LineIndex, b: LineIndex, radiusM: number): { onA: Snap; onB: Snap }[] {
  const pairs: { onA: Snap; onB: Snap }[] = [];
  for (const f of lineIntersect(lineString(a.coords), lineString(b.coords)).features) {
    const pt = f.geometry.coordinates as LngLat;
    const onA = a.snapWithin(pt, radiusM) ?? snapToLine(a.coords, pt);
    const onB = b.snapWithin(pt, radiusM) ?? snapToLine(b.coords, pt);
    pairs.push({ onA, onB });
  }
  // A vertex of one line is its own snap on that line; only the other line needs a lookup.
  b.coords.forEach((v, k) => {
    const onA = a.snapWithin(v, radiusM);
    if (onA) pairs.push({ onA, onB: b.vertex(k) });
  });
  a.coords.forEach((v, k) => {
    const onB = b.snapWithin(v, radiusM);
    if (onB) pairs.push({ onA: a.vertex(k), onB });
  });
  return pairs;
}

interface LegContext {
  landmarks: Landmark[];
  discount: DiscountType;
  at: Date;
}

// The search costs labels with these; the leg builders below use the same formulas.
const walkMeters = (from: LngLat, to: LngLat) => distanceM(from, to) * WALK_DETOUR;
const walkMinutes = (from: LngLat, to: LngLat) => walkMeters(from, to) / WALK_M_PER_MIN;
const linkMinutes = (ride: Ride) => (ride.km * 1000) / WALK_M_PER_MIN;
const rideMinutes = (vehicle: VehicleType, km: number, trafficMultiplier: number) =>
  (km / SPEED_KMH[vehicle]) * 60 * trafficMultiplier;
const isUnverifiedRoute = (route: TransitRoute) =>
  route.properties.source === 'community' && route.properties.status !== 'verified';

/** Along-distances and traffic prefix sums for one segment at one moment. */
interface SegProfile {
  cum: number[];
  /** prefix[i] = sum of vertex traffic multipliers before vertex i. */
  prefix: number[];
  totalKm: number;
  closed: boolean;
}

function segProfile(seg: Segment, at: Date): SegProfile {
  const cum = cumulativeKm(seg.coords);
  const prefix = [0];
  for (const m of vertexMultipliers(seg.coords, at)) prefix.push(prefix[prefix.length - 1] + m);
  return {
    cum,
    prefix,
    totalKm: cum[cum.length - 1] ?? 0,
    closed: isClosedLoop(seg.coords),
  };
}

/**
 * Sum and count of vertex multipliers over the stretch [fromKm, toKm], counting the
 * two cut points at their edges' start vertices. Approximates pathTraffic's average
 * over the sliced path, for ordering the search; finished trips use pathTraffic.
 */
function multiplierSum(p: SegProfile, fromKm: number, toKm: number): { sum: number; n: number } {
  const n = p.cum.length;
  const i0 = firstVertexAfter(p.cum, fromKm, true);
  const i1 = firstVertexAfter(p.cum, toKm, false);
  const interior = Math.max(0, i1 - i0);
  const e0 = Math.max(0, Math.min(n - 1, i0 - 1));
  const e1 = Math.max(0, Math.min(n - 1, i1 - 1));
  const sum =
    (interior ? p.prefix[i1] - p.prefix[i0] : 0) +
    (p.prefix[e0 + 1] - p.prefix[e0]) +
    (p.prefix[e1 + 1] - p.prefix[e1]);
  return { sum, n: interior + 2 };
}

/** Index of the first vertex past `km` (`strict`) or at/past it, by binary search. */
function firstVertexAfter(cum: number[], km: number, strict: boolean): number {
  let lo = 0;
  let hi = cum.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (strict ? cum[mid] > km : cum[mid] >= km) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function walkLeg(from: LngLat, to: LngLat, ctx: LegContext, toward?: TransitRoute): WalkLeg {
  const meters = walkMeters(from, to);
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
  return {
    kind: 'walk',
    from: ride.path[0],
    to,
    meters: ride.km * 1000,
    minutes: linkMinutes(ride),
    toName: placeName(to, ctx.landmarks, route),
    link: {
      id: p.id,
      name: p.name,
      path: ride.path,
      unverified: isUnverifiedRoute(route),
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
    minutes: rideMinutes(vehicle, ride.km, traffic.multiplier),
    fare: computeFare(vehicle, ride.km, ctx.discount, p.city, p.fare),
    path: ride.path,
    trafficLevel: traffic.level,
    unverified: isUnverifiedRoute(route),
  };
}

/** Binary min-heap; the planner's queue grows into the thousands on dense networks. */
class MinHeap<T> {
  private items: T[] = [];
  constructor(private readonly less: (a: T, b: T) => number) {}

  get size() {
    return this.items.length;
  }

  push(item: T) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop(): T | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last !== undefined) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.less(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
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
