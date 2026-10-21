import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppStoreProvider } from '@/state/AppStore';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <AppStoreProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="challenge/new" options={{ title: 'Nouveau défi', presentation: 'modal' }} />
        <Stack.Screen name="challenge/[id]" options={{ title: 'Défi' }} />
      </Stack>
    </AppStoreProvider>
  );
}
