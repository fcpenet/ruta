import fares from '@/data/fares.json';
import type { DiscountType, DistanceFare, FareTable, VehicleType } from '@/types';

export const fareTable = fares as FareTable;

/** LTFRB matrices are published in ₱0.25 steps. */
export function roundToQuarter(amount: number): number {
  return Math.round(amount * 4) / 4;
}

export function fareRule(vehicle: VehicleType, city?: string): DistanceFare {
  if (vehicle === 'tricycle') {
    return fareTable.tricycle[city ?? 'default'] ?? fareTable.tricycle.default;
  }
  return fareTable[vehicle];
}

/** Base fare covers `baseKm`; every started km after that adds `perKm`. */
export function computeFare(
  vehicle: VehicleType,
  km: number,
  discount: DiscountType = 'regular',
  city?: string
): number {
  const rule = fareRule(vehicle, city);
  const extraKm = Math.max(0, Math.ceil(km - rule.baseKm - 1e-9));
  const regular = rule.base + extraKm * rule.perKm;
  const rate = discount === 'regular' ? 1 : 1 - fareTable.discountRate;
  return roundToQuarter(regular * rate);
}

export function formatPeso(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}
