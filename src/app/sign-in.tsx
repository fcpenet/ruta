import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiErrorText, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

type Mode = 'login' | 'signup';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/i;
const MIN_PASSWORD = 8;

export default function SignInScreen() {
  const theme = useTheme();
  const t = useT();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const logIn = useAuthStore((s) => s.logIn);
  const signUp = useAuthStore((s) => s.signUp);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signup = mode === 'signup';
  const hint =
    signup && username.trim() && !USERNAME_RE.test(username.trim())
      ? t.auth.usernameRule
      : signup && password && password.length < MIN_PASSWORD
        ? t.auth.passwordPlaceholder(MIN_PASSWORD)
        : null;
  const canSubmit =
    !busy && username.trim().length > 0 && password.length > 0 && (!signup || !hint);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await (signup ? signUp : logIn)(username, password);
      if (next === 'add-route') router.replace('/add-route');
      else router.back();
    } catch (e) {
      // The server words these in English; the common ones have translations.
      const status = e instanceof ApiError ? e.status : -1;
      setError(
        status === 401 && !signup
          ? t.auth.wrongCredentials
          : status === 409
            ? t.auth.usernameTaken
            : apiErrorText(e, t)
      );
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(signup ? 'login' : 'signup');
    setError(null);
  };

  const inputStyle = [styles.input, { borderColor: theme.border, color: theme.text }];

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">{signup ? t.auth.signUpTitle : t.auth.logInTitle}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {next === 'add-route' ? t.auth.introAddRoute : t.auth.intro}
        </ThemedText>

        <View style={styles.field}>
          <ThemedText type="smallBold">{t.auth.username}</ThemedText>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder={t.auth.usernamePlaceholder}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            style={inputStyle}
          />
        </View>
        <View style={styles.field}>
          <ThemedText type="smallBold">{t.auth.password}</ThemedText>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={signup ? t.auth.passwordPlaceholder(MIN_PASSWORD) : ''}
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={signup ? 'new-password' : 'current-password'}
            textContentType={signup ? 'newPassword' : 'password'}
            onSubmitEditing={canSubmit ? submit : undefined}
            style={inputStyle}
          />
        </View>

        {hint && (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        )}
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          style={[styles.submit, { backgroundColor: theme.accent }, !canSubmit && styles.disabled]}>
          {busy ? (
            <ActivityIndicator color={theme.accentText} />
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.accentText }}>
              {signup ? t.auth.signUp : t.auth.logIn}
            </ThemedText>
          )}
        </Pressable>

        <Pressable onPress={switchMode} accessibilityRole="button" style={styles.switch}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {signup ? t.auth.toLogIn : t.auth.toSignUp}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  field: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  submit: { borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  switch: { alignSelf: 'center', padding: Spacing.two },
  error: { color: '#CF222E' },
});
