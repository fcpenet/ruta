import fares from '@/data/fares.json';
import type { DiscountType, DistanceFare, FareRule, FareTable, VehicleType } from '@/types';

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

/**
 * Base fare covers `baseKm`; every started km after that adds `perKm`. A route's own fare
 * (`routeFare`, agreed by commuters) replaces the standard table.
 */
export function computeFare(
  vehicle: VehicleType,
  km: number,
  discount: DiscountType = 'regular',
  city?: string,
  routeFare?: FareRule
): number {
  let regular: number;
  if (routeFare?.kind === 'flat') {
    regular = routeFare.amount;
  } else {
    const rule = routeFare ?? fareRule(vehicle, city);
    const extraKm = Math.max(0, Math.ceil(km - rule.baseKm - 1e-9));
    regular = rule.base + extraKm * rule.perKm;
  }
  const rate = discount === 'regular' ? 1 : 1 - fareTable.discountRate;
  return roundToQuarter(regular * rate);
}

export function formatPeso(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}
