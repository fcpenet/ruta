import { randomUUID } from 'node:crypto';

import { createClient, type Client, type Row } from '@libsql/client';

import type { Fare, NewRoute, ReportReason } from './schema.ts';
import {
  timestamp,
  type NewStoredRoute,
  type RouteStore,
  type StoredFare,
  type StoredRoute,
  type User,
  type VoteResult,
} from './store.ts';

const communityRoutesTable = (name: string) => `create table if not exists ${name} (
  id text primary key,
  name text not null,
  type text not null check (type in ('jeep', 'modern_jeep', 'tricycle', 'walk')),
  signboard text not null,
  direction text not null check (direction in ('both', 'oneway')),
  operating_hours text not null default '',
  city text,
  color text not null,
  coordinates text not null,
  loading_points text not null default '[]',
  author_id text not null references users (id),
  created_at text not null
);`;

const MIGRATION = `
create table if not exists users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  created_at text not null
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  expires_at text not null
);

${communityRoutesTable('community_routes')}

create table if not exists route_confirmations (
  route_id text not null references community_routes (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  created_at text not null,
  primary key (route_id, user_id)
);

create table if not exists route_reports (
  route_id text not null references community_routes (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  reason text not null check (reason in ('wrong_path', 'not_running', 'spam')),
  created_at text not null,
  primary key (route_id, user_id)
);

create table if not exists route_fares (
  id text primary key,
  route_id text not null references community_routes (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  kind text not null check (kind in ('flat', 'distance')),
  amount real,
  base real,
  base_km real,
  per_km real,
  created_at text not null
);

create table if not exists fare_supporters (
  fare_id text not null references route_fares (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  created_at text not null,
  primary key (fare_id, user_id)
);

create index if not exists community_routes_created_at on community_routes (created_at);
create index if not exists route_fares_route on route_fares (route_id, created_at);
`;

const SELECT = `
  select r.*, u.username as author,
    (select count(*) from route_confirmations c where c.route_id = r.id) as confirmations,
    (select count(*) from route_reports p where p.route_id = r.id) as reports,
    (select count(*) from route_reports p
      where p.route_id = r.id and p.reason = 'not_running'
        and p.created_at > coalesce((select max(c.created_at) from route_confirmations c where c.route_id = r.id), '')
    ) as fresh_not_running
  from community_routes r join users u on u.id = r.author_id
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
    authorId: row.author_id as string,
    author: row.author as string,
    createdAt: row.created_at as string,
    confirmations: Number(row.confirmations),
    reports: Number(row.reports),
    freshNotRunning: Number(row.fresh_not_running),
    fares: [],
  };
}

const FARES = `
  select f.*, u.username as proposed_by,
    (select count(*) from fare_supporters s where s.fare_id = f.id) as supporters
  from route_fares f join users u on u.id = f.user_id
