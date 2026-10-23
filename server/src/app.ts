import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import { deviceIdSchema, newRouteSchema } from './schema.ts';
import type { RouteStore, StoredRoute } from './store.ts';

/** Confirmations from other devices needed before a community route shows as verified. */
export const VERIFY_THRESHOLD = 3;

const PALETTE = ['#D1495B', '#EDAE49', '#00798C', '#30638E', '#8F2D56', '#3D7068', '#E26D5C', '#5C4D7D'];

export interface AppOptions {
  /** Comma-separated allowed origins, or '*'. */
  corsOrigin?: string;
  submitLimitPerHour?: number;
  confirmLimitPerHour?: number;
  now?: () => number;
}

/** Shape the app's TransitRoute expects, plus community metadata. */
export function toFeature(r: StoredRoute) {
  return {
    type: 'Feature' as const,
    properties: {
      id: r.id,
      name: r.name,
      type: r.type,
      signboard: r.signboard,
      direction: r.direction,
      operatingHours: r.operatingHours,
      loadingPoints: r.loadingPoints,
      color: r.color,
      lastVerified: r.createdAt.slice(0, 10),
      city: r.city,
      source: 'community' as const,
      confirmations: r.confirmations,
      status: r.confirmations >= VERIFY_THRESHOLD ? ('verified' as const) : ('unverified' as const),
      createdAt: r.createdAt,
    },
    geometry: { type: 'LineString' as const, coordinates: r.coordinates },
  };
}

/** Fixed-window per-key limiter. In-memory, so per instance — enough to blunt spam on one Fly machine. */
function rateLimiter(limit: number, now: () => number) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((h) => t - h < 3600_000);
    if (recent.length >= limit) return false;
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}

export function createApp(store: RouteStore, opts: AppOptions = {}) {
  const now = opts.now ?? Date.now;
  const allowSubmit = rateLimiter(opts.submitLimitPerHour ?? 10, now);
  const allowConfirm = rateLimiter(opts.confirmLimitPerHour ?? 60, now);
  const origins = (opts.corsOrigin ?? '*').split(',').map((o) => o.trim());

  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: origins.includes('*') ? '*' : origins,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-Device-Id'],
    })
  );
  app.use('*', bodyLimit({ maxSize: 256 * 1024 }));

  const deviceId = (header: string | undefined) => deviceIdSchema.safeParse(header);

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/routes', async (c) => {
    const routes = await store.list();
    return c.json({ verifyThreshold: VERIFY_THRESHOLD, routes: routes.map(toFeature) });
  });

  app.post('/routes', async (c) => {
    const device = deviceId(c.req.header('X-Device-Id'));
    if (!device.success) return c.json({ error: 'Missing or invalid X-Device-Id' }, 400);
    if (!allowSubmit(device.data)) return c.json({ error: 'Too many submissions, try again later' }, 429);

    const body = await c.req.json().catch(() => null);
    const parsed = newRouteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: 'Invalid route',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        400
      );
    }

    const count = (await store.list()).length;
    const route = await store.create({
      ...parsed.data,
      color: PALETTE[count % PALETTE.length],
      authorDevice: device.data,
    });
    return c.json({ route: toFeature(route) }, 201);
  });

  app.post('/routes/:id/confirm', async (c) => {
    const device = deviceId(c.req.header('X-Device-Id'));
    if (!device.success) return c.json({ error: 'Missing or invalid X-Device-Id' }, 400);
    if (!allowConfirm(device.data)) return c.json({ error: 'Too many confirmations, try again later' }, 429);

    const id = c.req.param('id');
    if (!deviceIdSchema.safeParse(id).success) return c.json({ error: 'Route not found' }, 404);

    const { result, route } = await store.confirm(id, device.data);
    if (result === 'not_found') return c.json({ error: 'Route not found' }, 404);
    if (result === 'own_route') return c.json({ error: 'You can’t confirm a route you added' }, 403);
    return c.json({ route: toFeature(route!) });
  });

  return app;
}
