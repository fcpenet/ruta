import { randomUUID } from 'node:crypto';

import type { Fare, NewRoute, ReportReason } from './schema.ts';

export interface StoredRoute extends NewRoute {
  id: string;
  color: string;
  authorId: string;
  /** Author's username. */
  author: string;
  createdAt: string;
  confirmations: number;
  reports: number;
  /** "Not running" reports made after the latest confirmation. */
  freshNotRunning: number;
  /** Fare proposals, newest first. */
  fares: StoredFare[];
}

export type StoredFare = Fare & {
  id: string;
  /** Proposer's username. */
  proposedBy: string;
  /** Users backing this fare, the proposer included. */
  supporters: number;
  createdAt: string;
};

let lastStamp = 0;
/** ISO time that always moves forward, so votes cast in the same millisecond still order. */
export function timestamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export type PublicUser = Pick<User, 'id' | 'username'>;

export type VoteResult = 'ok' | 'not_found' | 'own_route';

export type NewStoredRoute = NewRoute & { color: string; authorId: string };

/** A route as stored, before votes and fares are attached. */
type RouteRow = Omit<StoredRoute, 'confirmations' | 'reports' | 'freshNotRunning' | 'fares' | 'author'>;

/** Persistence boundary: Turso (libSQL) in production, in-memory for tests and local dev. */
export interface RouteStore {
  list(): Promise<StoredRoute[]>;
  create(route: NewStoredRoute): Promise<StoredRoute>;
  /**
   * One vote per user per route: confirming replaces that user's report and vice versa.
   * Repeats count once (a repeated report updates the reason). Authors can't confirm their own route.
   */
  confirm(routeId: string, userId: string): Promise<{ result: VoteResult; route?: StoredRoute }>;
  report(routeId: string, userId: string, reason: ReportReason): Promise<{ result: VoteResult; route?: StoredRoute }>;
  /** A new fare for the route, backed by its proposer. */
  proposeFare(routeId: string, userId: string, fare: Fare): Promise<{ result: VoteResult; route?: StoredRoute }>;
  /** Back a proposed fare; repeats count once. 'not_found' when the fare isn't the route's. */
  supportFare(routeId: string, fareId: string, userId: string): Promise<{ result: VoteResult; route?: StoredRoute }>;

  /** Returns null when the username is taken. */
  createUser(username: string, passwordHash: string): Promise<User | null>;
  findUserByUsername(username: string): Promise<User | null>;
  createSession(tokenHash: string, userId: string, expiresAt: string): Promise<void>;
  findSession(tokenHash: string): Promise<{ user: PublicUser; expiresAt: string } | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

export class MemoryStore implements RouteStore {
  private routes = new Map<string, RouteRow>();
  /** route → user → when */
  private confirmations = new Map<string, Map<string, string>>();
  private reports = new Map<string, Map<string, { reason: ReportReason; at: string }>>();
  private fares = new Map<
    string,
    { id: string; fare: Fare; proposerId: string; createdAt: string; supporters: Set<string> }[]
  >();
  private users = new Map<string, User>();
  private sessions = new Map<string, { userId: string; expiresAt: string }>();

  async list() {
    return [...this.routes.values()].reverse().map((r) => this.withCounts(r));
  }

  async create(route: NewStoredRoute) {
    const stored = { ...route, id: randomUUID(), createdAt: timestamp() };
    this.routes.set(stored.id, stored);
    this.confirmations.set(stored.id, new Map());
    this.reports.set(stored.id, new Map());
    this.fares.set(stored.id, []);
    return this.withCounts(stored);
  }

  async confirm(routeId: string, userId: string) {
    const route = this.routes.get(routeId);
    if (!route) return { result: 'not_found' as const };
    if (route.authorId === userId) return { result: 'own_route' as const };
    this.reports.get(routeId)!.delete(userId);
    this.confirmations.get(routeId)!.set(userId, timestamp());
    return { result: 'ok' as const, route: this.withCounts(route) };
  }

  async report(routeId: string, userId: string, reason: ReportReason) {
    const route = this.routes.get(routeId);
    if (!route) return { result: 'not_found' as const };
    this.confirmations.get(routeId)!.delete(userId);
    this.reports.get(routeId)!.set(userId, { reason, at: timestamp() });
    return { result: 'ok' as const, route: this.withCounts(route) };
  }

  async proposeFare(routeId: string, userId: string, fare: Fare) {
    const route = this.routes.get(routeId);
    if (!route) return { result: 'not_found' as const };
    this.fares.get(routeId)!.push({
      id: randomUUID(),
      fare,
      proposerId: userId,
      createdAt: timestamp(),
      supporters: new Set([userId]),
    });
    return { result: 'ok' as const, route: this.withCounts(route) };
  }

  async supportFare(routeId: string, fareId: string, userId: string) {
    const route = this.routes.get(routeId);
    const proposal = this.fares.get(routeId)?.find((f) => f.id === fareId);
    if (!route || !proposal) return { result: 'not_found' as const };
    proposal.supporters.add(userId);
    return { result: 'ok' as const, route: this.withCounts(route) };
  }

  async createUser(username: string, passwordHash: string) {
    if (await this.findUserByUsername(username)) return null;
    const user = { id: randomUUID(), username, passwordHash, createdAt: timestamp() };
    this.users.set(user.id, user);
    return user;
  }

  async findUserByUsername(username: string) {
    return [...this.users.values()].find((u) => u.username === username) ?? null;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: string) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }

  async findSession(tokenHash: string) {
    const s = this.sessions.get(tokenHash);
    const user = s && this.users.get(s.userId);
    return user ? { user: { id: user.id, username: user.username }, expiresAt: s.expiresAt } : null;
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  private withCounts(r: RouteRow): StoredRoute {
    const confirmed = [...(this.confirmations.get(r.id)?.values() ?? [])];
    const lastConfirmed = confirmed.sort().at(-1) ?? '';
    const reports = [...(this.reports.get(r.id)?.values() ?? [])];
    const username = (id: string) => this.users.get(id)?.username ?? 'unknown';
    return {
      ...r,
      author: username(r.authorId),
      confirmations: confirmed.length,
      reports: reports.length,
      freshNotRunning: reports.filter((p) => p.reason === 'not_running' && p.at > lastConfirmed).length,
      fares: [...(this.fares.get(r.id) ?? [])].reverse().map((f) => ({
        ...f.fare,
        id: f.id,
        proposedBy: username(f.proposerId),
        supporters: f.supporters.size,
        createdAt: f.createdAt,
      })),
    };
  }
}
