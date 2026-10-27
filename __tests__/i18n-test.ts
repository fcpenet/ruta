import { en } from '@/i18n/en';
import { fil } from '@/i18n/fil';

/** Every leaf as [path, value], so the two languages can be compared entry by entry. */
function leaves(obj: object, prefix = ''): [string, unknown][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
  );
}

describe('translations', () => {
  it('has the same entries in English and Filipino, none empty', () => {
    const enLeaves = leaves(en);
    const filLeaves = new Map(leaves(fil));
    expect([...filLeaves.keys()].sort()).toEqual(enLeaves.map(([k]) => k).sort());
    for (const [key, value] of enLeaves) {
      const other = filLeaves.get(key);
      expect([key, typeof other]).toEqual([key, typeof value]);
      if (typeof other === 'string') expect([key, other.trim().length > 0]).toEqual([key, true]);
    }
  });

  it('words places with the right preposition for each language', () => {
    const quiapo = { name: 'Quiapo Church', near: false };
    const gilmore = { name: 'Gilmore', near: true };
    expect(en.place.at(quiapo)).toBe('at Quiapo Church');
    expect(en.place.at(gilmore)).toBe('near Gilmore');
    expect(fil.place.at(quiapo)).toBe('sa Quiapo Church');
    expect(fil.place.at(gilmore)).toBe('malapit sa Gilmore');
    expect(fil.place.to(null)).toBe('papunta sa naka-pin na lugar');
  });

  it('builds trip steps with the place name in bold', () => {
    const cubao = { name: 'Cubao', near: false };
    expect(en.trip.board('jeep', cubao)).toEqual(['Get on the jeep ', { b: 'at Cubao' }]);
    expect(fil.trip.board('jeep', cubao)).toEqual(['Sumakay ng jeep ', { b: 'sa Cubao' }]);
    expect(fil.trip.walk('250 m', cubao, 'Footbridge')).toEqual([
      'Maglakad nang 250 m',
      ' sa ',
      { b: 'Footbridge' },
      ' papunta sa Cubao',
    ]);
  });

  it('formats durations and counts', () => {
    expect(en.common.duration(75)).toBe('1 h 15 min');
    expect(fil.common.duration(75)).toBe('1 oras 15 min');
    expect(en.trip.transfers(1)).toBe('1 transfer');
    expect(en.trip.transfers(2)).toBe('2 transfers');
  });
});
