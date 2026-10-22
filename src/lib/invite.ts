import * as Linking from 'expo-linking';

// Liens d'invitation. Ils ouvrent l'app si elle est installée (schéma
// `stepwars://`, ou `exp://` dans Expo Go) ; le code reste écrit dans le
// message pour qui ne l'a pas encore. Quand l'app sera sur les stores, on
// passera à des liens https (universal links) qui mènent aussi au store.

export function friendInviteUrl(code: string): string {
  return Linking.createURL(`/add/${code}`);
}

export function teamInviteUrl(code: string): string {
  return Linking.createURL(`/join/${code}`);
}

export function friendInviteMessage(code: string): string {
  return `On se lance un défi de pas ? Ajoute-moi sur StepWars avec mon code ami ${code}\n${friendInviteUrl(code)}`;
}

export function teamInviteMessage(teamName: string, code: string): string {
  return `Rejoins mon équipe « ${teamName} » sur StepWars ! Code d’équipe : ${code}\n${teamInviteUrl(code)}`;
}

/** Extrait un code à 6 caractères d'un paramètre de lien (insensible à la casse). */
export function parseInviteCode(raw: string | string[] | undefined): string | null {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase() ?? '';
  return /^[A-Z0-9]{6}$/.test(value) ? value : null;
}
