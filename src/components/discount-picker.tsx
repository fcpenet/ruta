import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/useAppStore';
import type { DiscountType } from '@/types';

const OPTIONS: { value: DiscountType; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'student', label: 'Student' },
  { value: 'senior', label: 'Senior' },
  { value: 'pwd', label: 'PWD' },
];

export function DiscountPicker() {
  const theme = useTheme();
  const discount = useAppStore((s) => s.discount);
  const setDiscount = useAppStore((s) => s.setDiscount);

  return (
    <View style={[styles.row, { borderColor: theme.border }]} accessibilityRole="radiogroup">
      {OPTIONS.map((o) => {
        const active = o.value === discount;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => setDiscount(o.value)}
            style={[styles.option, active && { backgroundColor: theme.accent }]}>
            <ThemedText
              type="smallBold"
              style={{ color: active ? theme.accentText : theme.textSecondary }}>
              {o.label}
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
