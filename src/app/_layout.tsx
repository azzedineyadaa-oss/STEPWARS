import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { reminderMessage, scheduleDailyReminder } from '@/lib/reminders';
import { AppStoreProvider, useAppStore } from '@/state/AppStore';
import { MapStoreProvider } from '@/state/MapStore';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

/** Reprogramme le rappel quotidien quand l'heure, la série ou l'équipe changent. */
function useDailyReminder() {
  const { ready, settings, streak, team } = useAppStore();
  const hour = settings.onboarded ? settings.reminderHour : null;
  const hasTeam = team !== null;
  const currentStreak = streak.current;
  useEffect(() => {
    if (!ready) return;
    scheduleDailyReminder(hour, reminderMessage(currentStreak, hasTeam)).catch((e) =>
      console.warn('Programmation du rappel impossible', e),
    );
  }, [ready, hour, currentStreak, hasTeam]);
}

function RootNavigator() {
  const { ready, settings } = useAppStore();
  useDailyReminder();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={settings.onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="challenge/new" options={{ title: 'Nouveau duel', presentation: 'modal' }} />
        <Stack.Screen name="challenge/[id]" options={{ title: 'Duel' }} />
        <Stack.Screen name="team/new" options={{ title: 'Guerre d’équipes', presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!settings.onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppStoreProvider>
      <MapStoreProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </MapStoreProvider>
    </AppStoreProvider>
  );
}
