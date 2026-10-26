import type { NewCommunityRoute, ReportReason, TransitRoute } from '@/types';

import { request } from './api';

/** Community routes endpoints. Submitting, confirming and reporting need a logged-in user. */

export async function fetchCommunityRoutes(): Promise<TransitRoute[]> {
  const { routes } = await request<{ routes: TransitRoute[] }>('/routes');
  return routes;
}

export async function submitRoute(route: NewCommunityRoute): Promise<TransitRoute> {
  const { route: created } = await request<{ route: TransitRoute }>('/routes', {
    method: 'POST',
    body: JSON.stringify(route),
  });
  return created;
}

export async function confirmRoute(id: string): Promise<TransitRoute> {
  const { route } = await request<{ route: TransitRoute }>(`/routes/${id}/confirm`, { method: 'POST' });
  return route;
}

export async function reportRoute(id: string, reason: ReportReason): Promise<TransitRoute> {
  const { route } = await request<{ route: TransitRoute }>(`/routes/${id}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return route;
}
