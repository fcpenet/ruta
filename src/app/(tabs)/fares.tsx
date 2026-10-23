import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DiscountPicker } from '@/components/discount-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { computeFare, fareTable, formatPeso } from '@/lib/fare';
import { useAppStore } from '@/store/useAppStore';

const MATRIX_KM = [4, 5, 6, 8, 10, 12, 15, 20];

const CITY_LABEL: Record<string, string> = {
  quezon_city: 'Quezon City',
  manila: 'Manila',
  default: 'Other LGUs (estimate)',
};

export default function FaresScreen() {
  const theme = useTheme();
  const discount = useAppStore((s) => s.discount);
  const [kmText, setKmText] = useState('7');
  const km = Number.parseFloat(kmText.replace(',', '.'));
  const validKm = Number.isFinite(km) && km > 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Pamasahe</ThemedText>
          <DiscountPicker />
          <ThemedText type="small" themeColor="textSecondary">
            Students, senior citizens and PWDs get 20% off — show your ID.
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Fare calculator</ThemedText>
            <View style={styles.calcRow}>
              <TextInput
                value={kmText}
                onChangeText={setKmText}
                keyboardType="decimal-pad"
                accessibilityLabel="Distance in kilometers"
                style={[styles.kmInput, { borderColor: theme.border, color: theme.text }]}
              />
              <ThemedText type="small">km</ThemedText>
            </View>
            {validKm ? (
              <View style={styles.calcResults}>
                <Result label="Jeep" value={computeFare('jeep', km, discount)} />
                <Result label="Modern jeep" value={computeFare('modern_jeep', km, discount)} />
                <Result
                  label="Tricycle (QC)"
                  value={computeFare('tricycle', km, discount, 'quezon_city')}
                />
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Enter a distance in km.
              </ThemedText>
            )}
          </ThemedView>

          <ThemedText type="smallBold">Jeepney fare matrix</ThemedText>
          <View style={[styles.table, { borderColor: theme.border }]}>
            <Row cells={['km', 'Jeep', 'Modern jeep']} header />
            {MATRIX_KM.map((k) => (
              <Row
                key={k}
                cells={[
                  `${k}`,
                  formatPeso(computeFare('jeep', k, discount)),
                  formatPeso(computeFare('modern_jeep', k, discount)),
                ]}
              />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Jeep: ₱{fareTable.jeep.base} first {fareTable.jeep.baseKm} km, +₱
            {fareTable.jeep.perKm.toFixed(2)}/km. Modern jeep: ₱{fareTable.modern_jeep.base} first{' '}
            {fareTable.modern_jeep.baseKm} km, +₱{fareTable.modern_jeep.perKm.toFixed(2)}/km.
          </ThemedText>

          <ThemedText type="smallBold">Tricycle</ThemedText>
          <View style={[styles.table, { borderColor: theme.border }]}>
            <Row cells={['City', 'Base', 'Per km', 'Special']} header />
            {Object.entries(fareTable.tricycle).map(([city, rule]) => (
              <Row
                key={city}
                cells={[
                  CITY_LABEL[city] ?? city,
                  `₱${rule.base} (${rule.baseKm} km)`,
                  `₱${rule.perKm}`,
                  rule.special ? `₱${rule.special}` : '—',
                ]}
              />
            ))}
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            Effective {fareTable.effectiveDate}. {fareTable.source}
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Result({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.result}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{formatPeso(value)}</ThemedText>
    </View>
  );
}

function Row({ cells, header }: { cells: string[]; header?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      {cells.map((c, i) => (
        <ThemedText
          key={i}
          type={header ? 'smallBold' : 'small'}
          themeColor={header ? 'textSecondary' : 'text'}
          style={[styles.cell, i === 0 && styles.firstCell]}>
          {c}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safe: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.four },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  calcRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  kmInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 18,
    width: 100,
  },
  calcResults: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  result: { gap: Spacing.half },
  table: { borderWidth: 1, borderRadius: Spacing.two, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.two },
  cell: { flex: 1, paddingHorizontal: Spacing.two, fontVariant: ['tabular-nums'] },
  firstCell: { flex: 1.3 },
});
