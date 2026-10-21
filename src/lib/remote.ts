// Conversion entre les lignes Supabase et les types de l'app. Pur, testé avec `node --test`.
import type { Challenge, DayKey, Friend, StepHistory, Team, TeamMember, TeamStanding } from './game.ts';
import type { FriendOnMap, TerritoryCell } from './territory.ts';

export type ProfileRow = {
  id: string;
  name: string;
  avatar: string;
  daily_goal: number;
  friend_code: string;
  team_id: string | null;
  team_joined_on: DayKey | null;
};
export type TeamRow = { id: string; name: string; emoji: string; code: string };
export type TeamStandingRow = { id: string; name: string; emoji: string; members: number; steps: number | string };
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

export function teamFromRow(row: TeamRow): Team {
  return { id: row.id, name: row.name, emoji: row.emoji, code: row.code };
}

export function teamMemberFromRow(row: Pick<ProfileRow, 'id' | 'name' | 'avatar' | 'team_joined_on'>): TeamMember {
  return { id: row.id, name: row.name, avatar: row.avatar, joinedOn: row.team_joined_on ?? '0000-00-00' };
}

/** `steps` est un bigint côté SQL : selon la configuration, il peut arriver en texte. */
export function teamStandingFromRow(row: TeamStandingRow): TeamStanding {
  return { id: row.id, name: row.name, emoji: row.emoji, members: row.members, steps: Number(row.steps) };
}

export type TerritoryRow = {
  cell_q: number;
  cell_r: number;
  leader_id: string | null;
  leader_name: string | null;
  leader_emoji: string | null;
  leader_steps: number | string | null;
  my_team_steps: number | string;
};

export function territoryCellFromRow(row: TerritoryRow): TerritoryCell {
  return {
    key: `${row.cell_q}:${row.cell_r}`,
    leader: row.leader_id
      ? { id: row.leader_id, name: row.leader_name ?? '', emoji: row.leader_emoji ?? '', steps: Number(row.leader_steps ?? 0) }
      : null,
    myTeamSteps: Number(row.my_team_steps),
  };
}

export type FriendOnMapRow = { id: string; name: string; avatar: string; cell_q: number; cell_r: number; updated_at: string };

export function friendOnMapFromRow(row: FriendOnMapRow, now: number): FriendOnMap {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    cell: { q: row.cell_q, r: row.cell_r },
    minutesAgo: Math.max(0, Math.round((now - Date.parse(row.updated_at)) / 60_000)),
  };
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
  if (message.includes('cannot_add_self')) return 'C’est ton propre code !';
  if (message.includes('team_code_not_found')) return 'Aucune équipe ne correspond à ce code.';
  if (message.includes('already_in_team')) return 'Tu fais déjà partie d’une équipe. Quitte-la d’abord.';
  if (message.includes('team_full')) return 'Cette équipe est complète (30 membres).';
  if (message.includes('cannot_report_own_team')) return 'Tu ne peux pas signaler ta propre équipe.';
  if (message.includes('teams_name_check')) return 'Le nom d’équipe doit faire entre 2 et 24 caractères.';
  if (message.includes('area_too_large')) return 'Zoome un peu plus pour voir les territoires.';
  if (message.includes('not_authenticated')) return 'Connexion au serveur perdue. Relancez l’app.';
  if (/network|fetch/i.test(message)) return 'Pas de connexion internet.';
  return 'Une erreur est survenue. Réessayez.';
}
