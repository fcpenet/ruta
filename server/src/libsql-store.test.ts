import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { createClient } from '@libsql/client';

import { LibsqlStore } from './libsql-store.ts';

// Schema as deployed before walk links: the type CHECK has no 'walk'.
const OLD_SCHEMA = `
create table users (id text primary key, username text not null unique, password_hash text not null, created_at text not null);
create table community_routes (
  id text primary key, name text not null,
  type text not null check (type in ('jeep', 'modern_jeep', 'tricycle')),
  signboard text not null, direction text not null check (direction in ('both', 'oneway')),
  operating_hours text not null default '', city text, color text not null, coordinates text not null,
  loading_points text not null default '[]', author_id text not null references users (id), created_at text not null
);
create table route_confirmations (
  route_id text not null references community_routes (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  created_at text not null, primary key (route_id, user_id)
);
insert into users values ('u1', 'juan', 'x', '2026-10-01T00:00:00Z'), ('u2', 'maria', 'x', '2026-10-01T00:00:00Z');
insert into community_routes values ('r1', 'Kamuning – Cubao', 'jeep', 'CUBAO', 'both', '', null, '#D1495B',
  '[[121.0383,14.6299],[121.0527,14.6195]]', '[]', 'u1', '2026-10-02T00:00:00Z');
insert into route_confirmations values ('r1', 'u2', '2026-10-03T00:00:00Z');
`;

describe('LibsqlStore migration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ruta-migrate-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('upgrades an old database to allow walk links, keeping rows and confirmations', async () => {
    const url = `file:${join(dir, 'old.db')}`;
    const old = createClient({ url });
    await old.executeMultiple(OLD_SCHEMA);
    old.close();

    const store = new LibsqlStore(url);
    await store.migrate();
    await store.migrate(); // idempotent

    const [kept] = await store.list();
    assert.equal(kept.id, 'r1');
    assert.equal(kept.author, 'juan');
    assert.equal(kept.confirmations, 1);

    const walk = await store.create({
      name: 'Footbridge sa Cubao',
      type: 'walk',
      signboard: '',
      direction: 'both',
      operatingHours: '',
      coordinates: [
        [121.0527, 14.6195],
        [121.053, 14.62],
      ],
      loadingPoints: [],
      color: '#57606A',
      authorId: 'u2',
    });
    assert.equal(walk.type, 'walk');
    assert.equal((await store.confirm('r1', 'u2')).route?.confirmations, 1);
    await store.close();
  });
});
