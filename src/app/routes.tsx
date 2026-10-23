import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lengthKm } from '@/lib/geo';
import { useAppStore } from '@/store/useAppStore';
import type { LngLat, TransitRoute, VehicleType } from '@/types';

type Filter = 'all' | VehicleType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Lahat' },
  { value: 'jeep', label: 'Jeep' },
  { value: 'modern_jeep', label: 'Modern jeep' },
  { value: 'tricycle', label: 'Tricycle' },
];

const TYPE_LABEL: Record<VehicleType, string> = {
  jeep: 'Jeep',
  modern_jeep: 'Modern jeep',
  tricycle: 'Tricycle',
};

export default function RoutesScreen() {
  const theme = useTheme();
  const dataset = useAppStore((s) => s.dataset);
  const highlightRoute = useAppStore((s) => s.highlightRoute);
  const selectTrip = useAppStore((s) => s.selectTrip);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const routes = dataset.routes.filter(
    (r) =>
      (filter === 'all' || r.properties.type === filter) &&
      (!q ||
        r.properties.name.toLowerCase().includes(q) ||
        r.properties.signboard.toLowerCase().includes(q) ||
        r.properties.loadingPoints.some((p) => p.name.toLowerCase().includes(q)))
  );

  const showOnMap = (r: TransitRoute) => {
    selectTrip(null);
    highlightRoute(r.properties.id);
    router.navigate('/');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Mga ruta</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {dataset.region} · data v{dataset.version}, updated {dataset.updatedAt}
          </ThemedText>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Hanapin: Cubao, Quiapo, UP Ikot…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.search, { borderColor: theme.border, color: theme.text }]}
          />
          <View style={styles.filters}>
            {FILTERS.map((f) => {
              const active = f.value === filter;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => setFilter(f.value)}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.filter,
                    { borderColor: active ? theme.accent : theme.border },
                    active && { backgroundColor: theme.accent },
                  ]}>
                  <ThemedText type="small" style={{ color: active ? theme.accentText : theme.text }}>
                    {f.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <FlatList
          data={routes}
          keyExtractor={(r) => r.properties.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary">
              Walang tugma. Try another name or filter.
            </ThemedText>
          }
          ListFooterComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.attribution}>
              {dataset.attribution}
            </ThemedText>
          }
          renderItem={({ item }) => <RouteCard route={item} onPress={() => showOnMap(item)} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function RouteCard({ route, onPress }: { route: TransitRoute; onPress: () => void }) {
  const theme = useTheme();
  const p = route.properties;
  const km = lengthKm(route.geometry.coordinates as LngLat[]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityHint="Shows this route on the map"
      style={({ pressed }) => [
        styles.card,
        { borderColor: theme.border, borderLeftColor: p.color },
        pressed && styles.pressed,
      ]}>
      <View style={styles.cardTop}>
        <ThemedText type="smallBold" style={styles.cardTitle}>
          {p.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {TYPE_LABEL[p.type]}
        </ThemedText>
      </View>
      <ThemedText type="small">Karatula: “{p.signboard}”</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {p.loadingPoints.map((l) => l.name).join(' → ')}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {km.toFixed(1)} km · {p.direction === 'oneway' ? 'one way' : 'both ways'} · {p.operatingHours} ·
        checked {p.lastVerified}
      </ThemedText>
      <ThemedText type="small" style={{ color: theme.accent }}>
        Ipakita sa mapa →
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safe: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  header: { padding: Spacing.three, gap: Spacing.two },
  search: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  filter: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  card: {
    borderWidth: 1,
    borderLeftWidth: 6,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { flex: 1 },
  pressed: { opacity: 0.7 },
  attribution: { marginTop: Spacing.three },
});
