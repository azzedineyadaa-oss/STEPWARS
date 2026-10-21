// Conversion entre les lignes Supabase et les types de l'app. Pur, testé avec `node --test`.
import type { Challenge, DayKey, Friend, StepHistory } from './game.ts';

export type ProfileRow = { id: string; name: string; avatar: string; daily_goal: number; friend_code: string };
export type StepsRow = { user_id: string; day: DayKey; steps: number };
export type ChallengeRow = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  start_day: DayKey;
  days: number;
  created_at: string;
};

/** Un défi vu par `myId` : l'adversaire est l'autre participant, quel que soit le lanceur. */
export function challengeFromRow(row: ChallengeRow, myId: string): Challenge {
  return {
    id: row.id,
    opponentId: row.challenger_id === myId ? row.opponent_id : row.challenger_id,
    startDay: row.start_day,
    days: row.days,
    createdAt: row.created_at,
  };
}

export function friendFromRow(row: Pick<ProfileRow, 'id' | 'name' | 'avatar'>): Friend {
  return { id: row.id, name: row.name, avatar: row.avatar };
}

/** Regroupe les lignes de pas par joueur. */
export function groupSteps(rows: StepsRow[]): Record<string, StepHistory> {
  const byUser: Record<string, StepHistory> = {};
  for (const row of rows) {
    (byUser[row.user_id] ??= {})[row.day] = row.steps;
  }
  return byUser;
}

/**
 * Jours dont le total local n'a pas encore été envoyé (ou a augmenté depuis),
 * limités aux jours acceptés par le serveur (à partir de `sinceDay`).
 */
export function pendingUploads(
  history: StepHistory,
  uploaded: StepHistory,
  sinceDay: DayKey,
): { day: DayKey; steps: number }[] {
  return Object.entries(history)
    .filter(([day, steps]) => day >= sinceDay && steps > (uploaded[day] ?? -1))
    .map(([day, steps]) => ({ day, steps }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Message lisible pour les erreurs renvoyées par les fonctions SQL. */
export function friendlyError(message: string | undefined): string {
  if (!message) return 'Une erreur est survenue. Réessayez.';
  if (message.includes('friend_code_not_found')) return 'Aucun joueur ne correspond à ce code.';
  if (message.includes('cannot_add_self')) return 'C’est votre propre code !';
  if (message.includes('not_authenticated')) return 'Connexion au serveur perdue. Relancez l’app.';
  if (/network|fetch/i.test(message)) return 'Pas de connexion internet.';
  return 'Une erreur est survenue. Réessayez.';
}
