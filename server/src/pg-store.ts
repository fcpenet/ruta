import postgres from 'postgres';

import type { NewRoute } from './schema.ts';
import type { ConfirmResult, RouteStore, StoredRoute } from './store.ts';

const MIGRATION = `
create table if not exists community_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('jeep', 'modern_jeep', 'tricycle')),
  signboard text not null,
  direction text not null check (direction in ('both', 'oneway')),
  operating_hours text not null default '',
  city text,
  color text not null,
  coordinates jsonb not null,
  loading_points jsonb not null default '[]',
  author_device text not null,
  created_at timestamptz not null default now()
);

create table if not exists route_confirmations (
  route_id uuid not null references community_routes (id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (route_id, device_id)
);
`;

interface Row {
  id: string;
  name: string;
  type: NewRoute['type'];
  signboard: string;
  direction: NewRoute['direction'];
  operating_hours: string;
  city: string | null;
  color: string;
  coordinates: NewRoute['coordinates'];
  loading_points: NewRoute['loadingPoints'];
  author_device: string;
  created_at: Date;
  confirmations: number;
}

const SELECT = `
  select r.*, (select count(*)::int from route_confirmations c where c.route_id = r.id) as confirmations
  from community_routes r
`;

function toRoute(row: Row): StoredRoute {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    signboard: row.signboard,
    direction: row.direction,
    operatingHours: row.operating_hours,
    city: row.city ?? undefined,
    color: row.color,
    coordinates: row.coordinates,
    loadingPoints: row.loading_points,
    authorDevice: row.author_device,
    createdAt: row.created_at.toISOString(),
    confirmations: row.confirmations,
  };
}

export class PgStore implements RouteStore {
  private sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 5, onnotice: () => {} });
  }

  async migrate() {
    await this.sql.unsafe(MIGRATION);
  }

  /** Test helper: empties both tables. */
  async truncateAll() {
    await this.sql`truncate community_routes cascade`;
  }

  async close() {
    await this.sql.end();
  }

  async list() {
    const rows = await this.sql.unsafe<Row[]>(`${SELECT} order by r.created_at desc limit 1000`);
    return rows.map(toRoute);
  }

  async create(route: NewRoute & { color: string; authorDevice: string }) {
    const [{ id }] = await this.sql<{ id: string }[]>`
      insert into community_routes
        (name, type, signboard, direction, operating_hours, city, color, coordinates, loading_points, author_device)
      values (
        ${route.name}, ${route.type}, ${route.signboard}, ${route.direction}, ${route.operatingHours},
        ${route.city ?? null}, ${route.color}, ${this.sql.json(route.coordinates)},
        ${this.sql.json(route.loadingPoints)}, ${route.authorDevice}
      )
      returning id`;
    return (await this.get(id))!;
  }

  async confirm(routeId: string, deviceId: string): Promise<{ result: ConfirmResult; route?: StoredRoute }> {
    const route = await this.get(routeId);
    if (!route) return { result: 'not_found' };
    if (route.authorDevice === deviceId) return { result: 'own_route' };
    await this.sql`
      insert into route_confirmations (route_id, device_id) values (${routeId}, ${deviceId})
      on conflict do nothing`;
    return { result: 'ok', route: (await this.get(routeId))! };
  }

  private async get(id: string) {
    const rows = await this.sql.unsafe<Row[]>(`${SELECT} where r.id = $1`, [id]);
    return rows[0] ? toRoute(rows[0]) : null;
  }
}