`;

function toFare(row: Row): StoredFare & { routeId: string } {
  const base = {
    id: row.id as string,
    routeId: row.route_id as string,
    proposedBy: row.proposed_by as string,
    supporters: Number(row.supporters),
    createdAt: row.created_at as string,
  };
  return row.kind === 'flat'
    ? { ...base, kind: 'flat', amount: Number(row.amount) }
    : {
        ...base,
        kind: 'distance',
        base: Number(row.base),
        baseKm: Number(row.base_km),
        perKm: Number(row.per_km),
      };
}

function toUser(row: Row): User {
  return {
    id: row.id as string,
    username: row.username as string,
    passwordHash: row.password_hash as string,
    createdAt: row.created_at as string,
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
    await this.allowWalkLinks();
  }

  /**
   * Databases created before walk links have a CHECK constraint without 'walk'. SQLite can't
   * alter constraints, so rebuild the table (rows kept; foreign keys off during the swap).
   */
  private async allowWalkLinks() {
    const { rows } = await this.db.execute(
      "select sql from sqlite_master where type = 'table' and name = 'community_routes'"
    );
    if (String(rows[0]?.sql ?? '').includes("'walk'")) return;
    await this.db.migrate([
      'drop table if exists community_routes_v2',
      communityRoutesTable('community_routes_v2'),
      'insert into community_routes_v2 select * from community_routes',
      'drop table community_routes',
      'alter table community_routes_v2 rename to community_routes',
      'create index if not exists community_routes_created_at on community_routes (created_at)',
    ]);
  }

  /** Test helper: empties all tables. */
  async truncateAll() {
    await this.db.batch(
      [
        'delete from fare_supporters',
        'delete from route_fares',
        'delete from route_confirmations',
        'delete from route_reports',
        'delete from community_routes', 'delete from sessions',
        'delete from users',
      ],
      'write'
    );
  }

  async close() {
    this.db.close();
  }

  async list() {
    const { rows } = await this.db.execute(`${SELECT} order by r.created_at desc limit 1000`);
    const { rows: fareRows } = await this.db.execute(`${FARES} order by f.created_at desc`);
    return this.withFares(rows.map(toRoute), fareRows);
  }

  private withFares(routes: StoredRoute[], fareRows: Row[]): StoredRoute[] {
    const byRoute = new Map<string, StoredFare[]>();
    for (const { routeId, ...fare } of fareRows.map(toFare)) {
      byRoute.set(routeId, [...(byRoute.get(routeId) ?? []), fare]);
    }
    return routes.map((r) => ({ ...r, fares: byRoute.get(r.id) ?? [] }));
  }

  async create(route: NewStoredRoute) {
    const id = randomUUID();
    await this.db.execute({
      sql: `insert into community_routes
        (id, name, type, signboard, direction, operating_hours, city, color, coordinates, loading_points, author_id, created_at)
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
        route.authorId,
        timestamp(),
      ],
    });
    return (await this.get(id))!;
  }

  async confirm(routeId: string, userId: string): Promise<{ result: VoteResult; route?: StoredRoute }> {
    const route = await this.get(routeId);
    if (!route) return { result: 'not_found' };
    if (route.authorId === userId) return { result: 'own_route' };
    await this.db.batch(
      [
        { sql: 'delete from route_reports where route_id = ? and user_id = ?', args: [routeId, userId] },
        {
          // Riding it again refreshes the date, which outweighs older "not running" reports.
          sql: `insert into route_confirmations (route_id, user_id, created_at) values (?, ?, ?)
            on conflict (route_id, user_id) do update set created_at = excluded.created_at`,
          args: [routeId, userId, timestamp()],
        },
      ],
      'write'
    );
    return { result: 'ok', route: (await this.get(routeId))! };
  }

  async report(
    routeId: string,
    userId: string,
    reason: ReportReason
  ): Promise<{ result: VoteResult; route?: StoredRoute }> {
    if (!(await this.get(routeId))) return { result: 'not_found' };
    await this.db.batch(
      [
        { sql: 'delete from route_confirmations where route_id = ? and user_id = ?', args: [routeId, userId] },
        {
          sql: `insert into route_reports (route_id, user_id, reason, created_at) values (?, ?, ?, ?)
            on conflict (route_id, user_id) do update set reason = excluded.reason, created_at = excluded.created_at`,
          args: [routeId, userId, reason, timestamp()],
        },
      ],
      'write'
    );
    return { result: 'ok', route: (await this.get(routeId))! };
  }

  async proposeFare(
    routeId: string,
    userId: string,
    fare: Fare
  ): Promise<{ result: VoteResult; route?: StoredRoute }> {
    if (!(await this.get(routeId))) return { result: 'not_found' };
    const id = randomUUID();
    const at = timestamp();
    await this.db.batch(
      [
        {
          sql: `insert into route_fares (id, route_id, user_id, kind, amount, base, base_km, per_km, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            routeId,
            userId,
            fare.kind,
            fare.kind === 'flat' ? fare.amount : null,
            fare.kind === 'distance' ? fare.base : null,
            fare.kind === 'distance' ? fare.baseKm : null,
            fare.kind === 'distance' ? fare.perKm : null,
            at,
          ],
        },
        {
          sql: 'insert into fare_supporters (fare_id, user_id, created_at) values (?, ?, ?)',
          args: [id, userId, at],
        },
      ],
      'write'
    );
    return { result: 'ok', route: (await this.get(routeId))! };
  }

  async supportFare(
    routeId: string,
    fareId: string,
    userId: string
  ): Promise<{ result: VoteResult; route?: StoredRoute }> {
    const { rows } = await this.db.execute({
      sql: 'select 1 from route_fares where id = ? and route_id = ?',
      args: [fareId, routeId],
    });
    if (!rows.length) return { result: 'not_found' };
    await this.db.execute({
      sql: 'insert or ignore into fare_supporters (fare_id, user_id, created_at) values (?, ?, ?)',
      args: [fareId, userId, timestamp()],
    });
    return { result: 'ok', route: (await this.get(routeId))! };
  }

  async createUser(username: string, passwordHash: string) {
    const user = { id: randomUUID(), username, passwordHash, createdAt: timestamp() };
    const { rowsAffected } = await this.db.execute({
      sql: 'insert or ignore into users (id, username, password_hash, created_at) values (?, ?, ?, ?)',
      args: [user.id, user.username, user.passwordHash, user.createdAt],
    });
    return rowsAffected ? user : null;
  }

  async findUserByUsername(username: string) {
    const { rows } = await this.db.execute({ sql: 'select * from users where username = ?', args: [username] });
    return rows[0] ? toUser(rows[0]) : null;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: string) {
    await this.db.execute({
      sql: 'insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)',
      args: [tokenHash, userId, expiresAt],
    });
  }

  async findSession(tokenHash: string) {
    const { rows } = await this.db.execute({
      sql: `select u.id, u.username, s.expires_at from sessions s join users u on u.id = s.user_id
        where s.token_hash = ?`,
      args: [tokenHash],
    });
    const row = rows[0];
    if (!row) return null;
    return {
      user: { id: row.id as string, username: row.username as string },
      expiresAt: row.expires_at as string,
    };
  }

  async deleteSession(tokenHash: string) {
    await this.db.execute({ sql: 'delete from sessions where token_hash = ?', args: [tokenHash] });
  }

  private async get(id: string) {
    const { rows } = await this.db.execute({ sql: `${SELECT} where r.id = ?`, args: [id] });
    if (!rows[0]) return null;
    const { rows: fareRows } = await this.db.execute({
      sql: `${FARES} where f.route_id = ? order by f.created_at desc`,
      args: [id],
    });
    return this.withFares([toRoute(rows[0])], fareRows)[0];
  }
}
