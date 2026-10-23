import { getBundledRoutes, landmarks } from '@/lib/dataSource';
import { planTrips } from '@/lib/planner';
import type { LngLat, RideLeg, TransitRoute } from '@/types';

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
    expect(ride.alightName).toBe('Quiapo Church');
    expect(direct!.totalFare).toBeGreaterThan(13);
    expect(direct!.transfers).toBe(0);
  });

  it('plans a one-transfer trip from Cubao to UP via Philcoa and the Ikot loop', () => {
    const trips = planTrips(coord('cubao'), coord('up-as'), { routes, landmarks, at });
    const transfer = trips.find((t) => t.id === 'jeep-cubao-philcoa-eastave>jeep-up-ikot');
    expect(transfer).toBeDefined();
    expect(transfer!.transfers).toBe(1);
    const [first] = rides(transfer!.legs);
    expect(first.alightName).toMatch(/Philcoa/);
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

  it('returns nothing when no route is within walking distance', () => {
    const cebu: LngLat = [123.8854, 10.3157];
    const lapu: LngLat = [123.9494, 10.3103];
    expect(planTrips(cebu, lapu, { routes, landmarks, at })).toEqual([]);
  });
});
