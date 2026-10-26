import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createApp } from './app.ts';
import { DirectionsUnavailable, osrmDirections, type Directions } from './directions.ts';
import { MemoryStore } from './store.ts';

const fakeFetch = (body: unknown, seen: string[] = []) =>
  (async (url: string) => {
    seen.push(url);
    return new Response(JSON.stringify(body));
  }) as unknown as typeof fetch;

describe('osrmDirections', () => {
  const urls = { driving: 'http://osrm:5000/', walking: 'http://osrm:5001' };

  it('calls the profile URL and returns path, km and waypoint street names', async () => {
    const seen: string[] = [];
    const directions = osrmDirections(
      urls,
      fakeFetch(
        {
          code: 'Ok',
          routes: [{ distance: 1530, geometry: { coordinates: [[121.04, 14.53], [121.045, 14.54], [121.05, 14.55]] } }],
          waypoints: [{ name: 'Lawton Avenue' }, { name: '5th Avenue' }],
        },
        seen
      )
    );
    const r = await directions('walking', [[121.04, 14.53], [121.05, 14.55]]);
    assert.equal(seen[0], 'http://osrm:5001/route/v1/walking/121.040000,14.530000;121.050000,14.550000?overview=full&geometries=geojson');
    assert.equal(r!.path.length, 3);
    assert.equal(r!.km, 1.53);
    assert.deepEqual(r!.names, ['Lawton Avenue', '5th Avenue']);
  });

  it('returns null when no road connects the points, and throws when OSRM fails', async () => {
    assert.equal(await osrmDirections(urls, fakeFetch({ code: 'NoRoute' }))('driving', [[121, 14.5], [121.1, 14.6]]), null);
    await assert.rejects(
      osrmDirections(urls, fakeFetch({ code: 'InvalidQuery' }))('driving', [[121, 14.5], [121.1, 14.6]]),
      DirectionsUnavailable
    );
  });
});

describe('GET /directions', () => {
  const setup = async (directions?: Directions) => {
    const app = createApp(new MemoryStore(), { directions });
    const res = await app.request('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'drawer', password: 'jeepney123' }),
    });
    const { token } = await res.json();
    return (query: string, auth = true) =>
      app.request(`/directions?${query}`, auth ? { headers: { Authorization: `Bearer ${token}` } } : {});
  };
  const ok: Directions = async (_mode, pts) => ({ path: pts, km: 1, names: pts.map(() => 'Lawton Avenue') });

  it('snaps waypoints for logged-in users', async () => {
    const get = await setup(ok);
    const res = await get('mode=driving&points=121.04,14.53;121.05,14.55');
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).names, ['Lawton Avenue', 'Lawton Avenue']);
    assert.equal((await get('mode=driving&points=121.04,14.53;121.05,14.55', false)).status, 401);
  });

  it('validates mode and points', async () => {
    const get = await setup(ok);
    assert.equal((await get('mode=flying&points=121.04,14.53;121.05,14.55')).status, 400);
    assert.equal((await get('mode=driving&points=121.04,14.53')).status, 400);
    assert.equal((await get('mode=driving&points=139.7,35.6;139.8,35.7')).status, 400);
    assert.equal((await get('mode=driving&points=abc;def')).status, 400);
  });

  it('reports no road, an outage, or missing setup', async () => {
    assert.equal((await (await setup(async () => null))('mode=walking&points=121.04,14.53;121.05,14.55')).status, 422);
    const down: Directions = async () => {
      throw new DirectionsUnavailable('down');
    };
    assert.equal((await (await setup(down))('mode=walking&points=121.04,14.53;121.05,14.55')).status, 502);
    assert.equal((await (await setup())('mode=walking&points=121.04,14.53;121.05,14.55')).status, 503);
  });
});
