import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { TRAFFIC_COLORS } from '@/lib/traffic';
import { useAppStore } from '@/store/useAppStore';
import type { TrafficLevel } from '@/types';

const REFRESH_MS = 30_000;

/** Hours to simulate traffic at; null is live. */
const HOURS: (number | null)[] = [null, 2, 8, 12, 18, 21];

const LEVELS: TrafficLevel[] = ['free', 'moderate', 'heavy', 'standstill'];

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
  const t = useT();
  const hourLabel = (h: number | null) =>
    h === null ? t.traffic.live : h === 12 ? t.traffic.noon : `${h % 12} ${h < 12 ? 'AM' : 'PM'}`;
  const simulatedHour = useAppStore((s) => s.simulatedHour);
  const setSimulatedHour = useAppStore((s) => s.setSimulatedHour);

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        {LEVELS.map((level) => (
          <View key={level} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: TRAFFIC_COLORS[level] }]} />
            <ThemedText type="small" themeColor="textSecondary">
              {t.traffic.levels[level]}
            </ThemedText>
          </View>
        ))}
        <ThemedText type="small" themeColor="textSecondary" style={styles.demo}>
          {t.traffic.demo}
        </ThemedText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}>
        <ThemedText type="small" themeColor="textSecondary">
          {t.traffic.at}
        </ThemedText>
        {HOURS.map((hour) => {
          const active = hour === simulatedHour;
          return (
            <Pressable
              key={hour ?? 'live'}
              onPress={() => setSimulatedHour(hour)}
              accessibilityState={{ selected: active }}
              style={[
                styles.hour,
                { borderColor: active ? theme.accent : theme.border },
                active && { backgroundColor: theme.accent },
              ]}>
              <ThemedText
                type="small"
                style={{ color: active ? theme.accentText : theme.text }}>
                {hourLabel(hour)}
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
