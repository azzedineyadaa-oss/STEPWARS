import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useAppStore } from '@/state/AppStore';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  // Les couleurs d'onglet définies plus bas sont toutes des chaînes.
  return function TabBarIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

export default function TabsLayout() {
  const { challenges } = useAppStore();
  const invitations = challenges.filter((c) => c.status === 'pending' && c.incoming).length;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: '700' },
        headerTitleStyle: { fontWeight: '800' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.onPrimary, fontWeight: '800' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', headerShown: false, tabBarIcon: tabIcon('footsteps') }} />
      <Tabs.Screen name="war" options={{ title: 'Ligue', headerShown: false, tabBarIcon: tabIcon('trophy') }} />
      <Tabs.Screen name="map" options={{ title: 'Carte', headerShown: false, tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen
        name="challenges"
        options={{ title: 'Duels', tabBarIcon: tabIcon('flash'), tabBarBadge: invitations > 0 ? invitations : undefined }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tabIcon('person-circle') }} />
    </Tabs>
  );
}
