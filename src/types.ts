import type { Feature, LineString, Position } from 'geojson';

export type LngLat = [number, number];

export type VehicleType = 'jeep' | 'modern_jeep' | 'tricycle';

export type DiscountType = 'regular' | 'student' | 'senior' | 'pwd';

export interface LoadingPoint {
  name: string;
  coord: LngLat;
}

export interface RouteProps {
  id: string;
  name: string;
  type: VehicleType;
  signboard: string;
  direction: 'oneway' | 'both';
  operatingHours: string;
  loadingPoints: LoadingPoint[];
  color: string;
  lastVerified: string;
  /** Tricycle fares are set per LGU; jeeps ignore this. */
  city?: string;
  /** Absent for bundled data; 'community' for routes added by commuters. */
  source?: 'official' | 'community';
  /** 'disputed' when commuters' reports outnumber confirmations; the planner skips these. */
  status?: 'unverified' | 'verified' | 'disputed';
  confirmations?: number;
  reports?: number;
  /** Username of the commuter who added a community route. */
  author?: string;
}

export type TransitRoute = Feature<LineString, RouteProps>;

export type ReportReason = 'wrong_path' | 'not_running' | 'spam';

export interface RouteDataset {
  version: number;
  updatedAt: string;
  region: string;
  attribution: string;
  routes: TransitRoute[];
}

export interface Landmark {
  id: string;
  name: string;
  aliases?: string[];
  coord: LngLat;
}

export interface DistanceFare {
  base: number;
  baseKm: number;
  perKm: number;
}

export interface FareTable {
  effectiveDate: string;
  source: string;
  discountRate: number;
  jeep: DistanceFare;
  modern_jeep: DistanceFare;
  tricycle: Record<string, DistanceFare & { special?: number }>;
}

export type TrafficLevel = 'free' | 'moderate' | 'heavy' | 'standstill';

export interface TrafficSegment {
  id: string;
  name: string;
  coords: Position[];
}

export interface TrafficReading {
  segmentId: string;
  level: TrafficLevel;
  multiplier: number;
}

export interface WalkLeg {
  kind: 'walk';
  from: LngLat;
  to: LngLat;
  meters: number;
  minutes: number;
  toName: string;
}

export interface RideLeg {
  kind: 'ride';
  routeId: string;
  routeName: string;
  vehicle: VehicleType;
  signboard: string;
  color: string;
  board: LngLat;
  alight: LngLat;
  boardName: string;
  alightName: string;
  km: number;
  minutes: number;
  fare: number;
  path: LngLat[];
  trafficLevel: TrafficLevel;
  /** Community route not yet confirmed by enough commuters. */
  unverified: boolean;
}

export type Leg = WalkLeg | RideLeg;

/** Body of POST /routes on the community API. */
export interface NewCommunityRoute {
  name: string;
  type: VehicleType;
  signboard: string;
  direction: 'oneway' | 'both';
  operatingHours: string;
  city?: string;
  coordinates: LngLat[];
  loadingPoints: LoadingPoint[];
}

export interface Trip {
  id: string;
  legs: Leg[];
  totalMinutes: number;
  totalFare: number;
  transfers: number;
  walkMeters: number;
}
