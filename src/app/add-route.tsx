import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DrawMap } from '@/components/map/draw-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSnappedPath, type SnapStatus } from '@/hooks/use-snapped-path';
import { useTheme } from '@/hooks/use-theme';
import { apiErrorText, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { submitRoute } from '@/lib/community';
import { landmarks } from '@/lib/dataSource';
import { fareTable } from '@/lib/fare';
import { distanceM, lengthKm } from '@/lib/geo';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { LngLat, RouteType } from '@/types';

const MAX_GAP_M = 5000;
/** Matches MAX_WALK_KM on the server. */
const MAX_WALK_KM = 2;
const WIDE_BREAKPOINT = 900;

const TYPES: RouteType[] = ['jeep', 'modern_jeep', 'tricycle', 'walk'];

const CITIES = Object.keys(fareTable.tricycle).filter((c) => c !== 'default');

/** A landmark this close to a tapped point names it; otherwise the street does. */
const LANDMARK_NAME_M = 150;

/** Snap states worth a note on the map. */
const SNAP_NOTES = ['loading', 'noRoad', 'unavailable'] as const;
const hasSnapNote = (s: SnapStatus): s is (typeof SNAP_NOTES)[number] =>
  (SNAP_NOTES as readonly SnapStatus[]).includes(s);

/** Suggested name for a tapped point: a nearby landmark, else its street. */
function suggestName(pt: LngLat | undefined, street: string | undefined): string {
  if (!pt) return '';
  let best: { name: string; d: number } | null = null;
  for (const l of landmarks) {
    const d = distanceM(pt, l.coord);
    if (d <= LANDMARK_NAME_M && (!best || d < best.d)) best = { name: l.name, d };
  }
  return best?.name ?? street ?? '';
}

export default function AddRouteScreen() {
  const theme = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const communityStatus = useAppStore((s) => s.communityStatus);
  const upsertCommunityRoute = useAppStore((s) => s.upsertCommunityRoute);
  const highlightRoute = useAppStore((s) => s.highlightRoute);
  const authStatus = useAuthStore((s) => s.status);

  const [points, setPoints] = useState<LngLat[]>([]);
  const [snap, setSnap] = useState(true);
  const [signboard, setSignboard] = useState('');
  // null until the user types: the field shows the name suggested from the map instead.
  const [fromInput, setFromInput] = useState<string | null>(null);
  const [toInput, setToInput] = useState<string | null>(null);
  const [via, setVia] = useState('');
  const [type, setType] = useState<RouteType>('jeep');
  const [direction, setDirection] = useState<'both' | 'oneway'>('both');
  const [hours, setHours] = useState('');
  const [city, setCity] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walk = type === 'walk';
  const snapped = useSnappedPath(points, walk ? 'walking' : 'driving', snap);
  const path = snapped.path;
  const suggestedFrom = useMemo(
    () => suggestName(points[0], snapped.names[0]),
    [points, snapped.names]
  );
  const suggestedTo = useMemo(
    () => (points.length >= 2 ? suggestName(points[points.length - 1], snapped.names.at(-1)) : ''),
    [points, snapped.names]
  );
  const from = fromInput ?? suggestedFrom;
  const to = toInput ?? suggestedTo;

  if (communityStatus === 'disabled') {
    return (
      <ThemedView style={styles.disabled}>
        <ThemedText type="smallBold">{t.addRoute.notSetUp}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t.addRoute.notSetUpBody}
        </ThemedText>
      </ThemedView>
    );
  }

  if (authStatus === 'signedOut') {
    return (
      <ThemedView style={styles.disabled}>
        <ThemedText type="smallBold">{t.addRoute.logInToAdd}</ThemedText>
        <Pressable
          onPress={() => router.replace({ pathname: '/sign-in', params: { next: 'add-route' } })}
          accessibilityRole="button"
          style={[styles.submit, { backgroundColor: theme.accent }]}>
          <ThemedText type="smallBold" style={{ color: theme.accentText }}>
            {t.addRoute.logIn}
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const km = lengthKm(path);
  const bigGap = path.some((p, i) => i > 0 && distanceM(path[i - 1], p) > MAX_GAP_M);
  const tooLong = walk && km > MAX_WALK_KM;
  const need = t.addRoute.missingItems;
  const missing = [
    points.length < 2 && need.points,
    !walk && !signboard.trim() && need.signboard,
    !from.trim() && need.from,
    !to.trim() && need.to,
  ].filter(Boolean) as string[];
  const canSubmit = missing.length === 0 && !bigGap && !tooLong && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const name = `${from.trim()} – ${to.trim()}${via.trim() ? ` via ${via.trim()}` : ''}`;
      const created = await submitRoute({
        name,
        type,
        signboard: walk ? '' : signboard.trim().toUpperCase(),
        direction: walk ? 'both' : direction,
        operatingHours: walk ? '' : hours.trim(),
        city: type === 'tricycle' ? city : undefined,
        coordinates: path,
        loadingPoints: [
          { name: from.trim(), coord: path[0] },
          { name: to.trim(), coord: path[path.length - 1] },
        ],
      });
      upsertCommunityRoute(created);
      highlightRoute(created.properties.id);
      router.back();
    } catch (e) {
      const issues = e instanceof ApiError && e.status === 400 ? e.issues.map((i) => i.message) : [];
      setError([apiErrorText(e, t), ...issues].join('\n'));
    } finally {
      setSubmitting(false);
    }
  };

  const map = (
    <View style={wide ? styles.mapWide : styles.map}>
      <DrawMap points={points} path={path} onAddPoint={(p) => setPoints((ps) => [...ps, p])} />
      <View style={styles.mapToolbar}>
        <ToolbarButton
          label={t.addRoute.undo}
          disabled={points.length === 0}
          onPress={() => setPoints((ps) => ps.slice(0, -1))}
        />
        <ToolbarButton
          label={t.addRoute.clear}
          disabled={points.length === 0}
          onPress={() => setPoints([])}
        />
        <ToolbarButton
          label={
            snap ? (walk ? t.addRoute.followPaths : t.addRoute.followRoads) : t.addRoute.straight
          }
          onPress={() => setSnap((v) => !v)}
        />
        {points.length > 0 && (
          <ThemedView type="backgroundElement" style={styles.stat}>
            <ThemedText type="small">
              {t.addRoute.stats(points.length, km)}
            </ThemedText>
          </ThemedView>
        )}
      </View>
      {hasSnapNote(snapped.status) && (
        <ThemedView type="backgroundElement" style={[styles.stat, styles.snapNote]}>
          <ThemedText type="small">{t.addRoute.snap[snapped.status]}</ThemedText>
        </ThemedView>
      )}
    </View>
  );

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    autoCapitalize: 'none' | 'words' | 'characters' = 'words'
  ) => (
    <View style={styles.fieldWrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize={autoCapitalize}
        style={[styles.input, { borderColor: theme.border, color: theme.text }]}
      />
    </View>
  );

  const form = (
    <ScrollView
      style={styles.form}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled">
      <ThemedText type="small" themeColor="textSecondary">
        {walk ? t.addRoute.instructionsWalk(wide) : t.addRoute.instructionsRide(wide)}
      </ThemedText>
      {bigGap && (
        <ThemedText type="small" style={styles.error}>
          {t.addRoute.bigGap}
        </ThemedText>
      )}
      {tooLong && (
        <ThemedText type="small" style={styles.error}>
          {t.addRoute.tooLong(MAX_WALK_KM)}
        </ThemedText>
      )}

      <ThemedText type="smallBold">{t.addRoute.type}</ThemedText>
      <Segmented
        options={TYPES.map((v) => ({ value: v, label: t.routes.types[v] }))}
        value={type}
        onChange={setType}
      />

      {!walk &&
        field(
          t.addRoute.signboard,
          signboard,
          setSignboard,
          t.addRoute.signboardPlaceholder,
          'characters'
        )}
      <View style={styles.row}>
        <View style={styles.flex}>
          {field(t.addRoute.from, from, setFromInput, t.addRoute.endPlaceholder)}
        </View>
        <View style={styles.flex}>
          {field(t.addRoute.to, to, setToInput, t.addRoute.endPlaceholder)}
        </View>
      </View>
      {field(
        walk ? t.addRoute.viaWalk : t.addRoute.via,
        via,
        setVia,
        walk ? t.addRoute.viaWalkPlaceholder : t.addRoute.viaPlaceholder
      )}

      {type === 'tricycle' && (
        <>
          <ThemedText type="smallBold">{t.addRoute.city}</ThemedText>
          <Segmented
            options={[
              ...CITIES.map((c) => ({ value: c, label: t.fares.cities[c] ?? c.replace('_', ' ') })),
              { value: undefined, label: t.addRoute.otherCity },
            ]}
            value={city}
            onChange={setCity}
          />
        </>
      )}

      {!walk && (
        <>
          <ThemedText type="smallBold">{t.addRoute.direction}</ThemedText>
          <Segmented
            options={(['both', 'oneway'] as const).map((v) => ({
              value: v,
              label: t.addRoute.directions[v],
            }))}
            value={direction}
            onChange={setDirection}
          />
          {direction === 'oneway' && (
            <ThemedText type="small" themeColor="textSecondary">
              {t.addRoute.onewayHint}
            </ThemedText>
          )}

          {field(t.addRoute.hours, hours, setHours, t.addRoute.hoursPlaceholder, 'none')}
        </>
      )}

      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
      {missing.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t.addRoute.missing(missing)}
        </ThemedText>
      )}

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        accessibilityRole="button"
        style={[styles.submit, { backgroundColor: theme.accent }, !canSubmit && styles.submitDisabled]}>
        {submitting ? (
          <ActivityIndicator color={theme.accentText} />
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.accentText }}>
            {walk ? t.addRoute.submitWalk : t.addRoute.submitRide}
          </ThemedText>
        )}
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary">
        {t.addRoute.footnote}
      </ThemedText>
    </ScrollView>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={wide ? styles.wideRow : styles.flex}>
        {wide ? (
          <>
            <View style={[styles.side, { borderRightColor: theme.border }]}>{form}</View>
            {map}
          </>
        ) : (
          <>
            {map}
            {form}
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function ToolbarButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={disabled && styles.submitDisabled}>
      <ThemedView type="backgroundElement" style={styles.stat}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function Segmented<T>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.label}
            onPress={() => onChange(o.value)}
            accessibilityState={{ selected: active }}
            style={[
              styles.segment,
              { borderColor: active ? theme.accent : theme.border },
              active && { backgroundColor: theme.accent },
            ]}>
            <ThemedText type="small" style={{ color: active ? theme.accentText : theme.text }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  wideRow: { flex: 1, flexDirection: 'row' },
  side: { width: 420, borderRightWidth: 1 },
  disabled: { flex: 1, padding: Spacing.four, gap: Spacing.two, justifyContent: 'center' },
  map: { height: '45%', minHeight: 240 },
  mapWide: { flex: 1 },
  snapNote: { position: 'absolute', left: Spacing.two, bottom: Spacing.two },
  mapToolbar: {
    position: 'absolute',
    left: Spacing.two,
    // Leave room for the zoom buttons in the top-right corner.
    right: 56,
    top: Spacing.two,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  stat: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  form: { flex: 1 },
  formContent: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  fieldWrap: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: Spacing.two },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  segment: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  submit: {
    marginTop: Spacing.two,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  error: { color: '#CF222E' },
});
