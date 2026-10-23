import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { PgStore } from './pg-store.ts';
import { MemoryStore, type RouteStore } from './store.ts';

const port = Number(process.env.PORT ?? 8080);
const databaseUrl = process.env.DATABASE_URL;

let store: RouteStore;
if (databaseUrl) {
  const pg = new PgStore(databaseUrl);
  await pg.migrate();
  store = pg;
} else {
  console.warn('DATABASE_URL not set — using in-memory store; routes are lost on restart.');
  store = new MemoryStore();
}

const app = createApp(store, { corsOrigin: process.env.CORS_ORIGIN });

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`ruta-api listening on :${info.port}`);
});
