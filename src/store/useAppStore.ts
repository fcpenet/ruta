import { create } from 'zustand';

import { getBundledRoutes, landmarks } from '@/lib/dataSource';
import { planTrips } from '@/lib/planner';
import type { DiscountType, LngLat, RouteDataset, Trip } from '@/types';

export interface Place {
  name: string;
  coord: LngLat;
}

export type PickTarget = 'origin' | 'destination';

/** Default map centre and origin: Cubao. */
export const DEFAULT_CENTER: LngLat = [121.0527, 14.6195];

interface AppState {
  dataset: RouteDataset;
  origin: Place | null;
  destination: Place | null;
  pickTarget: PickTarget;
  trips: Trip[];
  selectedTripId: string | null;
  highlightedRouteId: string | null;
  discount: DiscountType;
  /** Manila hour to simulate traffic at; null means live. */
  simulatedHour: number | null;
  /** Bumped by a timer so traffic re-reads every 30 s. */
  trafficTick: number;

  setDataset: (d: RouteDataset) => void;
  setPlace: (target: PickTarget, place: Place | null) => void;
  setPickTarget: (t: PickTarget) => void;
  swapPlaces: () => void;
  selectTrip: (id: string | null) => void;
  highlightRoute: (id: string | null) => void;
  setDiscount: (d: DiscountType) => void;
  setSimulatedHour: (h: number | null) => void;
  tickTraffic: () => void;
}

/** The moment traffic is read at: now, or today at the simulated Manila hour. */
export function trafficTime(simulatedHour: number | null): Date {
  const now = new Date();
  if (simulatedHour === null) return now;
  // Manila is UTC+8 with no DST.
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + (simulatedHour - 8) * 3600_000);
}

function replan(s: Pick<AppState, 'origin' | 'destination' | 'dataset' | 'discount' | 'simulatedHour'>) {
  if (!s.origin || !s.destination) return { trips: [], selectedTripId: null };
  const trips = planTrips(s.origin.coord, s.destination.coord, {
    routes: s.dataset.routes,
    landmarks,
    discount: s.discount,
    at: trafficTime(s.simulatedHour),
  });
  return { trips, selectedTripId: trips[0]?.id ?? null };
}

export const useAppStore = create<AppState>((set, get) => ({
  dataset: getBundledRoutes(),
  origin: null,
  destination: null,
  pickTarget: 'destination',
  trips: [],
  selectedTripId: null,
  highlightedRouteId: null,
  discount: 'regular',
  simulatedHour: null,
  trafficTick: 0,

  setDataset: (dataset) => set({ dataset, ...replan({ ...get(), dataset }) }),
  setPlace: (target, place) => {
    const next = { ...get(), [target]: place };
    set({ [target]: place, ...replan(next) });
  },
  setPickTarget: (pickTarget) => set({ pickTarget }),
  swapPlaces: () => {
    const { origin, destination } = get();
    const next = { ...get(), origin: destination, destination: origin };
    set({ origin: destination, destination: origin, ...replan(next) });
  },
  selectTrip: (selectedTripId) => set({ selectedTripId }),
  highlightRoute: (highlightedRouteId) => set({ highlightedRouteId }),
  setDiscount: (discount) => set({ discount, ...replan({ ...get(), discount }) }),
  setSimulatedHour: (simulatedHour) =>
    set({ simulatedHour, ...replan({ ...get(), simulatedHour }) }),
  tickTraffic: () => {
    const s = get();
    // Live traffic changes ETAs; keep the user's selected trip if it still exists.
    const { trips } = replan(s);
    const keep = trips.some((t) => t.id === s.selectedTripId);
    set({
      trafficTick: s.trafficTick + 1,
      trips,
      selectedTripId: keep ? s.selectedTripId : (trips[0]?.id ?? null),
    });
  },
}));
