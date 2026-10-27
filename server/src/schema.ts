import { z } from 'zod';

/** Rough bounding box of the Philippines; rejects routes drawn elsewhere. */
const PH_BOUNDS = { west: 116, south: 4.5, east: 127, north: 21.5 };
const MAX_SEGMENT_KM = 5;
const MAX_ROUTE_KM = 80;
/** Walk links are short connectors (footbridges, alleys, mall walkways), not whole trips. */
export const MAX_WALK_KM = 2;

export const ROUTE_TYPES = ['jeep', 'modern_jeep', 'tricycle', 'walk'] as const;

const lngLat = z
  .tuple([z.number(), z.number()])
  .refine(
    ([lng, lat]) =>
      lng >= PH_BOUNDS.west && lng <= PH_BOUNDS.east && lat >= PH_BOUNDS.south && lat <= PH_BOUNDS.north,
    'Point must be inside the Philippines'
  );

const text = (max: number) => z.string().trim().min(1).max(max);

export const newRouteSchema = z
  .object({
    name: text(80),
    type: z.enum(ROUTE_TYPES),
    /** Required for vehicles; walk links have none. */
    signboard: z.string().trim().max(60).default(''),
    direction: z.enum(['both', 'oneway']),
    operatingHours: z.string().trim().max(60).default(''),
    city: z.string().trim().max(40).optional(),
    // Road-snapped paths are dense: a point every few metres along each street.
    coordinates: z.array(lngLat).min(2).max(5000),
    loadingPoints: z.array(z.object({ name: text(60), coord: lngLat })).max(30).default([]),
  })
  .superRefine((r, ctx) => {
    const walk = r.type === 'walk';
    if (!walk && !r.signboard) {
      ctx.addIssue({ code: 'custom', path: ['signboard'], message: 'Signboard is required' });
    }
    if (walk && r.direction !== 'both') {
      ctx.addIssue({ code: 'custom', path: ['direction'], message: 'Walk links go both ways' });
    }
    let total = 0;
    for (let i = 1; i < r.coordinates.length; i++) {
      const seg = haversineKm(r.coordinates[i - 1], r.coordinates[i]);
      if (seg > MAX_SEGMENT_KM) {
        ctx.addIssue({
          code: 'custom',
          path: ['coordinates', i],
          message: `Points ${i} and ${i + 1} are more than ${MAX_SEGMENT_KM} km apart`,
        });
        return;
      }
      total += seg;
    }
    const max = walk ? MAX_WALK_KM : MAX_ROUTE_KM;
    if (total > max) {
      ctx.addIssue({
        code: 'custom',
        path: ['coordinates'],
        message: walk ? `Walk link is longer than ${max} km` : `Route is longer than ${max} km`,
      });
    }
  });

export type NewRoute = z.infer<typeof newRouteSchema>;

export const routeIdSchema = z.uuid();

/** GET /directions?mode=driving&points=lng,lat;lng,lat;… */
export const directionsQuerySchema = z.object({
  mode: z.enum(['driving', 'walking']),
  points: z
    .string()
    .transform((s) => s.split(';').map((p) => p.split(',').map(Number)))
    .pipe(z.array(lngLat).min(2).max(100)),
});

/** A route's own fare: one amount for any distance, or a base for the first km then per km. */
export const fareSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('flat'), amount: z.number().positive().max(1000) }),
  z.object({
    kind: z.literal('distance'),
    base: z.number().positive().max(1000),
    baseKm: z.number().min(0).max(50),
    perKm: z.number().min(0).max(200),
  }),
]);
export type Fare = z.infer<typeof fareSchema>;

export const REPORT_REASONS = ['wrong_path', 'not_running', 'spam'] as const;
export const reportSchema = z.object({ reason: z.enum(REPORT_REASONS) });
export type ReportReason = (typeof REPORT_REASONS)[number];

export function haversineKm([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
