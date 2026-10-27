import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteFare } from '@/components/route-fare';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiErrorText, useT } from '@/i18n';
import { lengthKm } from '@/lib/geo';
import { useAllRoutes, useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { LngLat, ReportReason, RouteType, TransitRoute } from '@/types';

type Filter = 'all' | 'community' | RouteType;

const FILTERS: Filter[] = ['all', 'jeep', 'modern_jeep', 'tricycle', 'walk', 'community'];

export default function RoutesScreen() {
  const theme = useTheme();
  const t = useT();
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
              {t.routes.title}
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
                  {t.routes.add}
                </ThemedText>
              </Pressable>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t.routes.dataInfo(dataset.region, dataset.version, dataset.updatedAt)}
          </ThemedText>
          {communityStatus !== 'disabled' && <AccountRow />}
          {communityStatus === 'loading' && <ActivityIndicator style={styles.status} />}
          {communityStatus === 'error' && (
            <Pressable onPress={loadCommunityRoutes}>
              <ThemedText type="small" style={styles.errorText}>
                {t.routes.loadError}
              </ThemedText>
            </Pressable>
          )}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.routes.searchPlaceholder}
            placeholderTextColor={theme.textSecondary}
            style={[styles.search, { borderColor: theme.border, color: theme.text }]}
          />
          <View style={styles.filters}>
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.filter,
                    { borderColor: active ? theme.accent : theme.border },
                    active && { backgroundColor: theme.accent },
                  ]}>
                  <ThemedText type="small" style={{ color: active ? theme.accentText : theme.text }}>
                    {t.routes.filters[f]}
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
              {t.routes.empty}
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
  const t = useT();
  const p = route.properties;
  const km = lengthKm(route.geometry.coordinates as LngLat[]);
  const community = p.source === 'community';
  // Only the title and the link open the map: the card also holds buttons and fare inputs.
  return (
    <View style={[styles.card, { borderColor: theme.border, borderLeftColor: p.color }]}>
      <Pressable
        onPress={onPress}
        accessibilityHint={t.routes.showOnMapHint}
        style={({ pressed }) => [styles.cardTop, pressed && styles.pressed]}>
        <ThemedText type="smallBold" style={styles.cardTitle}>
          {p.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t.routes.types[p.type]}
        </ThemedText>
      </Pressable>
      {community && <CommunityBadge route={route} />}
      {p.signboard ? <ThemedText type="small">{t.routes.signboard(p.signboard)}</ThemedText> : null}
      <RouteFare route={route} editable={community} />
      <ThemedText type="small" themeColor="textSecondary">
        {p.loadingPoints.map((l) => l.name).join(' → ')}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {[
          `${km.toFixed(1)} km`,
          p.type === 'walk' ? null : p.direction === 'oneway' ? t.routes.oneWay : t.routes.bothWays,
          p.operatingHours,
          community ? t.routes.added(p.lastVerified, p.author) : t.routes.checked(p.lastVerified),
        ]
          .filter(Boolean)
          .join(' · ')}
      </ThemedText>
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityHint={t.routes.showOnMapHint}
        style={({ pressed }) => [styles.mapLink, pressed && styles.pressed]}>
        <ThemedText type="small" style={{ color: theme.accent }}>
          {t.routes.showOnMap}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function AccountRow() {
  const theme = useTheme();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const logOut = useAuthStore((s) => s.logOut);
  if (status === 'loading') return null;
  return (
    <View style={styles.accountRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {user ? t.routes.account.loggedInAs(user.username) : t.routes.account.prompt}
      </ThemedText>
      <Pressable onPress={user ? logOut : () => router.push('/sign-in')} accessibilityRole="button">
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          {user ? t.routes.account.logOut : t.routes.account.logIn}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const REPORT_REASONS: ReportReason[] = ['wrong_path', 'not_running', 'spam'];

const BADGE_COLORS = {
  verified: '#1A7F37',
  unverified: '#9A6700',
  disputed: '#CF222E',
  unavailable: '#57606A',
};

function CommunityBadge({ route }: { route: TransitRoute }) {
  const theme = useTheme();
  const t = useT();
  const p = route.properties;
  const user = useAuthStore((s) => s.user);
  const own = !!user && p.author === user.username;
  const confirmCommunityRoute = useAppStore((s) => s.confirmCommunityRoute);
  const reportCommunityRoute = useAppStore((s) => s.reportCommunityRoute);
  const vote = useAppStore((s) => s.myVotes[p.id]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const status = p.status ?? 'unverified';

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
      setMessage(apiErrorText(e, t, t.routes.voteFailed));
    } finally {
      setBusy(false);
    }
  };

  const reported = vote && vote !== 'confirmed';

  return (
    <View style={styles.badgeBlock}>
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: BADGE_COLORS[status] }]}>
          <ThemedText type="small" style={styles.badgeText}>
            {t.routes.badges[status]}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t.routes.counts(p.confirmations ?? 0, p.reports ?? 0)}
        </ThemedText>
      </View>

      {status === 'unavailable' && vote !== 'confirmed' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t.routes.unavailableHint}
        </ThemedText>
      )}

      {vote && (
        <ThemedText type="small" style={{ color: theme.accent }}>
          {reported ? t.routes.thanksReport(t.routes.reasons[vote]) : t.routes.thanksConfirm}
        </ThemedText>
      )}

      {picking ? (
        <View style={styles.badgeRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {t.routes.whatsWrong}
          </ThemedText>
          {REPORT_REASONS.map((reason) => (
            <VoteButton
              key={reason}
              label={t.routes.reasons[reason]}
              color="#CF222E"
              disabled={busy}
              onPress={() => run(() => reportCommunityRoute(p.id, reason))}
            />
          ))}
          <VoteButton
            label={t.common.cancel}
            color={theme.textSecondary}
            onPress={() => setPicking(false)}
          />
        </View>
      ) : (
        <View style={styles.badgeRow}>
          {own ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t.routes.youAdded}
            </ThemedText>
          ) : (
            vote !== 'confirmed' && (
              <VoteButton
                label={busy ? '…' : t.routes.confirm}
                hint={t.routes.confirmHint}
                color={theme.accent}
                disabled={busy}
                onPress={() => run(() => confirmCommunityRoute(p.id))}
              />
            )
          )}
          <VoteButton
            label={reported ? t.routes.changeReport : t.routes.report}
            hint={t.routes.reportHint}
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
  mapLink: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.7 },
  attribution: { marginTop: Spacing.three },
});
