import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES, useLangStore, useT } from '@/i18n';

/** EN | FIL switch. */
export function LanguageToggle() {
  const theme = useTheme();
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);

  return (
    <View
      style={[styles.row, { borderColor: theme.border }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={t.language.label}>
      {LANGUAGES.map((l) => {
        const active = l.code === lang;
        return (
          <Pressable
            key={l.code}
            onPress={() => setLang(l.code)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={l.label}
            style={[styles.option, active && { backgroundColor: theme.accent }]}>
            <ThemedText
              type="smallBold"
              style={{ color: active ? theme.accentText : theme.textSecondary }}>
              {l.short}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1, borderRadius: Spacing.three, padding: 2 },
  option: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Spacing.three },
});
