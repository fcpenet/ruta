import { useMemo } from 'react';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { CircleLayerSpecification, LineLayerSpecification } from 'maplibre-gl';

import { getAllTraffic, TRAFFIC_COLORS, trafficSegments } from '@/lib/traffic';
import { trafficTime, useAllRoutes, useAppStore } from '@/store/useAppStore';
import type { LngLat } from '@/types';

/**
 * Builds the GeoJSON both map implementations render (MapLibre native on
 * Android/iOS, maplibre-gl on web), so they stay visually identical.
 */

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export interface MapData {
  routes: FeatureCollection<LineString>;
  traffic: FeatureCollection<LineString>;
  trip: FeatureCollection<LineString>;
  points: FeatureCollection<Point>;
  /** Camera bounds for the current trip or pins, if any. */
  bounds: Bounds | null;
  /** Bounds of the route highlighted from the Routes tab. */
  focus: Bounds | null;
}

/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

export interface RutaMapProps {
  /** Long-press (native) or right-click / long-press (web) on the map. */
  onPick: (coord: LngLat) => void;
}

export function useMapData(): MapData {
  const allRoutes = useAllRoutes();
  const highlighted = useAppStore((s) => s.highlightedRouteId);
  const trips = useAppStore((s) => s.trips);
  const selectedTripId = useAppStore((s) => s.selectedTripId);
  const origin = useAppStore((s) => s.origin);
  const destination = useAppStore((s) => s.destination);
  const simulatedHour = useAppStore((s) => s.simulatedHour);
  const tick = useAppStore((s) => s.trafficTick);

  const trip = trips.find((t) => t.id === selectedTripId) ?? null;

  const routes = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: allRoutes.map((r) => ({
        ...r,
        properties: {
          ...r.properties,
          highlighted: r.properties.id === highlighted,
          dimmed: trip !== null || (highlighted !== null && r.properties.id !== highlighted),
        },
      })),
    }),
    [allRoutes, highlighted, trip]
  );

  const traffic = useMemo<FeatureCollection<LineString>>(() => {
    const readings = new Map(getAllTraffic(trafficTime(simulatedHour)).map((r) => [r.segmentId, r]));
    return {
      type: 'FeatureCollection',
      features: trafficSegments.map((s) => ({
        type: 'Feature',
        properties: {
          id: s.id,
          name: s.name,
          level: readings.get(s.id)?.level ?? 'free',
          color: TRAFFIC_COLORS[readings.get(s.id)?.level ?? 'free'],
        },
        geometry: { type: 'LineString', coordinates: s.coords },
      })),
    };
    // `tick` re-reads live traffic every 30 s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulatedHour, tick]);

  const tripFc = useMemo<FeatureCollection<LineString>>(() => {
    const features: Feature<LineString>[] = [];
    for (const leg of trip?.legs ?? []) {
      features.push(
        leg.kind === 'ride'
          ? {
              type: 'Feature',
              properties: { kind: 'ride', color: leg.color },
              geometry: { type: 'LineString', coordinates: leg.path },
            }
          : {
              type: 'Feature',
              properties: { kind: 'walk', color: '#57606A' },
              geometry: { type: 'LineString', coordinates: [leg.from, leg.to] },
            }
      );
    }
    return { type: 'FeatureCollection', features };
  }, [trip]);

  const points = useMemo<FeatureCollection<Point>>(() => {
    const pt = (coord: LngLat, role: string, color: string): Feature<Point> => ({
      type: 'Feature',
      properties: { role, color },
      geometry: { type: 'Point', coordinates: coord },
    });
    const features: Feature<Point>[] = [];
    for (const leg of trip?.legs ?? []) {
      if (leg.kind === 'ride') {
        features.push(pt(leg.board, 'board', leg.color), pt(leg.alight, 'alight', leg.color));
      }
    }
    if (origin) features.push(pt(origin.coord, 'origin', '#1A7F37'));
    if (destination) features.push(pt(destination.coord, 'destination', '#CF222E'));
    return { type: 'FeatureCollection', features };
  }, [trip, origin, destination]);

  const bounds = useMemo(() => {
    const coords: LngLat[] = [];
    if (origin) coords.push(origin.coord);
    if (destination) coords.push(destination.coord);
    for (const f of tripFc.features) coords.push(...(f.geometry.coordinates as LngLat[]));
    return coords.length >= 2 ? bbox(coords) : null;
  }, [origin, destination, tripFc]);

  const focus = useMemo(() => {
    const r = allRoutes.find((x) => x.properties.id === highlighted);
    return r ? bbox(r.geometry.coordinates as LngLat[]) : null;
  }, [allRoutes, highlighted]);

  return { routes, traffic, trip: tripFc, points, bounds, focus };
}

function bbox(coords: LngLat[]): Bounds {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}

type LineStyle = Pick<LineLayerSpecification, 'layout' | 'paint' | 'filter'>;
type CircleStyle = Pick<CircleLayerSpecification, 'paint'>;

/** MapLibre style-spec paint/layout shared by both platforms. */
export const LAYER_STYLES: {
  traffic: LineStyle;
  routes: LineStyle;
  tripCasing: LineStyle;
  tripRide: LineStyle;
  tripWalk: LineStyle;
  points: CircleStyle;
} = {
  traffic: {
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 9, 'line-opacity': 0.35 },
  },
  routes: {
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['get', 'highlighted'], 7, 4],
      'line-opacity': ['case', ['get', 'dimmed'], 0.25, 0.9],
    },
  },
  tripCasing: {
    filter: ['==', ['get', 'kind'], 'ride'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 10 },
  },
  tripRide: {
    filter: ['==', ['get', 'kind'], 'ride'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 6 },
  },
  tripWalk: {
    filter: ['==', ['get', 'kind'], 'walk'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [1, 2] },
  },
  points: {
    paint: {
      'circle-radius': ['match', ['get', 'role'], ['origin', 'destination'], 9, 6],
      'circle-color': [
        'match',
        ['get', 'role'],
        ['origin', 'destination'],
        ['get', 'color'],
        '#ffffff',
      ],
      'circle-stroke-color': [
        'match',
        ['get', 'role'],
        ['origin', 'destination'],
        '#ffffff',
        ['get', 'color'],
      ],
      'circle-stroke-width': 3,
    },
  },
};

