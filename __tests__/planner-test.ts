import { getBundledRoutes, landmarks } from '@/lib/dataSource';
import { planTrips } from '@/lib/planner';
import type { LngLat, RideLeg, RouteType, TransitRoute, WalkLeg } from '@/types';

const routes = getBundledRoutes().routes;
const at = new Date('2026-10-21T04:00:00Z'); // Wed noon, Manila
const coord = (id: string) => landmarks.find((l) => l.id === id)!.coord;
const rides = (legs: { kind: string }[]) => legs.filter((l): l is RideLeg => l.kind === 'ride');

describe('planTrips', () => {
  it('finds a direct jeep from Cubao to Quiapo with board/alight points and fare', () => {
    const trips = planTrips(coord('cubao'), coord('quiapo'), { routes, landmarks, at });
    const direct = trips.find((t) => t.id === 'jeep-cubao-quiapo-aurora');
    expect(direct).toBeDefined();
    const [ride] = rides(direct!.legs);
    expect(ride.signboard).toBe('CUBAO – QUIAPO');
    expect(ride.km).toBeGreaterThan(7);
    expect(ride.alightName).toEqual({ name: 'Quiapo Church', near: false });
    expect(direct!.totalFare).toBeGreaterThan(13);
    expect(direct!.transfers).toBe(0);
  });

  it('plans a one-transfer trip from Cubao to UP via Philcoa and the Ikot loop', () => {
    const trips = planTrips(coord('cubao'), coord('up-as'), { routes, landmarks, at });
    const transfer = trips.find((t) => t.id === 'jeep-cubao-philcoa-eastave>jeep-up-ikot');
    expect(transfer).toBeDefined();
    expect(transfer!.transfers).toBe(1);
    const [first] = rides(transfer!.legs);
    expect(first.alightName?.name).toMatch(/Philcoa/);
  });

  it('does not suggest riding a one-way route backwards', () => {
    const line: LngLat[] = [
      [121.0, 14.6],
      [121.01, 14.6],
      [121.02, 14.6],
    ];
    const oneway: TransitRoute = {
      type: 'Feature',
      properties: {
        id: 'test-oneway',
        name: 'Test',
        type: 'jeep',
        signboard: 'TEST',
        direction: 'oneway',
        operatingHours: '',
        loadingPoints: [],
        color: '#000',
        lastVerified: '2026-01-01',
      },
      geometry: { type: 'LineString', coordinates: line },
    };
    const forward = planTrips(line[0], line[2], { routes: [oneway], landmarks, at });
    const backward = planTrips(line[2], line[0], { routes: [oneway], landmarks, at });
    expect(forward.map((t) => t.id)).toContain('test-oneway');
    expect(backward.map((t) => t.id)).not.toContain('test-oneway');
  });

  it('rides around a one-way loop when the stop is "behind" the boarding point', () => {
    const engg = coord('up-engg');
    const palma = coord('up-as');
    const trips = planTrips(engg, palma, { routes, landmarks, at });
    const ikot = trips.find((t) => t.id === 'jeep-up-ikot');
    expect(ikot).toBeDefined();
    expect(rides(ikot!.legs)[0].km).toBeGreaterThan(1.5);
  });

  it('marks unverified community rides and prefers an equivalent official route', () => {
    const official = routes.find((r) => r.properties.id === 'jeep-cubao-quiapo-aurora')!;
    const community: TransitRoute = {
      ...official,
      properties: {
        ...official.properties,
        id: 'community-copy',
        source: 'community',
        status: 'unverified',
        confirmations: 0,
      },
    };
    const trips = planTrips(coord('cubao'), coord('quiapo'), {
      routes: [official, community],
      landmarks,
      at,
    });
    expect(trips.map((t) => t.id)).toEqual(['jeep-cubao-quiapo-aurora', 'community-copy']);
    expect(rides(trips[1].legs)[0].unverified).toBe(true);
    expect(rides(trips[0].legs)[0].unverified).toBe(false);
  });

  it('skips disputed community routes', () => {
    const official = routes.find((r) => r.properties.id === 'jeep-cubao-quiapo-aurora')!;
    const disputed: TransitRoute = {
      ...official,
      properties: { ...official.properties, id: 'community-bad', source: 'community', status: 'disputed' },
    };
    const trips = planTrips(coord('cubao'), coord('quiapo'), { routes: [official, disputed], landmarks, at });
    expect(trips.map((t) => t.id)).toEqual(['jeep-cubao-quiapo-aurora']);
  });

  it('returns nothing when no route is within walking distance', () => {
    const cebu: LngLat = [123.8854, 10.3157];
    const lapu: LngLat = [123.9494, 10.3103];
    expect(planTrips(cebu, lapu, { routes, landmarks, at })).toEqual([]);
  });

  describe('walk links', () => {
    // Two jeeps ~550 m apart (too far for a normal transfer), in an area with no bundled routes.
    const make = (id: string, type: RouteType, coordinates: LngLat[]): TransitRoute => ({
      type: 'Feature',
      properties: {
        id,
        name: id,
        type,
        signboard: type === 'walk' ? '' : id.toUpperCase(),
        direction: 'both',
        operatingHours: '',
        loadingPoints: [],
        color: '#00798C',
        lastVerified: '2026-10-26',
        source: 'community',
        status: 'verified',
      },
      geometry: { type: 'LineString', coordinates },
    });
    const jeepA = make('jeep-a', 'jeep', [
      [121.06, 14.57],
      [121.08, 14.57],
    ]);
    const jeepB = make('jeep-b', 'jeep', [
      [121.08, 14.575],
      [121.1, 14.575],
    ]);
    const origin: LngLat = [121.061, 14.5702];
    const destination: LngLat = [121.099, 14.5748];
    const plan = (extra: TransitRoute[]) =>
      planTrips(origin, destination, { routes: [jeepA, jeepB, ...extra], landmarks: [], at });

    it('finds nothing when the routes are too far apart to transfer', () => {
      expect(plan([])).toEqual([]);
    });

    it('connects two jeeps through a walk link and walks its drawn path', () => {
      const link = make('footbridge', 'walk', [
        [121.0799, 14.5701],
        [121.0805, 14.5725],
        [121.0799, 14.5749],
      ]);
      const [trip] = plan([link]);
      expect(trip.id).toBe('jeep-a>footbridge>jeep-b');
      expect(trip.transfers).toBe(1);
      expect(trip.totalFare).toBeGreaterThan(0);
      const linkLeg = trip.legs.find((l): l is WalkLeg => l.kind === 'walk' && !!l.link)!;
      expect(linkLeg.link!.name).toBe('footbridge');
      expect(linkLeg.link!.path.length).toBeGreaterThanOrEqual(3);
      expect(linkLeg.meters).toBeGreaterThan(500);
    });

    it('chains several walk links', () => {
      const first = make('stairs', 'walk', [
        [121.0799, 14.5701],
        [121.0799, 14.5725],
      ]);
      const second = make('alley', 'walk', [
        [121.08, 14.5726],
        [121.0799, 14.5749],
      ]);
      const [trip] = plan([first, second]);
      expect(trip.id).toBe('jeep-a>stairs>alley>jeep-b');
      expect(rides(trip.legs).map((r) => r.routeId)).toEqual(['jeep-a', 'jeep-b']);
    });

    it('ignores disputed walk links', () => {
      const link = make('footbridge', 'walk', [
        [121.0799, 14.5701],
        [121.0799, 14.5749],
      ]);
      link.properties.status = 'disputed';
      expect(plan([link])).toEqual([]);
    });
  });
});
