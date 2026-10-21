import { Redirect } from 'expo-router';

import { useAppStore } from '@/state/AppStore';

/** Lien inconnu (ancien lien, page web hébergée ailleurs) : retour au bon écran de départ. */
export default function NotFound() {
  const { settings } = useAppStore();
  return <Redirect href={settings.onboarded ? '/' : '/onboarding'} />;
}
