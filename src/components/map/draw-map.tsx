import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { StyleSheet } from 'react-native';

import { DEFAULT_CENTER } from '@/store/useAppStore';

import {
  DRAFT_STYLES,
  type DrawMapProps,
  LAYER_STYLES,
  MAP_STYLE_URL,
  useDraftData,
} from './map-data';

/** Same cross-package style-spec cast as ruta-map.tsx. */
const native = (style: object) => style;

/** Android/iOS route drawing map: tap to add a point. */
export function DrawMap({ points, onAddPoint }: DrawMapProps) {
  const { reference, draft } = useDraftData(points);

  return (
    <Map
      style={styles.map}
      mapStyle={MAP_STYLE_URL}
      attribution
      logo={false}
      onPress={(e) => onAddPoint(e.nativeEvent.lngLat)}>
      <Camera initialViewState={{ center: points[0] ?? DEFAULT_CENTER, zoom: 14 }} />
      <GeoJSONSource id="reference" data={reference}>
        <Layer id="reference-line" type="line" {...native(LAYER_STYLES.routes)} />
        <Layer id="reference-walk-line" type="line" {...native(LAYER_STYLES.walkLinks)} />
      </GeoJSONSource>
      <GeoJSONSource id="draft" data={draft}>
        <Layer id="draft-line" type="line" {...native(DRAFT_STYLES.line)} />
        <Layer
          id="draft-points"
          type="circle"
          filter={['==', ['geometry-type'], 'Point']}
          {...native(DRAFT_STYLES.points)}
        />
      </GeoJSONSource>
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