export interface DrawMapProps {
  /** Vertices of the route being drawn, in order. */
  points: LngLat[];
  /** Tap/click on the map. */
  onAddPoint: (coord: LngLat) => void;
}

/** Existing routes (faint, for reference) plus the draft line and its vertices. */
export function useDraftData(points: LngLat[]) {
  const allRoutes = useAllRoutes();
  const reference = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: allRoutes.map((r) => ({
        ...r,
        properties: { ...r.properties, highlighted: false, dimmed: true },
      })),
    }),
    [allRoutes]
  );
  const draft = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...(points.length >= 2
          ? [
              {
                type: 'Feature' as const,
                properties: {},
                geometry: { type: 'LineString' as const, coordinates: points },
              },
            ]
          : []),
        ...points.map((p, i) => ({
          type: 'Feature' as const,
          properties: {
            role: i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'mid',
          },
          geometry: { type: 'Point' as const, coordinates: p },
        })),
      ],
    }),
    [points]
  );
  return { reference, draft };
}

export const DRAFT_STYLES: { line: LineStyle; points: CircleStyle } = {
  line: {
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0B6E4F', 'line-width': 5 },
  },
  points: {
    paint: {
      'circle-radius': ['match', ['get', 'role'], 'mid', 5, 8],
      'circle-color': ['match', ['get', 'role'], 'start', '#1A7F37', 'end', '#CF222E', '#ffffff'],
      'circle-stroke-color': '#0B6E4F',
      'circle-stroke-width': 2,
    },
  },
};
