import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Messages, useT } from '@/i18n';
import { searchLandmarks } from '@/lib/dataSource';
import { type Place, type PickTarget, useAppStore } from '@/store/useAppStore';

/** What the From/To field shows for a chosen place, in the current language. */
function placeText(place: Place, t: Messages): string {
  if (place.kind === 'landmark') return place.name;
  if (place.kind === 'myLocation') return t.place.myLocation;
  return `📍 ${t.place.name(place.near)}`;
}

export function PlaceSearch() {
  const theme = useTheme();
  const t = useT();
  const labels: Record<PickTarget, { label: string; placeholder: string }> = {
    origin: { label: t.search.from, placeholder: t.search.fromPlaceholder },
    destination: { label: t.search.to, placeholder: t.search.toPlaceholder },
  };
  const origin = useAppStore((s) => s.origin);
  const destination = useAppStore((s) => s.destination);
  const pickTarget = useAppStore((s) => s.pickTarget);
  const setPickTarget = useAppStore((s) => s.setPickTarget);
  const setPlace = useAppStore((s) => s.setPlace);
  const swapPlaces = useAppStore((s) => s.swapPlaces);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<PickTarget | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const results = editing ? searchLandmarks(query) : [];

  const useMyLocation = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocError(t.search.locationDenied);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setPlace('origin', {
        kind: 'myLocation',
        coord: [pos.coords.longitude, pos.coords.latitude],
      });
      setEditing(null);
    } catch {
      setLocError(t.search.locationFailed);
    } finally {
      setLocating(false);
    }
  };

  const field = (target: PickTarget) => {
    const place = target === 'origin' ? origin : destination;
    const active = pickTarget === target;
    return (
      <View style={[styles.field, { borderColor: active ? theme.accent : theme.border }]}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
          {labels[target].label}
        </ThemedText>
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder={labels[target].placeholder}
          placeholderTextColor={theme.textSecondary}
          value={editing === target ? query : place ? placeText(place, t) : ''}
          onFocus={() => {
            setPickTarget(target);
            setEditing(target);
            setQuery('');
          }}
          onBlur={() => setTimeout(() => setEditing((e) => (e === target ? null : e)), 150)}
          onChangeText={setQuery}
          accessibilityLabel={labels[target].placeholder}
        />
      </View>
    );
  };

  return (
    <ThemedView style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.fields}>
        <View style={styles.fieldCol}>
          {field('origin')}
          {field('destination')}
        </View>
        <Pressable
          onPress={swapPlaces}
          style={[styles.swap, { borderColor: theme.border }]}
          accessibilityLabel={t.search.swap}>
          <ThemedText type="smallBold">⇅</ThemedText>
        </Pressable>
      </View>

      {editing && (
        <View style={styles.results}>
          {editing === 'origin' && (
            <Pressable style={styles.result} onPress={useMyLocation}>
              {locating ? (
                <ActivityIndicator size="small" />
              ) : (
                <ThemedText type="small" style={{ color: theme.accent }}>
                  {t.search.useMyLocation}
                </ThemedText>
              )}
            </Pressable>
          )}
          {results.map((l) => (
            <Pressable
              key={l.id}
              style={styles.result}
              onPress={() => {
                setPlace(editing, { kind: 'landmark', name: l.name, coord: l.coord });
                setEditing(null);
                setPickTarget(editing === 'origin' ? 'destination' : 'origin');
              }}>
              <ThemedText type="small">{l.name}</ThemedText>
            </Pressable>
          ))}
          {query.length > 0 && results.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.result}>
              {t.search.noMatch}
            </ThemedText>
          )}
        </View>
      )}

      {locError && (
        <ThemedText type="small" style={{ color: '#CF222E' }}>
          {locError}
        </ThemedText>
      )}
      {!editing && (
        <ThemedText type="small" themeColor="textSecondary">
          {t.search.tip(pickTarget === 'origin')}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fields: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  fieldCol: { flex: 1, gap: Spacing.two },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  label: { width: 64 },
  input: { flex: 1, paddingVertical: Spacing.two, fontSize: 16, minWidth: 0 },
  swap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: { gap: Spacing.half },
  result: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.one },
});
