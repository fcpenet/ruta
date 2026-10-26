import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

type Mode = 'login' | 'signup';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/i;
const MIN_PASSWORD = 8;

export default function SignInScreen() {
  const theme = useTheme();
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
      ? '3–20 letters, numbers, _ or .'
      : signup && password && password.length < MIN_PASSWORD
        ? `At least ${MIN_PASSWORD} characters`
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
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
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
        <ThemedText type="subtitle">{signup ? 'Gumawa ng account' : 'Mag-log in'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {next === 'add-route'
            ? 'Log in to add a route. Other commuters will see your username on it.'
            : 'Log in to add routes and confirm routes you’ve ridden.'}
        </ThemedText>

        <View style={styles.field}>
          <ThemedText type="smallBold">Username</ThemedText>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="e.g. juan_commuter"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            style={inputStyle}
          />
        </View>
        <View style={styles.field}>
          <ThemedText type="smallBold">Password</ThemedText>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={signup ? `At least ${MIN_PASSWORD} characters` : ''}
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
              {signup ? 'Sign up' : 'Log in'}
            </ThemedText>
          )}
        </Pressable>

        <Pressable onPress={switchMode} accessibilityRole="button" style={styles.switch}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {signup ? 'May account na? Log in' : 'Wala pang account? Sign up'}
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
