// Conversion entre les lignes Supabase et les types de l'app. Pur, testé avec `node --test`.
import type { Challenge, DayKey, Friend, StepHistory, Team, TeamMember, TeamStanding } from './game.ts';
import type { Division, League, LeagueResult } from './league.ts';
import type { MapPlayer, PlayerCard } from './players.ts';

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
  status: 'pending' | 'accepted';
  stake: string | null;
};

export type LeagueRow = {
  week_start: DayKey;
  division: number;
  user_id: string;
  name: string;
  steps: number | string;
  league_position: number;
  members: number;
  is_me: boolean;
};

/** Lignes de `my_league`, déjà classées ; null si la réponse est vide. */
export function leagueFromRows(rows: LeagueRow[]): League | null {
  if (rows.length === 0) return null;
  return {
    division: Math.min(5, Math.max(1, rows[0].division)) as Division,
    weekStart: rows[0].week_start,
    entries: [...rows]
      .sort((a, b) => a.league_position - b.league_position)
      .map((r) => ({ id: r.user_id, name: r.name, steps: Number(r.steps), position: r.league_position, isMe: r.is_me })),
  };
}

export type LeagueResultRow = {
  week_start: DayKey;
  division: number;
  next_division: number;
  league_position: number;
  members: number;
  steps: number | string;
};

export function leagueResultFromRow(row: LeagueResultRow): LeagueResult {
  const level = (n: number) => Math.min(5, Math.max(1, n)) as Division;
  return {
    weekStart: row.week_start,
    division: level(row.division),
    nextDivision: level(row.next_division),
    position: row.league_position,
    members: row.members,
    steps: Number(row.steps),
  };
}

/** Un défi vu par `myId` : l'adversaire est l'autre participant, quel que soit le lanceur. */
export function challengeFromRow(row: ChallengeRow, myId: string): Challenge {
  return {
    id: row.id,
    opponentId: row.challenger_id === myId ? row.opponent_id : row.challenger_id,
    startDay: row.start_day,
    days: row.days,
    createdAt: row.created_at,
    status: row.status,
    incoming: row.challenger_id !== myId,
    stake: row.stake,
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

export type MapPlayerRow = {
  id: string;
  name: string;
  avatar: string;
  team_name: string | null;
  team_emoji: string | null;
  steps_today: number;
  goal_reached: boolean;
  is_friend: boolean;
  cell_q: number;
  cell_r: number;
  minutes_ago: number;
};

export function mapPlayerFromRow(row: MapPlayerRow): MapPlayer {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    teamName: row.team_name,
    teamEmoji: row.team_emoji,
    stepsToday: row.steps_today,
    goalReached: row.goal_reached,
    isFriend: row.is_friend,
    cell: { q: row.cell_q, r: row.cell_r },
    minutesAgo: row.minutes_ago,
  };
}

export type PlayerCardRow = {
  id: string;
  name: string;
  avatar: string;
  team_name: string | null;
  team_emoji: string | null;
  is_friend: boolean;
  steps_today: number;
  steps_week: number;
  best_day: number;
  streak: number;
  week_rank: number;
  week_players: number;
  duels_won: number;
  duels_lost: number;
  duels_tied: number;
};

export function playerCardFromRow(row: PlayerCardRow): PlayerCard {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    teamName: row.team_name,
    teamEmoji: row.team_emoji,
    isFriend: row.is_friend,
    stepsToday: row.steps_today,
    stepsWeek: row.steps_week,
    bestDay: row.best_day,
    streak: row.streak,
    weekRank: row.week_rank,
    weekPlayers: row.week_players,
    duelsWon: row.duels_won,
    duelsLost: row.duels_lost,
    duelsTied: row.duels_tied,
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
  if (message.includes('player_not_visible')) return 'Ce joueur n’est plus visible.';
  if (message.includes('challenge_not_found')) return 'Ce duel n’existe plus ou a déjà été accepté.';
  if (message.includes('challenges_stake_check')) return 'Le gage doit faire 60 caractères au plus.';
  if (message.includes('cannot_block_self') || message.includes('cannot_report_self')) return 'C’est toi !';
  if (message.includes('not_authenticated')) return 'Connexion au serveur perdue. Relancez l’app.';
  if (/expired|invalid.*(token|otp)|otp.*invalid/i.test(message)) return 'Code incorrect ou expiré. Vérifie-le ou demande un nouveau code.';
  if (/rate limit|security purposes|only request this/i.test(message)) return 'Trop de demandes. Réessaie dans quelques minutes.';
  if (/signups not allowed|user not found/i.test(message)) return 'Aucun compte n’utilise cette adresse.';
  if (/already (been )?registered|already exists|email_exists/i.test(message)) return 'Cette adresse est déjà liée à un autre compte.';
  if (/invalid.*email|email.*invalid|validate email/i.test(message)) return 'Cette adresse e-mail n’est pas valide.';
  if (/network|fetch/i.test(message)) return 'Pas de connexion internet.';
  return 'Une erreur est survenue. Réessayez.';
}
