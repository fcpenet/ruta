import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { loadRoutes } from '@/lib/dataSource';
import { useAppStore } from '@/store/useAppStore';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const setDataset = useAppStore((s) => s.setDataset);

  // Picks up newer route data from EXPO_PUBLIC_ROUTES_URL, if configured.
  useEffect(() => {
    loadRoutes().then((d) => {
      if (d !== useAppStore.getState().dataset) setDataset(d);
    });
  }, [setDataset]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppTabs />
    </ThemeProvider>
  );
}
