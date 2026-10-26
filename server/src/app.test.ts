import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp, DISPUTE_MARGIN, VERIFY_THRESHOLD, type AppOptions } from './app.ts';
import { LibsqlStore } from './libsql-store.ts';
import { MemoryStore, type RouteStore } from './store.ts';

const route = {
  name: 'Kamuning – Cubao via Kamias',
  type: 'jeep',
  signboard: 'KAMUNING – CUBAO',
  direction: 'both',
  operatingHours: '5 AM – 10 PM',
  coordinates: [
    [121.0383, 14.6299],
    [121.0455, 14.6275],
    [121.0527, 14.6195],
  ],
  loadingPoints: [
    { name: 'Kamuning', coord: [121.0383, 14.6299] },
    { name: 'Cubao', coord: [121.0527, 14.6195] },
  ],
};

function client(store: RouteStore, opts: AppOptions = {}) {
  const app = createApp(store, opts);
  const post = (path: string, body: unknown, token?: string) =>
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  let n = 0;
  return {
    get: (path: string, token?: string) =>
      app.request(path, token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    post,
    /** Signs up a fresh user and returns its session token. */
    user: async (username = `user_${++n}`) => {
      const res = await post('/auth/signup', { username, password: 'jeepney123' });
      assert.equal(res.status, 201);
      return (await res.json()).token as string;
    },
  };
}

interface TestStore {
  store: RouteStore;
  reset(): Promise<void>;
  close(): Promise<void>;
}

// Runs the same suite against each store; libSQL uses an in-memory SQLite database.
const stores: [string, () => Promise<TestStore>][] = [
  [
    'memory',
    async () => {
      const t = { store: new MemoryStore() as RouteStore, reset: async () => {}, close: async () => {} };
      t.reset = async () => {
        t.store = new MemoryStore();
      };
      return t;
    },
  ],
  [
    'libsql',
    async () => {
      const db = new LibsqlStore(':memory:');
      await db.migrate();
      return { store: db, reset: () => db.truncateAll(), close: () => db.close() };
    },
  ],
];

for (const [name, makeStore] of stores) {
  describe(`auth (${name})`, () => {
    let t: TestStore;
    before(async () => {
      t = await makeStore();
    });
    beforeEach(() => t.reset());
    after(() => t.close());

    it('signs up, logs in, and reads the current user', async () => {
      const api = client(t.store);
      const signup = await api.post('/auth/signup', { username: '  Juan.Dela_Cruz ', password: 'jeepney123' });
      assert.equal(signup.status, 201);
      const { token, user } = await signup.json();
      assert.equal(user.username, 'juan.dela_cruz');

      const me = await (await api.get('/auth/me', token)).json();
      assert.equal(me.user.username, 'juan.dela_cruz');

      const login = await api.post('/auth/login', { username: 'JUAN.DELA_CRUZ', password: 'jeepney123' });
      assert.equal(login.status, 200);
      assert.notEqual((await login.json()).token, token);
    });

    it('rejects taken usernames and weak input', async () => {
      const api = client(t.store);
      await api.user('maria');
      assert.equal((await api.post('/auth/signup', { username: 'MARIA', password: 'jeepney123' })).status, 409);
      const short = await api.post('/auth/signup', { username: 'ana', password: 'short' });
      assert.equal(short.status, 400);
      assert.match((await short.json()).error, /at least 8/);
      assert.equal((await api.post('/auth/signup', { username: 'a b', password: 'jeepney123' })).status, 400);
    });

    it('rejects wrong passwords and unknown users the same way', async () => {
      const api = client(t.store);
      await api.user('pedro');
      const wrong = await api.post('/auth/login', { username: 'pedro', password: 'wrongpass1' });
      const unknown = await api.post('/auth/login', { username: 'nobody', password: 'jeepney123' });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.deepEqual(await wrong.json(), await unknown.json());
    });

    it('logs out and expires sessions', async () => {
      let clock = Date.now();
      const api = client(t.store, { now: () => clock });
      const token = await api.user();
      assert.equal((await api.post('/auth/logout', {}, token)).status, 200);
      assert.equal((await api.get('/auth/me', token)).status, 401);

      const fresh = await api.user();
      clock += 31 * 86400_000;
      assert.equal((await api.get('/auth/me', fresh)).status, 401);
    });
  });

  describe(`community routes API (${name})`, () => {
    let t: TestStore;
    before(async () => {
      t = await makeStore();
    });
    beforeEach(() => t.reset());
    after(() => t.close());

    it('creates a route and lists it as an unverified community feature with its author', async () => {
      const api = client(t.store);
      const res = await api.post('/routes', route, await api.user('kuya_jun'));
      assert.equal(res.status, 201);
      const { route: created } = await res.json();
      assert.equal(created.type, 'Feature');
      assert.equal(created.properties.source, 'community');
      assert.equal(created.properties.status, 'unverified');
      assert.equal(created.properties.author, 'kuya_jun');
      assert.deepEqual(created.geometry.coordinates, route.coordinates);

      const list = await (await api.get('/routes')).json();
      assert.equal(list.routes.length, 1);
      assert.equal(list.routes[0].properties.signboard, 'KAMUNING – CUBAO');
    });

    it('requires login to submit or confirm', async () => {
      const api = client(t.store);
      assert.equal((await api.post('/routes', route)).status, 401);
      assert.equal((await api.post('/routes', route, 'not-a-real-token')).status, 401);
      assert.equal((await api.post(`/routes/${randomUUID()}/confirm`, {})).status, 401);
    });

    it('rejects routes outside the Philippines or with huge jumps', async () => {
      const api = client(t.store);
      const token = await api.user();
      const abroad = await api.post('/routes', { ...route, coordinates: [[139.69, 35.68], [139.7, 35.69]] }, token);
      assert.equal(abroad.status, 400);
      const jump = await api.post('/routes', { ...route, coordinates: [[121.0, 14.6], [121.2, 14.6]] }, token);
      assert.equal(jump.status, 400);
      const body = await jump.json();
      assert.match(body.issues[0].message, /more than 5 km apart/);
    });

    it('rejects a single-point route and missing fields', async () => {
      const api = client(t.store);
      const token = await api.user();
      assert.equal((await api.post('/routes', { ...route, coordinates: [[121.0, 14.6]] }, token)).status, 400);
      assert.equal((await api.post('/routes', { ...route, signboard: '  ' }, token)).status, 400);
    });

    it('verifies a route after enough distinct confirmations, ignoring the author and repeats', async () => {
      const api = client(t.store);
      const author = await api.user();
      const { route: created } = await (await api.post('/routes', route, author)).json();
      const confirm = (token: string) => api.post(`/routes/${created.properties.id}/confirm`, {}, token);

      assert.equal((await confirm(author)).status, 403);

      const first = await api.user();
      await confirm(first);
      const again = await (await confirm(first)).json();
      assert.equal(again.route.properties.confirmations, 1);

      for (let i = 1; i < VERIFY_THRESHOLD; i++) await confirm(await api.user());
      const list = await (await api.get('/routes')).json();
      assert.equal(list.routes[0].properties.status, 'verified');
    });

    it('disputes a route once reports outnumber confirmations by DISPUTE_MARGIN', async () => {
      const api = client(t.store);
      const { route: created } = await (await api.post('/routes', route, await api.user())).json();
      const id = created.properties.id;
      const report = (token: string, reason = 'wrong_path') => api.post(`/routes/${id}/report`, { reason }, token);
      const confirm = (token: string) => api.post(`/routes/${id}/confirm`, {}, token);

      const fan = await api.user();
      await confirm(fan);
      for (let i = 0; i < DISPUTE_MARGIN; i++) await report(await api.user());
      let p = (await (await api.get('/routes')).json()).routes[0].properties;
      assert.deepEqual([p.confirmations, p.reports, p.status], [1, DISPUTE_MARGIN, 'unverified']);

      // The fan changes their mind: their confirmation becomes a report.
      const res = await report(fan, 'not_running');
      assert.equal(res.status, 200);
      p = (await res.json()).route.properties;
      assert.deepEqual([p.confirmations, p.reports, p.status], [0, DISPUTE_MARGIN + 1, 'disputed']);

      // Repeating a report counts once; confirming again swaps it back.
      await report(fan, 'spam');
      p = (await (await confirm(fan)).json()).route.properties;
      assert.deepEqual([p.confirmations, p.reports, p.status], [1, DISPUTE_MARGIN, 'unverified']);
    });

    it('validates reports and lets authors report their own route', async () => {
      const api = client(t.store);
      const author = await api.user();
      const { route: created } = await (await api.post('/routes', route, author)).json();
      const id = created.properties.id;
      assert.equal((await api.post(`/routes/${id}/report`, { reason: 'wrong_path' })).status, 401);
      assert.equal((await api.post(`/routes/${id}/report`, { reason: 'ugly' }, author)).status, 400);
      assert.equal((await api.post(`/routes/${id}/report`, { reason: 'not_running' }, author)).status, 200);
      assert.equal((await api.post(`/routes/${randomUUID()}/report`, { reason: 'spam' }, author)).status, 404);
    });

    it('404s when confirming an unknown route', async () => {
      const api = client(t.store);
      const res = await api.post(`/routes/${randomUUID()}/confirm`, {}, await api.user());
      assert.equal(res.status, 404);
    });
  });
}

describe('rate limiting', () => {
  it('limits submissions per user per hour', async () => {
    let t = 0;
    const api = client(new MemoryStore(), { submitLimitPerHour: 2, now: () => t });
    const token = await api.user();
    assert.equal((await api.post('/routes', route, token)).status, 201);
    assert.equal((await api.post('/routes', route, token)).status, 201);
    assert.equal((await api.post('/routes', route, token)).status, 429);
    t += 3600_001;
    assert.equal((await api.post('/routes', route, token)).status, 201);
  });

  it('limits login attempts per username', async () => {
    const api = client(new MemoryStore(), { loginLimitPerHour: 2 });
    await api.user('target');
    const attempt = () => api.post('/auth/login', { username: 'target', password: 'guess12345' });
    assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 429);
  });
});
