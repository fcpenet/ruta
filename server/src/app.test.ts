import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp, VERIFY_THRESHOLD } from './app.ts';
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

function client(store: RouteStore, opts = {}) {
  const app = createApp(store, opts);
  return {
    get: (path: string) => app.request(path),
    post: (path: string, body: unknown, device: string | null = randomUUID()) =>
      app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(device ? { 'X-Device-Id': device } : {}) },
        body: JSON.stringify(body),
      }),
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
  describe(`community routes API (${name})`, () => {
    let t: TestStore;
    let store: RouteStore;
    before(async () => {
      t = await makeStore();
    });
    beforeEach(async () => {
      await t.reset();
      store = t.store;
    });
    after(() => t.close());

    it('creates a route and lists it as an unverified community feature', async () => {
      const api = client(store);
      const res = await api.post('/routes', route);
      assert.equal(res.status, 201);
      const { route: created } = await res.json();
      assert.equal(created.type, 'Feature');
      assert.equal(created.properties.source, 'community');
      assert.equal(created.properties.status, 'unverified');
      assert.deepEqual(created.geometry.coordinates, route.coordinates);

      const list = await (await api.get('/routes')).json();
      assert.equal(list.routes.length, 1);
      assert.equal(list.routes[0].properties.signboard, 'KAMUNING – CUBAO');
    });

    it('rejects requests without a device id', async () => {
      const res = await client(store).post('/routes', route, null);
      assert.equal(res.status, 400);
    });

    it('rejects routes outside the Philippines or with huge jumps', async () => {
      const api = client(store);
      const abroad = await api.post('/routes', { ...route, coordinates: [[139.69, 35.68], [139.7, 35.69]] });
      assert.equal(abroad.status, 400);
      const jump = await api.post('/routes', { ...route, coordinates: [[121.0, 14.6], [121.2, 14.6]] });
      assert.equal(jump.status, 400);
      const body = await jump.json();
      assert.match(body.issues[0].message, /more than 5 km apart/);
    });

    it('rejects a single-point route and missing fields', async () => {
      const api = client(store);
      assert.equal((await api.post('/routes', { ...route, coordinates: [[121.0, 14.6]] })).status, 400);
      assert.equal((await api.post('/routes', { ...route, signboard: '  ' })).status, 400);
    });

    it('verifies a route after enough distinct confirmations, ignoring the author and repeats', async () => {
      const author = randomUUID();
      const api = client(store);
      const { route: created } = await (await api.post('/routes', route, author)).json();
      const confirm = (device: string) => api.post(`/routes/${created.properties.id}/confirm`, {}, device);

      assert.equal((await confirm(author)).status, 403);

      const first = randomUUID();
      await confirm(first);
      const again = await (await confirm(first)).json();
      assert.equal(again.route.properties.confirmations, 1);

      for (let i = 1; i < VERIFY_THRESHOLD; i++) await confirm(randomUUID());
      const list = await (await api.get('/routes')).json();
      assert.equal(list.routes[0].properties.status, 'verified');
    });

    it('404s when confirming an unknown route', async () => {
      const res = await client(store).post(`/routes/${randomUUID()}/confirm`, {});
      assert.equal(res.status, 404);
    });
  });
}

describe('rate limiting', () => {
  it('limits submissions per device per hour', async () => {
    let t = 0;
    const api = client(new MemoryStore(), { submitLimitPerHour: 2, now: () => t });
    const device = randomUUID();
    assert.equal((await api.post('/routes', route, device)).status, 201);
    assert.equal((await api.post('/routes', route, device)).status, 201);
    assert.equal((await api.post('/routes', route, device)).status, 429);
    t += 3600_001;
    assert.equal((await api.post('/routes', route, device)).status, 201);
  });
});
