import { getAllTraffic, getTraffic, manilaHour } from '@/lib/traffic';

// Wednesday 2026-10-21, expressed in UTC (Manila is UTC+8).
const WED_8AM_MNL = new Date('2026-10-21T00:00:00Z');
const WED_2AM_MNL = new Date('2026-10-20T18:00:00Z');
const SAT_8AM_MNL = new Date('2026-10-24T00:00:00Z');

describe('dummy traffic', () => {
  it('reads Manila local time regardless of device timezone', () => {
    expect(manilaHour(WED_8AM_MNL)).toEqual({ hour: 8, weekend: false });
    expect(manilaHour(SAT_8AM_MNL).weekend).toBe(true);
  });

  it('is deterministic for the same segment and time', () => {
    expect(getTraffic('espana', WED_8AM_MNL)).toEqual(getTraffic('espana', WED_8AM_MNL));
  });

  it('is heavier at weekday rush hour than at 2 AM', () => {
    const avg = (d: Date) => {
      const all = getAllTraffic(d);
      return all.reduce((s, r) => s + r.multiplier, 0) / all.length;
    };
    expect(avg(WED_8AM_MNL)).toBeGreaterThan(avg(WED_2AM_MNL) + 0.5);
    expect(getTraffic('edsa-cubao', WED_2AM_MNL).level).toBe('free');
    expect(['heavy', 'standstill']).toContain(getTraffic('edsa-cubao', WED_8AM_MNL).level);
  });

  it('is lighter on weekends', () => {
    expect(getTraffic('edsa-cubao', SAT_8AM_MNL).multiplier).toBeLessThan(
      getTraffic('edsa-cubao', WED_8AM_MNL).multiplier
    );
  });
});
