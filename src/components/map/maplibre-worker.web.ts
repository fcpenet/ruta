import { getVersion, setWorkerUrl } from 'maplibre-gl';

// Served from public/ (copied by scripts/copy-maplibre-worker.mjs on install). The default
// URL points next to the Metro bundle, where the file doesn't exist.
setWorkerUrl(`/maplibre-gl-worker.mjs?v=${getVersion()}`);
