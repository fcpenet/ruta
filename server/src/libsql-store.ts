import { randomUUID } from 'node:crypto';

import { createClient, type Client, type Row } from '@libsql/client';

import type { NewRoute } from './schema.ts';
import type { ConfirmResult, RouteStore, StoredRoute } from './store.ts';

const MIGRATION = `
create table if not exists community_routes (
  id text primary key,
  name text not null,
  type text not null check (type in ('jeep', 'modern_jeep', 'tricycle')),
  signboard text not null,
  direction text not null check (direction in ('both', 'oneway')),
  operating_hours text not null default '',
  city text,
  color text not null,
  coordinates text not null,
  loading_points text not null default '[]',
  author_device text not null,
  created_at text not null
);

create table if not exists route_confirmations (
  route_id text not null references community_routes (id) on delete cascade,
  device_id text not null,
  created_at text not null,
  primary key (route_id, device_id)
);

create index if not exists community_routes_created_at on community_routes (created_at);
`;

const SELECT = `
  select r.*, (select count(*) from route_confirmations c where c.route_id = r.id) as confirmations
  from community_routes r
`;

function toRoute(row: Row): StoredRoute {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as NewRoute['type'],
    signboard: row.signboard as string,
    direction: row.direction as NewRoute['direction'],
    operatingHours: row.operating_hours as string,
    city: (row.city as string | null) ?? undefined,
    color: row.color as string,
    coordinates: JSON.parse(row.coordinates as string),
    loadingPoints: JSON.parse(row.loading_points as string),
    authorDevice: row.author_device as string,
    createdAt: row.created_at as string,
    confirmations: Number(row.confirmations),
  };
}

/** Turso / libSQL store. Also accepts `file:` and `:memory:` URLs for local dev and tests. */
export class LibsqlStore implements RouteStore {
  private db: Client;

  constructor(url: string, authToken?: string) {
    this.db = createClient({ url, authToken });
  }

  async migrate() {
    await this.db.executeMultiple(MIGRATION);
  }

  /** Test helper: empties both tables. */
  async truncateAll() {
    await this.db.batch(['delete from route_confirmations', 'delete from community_routes'], 'write');
  }

  async close() {
    this.db.close();
  }

  async list() {
    const { rows } = await this.db.execute(`${SELECT} order by r.created_at desc limit 1000`);
    return rows.map(toRoute);
  }

  async create(route: NewRoute & { color: string; authorDevice: string }) {
    const id = randomUUID();
    await this.db.execute({
      sql: `insert into community_routes
        (id, name, type, signboard, direction, operating_hours, city, color, coordinates, loading_points, author_device, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        route.name,
        route.type,
        route.signboard,
        route.direction,
        route.operatingHours,
        route.city ?? null,
        route.color,
        JSON.stringify(route.coordinates),
        JSON.stringify(route.loadingPoints),
        route.authorDevice,
        new Date().toISOString(),
      ],
    });
    return (await this.get(id))!;
  }

  async confirm(routeId: string, deviceId: string): Promise<{ result: ConfirmResult; route?: StoredRoute }> {
    const route = await this.get(routeId);
    if (!route) return { result: 'not_found' };
    if (route.authorDevice === deviceId) return { result: 'own_route' };
    await this.db.execute({
      sql: 'insert or ignore into route_confirmations (route_id, device_id, created_at) values (?, ?, ?)',
      args: [routeId, deviceId, new Date().toISOString()],
    });
    return { result: 'ok', route: (await this.get(routeId))! };
  }

  private async get(id: string) {
    const { rows } = await this.db.execute({ sql: `${SELECT} where r.id = ?`, args: [id] });
    return rows[0] ? toRoute(rows[0]) : null;
  }
}
