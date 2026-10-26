import { Camera, type CameraRef, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { DEFAULT_CENTER } from '@/store/useAppStore';

import { LAYER_STYLES, MAP_STYLE_URL, type RutaMapProps, useMapData } from './map-data';

const FIT_PADDING = { top: 48, right: 32, bottom: 48, left: 32 };

/**
 * LAYER_STYLES is typed against maplibre-gl's style spec; this package ships its
 * own copy of the same types, which TypeScript treats as unrelated.
 */
const native = (style: (typeof LAYER_STYLES)[keyof typeof LAYER_STYLES]) => style as object;

/** Android/iOS map. The web build uses ruta-map.web.tsx. */
export function RutaMap({ onPick }: RutaMapProps) {
  const { routes, traffic, trip, points, bounds, focus } = useMapData();
  const camera = useRef<CameraRef>(null);

  useEffect(() => {
    const target = bounds ?? focus;
    if (target) camera.current?.fitBounds(target, { padding: FIT_PADDING, duration: 600 });
  }, [bounds, focus]);

  return (
    <Map
      style={styles.map}
      mapStyle={MAP_STYLE_URL}
      attribution
      logo={false}
      onLongPress={(e) => onPick(e.nativeEvent.lngLat)}>
      <Camera ref={camera} initialViewState={{ center: DEFAULT_CENTER, zoom: 13 }} />

      <GeoJSONSource id="traffic" data={traffic}>
        <Layer id="traffic-line" type="line" {...native(LAYER_STYLES.traffic)} />
      </GeoJSONSource>
      <GeoJSONSource id="routes" data={routes}>
        <Layer id="routes-line" type="line" {...native(LAYER_STYLES.routes)} />
        <Layer id="walk-links-line" type="line" {...native(LAYER_STYLES.walkLinks)} />
      </GeoJSONSource>
      <GeoJSONSource id="trip" data={trip}>
        <Layer id="trip-casing" type="line" {...native(LAYER_STYLES.tripCasing)} />
        <Layer id="trip-ride" type="line" {...native(LAYER_STYLES.tripRide)} />
        <Layer id="trip-walk" type="line" {...native(LAYER_STYLES.tripWalk)} />
      </GeoJSONSource>
      <GeoJSONSource id="points" data={points}>
        <Layer id="points-circle" type="circle" {...native(LAYER_STYLES.points)} />
      </GeoJSONSource>
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
