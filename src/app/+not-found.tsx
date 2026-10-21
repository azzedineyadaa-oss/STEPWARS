import { Redirect } from 'expo-router';

/** Lien inconnu (ancien lien, page web hébergée ailleurs) : retour à l'accueil. */
export default function NotFound() {
  return <Redirect href="/" />;
}
