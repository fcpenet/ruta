import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { restoreLang, useLangStore, useT } from '@/i18n';
import { loadRoutes } from '@/lib/dataSource';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const setDataset = useAppStore((s) => s.setDataset);
  const loadCommunityRoutes = useAppStore((s) => s.loadCommunityRoutes);
  const t = useT();
  const lang = useLangStore((s) => s.lang);

  // Picks up newer route data from EXPO_PUBLIC_ROUTES_URL, and community
  // routes from EXPO_PUBLIC_API_URL, if configured.
  useEffect(() => {
    loadRoutes().then((d) => {
      if (d !== useAppStore.getState().dataset) setDataset(d);
    });
    loadCommunityRoutes();
    useAuthStore.getState().restore();
    restoreLang();
  }, [setDataset, loadCommunityRoutes]);

  // Screen readers and browser translation tools read the page language from <html lang>.
  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.lang = lang;
  }, [lang]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add-route"
          options={{ headerShown: true, title: t.nav.addRoute, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen
          name="sign-in"
          options={{ headerShown: true, title: t.nav.account, presentation: 'modal' }}
        />
      </Stack>
    </ThemeProvider>
  );
}
