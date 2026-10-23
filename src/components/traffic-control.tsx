import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TRAFFIC_COLORS } from '@/lib/traffic';
import { useAppStore } from '@/store/useAppStore';
import type { TrafficLevel } from '@/types';

const REFRESH_MS = 30_000;

const HOURS: { hour: number | null; label: string }[] = [
  { hour: null, label: 'Live' },
  { hour: 2, label: '2 AM' },
  { hour: 8, label: '8 AM' },
  { hour: 12, label: '12 NN' },
  { hour: 18, label: '6 PM' },
  { hour: 21, label: '9 PM' },
];

const LEGEND: { level: TrafficLevel; label: string }[] = [
  { level: 'free', label: 'Maluwag' },
  { level: 'moderate', label: 'Katamtaman' },
  { level: 'heavy', label: 'Traffic' },
  { level: 'standstill', label: 'Hinto' },
];

/** Re-reads (dummy) live traffic every 30 s while mounted. */
export function useTrafficTicker() {
  const tick = useAppStore((s) => s.tickTraffic);
  useEffect(() => {
    const id = setInterval(tick, REFRESH_MS);
    return () => clearInterval(id);
  }, [tick]);
}

export function TrafficControl() {
  const theme = useTheme();
  const simulatedHour = useAppStore((s) => s.simulatedHour);
  const setSimulatedHour = useAppStore((s) => s.setSimulatedHour);

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        {LEGEND.map((l) => (
          <View key={l.level} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: TRAFFIC_COLORS[l.level] }]} />
            <ThemedText type="small" themeColor="textSecondary">
              {l.label}
            </ThemedText>
          </View>
        ))}
        <ThemedText type="small" themeColor="textSecondary" style={styles.demo}>
          (demo data)
        </ThemedText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}>
        <ThemedText type="small" themeColor="textSecondary">
          Traffic at:
        </ThemedText>
        {HOURS.map((h) => {
          const active = h.hour === simulatedHour;
          return (
            <Pressable
              key={h.label}
              onPress={() => setSimulatedHour(h.hour)}
              accessibilityState={{ selected: active }}
              style={[
                styles.hour,
                { borderColor: active ? theme.accent : theme.border },
                active && { backgroundColor: theme.accent },
              ]}>
              <ThemedText
                type="small"
                style={{ color: active ? theme.accentText : theme.text }}>
                {h.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  swatch: { width: 14, height: 4, borderRadius: 2 },
  demo: { fontStyle: 'italic' },
  hours: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  hour: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
