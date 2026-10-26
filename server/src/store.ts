import { randomUUID } from 'node:crypto';

import type { NewRoute, ReportReason } from './schema.ts';

export interface StoredRoute extends NewRoute {
  id: string;
  color: string;
  authorId: string;
  /** Author's username. */
  author: string;
  createdAt: string;
  confirmations: number;
  reports: number;
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

  /** Returns null when the username is taken. */
  createUser(username: string, passwordHash: string): Promise<User | null>;
  findUserByUsername(username: string): Promise<User | null>;
  createSession(tokenHash: string, userId: string, expiresAt: string): Promise<void>;
  findSession(tokenHash: string): Promise<{ user: PublicUser; expiresAt: string } | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

export class MemoryStore implements RouteStore {
  private routes = new Map<string, Omit<StoredRoute, 'confirmations' | 'reports' | 'author'>>();
  private confirmations = new Map<string, Set<string>>();
  private reports = new Map<string, Map<string, ReportReason>>();
  private users = new Map<string, User>();
  private sessions = new Map<string, { userId: string; expiresAt: string }>();

  async list() {
    return [...this.routes.values()].reverse().map((r) => this.withCounts(r));
  }

  async create(route: NewStoredRoute) {
    const stored = { ...route, id: randomUUID(), createdAt: new Date().toISOString() };
    this.routes.set(stored.id, stored);
    this.confirmations.set(stored.id, new Set());
    this.reports.set(stored.id, new Map());
    return this.withCounts(stored);
  }

  async confirm(routeId: string, userId: string) {
    const route = this.routes.get(routeId);
    if (!route) return { result: 'not_found' as const };
    if (route.authorId === userId) return { result: 'own_route' as const };
    this.reports.get(routeId)!.delete(userId);
    this.confirmations.get(routeId)!.add(userId);
    return { result: 'ok' as const, route: this.withCounts(route) };
  }

  async report(routeId: string, userId: string, reason: ReportReason) {
    const route = this.routes.get(routeId);
    if (!route) return { result: 'not_found' as const };
    this.confirmations.get(routeId)!.delete(userId);
    this.reports.get(routeId)!.set(userId, reason);
    return { result: 'ok' as const, route: this.withCounts(route) };
  }

  async createUser(username: string, passwordHash: string) {
    if (await this.findUserByUsername(username)) return null;
    const user = { id: randomUUID(), username, passwordHash, createdAt: new Date().toISOString() };
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

  private withCounts(r: Omit<StoredRoute, 'confirmations' | 'reports' | 'author'>): StoredRoute {
    return {
      ...r,
      author: this.users.get(r.authorId)?.username ?? 'unknown',
      confirmations: this.confirmations.get(r.id)?.size ?? 0,
      reports: this.reports.get(r.id)?.size ?? 0,
    };
  }
}
