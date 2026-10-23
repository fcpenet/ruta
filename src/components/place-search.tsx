import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchLandmarks } from '@/lib/dataSource';
import { type PickTarget, useAppStore } from '@/store/useAppStore';

const LABELS: Record<PickTarget, { label: string; placeholder: string }> = {
  origin: { label: 'Mula', placeholder: 'Saan ka manggagaling?' },
  destination: { label: 'Papunta', placeholder: 'Saan ka pupunta?' },
};

export function PlaceSearch() {
  const theme = useTheme();
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
        setLocError('Location permission denied — long-press the map instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setPlace('origin', {
        name: 'Your location',
        coord: [pos.coords.longitude, pos.coords.latitude],
      });
      setEditing(null);
    } catch {
      setLocError("Couldn't get your location.");
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
          {LABELS[target].label}
        </ThemedText>
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder={LABELS[target].placeholder}
          placeholderTextColor={theme.textSecondary}
          value={editing === target ? query : (place?.name ?? '')}
          onFocus={() => {
            setPickTarget(target);
            setEditing(target);
            setQuery('');
          }}
          onBlur={() => setTimeout(() => setEditing((e) => (e === target ? null : e)), 150)}
          onChangeText={setQuery}
          accessibilityLabel={LABELS[target].placeholder}
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
          accessibilityLabel="Swap origin and destination">
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
                  ◎ Use my location
                </ThemedText>
              )}
            </Pressable>
          )}
          {results.map((l) => (
            <Pressable
              key={l.id}
              style={styles.result}
              onPress={() => {
                setPlace(editing, { name: l.name, coord: l.coord });
                setEditing(null);
                setPickTarget(editing === 'origin' ? 'destination' : 'origin');
              }}>
              <ThemedText type="small">{l.name}</ThemedText>
            </Pressable>
          ))}
          {query.length > 0 && results.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.result}>
              No match. Long-press the map to drop a pin.
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
          Tip: long-press (or right-click) the map to set{' '}
          {pickTarget === 'origin' ? 'where you start' : 'where you’re going'}.
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
