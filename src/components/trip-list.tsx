import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPeso } from '@/lib/fare';
import { TRAFFIC_COLORS } from '@/lib/traffic';
import { useAppStore } from '@/store/useAppStore';
import type { Leg, RideLeg, Trip, VehicleType } from '@/types';

const VEHICLE_LABEL: Record<VehicleType, string> = {
  jeep: 'jeep',
  modern_jeep: 'modern jeep',
  tricycle: 'tricycle',
};

const TRAFFIC_LABEL = {
  free: 'maluwag',
  moderate: 'medyo traffic',
  heavy: 'traffic',
  standstill: 'sobrang traffic',
} as const;

function minutes(m: number) {
  const r = Math.max(1, Math.round(m));
  return r >= 60 ? `${Math.floor(r / 60)} h ${r % 60} min` : `${r} min`;
}

function meters(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
}

export function TripList() {
  const theme = useTheme();
  const trips = useAppStore((s) => s.trips);
  const origin = useAppStore((s) => s.origin);
  const destination = useAppStore((s) => s.destination);
  const selectedTripId = useAppStore((s) => s.selectedTripId);
  const selectTrip = useAppStore((s) => s.selectTrip);

  if (!origin || !destination) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Set where you’re coming from and where you’re going to see which jeep or tricycle to take.
      </ThemedText>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="smallBold">Walang nakitang ruta.</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          No route in our data passes within walking distance of both points with at most one
          transfer. Try a nearby landmark, or check the Routes tab for what’s covered so far.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {trips.map((t) => {
        const selected = t.id === selectedTripId;
        return (
          <Pressable
            key={t.id}
            onPress={() => selectTrip(t.id)}
            accessibilityState={{ selected }}
            style={[
              styles.card,
              { borderColor: selected ? theme.accent : theme.border },
              selected && { borderWidth: 2 },
            ]}>
            <TripSummary trip={t} />
            {selected && <TripSteps trip={t} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function TripSummary({ trip }: { trip: Trip }) {
  const rides = trip.legs.filter((l): l is RideLeg => l.kind === 'ride');
  return (
    <View style={styles.summary}>
      <View style={styles.chips}>
        {rides.length === 0 && <Chip color="#57606A" label="Lakad lang" />}
        {rides.map((r, i) => (
          <View key={r.routeId + i} style={styles.chipRow}>
            {i > 0 && <ThemedText type="small">›</ThemedText>}
            <Chip color={r.color} label={r.unverified ? `⚠ ${r.signboard}` : r.signboard} />
          </View>
        ))}
      </View>
      <View style={styles.summaryRight}>
        <ThemedText type="smallBold">{minutes(trip.totalMinutes)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatPeso(trip.totalFare)}
          {trip.transfers > 0 ? ` · ${trip.transfers} lipat` : ''}
        </ThemedText>
      </View>
    </View>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      <ThemedText type="smallBold" style={styles.chipText} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

export function TripSteps({ trip }: { trip: Trip }) {
  return (
    <View style={styles.steps}>
      {trip.legs.map((leg, i) => (
        <Step key={i} leg={leg} />
      ))}
    </View>
  );
}

function Step({ leg }: { leg: Leg }) {
  const theme = useTheme();
  if (leg.kind === 'walk') {
    return (
      <View style={styles.step}>
        <ThemedText style={styles.stepIcon}>🚶</ThemedText>
        <View style={styles.stepBody}>
          <ThemedText type="small">
            Maglakad {meters(leg.meters)} papunta sa {leg.toName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ~{minutes(leg.minutes)}
          </ThemedText>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.step}>
      <ThemedText style={styles.stepIcon}>{leg.vehicle === 'tricycle' ? '🛺' : '🚙'}</ThemedText>
      <View style={[styles.stepBody, { borderLeftColor: leg.color }, styles.rideBody]}>
        <ThemedText type="small">
          Sumakay ng {VEHICLE_LABEL[leg.vehicle]} sa <ThemedText type="smallBold">{leg.boardName}</ThemedText>
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Hanapin ang karatula: “{leg.signboard}”
        </ThemedText>
        {leg.unverified && (
          <ThemedText type="small" style={styles.unverified}>
            ⚠ Added by a commuter, not yet confirmed — double-check with the barker or driver.
          </ThemedText>
        )}
        <ThemedText type="small">
          Bumaba sa <ThemedText type="smallBold">{leg.alightName}</ThemedText> — “Para po!”
        </ThemedText>
        <View style={styles.rideMeta}>
          <ThemedText type="small" themeColor="textSecondary">
            {leg.km.toFixed(1)} km · ~{minutes(leg.minutes)} · {formatPeso(leg.fare)}
          </ThemedText>
          <View style={[styles.trafficDot, { backgroundColor: TRAFFIC_COLORS[leg.trafficLevel] }]} />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {TRAFFIC_LABEL[leg.trafficLevel]}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  empty: { gap: Spacing.one },
  card: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chip: { borderRadius: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  chipText: { color: '#ffffff', fontSize: 12 },
  summaryRight: { alignItems: 'flex-end' },
  steps: { gap: Spacing.three },
  step: { flexDirection: 'row', gap: Spacing.two },
  stepIcon: { width: 24, textAlign: 'center' },
  stepBody: { flex: 1, gap: Spacing.half },
  rideBody: { borderLeftWidth: 3, paddingLeft: Spacing.two },
  rideMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  unverified: { color: '#9A6700' },
  trafficDot: { width: 8, height: 8, borderRadius: 4, marginLeft: Spacing.one },
});
