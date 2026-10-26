import { useMemo } from 'react';
import { create } from 'zustand';

import { API_URL } from '@/lib/api';
import { confirmRoute, fetchCommunityRoutes } from '@/lib/community';
import { getBundledRoutes, landmarks } from '@/lib/dataSource';
import { planTrips } from '@/lib/planner';
import type { DiscountType, LngLat, RouteDataset, TransitRoute, Trip } from '@/types';

export interface Place {
  name: string;
  coord: LngLat;
}

export type PickTarget = 'origin' | 'destination';

export type CommunityStatus = 'disabled' | 'idle' | 'loading' | 'ready' | 'error';

/** Default map centre and origin: Cubao. */
export const DEFAULT_CENTER: LngLat = [121.0527, 14.6195];

interface AppState {
  dataset: RouteDataset;
  /** Routes added by commuters through the community API. */
  communityRoutes: TransitRoute[];
  communityStatus: CommunityStatus;
  /** Community route IDs the logged-in user has confirmed this session. */
  confirmedIds: string[];
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
  loadCommunityRoutes: () => Promise<void>;
  /** Adds or replaces a community route (after submit or confirm). */
  upsertCommunityRoute: (r: TransitRoute) => void;
  confirmCommunityRoute: (id: string) => Promise<void>;
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

type PlanInputs = Pick<
  AppState,
  'origin' | 'destination' | 'dataset' | 'communityRoutes' | 'discount' | 'simulatedHour'
>;

/** Bundled routes plus community routes; what the planner, map and Routes tab use. */
export function selectAllRoutes(s: Pick<AppState, 'dataset' | 'communityRoutes'>): TransitRoute[] {
  return s.communityRoutes.length ? [...s.dataset.routes, ...s.communityRoutes] : s.dataset.routes;
}

function replan(s: PlanInputs) {
  if (!s.origin || !s.destination) return { trips: [], selectedTripId: null };
  const trips = planTrips(s.origin.coord, s.destination.coord, {
    routes: selectAllRoutes(s),
    landmarks,
    discount: s.discount,
    at: trafficTime(s.simulatedHour),
  });
  return { trips, selectedTripId: trips[0]?.id ?? null };
}

export const useAppStore = create<AppState>((set, get) => ({
  dataset: getBundledRoutes(),
  communityRoutes: [],
  communityStatus: API_URL ? 'idle' : 'disabled',
  confirmedIds: [],
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
  loadCommunityRoutes: async () => {
    if (!API_URL) return;
    set({ communityStatus: 'loading' });
    try {
      const communityRoutes = await fetchCommunityRoutes();
      set({ communityRoutes, communityStatus: 'ready', ...replan({ ...get(), communityRoutes }) });
    } catch {
      set({ communityStatus: 'error' });
    }
  },
  upsertCommunityRoute: (route) => {
    const others = get().communityRoutes.filter((r) => r.properties.id !== route.properties.id);
    const communityRoutes = [route, ...others];
    set({ communityRoutes, ...replan({ ...get(), communityRoutes }) });
  },
  confirmCommunityRoute: async (id) => {
    const route = await confirmRoute(id);
    get().upsertCommunityRoute(route);
    set({ confirmedIds: [...get().confirmedIds, id] });
  },
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

/** Memoized bundled + community routes for components. */
export function useAllRoutes(): TransitRoute[] {
  const dataset = useAppStore((s) => s.dataset);
  const communityRoutes = useAppStore((s) => s.communityRoutes);
  return useMemo(() => selectAllRoutes({ dataset, communityRoutes }), [dataset, communityRoutes]);
}
