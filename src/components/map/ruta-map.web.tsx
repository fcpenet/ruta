import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useRef } from 'react';
import {
  Layer,
  Map,
  type MapLayerMouseEvent,
  type MapLayerTouchEvent,
  type MapRef,
  NavigationControl,
  Source,
} from 'react-map-gl/maplibre';

import { DEFAULT_CENTER } from '@/store/useAppStore';

import { LAYER_STYLES, MAP_STYLE_URL, type RutaMapProps, useMapData } from './map-data';

const FIT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
const LONG_PRESS_MS = 550;

/** Web map (maplibre-gl). Android/iOS use ruta-map.tsx. */
export function RutaMap({ onPick }: RutaMapProps) {
  const { routes, traffic, trip, points, bounds, focus } = useMapData();
  const map = useRef<MapRef>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const target = bounds ?? focus;
    if (target) map.current?.fitBounds(target, { padding: FIT_PADDING, duration: 600 });
  }, [bounds, focus]);

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };

  // iOS Safari doesn't fire contextmenu on long-press, so time touches ourselves.
  const onTouchStart = (e: MapLayerTouchEvent) => {
    cancelPress();
    if (e.points.length !== 1) return;
    const { lng, lat } = e.lngLat;
    press.current = setTimeout(() => onPick([lng, lat]), LONG_PRESS_MS);
  };

  const onContextMenu = (e: MapLayerMouseEvent) => {
    e.preventDefault();
    cancelPress();
    onPick([e.lngLat.lng, e.lngLat.lat]);
  };

  return (
    <Map
      ref={map}
      mapStyle={MAP_STYLE_URL}
      initialViewState={{ longitude: DEFAULT_CENTER[0], latitude: DEFAULT_CENTER[1], zoom: 13 }}
      style={{ width: '100%', height: '100%' }}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onDragStart={cancelPress}>
      <NavigationControl position="top-right" showCompass={false} />

      <Source id="traffic" type="geojson" data={traffic}>
        <Layer id="traffic-line" type="line" {...LAYER_STYLES.traffic} />
      </Source>
      <Source id="routes" type="geojson" data={routes}>
        <Layer id="routes-line" type="line" {...LAYER_STYLES.routes} />
      </Source>
      <Source id="trip" type="geojson" data={trip}>
        <Layer id="trip-casing" type="line" {...LAYER_STYLES.tripCasing} />
        <Layer id="trip-ride" type="line" {...LAYER_STYLES.tripRide} />
        <Layer id="trip-walk" type="line" {...LAYER_STYLES.tripWalk} />
      </Source>
      <Source id="points" type="geojson" data={points}>
        <Layer id="points-circle" type="circle" {...LAYER_STYLES.points} />
      </Source>
    </Map>
  );
}
