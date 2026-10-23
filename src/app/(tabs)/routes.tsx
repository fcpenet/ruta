import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CommunityApiError } from '@/lib/community';
import { lengthKm } from '@/lib/geo';
import { useAllRoutes, useAppStore } from '@/store/useAppStore';
import type { LngLat, TransitRoute, VehicleType } from '@/types';

type Filter = 'all' | 'community' | VehicleType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Lahat' },
  { value: 'jeep', label: 'Jeep' },
  { value: 'modern_jeep', label: 'Modern jeep' },
  { value: 'tricycle', label: 'Tricycle' },
  { value: 'community', label: 'Community' },
];

const TYPE_LABEL: Record<VehicleType, string> = {
  jeep: 'Jeep',
  modern_jeep: 'Modern jeep',
  tricycle: 'Tricycle',
};

export default function RoutesScreen() {
  const theme = useTheme();
  const dataset = useAppStore((s) => s.dataset);
  const allRoutes = useAllRoutes();
  const communityStatus = useAppStore((s) => s.communityStatus);
  const loadCommunityRoutes = useAppStore((s) => s.loadCommunityRoutes);
  const highlightRoute = useAppStore((s) => s.highlightRoute);
  const selectTrip = useAppStore((s) => s.selectTrip);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const routes = allRoutes.filter(
    (r) =>
      (filter === 'all' ||
        (filter === 'community' ? r.properties.source === 'community' : r.properties.type === filter)) &&
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
          <View style={styles.titleRow}>
            <ThemedText type="subtitle" style={styles.title}>
              Mga ruta
            </ThemedText>
            {communityStatus !== 'disabled' && (
              <Pressable
                onPress={() => router.push('/add-route')}
                accessibilityRole="button"
                style={[styles.addButton, { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                  + Add route
                </ThemedText>
              </Pressable>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {dataset.region} · data v{dataset.version}, updated {dataset.updatedAt}
          </ThemedText>
          {communityStatus === 'loading' && <ActivityIndicator style={styles.status} />}
          {communityStatus === 'error' && (
            <Pressable onPress={loadCommunityRoutes}>
              <ThemedText type="small" style={styles.errorText}>
                Couldn’t load community routes. Tap to retry.
              </ThemedText>
            </Pressable>
          )}
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
  const community = p.source === 'community';
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
      {community && <CommunityBadge route={route} />}
      <ThemedText type="small">Karatula: “{p.signboard}”</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {p.loadingPoints.map((l) => l.name).join(' → ')}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {[
          `${km.toFixed(1)} km`,
          p.direction === 'oneway' ? 'one way' : 'both ways',
          p.operatingHours,
          community ? `added ${p.lastVerified}` : `checked ${p.lastVerified}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </ThemedText>
      <ThemedText type="small" style={{ color: theme.accent }}>
        Ipakita sa mapa →
      </ThemedText>
    </Pressable>
  );
}

function CommunityBadge({ route }: { route: TransitRoute }) {
  const theme = useTheme();
  const p = route.properties;
  const confirmCommunityRoute = useAppStore((s) => s.confirmCommunityRoute);
  const confirmed = useAppStore((s) => s.confirmedIds.includes(p.id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const verified = p.status === 'verified';

  const confirm = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await confirmCommunityRoute(p.id);
    } catch (e) {
      setMessage(e instanceof CommunityApiError ? e.message : 'Couldn’t confirm. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.badgeRow}>
      <View style={[styles.badge, { backgroundColor: verified ? '#1A7F37' : '#9A6700' }]}>
        <ThemedText type="small" style={styles.badgeText}>
          {verified ? '✓ Verified by commuters' : '⚠ Unverified · added by a commuter'}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {p.confirmations ?? 0} confirmed
      </ThemedText>
      {!confirmed ? (
        <Pressable
          onPress={confirm}
          disabled={busy}
          accessibilityRole="button"
          accessibilityHint="Confirm you have ridden this route"
          style={[styles.confirm, { borderColor: theme.accent }]}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {busy ? '…' : 'Nasakyan ko ’to ✓'}
          </ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="small" style={{ color: theme.accent }}>
          Salamat sa pag-confirm!
        </ThemedText>
      )}
      {message && (
        <ThemedText type="small" style={styles.errorText}>
          {message}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
  addButton: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  status: { alignSelf: 'flex-start' },
  errorText: { color: '#CF222E' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  badge: { borderRadius: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  badgeText: { color: '#ffffff', fontSize: 12 },
  confirm: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
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
