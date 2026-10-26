import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { lengthKm } from '@/lib/geo';
import { useAllRoutes, useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { LngLat, ReportReason, TransitRoute, VehicleType } from '@/types';

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
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
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
                onPress={() =>
                  signedIn
                    ? router.push('/add-route')
                    : router.push({ pathname: '/sign-in', params: { next: 'add-route' } })
                }
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
          {communityStatus !== 'disabled' && <AccountRow />}
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
          community
            ? `added ${p.lastVerified}${p.author ? ` by @${p.author}` : ''}`
            : `checked ${p.lastVerified}`,
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

function AccountRow() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const logOut = useAuthStore((s) => s.logOut);
  if (status === 'loading') return null;
  return (
    <View style={styles.accountRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {user ? `Logged in as @${user.username}` : 'Log in to add or confirm routes.'}
      </ThemedText>
      <Pressable onPress={user ? logOut : () => router.push('/sign-in')} accessibilityRole="button">
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          {user ? 'Log out' : 'Log in / Sign up'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'wrong_path', label: 'Maling daan (wrong path)' },
  { value: 'not_running', label: 'Wala na (not running)' },
  { value: 'spam', label: 'Spam / fake' },
];

const BADGES = {
  verified: { color: '#1A7F37', label: '✓ Verified by commuters' },
  unverified: { color: '#9A6700', label: '⚠ Unverified · added by a commuter' },
  disputed: { color: '#CF222E', label: '✕ Disputed · reported by commuters' },
};

function CommunityBadge({ route }: { route: TransitRoute }) {
  const theme = useTheme();
  const p = route.properties;
  const user = useAuthStore((s) => s.user);
  const own = !!user && p.author === user.username;
  const confirmCommunityRoute = useAppStore((s) => s.confirmCommunityRoute);
  const reportCommunityRoute = useAppStore((s) => s.reportCommunityRoute);
  const vote = useAppStore((s) => s.myVotes[p.id]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const badge = BADGES[p.status ?? 'unverified'];

  const run = async (action: () => Promise<void>) => {
    if (!user) {
      router.push('/sign-in');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setPicking(false);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Couldn’t send. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reported = vote && vote !== 'confirmed';
  const reasonLabel = REPORT_REASONS.find((r) => r.value === vote)?.label;

  return (
    <View style={styles.badgeBlock}>
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: badge.color }]}>
          <ThemedText type="small" style={styles.badgeText}>
            {badge.label}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {p.confirmations ?? 0} confirmed · {p.reports ?? 0} reported
        </ThemedText>
      </View>

      {vote && (
        <ThemedText type="small" style={{ color: theme.accent }}>
          {reported ? `Salamat! You reported: ${reasonLabel}.` : 'Salamat sa pag-confirm!'}
        </ThemedText>
      )}

      {picking ? (
        <View style={styles.badgeRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Ano ang mali?
          </ThemedText>
          {REPORT_REASONS.map((r) => (
            <VoteButton
              key={r.value}
              label={r.label}
              color="#CF222E"
              disabled={busy}
              onPress={() => run(() => reportCommunityRoute(p.id, r.value))}
            />
          ))}
          <VoteButton label="Cancel" color={theme.textSecondary} onPress={() => setPicking(false)} />
        </View>
      ) : (
        <View style={styles.badgeRow}>
          {own ? (
            <ThemedText type="small" themeColor="textSecondary">
              You added this
            </ThemedText>
          ) : (
            vote !== 'confirmed' && (
              <VoteButton
                label={busy ? '…' : 'Nasakyan ko ’to ✓'}
                hint="Confirm you have ridden this route"
                color={theme.accent}
                disabled={busy}
                onPress={() => run(() => confirmCommunityRoute(p.id))}
              />
            )
          )}
          <VoteButton
            label={reported ? 'Change report' : 'Mali ’to'}
            hint="Report this route as wrong, not running, or fake"
            color="#CF222E"
            disabled={busy}
            onPress={() => (user ? setPicking(true) : router.push('/sign-in'))}
          />
        </View>
      )}

      {message && (
        <ThemedText type="small" style={styles.errorText}>
          {message}
        </ThemedText>
      )}
    </View>
  );
}

function VoteButton({
  label,
  hint,
  color,
  disabled,
  onPress,
}: {
  label: string;
  hint?: string;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityHint={hint}
      style={[styles.confirm, { borderColor: color }]}>
      <ThemedText type="small" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
  addButton: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  status: { alignSelf: 'flex-start' },
  errorText: { color: '#CF222E' },
  badgeBlock: { gap: Spacing.one },
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
