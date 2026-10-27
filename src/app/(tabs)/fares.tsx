import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DiscountPicker } from '@/components/discount-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { computeFare, fareTable, formatPeso } from '@/lib/fare';
import { useAppStore } from '@/store/useAppStore';

const MATRIX_KM = [4, 5, 6, 8, 10, 12, 15, 20];

export default function FaresScreen() {
  const theme = useTheme();
  const t = useT();
  const discount = useAppStore((s) => s.discount);
  const [kmText, setKmText] = useState('7');
  const km = Number.parseFloat(kmText.replace(',', '.'));
  const validKm = Number.isFinite(km) && km > 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{t.fares.title}</ThemedText>
          <DiscountPicker />
          <ThemedText type="small" themeColor="textSecondary">
            {t.fares.discountNote}
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{t.fares.calculator}</ThemedText>
            <View style={styles.calcRow}>
              <TextInput
                value={kmText}
                onChangeText={setKmText}
                keyboardType="decimal-pad"
                accessibilityLabel={t.fares.distanceLabel}
                style={[styles.kmInput, { borderColor: theme.border, color: theme.text }]}
              />
              <ThemedText type="small">km</ThemedText>
            </View>
            {validKm ? (
              <View style={styles.calcResults}>
                <Result label={t.routes.types.jeep} value={computeFare('jeep', km, discount)} />
                <Result
                  label={t.routes.types.modern_jeep}
                  value={computeFare('modern_jeep', km, discount)}
                />
                <Result
                  label={t.fares.tricycleQc}
                  value={computeFare('tricycle', km, discount, 'quezon_city')}
                />
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                {t.fares.enterDistance}
              </ThemedText>
            )}
          </ThemedView>

          <ThemedText type="smallBold">{t.fares.matrixTitle}</ThemedText>
          <View style={[styles.table, { borderColor: theme.border }]}>
            <Row
              cells={[t.fares.columns.km, t.routes.types.jeep, t.routes.types.modern_jeep]}
              header
            />
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
            {t.routes.types.jeep}:{' '}
            {t.fares.jeepRule(fareTable.jeep.base, fareTable.jeep.baseKm, fareTable.jeep.perKm.toFixed(2))}
            . {t.routes.types.modern_jeep}:{' '}
            {t.fares.jeepRule(
              fareTable.modern_jeep.base,
              fareTable.modern_jeep.baseKm,
              fareTable.modern_jeep.perKm.toFixed(2)
            )}
            .
          </ThemedText>

          <ThemedText type="smallBold">{t.fares.tricycleTitle}</ThemedText>
          <View style={[styles.table, { borderColor: theme.border }]}>
            <Row
              cells={[
                t.fares.columns.city,
                t.fares.columns.base,
                t.fares.columns.perKm,
                t.fares.columns.special,
              ]}
              header
            />
            {Object.entries(fareTable.tricycle).map(([city, rule]) => (
              <Row
                key={city}
                cells={[
                  t.fares.cities[city] ?? city,
                  `₱${rule.base} (${rule.baseKm} km)`,
                  `₱${rule.perKm}`,
                  rule.special ? `₱${rule.special}` : '—',
                ]}
              />
            ))}
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {t.fares.effective(fareTable.effectiveDate)} {fareTable.source}
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
