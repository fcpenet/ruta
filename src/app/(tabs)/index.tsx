import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RutaMap } from '@/components/map/ruta-map';
import { PlaceSearch } from '@/components/place-search';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TrafficControl, useTrafficTicker } from '@/components/traffic-control';
import { TripList } from '@/components/trip-list';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { landmarks } from '@/lib/dataSource';
import { placeName } from '@/lib/planner';
import { useAppStore } from '@/store/useAppStore';
import type { LngLat } from '@/types';

const WIDE_BREAKPOINT = 900;

export default function CommuteScreen() {
  useTrafficTicker();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const theme = useTheme();

  const pickTarget = useAppStore((s) => s.pickTarget);
  const setPlace = useAppStore((s) => s.setPlace);
  const setPickTarget = useAppStore((s) => s.setPickTarget);

  const onPick = (coord: LngLat) => {
    const near = placeName(coord, landmarks);
    setPlace(pickTarget, { name: `📍 ${near}`, coord });
    setPickTarget(pickTarget === 'origin' ? 'destination' : 'origin');
  };

  const panel = (
    <ScrollView
      style={wide ? styles.sideScroll : styles.sheetScroll}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled">
      <PlaceSearch />
      <TrafficControl />
      <TripList />
    </ScrollView>
  );

  if (wide) {
    return (
      <ThemedView style={styles.wideRow}>
        <View style={[styles.side, { borderRightColor: theme.border }]}>{panel}</View>
        <View style={styles.fill}>
          <RutaMap onPick={onPick} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <View style={styles.mapHalf}>
        <RutaMap onPick={onPick} />
      </View>
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { borderTopColor: theme.border }]}>
        <ThemedView style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <ThemedText type="smallBold">Ruta — jeep at tricycle planner</ThemedText>
        </ThemedView>
        {panel}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wideRow: { flex: 1, flexDirection: 'row' },
  side: { width: 420, borderRightWidth: 1 },
  sideScroll: { flex: 1 },
  mapHalf: { flex: 1, minHeight: 240 },
  sheet: { flex: 1.2, borderTopWidth: 1, paddingBottom: BottomTabInset },
  sheetScroll: { flex: 1 },
  handleWrap: { alignItems: 'center', gap: Spacing.one, paddingTop: Spacing.two },
  handle: { width: 40, height: 4, borderRadius: 2 },
  panelContent: { padding: Spacing.three, gap: Spacing.three },
});
