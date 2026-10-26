// MapLibre GL v6 runs map rendering in a module worker loaded from a separate file.
// Metro doesn't bundle it, so copy it into public/ (served at the site root) and point
// MapLibre at it with setWorkerUrl (src/components/map/maplibre-worker.web.ts).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
mkdirSync('public', { recursive: true });
copyFileSync(join(dist, 'maplibre-gl-worker.mjs'), join('public', 'maplibre-gl-worker.mjs'));
