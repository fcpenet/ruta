import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import type { DiscountType } from '@/types';

const OPTIONS: DiscountType[] = ['regular', 'student', 'senior', 'pwd'];

export function DiscountPicker() {
  const theme = useTheme();
  const t = useT();
  const discount = useAppStore((s) => s.discount);
  const setDiscount = useAppStore((s) => s.setDiscount);

  return (
    <View style={[styles.row, { borderColor: theme.border }]} accessibilityRole="radiogroup">
      {OPTIONS.map((value) => {
        const active = value === discount;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => setDiscount(value)}
            style={[styles.option, active && { backgroundColor: theme.accent }]}>
            <ThemedText
              type="smallBold"
              style={{ color: active ? theme.accentText : theme.textSecondary }}>
              {t.fares.discounts[value]}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.half,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three - Spacing.half,
  },
});
