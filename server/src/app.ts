import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';

import {
  credentialsSchema,
  DUMMY_HASH,
  hashPassword,
  hashToken,
  newSessionToken,
  SESSION_DAYS,
  verifyPassword,
} from './auth.ts';
import { newRouteSchema, reportSchema, routeIdSchema } from './schema.ts';
import type { PublicUser, RouteStore, StoredRoute } from './store.ts';

/** Confirmations from other users needed before a community route shows as verified. */
export const VERIFY_THRESHOLD = 3;
/** A route is disputed once reports outnumber confirmations by this much; the app stops suggesting it. */
export const DISPUTE_MARGIN = 2;

export function routeStatus(r: Pick<StoredRoute, 'confirmations' | 'reports'>) {
  if (r.reports - r.confirmations >= DISPUTE_MARGIN) return 'disputed' as const;
  return r.confirmations >= VERIFY_THRESHOLD ? ('verified' as const) : ('unverified' as const);
}

const PALETTE = ['#D1495B', '#EDAE49', '#00798C', '#30638E', '#8F2D56', '#3D7068', '#E26D5C', '#5C4D7D'];

export interface AppOptions {
  /** Comma-separated allowed origins, or '*'. */
  corsOrigin?: string;
  submitLimitPerHour?: number;
  /** Confirmations and reports combined. */
  confirmLimitPerHour?: number;
  /** Per client IP. Generous because mobile carriers put many users behind one IP. */
  signupLimitPerHour?: number;
  /** Failed and successful attempts per username. */
  loginLimitPerHour?: number;
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
      author: r.author,
      confirmations: r.confirmations,
      reports: r.reports,
      status: routeStatus(r),
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

type Env = { Variables: { user: PublicUser; tokenHash: string } };

const clientIp = (c: Context) => c.req.header('Fly-Client-IP') ?? 'local';

function bearerToken(c: Context) {
  const match = c.req.header('Authorization')?.match(/^Bearer (\S+)$/);
  return match?.[1] ?? null;
}

const validationError = (issues: { path: PropertyKey[]; message: string }[]) => ({
  error: issues[0]?.message ?? 'Invalid request',
  issues: issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
});

export function createApp(store: RouteStore, opts: AppOptions = {}) {
  const now = opts.now ?? Date.now;
  const allowSubmit = rateLimiter(opts.submitLimitPerHour ?? 10, now);
  const allowVote = rateLimiter(opts.confirmLimitPerHour ?? 60, now);
  const allowSignup = rateLimiter(opts.signupLimitPerHour ?? 30, now);
  const allowLogin = rateLimiter(opts.loginLimitPerHour ?? 20, now);
  const origins = (opts.corsOrigin ?? '*').split(',').map((o) => o.trim());

  const app = new Hono<Env>();

  app.use(
    '*',
    cors({
      origin: origins.includes('*') ? '*' : origins,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use('*', bodyLimit({ maxSize: 256 * 1024 }));

  const requireUser = createMiddleware<Env>(async (c, next) => {
    const token = bearerToken(c);
    const session = token ? await store.findSession(hashToken(token)) : null;
    if (!session || Date.parse(session.expiresAt) <= now()) {
      return c.json({ error: 'Please log in first' }, 401);
    }
    c.set('user', session.user);
    c.set('tokenHash', hashToken(token!));
    await next();
  });

  const startSession = async (user: PublicUser) => {
    const token = newSessionToken();
    const expiresAt = new Date(now() + SESSION_DAYS * 86400_000).toISOString();
    await store.createSession(hashToken(token), user.id, expiresAt);
    return { token, user: { id: user.id, username: user.username } };
  };

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/auth/signup', async (c) => {
    if (!allowSignup(clientIp(c))) return c.json({ error: 'Too many sign-ups, try again later' }, 429);
    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);

    const user = await store.createUser(parsed.data.username, await hashPassword(parsed.data.password));
    if (!user) return c.json({ error: 'That username is taken' }, 409);
    return c.json(await startSession(user), 201);
  });

  app.post('/auth/login', async (c) => {
    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null));
    // Don't echo validation rules on login; any malformed input is just wrong credentials.
    if (!parsed.success) return c.json({ error: 'Wrong username or password' }, 401);
    if (!allowLogin(parsed.data.username)) {
      return c.json({ error: 'Too many login attempts, try again later' }, 429);
    }

    const user = await store.findUserByUsername(parsed.data.username);
    const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return c.json({ error: 'Wrong username or password' }, 401);
    return c.json(await startSession(user));
  });

  app.post('/auth/logout', requireUser, async (c) => {
    await store.deleteSession(c.get('tokenHash'));
    return c.json({ ok: true });
  });

  app.get('/auth/me', requireUser, (c) => c.json({ user: c.get('user') }));

  app.get('/routes', async (c) => {
    const routes = await store.list();
    return c.json({
      verifyThreshold: VERIFY_THRESHOLD,
      disputeMargin: DISPUTE_MARGIN,
      routes: routes.map(toFeature),
    });
  });

  app.post('/routes', requireUser, async (c) => {
    const user = c.get('user');
    if (!allowSubmit(user.id)) return c.json({ error: 'Too many submissions, try again later' }, 429);

    const parsed = newRouteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ ...validationError(parsed.error.issues), error: 'Invalid route' }, 400);

    const count = (await store.list()).length;
    const route = await store.create({
      ...parsed.data,
      color: PALETTE[count % PALETTE.length],
      authorId: user.id,
    });
    return c.json({ route: toFeature(route) }, 201);
  });

  app.post('/routes/:id/confirm', requireUser, async (c) => {
    const user = c.get('user');
    if (!allowVote(user.id)) return c.json({ error: 'Too many votes, try again later' }, 429);

    const id = c.req.param('id');
    if (!routeIdSchema.safeParse(id).success) return c.json({ error: 'Route not found' }, 404);

    const { result, route } = await store.confirm(id, user.id);
    if (result === 'not_found') return c.json({ error: 'Route not found' }, 404);
    if (result === 'own_route') return c.json({ error: 'You can’t confirm a route you added' }, 403);
    return c.json({ route: toFeature(route!) });
  });

  // Authors may report their own route too, e.g. when it stops running.
  app.post('/routes/:id/report', requireUser, async (c) => {
    const user = c.get('user');
    if (!allowVote(user.id)) return c.json({ error: 'Too many votes, try again later' }, 429);

    const id = c.req.param('id');
    if (!routeIdSchema.safeParse(id).success) return c.json({ error: 'Route not found' }, 404);
    const parsed = reportSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);

    const { result, route } = await store.report(id, user.id, parsed.data.reason);
    if (result === 'not_found') return c.json({ error: 'Route not found' }, 404);
    return c.json({ route: toFeature(route!) });
  });

  return app;
}
