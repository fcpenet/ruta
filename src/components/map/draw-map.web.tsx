import 'maplibre-gl/dist/maplibre-gl.css';
import './maplibre-worker.web';

import { Layer, Map, NavigationControl, Source } from 'react-map-gl/maplibre';

import { DEFAULT_CENTER } from '@/store/useAppStore';

import {
  DRAFT_STYLES,
  type DrawMapProps,
  LAYER_STYLES,
  MAP_STYLE_URL,
  useDraftData,
} from './map-data';

/** Web route drawing map: click to add a point. */
export function DrawMap({ points, path, onAddPoint }: DrawMapProps) {
  const { reference, draft } = useDraftData(points, path);
  const [lng, lat] = points[0] ?? DEFAULT_CENTER;

  return (
    <Map
      mapStyle={MAP_STYLE_URL}
      initialViewState={{ longitude: lng, latitude: lat, zoom: 14 }}
      style={{ width: '100%', height: '100%' }}
      cursor="crosshair"
      onClick={(e) => onAddPoint([e.lngLat.lng, e.lngLat.lat])}>
      <NavigationControl position="top-right" showCompass={false} />
      <Source id="reference" type="geojson" data={reference}>
        <Layer id="reference-line" type="line" {...LAYER_STYLES.routes} />
        <Layer id="reference-walk-line" type="line" {...LAYER_STYLES.walkLinks} />
      </Source>
      <Source id="draft" type="geojson" data={draft}>
        <Layer id="draft-line" type="line" {...DRAFT_STYLES.line} />
        <Layer
          id="draft-points"
          type="circle"
          filter={['==', ['geometry-type'], 'Point']}
          {...DRAFT_STYLES.points}
        />
      </Source>
    </Map>
  );
}
