import { Pressable, StyleSheet, View } from 'react-native';

import { RichText } from '@/components/rich-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { formatPeso } from '@/lib/fare';
import { TRAFFIC_COLORS } from '@/lib/traffic';
import { useAppStore } from '@/store/useAppStore';
import type { Leg, RideLeg, Trip } from '@/types';

function meters(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
}

export function TripList() {
  const theme = useTheme();
  const t = useT();
  const trips = useAppStore((s) => s.trips);
  const origin = useAppStore((s) => s.origin);
  const destination = useAppStore((s) => s.destination);
  const selectedTripId = useAppStore((s) => s.selectedTripId);
  const selectTrip = useAppStore((s) => s.selectTrip);

  if (!origin || !destination) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t.trip.prompt}
      </ThemedText>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="smallBold">{t.trip.noneTitle}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t.trip.noneBody}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {trips.map((trip) => {
        const selected = trip.id === selectedTripId;
        return (
          <Pressable
            key={trip.id}
            onPress={() => selectTrip(trip.id)}
            accessibilityState={{ selected }}
            style={[
              styles.card,
              { borderColor: selected ? theme.accent : theme.border },
              selected && { borderWidth: 2 },
            ]}>
            <TripSummary trip={trip} />
            {selected && <TripSteps trip={trip} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function TripSummary({ trip }: { trip: Trip }) {
  const t = useT();
  const rides = trip.legs.filter((l): l is RideLeg => l.kind === 'ride');
  return (
    <View style={styles.summary}>
      <View style={styles.chips}>
        {rides.length === 0 && <Chip color="#57606A" label={t.trip.walkOnly} />}
        {rides.map((r, i) => (
          <View key={r.routeId + i} style={styles.chipRow}>
            {i > 0 && <ThemedText type="small">›</ThemedText>}
            <Chip color={r.color} label={r.unverified ? `⚠ ${r.signboard}` : r.signboard} />
          </View>
        ))}
      </View>
      <View style={styles.summaryRight}>
        <ThemedText type="smallBold">{t.common.duration(trip.totalMinutes)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatPeso(trip.totalFare)}
          {trip.transfers > 0 ? ` · ${t.trip.transfers(trip.transfers)}` : ''}
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
  const t = useT();
  if (leg.kind === 'walk') {
    return (
      <View style={styles.step}>
        <ThemedText style={styles.stepIcon}>🚶</ThemedText>
        <View style={styles.stepBody}>
          <RichText type="small" parts={t.trip.walk(meters(leg.meters), leg.toName, leg.link?.name)} />
          {leg.link?.unverified && (
            <ThemedText type="small" style={styles.unverified}>
              {t.trip.unverifiedWalk}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            ~{t.common.duration(leg.minutes)}
          </ThemedText>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.step}>
      <ThemedText style={styles.stepIcon}>{leg.vehicle === 'tricycle' ? '🛺' : '🚙'}</ThemedText>
      <View style={[styles.stepBody, { borderLeftColor: leg.color }, styles.rideBody]}>
        <RichText type="small" parts={t.trip.board(leg.vehicle, leg.boardName)} />
        <ThemedText type="small" themeColor="textSecondary">
          {t.trip.signboard(leg.signboard)}
        </ThemedText>
        {leg.unverified && (
          <ThemedText type="small" style={styles.unverified}>
            {t.trip.unverifiedRide}
          </ThemedText>
        )}
        <RichText type="small" parts={t.trip.alight(leg.alightName)} />
        <View style={styles.rideMeta}>
          <ThemedText type="small" themeColor="textSecondary">
            {leg.km.toFixed(1)} km · ~{t.common.duration(leg.minutes)} · {formatPeso(leg.fare)}
          </ThemedText>
          <View style={[styles.trafficDot, { backgroundColor: TRAFFIC_COLORS[leg.trafficLevel] }]} />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {t.traffic.onRide[leg.trafficLevel]}
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
