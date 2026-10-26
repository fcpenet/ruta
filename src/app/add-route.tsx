import { router } from 'expo-router';
import { useState } from 'react';
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
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { submitRoute } from '@/lib/community';
import { fareTable } from '@/lib/fare';
import { distanceM, lengthKm } from '@/lib/geo';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { LngLat, RouteType } from '@/types';

const MAX_GAP_M = 5000;
/** Matches MAX_WALK_KM on the server. */
const MAX_WALK_KM = 2;
const WIDE_BREAKPOINT = 900;

const TYPES: { value: RouteType; label: string }[] = [
  { value: 'jeep', label: 'Jeep' },
  { value: 'modern_jeep', label: 'Modern jeep' },
  { value: 'tricycle', label: 'Tricycle' },
  { value: 'walk', label: 'Lakad (walk link)' },
];

const DIRECTIONS = [
  { value: 'both', label: 'Balikan (both ways)' },
  { value: 'oneway', label: 'One way lang' },
] as const;

const CITIES = Object.keys(fareTable.tricycle).filter((c) => c !== 'default');

export default function AddRouteScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const communityStatus = useAppStore((s) => s.communityStatus);
  const upsertCommunityRoute = useAppStore((s) => s.upsertCommunityRoute);
  const highlightRoute = useAppStore((s) => s.highlightRoute);
  const authStatus = useAuthStore((s) => s.status);

  const [points, setPoints] = useState<LngLat[]>([]);
  const [signboard, setSignboard] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [via, setVia] = useState('');
  const [type, setType] = useState<RouteType>('jeep');
  const [direction, setDirection] = useState<'both' | 'oneway'>('both');
  const [hours, setHours] = useState('');
  const [city, setCity] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (communityStatus === 'disabled') {
    return (
      <ThemedView style={styles.disabled}>
        <ThemedText type="smallBold">Community routes aren’t set up yet.</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Set EXPO_PUBLIC_API_URL to the Ruta API (server/) to let commuters add routes.
        </ThemedText>
      </ThemedView>
    );
  }

  if (authStatus === 'signedOut') {
    return (
      <ThemedView style={styles.disabled}>
        <ThemedText type="smallBold">Log in to add a route.</ThemedText>
        <Pressable
          onPress={() => router.replace({ pathname: '/sign-in', params: { next: 'add-route' } })}
          accessibilityRole="button"
          style={[styles.submit, { backgroundColor: theme.accent }]}>
          <ThemedText type="smallBold" style={{ color: theme.accentText }}>
            Log in / Sign up
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const walk = type === 'walk';
  const km = lengthKm(points);
  const bigGap = points.some((p, i) => i > 0 && distanceM(points[i - 1], p) > MAX_GAP_M);
  const tooLong = walk && km > MAX_WALK_KM;
  const missing = [
    points.length < 2 && 'at least 2 points on the map',
    !walk && !signboard.trim() && 'the signboard',
    !from.trim() && 'where it starts',
    !to.trim() && 'where it ends',
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
        coordinates: points,
        loadingPoints: [
          { name: from.trim(), coord: points[0] },
          { name: to.trim(), coord: points[points.length - 1] },
        ],
      });
      upsertCommunityRoute(created);
      highlightRoute(created.properties.id);
      router.back();
    } catch (e) {
      if (e instanceof ApiError) {
        setError([e.message, ...e.issues.map((i) => i.message)].join('\n'));
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const map = (
    <View style={wide ? styles.mapWide : styles.map}>
      <DrawMap points={points} onAddPoint={(p) => setPoints((ps) => [...ps, p])} />
      <View style={styles.mapToolbar}>
        <ToolbarButton
          label="↶ Undo"
          disabled={points.length === 0}
          onPress={() => setPoints((ps) => ps.slice(0, -1))}
        />
        <ToolbarButton label="Clear" disabled={points.length === 0} onPress={() => setPoints([])} />
        {points.length > 0 && (
          <ThemedView type="backgroundElement" style={styles.stat}>
            <ThemedText type="small">
              {points.length} points · {km.toFixed(1)} km
            </ThemedText>
          </ThemedView>
        )}
      </View>
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
        {walk
          ? `${wide ? 'Click' : 'Tap'} the map along the path you walk — a footbridge, alley, mall walkway or shortcut between two routes. Start and end close to the jeep lines it connects.`
          : `${wide ? 'Click' : 'Tap'} the map along the road the jeep or tricycle takes, from one terminal to the other. Add a point at every turn so the line follows the street.`}
      </ThemedText>
      {bigGap && (
        <ThemedText type="small" style={styles.error}>
          Two points are more than 5 km apart. Add points in between along the road.
        </ThemedText>
      )}
      {tooLong && (
        <ThemedText type="small" style={styles.error}>
          Walk links can be up to {MAX_WALK_KM} km. Split a longer walk, or add it as a jeep or
          tricycle route.
        </ThemedText>
      )}

      <ThemedText type="smallBold">Uri</ThemedText>
      <Segmented options={TYPES} value={type} onChange={setType} />

      {!walk &&
        field('Karatula (signboard)', signboard, setSignboard, 'e.g. CUBAO – QUIAPO', 'characters')}
      <View style={styles.row}>
        <View style={styles.flex}>{field('Mula (start)', from, setFrom, 'e.g. Cubao')}</View>
        <View style={styles.flex}>{field('Hanggang (end)', to, setTo, 'e.g. Quiapo')}</View>
      </View>
      {field(
        walk ? 'Daan (optional)' : 'Via (optional)',
        via,
        setVia,
        walk ? 'e.g. footbridge, SM Cubao walkway' : 'e.g. Aurora Blvd'
      )}

      {type === 'tricycle' && (
        <>
          <ThemedText type="smallBold">City (for fares)</ThemedText>
          <Segmented
            options={[
              ...CITIES.map((c) => ({ value: c, label: c.replace('_', ' ') })),
              { value: undefined, label: 'Other' },
            ]}
            value={city}
            onChange={setCity}
          />
        </>
      )}

      {!walk && (
        <>
          <ThemedText type="smallBold">Direction</ThemedText>
          <Segmented options={DIRECTIONS} value={direction} onChange={setDirection} />
          {direction === 'oneway' && (
            <ThemedText type="small" themeColor="textSecondary">
              Draw the points in the direction the vehicle travels.
            </ThemedText>
          )}

          {field('Oras ng biyahe (optional)', hours, setHours, 'e.g. 5:00 AM – 10:00 PM', 'none')}
        </>
      )}

      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
      {missing.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Still needed: {missing.join(', ')}.
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
            {walk ? 'I-submit ang lakaran' : 'I-submit ang ruta'}
          </ThemedText>
        )}
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary">
        New routes show as “unverified” until other commuters confirm them. Routes that get more reports than confirmations are hidden from trip suggestions.
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
  mapToolbar: {
    position: 'absolute',
    left: Spacing.two,
    top: Spacing.two,
    flexDirection: 'row',
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
