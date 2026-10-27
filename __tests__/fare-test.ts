import { computeFare, roundToQuarter } from '@/lib/fare';

describe('computeFare', () => {
  it('charges the base fare up to the first 4 km', () => {
    expect(computeFare('jeep', 1)).toBe(13);
    expect(computeFare('jeep', 4)).toBe(13);
  });

  it('adds the per-km rate for every started km after the base', () => {
    expect(computeFare('jeep', 4.2)).toBe(roundToQuarter(13 + 1.8));
    expect(computeFare('jeep', 10)).toBe(roundToQuarter(13 + 6 * 1.8));
  });

  it('applies the 20% student/senior/PWD discount', () => {
    expect(computeFare('jeep', 4, 'student')).toBe(roundToQuarter(13 * 0.8));
    expect(computeFare('modern_jeep', 4, 'senior')).toBe(12);
  });

  it('uses the city tricycle table and falls back to default', () => {
    expect(computeFare('tricycle', 1, 'regular', 'quezon_city')).toBe(15);
    expect(computeFare('tricycle', 2.5, 'regular', 'nowhere')).toBe(15 + 2 * 5);
  });

  it('uses a route’s own fare when commuters agreed on one', () => {
    expect(computeFare('tricycle', 3, 'regular', undefined, { kind: 'flat', amount: 25 })).toBe(25);
    expect(computeFare('tricycle', 9, 'student', undefined, { kind: 'flat', amount: 25 })).toBe(20);
    const rule = { kind: 'distance' as const, base: 15, baseKm: 4, perKm: 2.5 };
    expect(computeFare('jeep', 4, 'regular', undefined, rule)).toBe(15);
    expect(computeFare('jeep', 6.2, 'regular', undefined, rule)).toBe(22.5);
  });
});
