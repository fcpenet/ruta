import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { osrmDirections } from './directions.ts';
import { LibsqlStore } from './libsql-store.ts';
import { MemoryStore, type RouteStore } from './store.ts';

const port = Number(process.env.PORT ?? 8080);
const databaseUrl = process.env.TURSO_DATABASE_URL;

let store: RouteStore;
if (databaseUrl) {
  const db = new LibsqlStore(databaseUrl, process.env.TURSO_AUTH_TOKEN);
  await db.migrate();
  store = db;
} else {
  console.warn('TURSO_DATABASE_URL not set — using in-memory store; routes are lost on restart.');
  store = new MemoryStore();
}

// Private OSRM service (routing/), e.g. http://ruta-osrm-jem.internal:5000 and :5001.
const { OSRM_DRIVING_URL, OSRM_WALKING_URL } = process.env;
const directions =
  OSRM_DRIVING_URL && OSRM_WALKING_URL
    ? osrmDirections({ driving: OSRM_DRIVING_URL, walking: OSRM_WALKING_URL })
    : undefined;
if (!directions) console.warn('OSRM_*_URL not set — /directions is disabled; drawn routes stay straight.');

const app = createApp(store, { corsOrigin: process.env.CORS_ORIGIN, directions });

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`ruta-api listening on :${info.port}`);
});
