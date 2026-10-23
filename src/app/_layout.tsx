import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { loadRoutes } from '@/lib/dataSource';
import { useAppStore } from '@/store/useAppStore';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const setDataset = useAppStore((s) => s.setDataset);
  const loadCommunityRoutes = useAppStore((s) => s.loadCommunityRoutes);

  // Picks up newer route data from EXPO_PUBLIC_ROUTES_URL, and community
  // routes from EXPO_PUBLIC_API_URL, if configured.
  useEffect(() => {
    loadRoutes().then((d) => {
      if (d !== useAppStore.getState().dataset) setDataset(d);
    });
    loadCommunityRoutes();
  }, [setDataset, loadCommunityRoutes]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add-route"
          options={{ headerShown: true, title: 'Magdagdag ng ruta', presentation: 'fullScreenModal' }}
        />
      </Stack>
    </ThemeProvider>
  );
}
