import { randomUUID } from 'node:crypto';

import type { NewRoute } from './schema.ts';

export interface StoredRoute extends NewRoute {
  id: string;
  color: string;
  authorDevice: string;
  createdAt: string;
  confirmations: number;
}

export type ConfirmResult = 'ok' | 'not_found' | 'own_route';

/** Persistence boundary: Postgres in production, in-memory for tests and local dev. */
export interface RouteStore {
  list(): Promise<StoredRoute[]>;
  create(route: NewRoute & { color: string; authorDevice: string }): Promise<StoredRoute>;
  /** Idempotent per device: confirming twice counts once. */
  confirm(routeId: string, deviceId: string): Promise<{ result: ConfirmResult; route?: StoredRoute }>;
}

export class MemoryStore implements RouteStore {
  private routes = new Map<string, Omit<StoredRoute, 'confirmations'>>();
  private confirmations = new Map<string, Set<string>>();

  async list() {
    return [...this.routes.values()].map((r) => this.withCount(r));
  }

  async create(route: NewRoute & { color: string; authorDevice: string }) {
    const stored = { ...route, id: randomUUID(), createdAt: new Date().toISOString() };
    this.routes.set(stored.id, stored);
    this.confirmations.set(stored.id, new Set());
    return this.withCount(stored);
  }

  async confirm(routeId: string, deviceId: string) {
    const route = this.routes.get(routeId);
    if (!route) return { result: 'not_found' as const };
    if (route.authorDevice === deviceId) return { result: 'own_route' as const };
    this.confirmations.get(routeId)!.add(deviceId);
    return { result: 'ok' as const, route: this.withCount(route) };
  }

  private withCount(r: Omit<StoredRoute, 'confirmations'>): StoredRoute {
    return { ...r, confirmations: this.confirmations.get(r.id)?.size ?? 0 };
  }
}
