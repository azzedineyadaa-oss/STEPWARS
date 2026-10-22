import type { SupabaseClient } from '@supabase/supabase-js';

import {
  addDays,
  weekStart,
  type Challenge,
  type DayKey,
  type Friend,
  type StepHistory,
  type Team,
  type TeamMember,
  type TeamStanding,
} from '@/lib/game';
import type { Cell } from '@/lib/hex';
import type { League, LeagueResult } from '@/lib/league';
import type { MapPlayer, MapVisibility, PlayerCard } from '@/lib/players';
import {
  challengeFromRow,
  friendFromRow,
  friendlyError,
  groupSteps,
  leagueFromRows,
  leagueResultFromRow,
  teamFromRow,
  teamMemberFromRow,
  teamStandingFromRow,
  mapPlayerFromRow,
  playerCardFromRow,
  type ChallengeRow,
  type LeagueResultRow,
  type LeagueRow,
  type MapPlayerRow,
  type PlayerCardRow,
  type ProfileRow,
  type StepsRow,
  type TeamRow,
  type TeamStandingRow,
} from '@/lib/remote';

export class ApiError extends Error {}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new ApiError(friendlyError(result.error.message));
  return result.data;
}

const CHALLENGE_COLUMNS = 'id, challenger_id, opponent_id, start_day, days, created_at, status, stake';

/** Ouvre (ou reprend) une session. Le compte est anonyme : aucun e-mail demandé. */
export async function ensureSession(db: SupabaseClient): Promise<string> {
  const { data } = await db.auth.getSession();
  if (data.session) return data.session.user.id;
  const signIn = check(await db.auth.signInAnonymously());
  if (!signIn.user) throw new ApiError(friendlyError(undefined));
  return signIn.user.id;
}

/** Adresse e-mail du compte, ou null tant qu'il est anonyme. */
export async function currentEmail(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.auth.getSession();
  return data.session?.user.email || null;
}

/**
 * Sauvegarde du compte anonyme : envoie un code à 6 chiffres à `email`.
 * Le compte (pas, amis, duels) reste le même, il gagne juste une adresse.
 */
export async function requestEmailLink(db: SupabaseClient, email: string): Promise<void> {
  const { error } = await db.auth.updateUser({ email: email.trim().toLowerCase() });
  if (error) throw new ApiError(friendlyError(error.message));
}

export async function confirmEmailLink(db: SupabaseClient, email: string, code: string): Promise<void> {
  check(await db.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email_change' }));
}

/** Nouveau téléphone : envoie un code de connexion, sans jamais créer de compte. */
export async function requestLoginCode(db: SupabaseClient, email: string): Promise<void> {
  check(await db.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } }));
}

/** Remplace la session en cours par celle du compte retrouvé ; renvoie son identifiant. */
export async function confirmLoginCode(db: SupabaseClient, email: string, code: string): Promise<string> {
  const { user } = check(await db.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' }));
  if (!user) throw new ApiError(friendlyError(undefined));
  return user.id;
}

export type Snapshot = {
  profile: ProfileRow;
  friends: Friend[];
  challenges: Challenge[];
  team: Team | null;
  teamMembers: TeamMember[];
  /** Classement des équipes pour la semaine en cours. */
  teamBoard: TeamStanding[];
  /** Pas des autres joueurs visibles (amis et coéquipiers), par identifiant. */
  playerSteps: Record<string, StepHistory>;
  /** Mes pas connus du serveur (pour restaurer l'historique). */
  mySteps: StepHistory;
};

const PROFILE_COLUMNS = 'id, name, avatar, daily_goal, friend_code, team_id, team_joined_on';

/** Récupère tout ce que l'app affiche. `today` (jour local) borne l'historique et la semaine de guerre. */
export async function fetchSnapshot(db: SupabaseClient, myId: string, today: DayKey): Promise<Snapshot> {
  const week = weekStart(today);
  const [profileRow, friendRows, challengeRows, boardRows] = await Promise.all([
    db.from('profiles').select(PROFILE_COLUMNS).eq('id', myId).single(),
    db.from('friendships').select('friend:profiles!friendships_friend_id_fkey(id, name, avatar)').eq('user_id', myId),
    db.from('challenges').select(CHALLENGE_COLUMNS).order('created_at', { ascending: false }),
    db.rpc('team_leaderboard', { from_day: week, to_day: addDays(week, 6) }),
  ]).then(([p, f, c, b]) => [check(p), check(f), check(c), check(b)] as const);

  const profile = profileRow as ProfileRow;
  const friends = (friendRows as unknown as { friend: ProfileRow | null }[])
    .flatMap((r) => (r.friend ? [friendFromRow(r.friend)] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
  const challenges = (challengeRows as ChallengeRow[]).map((r) => challengeFromRow(r, myId));
  const teamBoard = (boardRows as TeamStandingRow[]).map(teamStandingFromRow);

  let team: Team | null = null;
  let teamMembers: TeamMember[] = [];
  if (profile.team_id) {
    const [teamRow, memberRows] = await Promise.all([
      db.from('teams').select('id, name, emoji, code').eq('id', profile.team_id).single(),
      db.from('profiles').select('id, name, avatar, team_joined_on').eq('team_id', profile.team_id),
    ]).then(([t, m]) => [check(t), check(m)] as const);
    team = teamFromRow(teamRow as TeamRow);
    teamMembers = (memberRows as ProfileRow[]).map(teamMemberFromRow);
  }

  // 30 jours pour le classement, plus loin si un défi a commencé avant.
  const since = challenges.reduce((min, c) => (c.startDay < min ? c.startDay : min), addDays(today, -29));
  const playerIds = [...new Set([myId, ...friends.map((f) => f.id), ...teamMembers.map((m) => m.id)])];
  const stepRows = check(
    await db.from('daily_steps').select('user_id, day, steps').in('user_id', playerIds).gte('day', since),
  ) as StepsRow[];
  const { [myId]: mySteps = {}, ...playerSteps } = groupSteps(stepRows);

  return { profile, friends, challenges, team, teamMembers, teamBoard, playerSteps, mySteps };
}

/** Ma ligue de la semaine ; le serveur m'y place au premier appel de la semaine. */
export async function fetchLeague(db: SupabaseClient, today: DayKey): Promise<League | null> {
  return leagueFromRows(check(await db.rpc('my_league', { day: today })) as LeagueRow[]);
}

/** Bilan de ma ligue pour la semaine qui contient `week` ; null si je n'y jouais pas. */
export async function fetchLeagueResult(db: SupabaseClient, week: DayKey): Promise<LeagueResult | null> {
  const rows = check(await db.rpc('my_league_result', { week })) as LeagueResultRow[];
  return rows.length > 0 ? leagueResultFromRow(rows[0]) : null;
}

export async function updateProfile(
  db: SupabaseClient,
  myId: string,
  patch: { name?: string; avatar?: string; daily_goal?: number },
): Promise<void> {
  check(await db.from('profiles').update(patch).eq('id', myId));
}

export async function uploadSteps(db: SupabaseClient, entries: { day: DayKey; steps: number }[]): Promise<void> {
  if (entries.length === 0) return;
  check(await db.rpc('record_steps', { entries }));
}

export async function addFriend(db: SupabaseClient, code: string): Promise<Friend> {
  const rows = check(await db.rpc('add_friend', { code })) as ProfileRow[];
  return friendFromRow(rows[0]);
}

export async function removeFriend(db: SupabaseClient, friendId: string): Promise<void> {
  check(await db.rpc('remove_friend', { friend: friendId }));
}

/** Lance un duel : il attend que l'adversaire l'accepte. */
export async function createChallenge(
  db: SupabaseClient,
  myId: string,
  opponentId: string,
  startDay: DayKey,
  days: number,
  stake: string | null = null,
): Promise<Challenge> {
  const row = check(
    await db
      .from('challenges')
      .insert({ challenger_id: myId, opponent_id: opponentId, start_day: startDay, days, stake: stake?.trim() || null })
      .select(CHALLENGE_COLUMNS)
      .single(),
  ) as ChallengeRow;
  return challengeFromRow(row, myId);
}

/** Accepte un duel reçu ; renvoie son premier jour (aujourd'hui s'il a été lancé avant). */
export async function acceptChallenge(db: SupabaseClient, id: string, today: DayKey): Promise<DayKey> {
  const rows = check(await db.rpc('accept_challenge', { challenge: id, day: today })) as { start_day: DayKey }[];
  return rows[0].start_day;
}

/** Supprime un duel : l'annuler, le refuser ou l'effacer une fois terminé. */
export async function deleteChallenge(db: SupabaseClient, id: string): Promise<void> {
  check(await db.from('challenges').delete().eq('id', id));
}

export async function createTeam(db: SupabaseClient, name: string, emoji: string): Promise<Team> {
  const rows = check(await db.rpc('create_team', { team_name: name, team_emoji: emoji })) as TeamRow[];
  return teamFromRow(rows[0]);
}

export async function joinTeam(db: SupabaseClient, code: string): Promise<Team> {
  const rows = check(await db.rpc('join_team', { team_code: code })) as TeamRow[];
  return teamFromRow(rows[0]);
}

export async function leaveTeam(db: SupabaseClient): Promise<void> {
  check(await db.rpc('leave_team'));
}

export async function reportTeam(db: SupabaseClient, teamId: string): Promise<void> {
  check(await db.rpc('report_team', { team: teamId }));
}

// --- Carte ---------------------------------------------------------------------

export async function setMapVisibility(db: SupabaseClient, mode: MapVisibility): Promise<void> {
  check(await db.rpc('set_map_visibility', { mode }));
}

/** Sans effet en mode fantôme (vérifié par le serveur). */
export async function updateMyLocation(db: SupabaseClient, cell: Cell): Promise<void> {
  check(await db.rpc('update_my_location', { q: cell.q, r: cell.r }));
}

export async function fetchPlayersOnMap(db: SupabaseClient, today: DayKey): Promise<MapPlayer[]> {
  const rows = check(await db.rpc('players_on_map', { day: today })) as MapPlayerRow[];
  return rows.map(mapPlayerFromRow);
}

export async function fetchPlayerCard(db: SupabaseClient, playerId: string, today: DayKey): Promise<PlayerCard> {
  const rows = check(await db.rpc('player_card', { player: playerId, day: today })) as PlayerCardRow[];
  return playerCardFromRow(rows[0]);
}

export async function blockPlayer(db: SupabaseClient, playerId: string): Promise<void> {
  check(await db.rpc('block_player', { player: playerId }));
}

export async function reportPlayer(db: SupabaseClient, playerId: string): Promise<void> {
  check(await db.rpc('report_player', { player: playerId }));
}

export async function deleteAccount(db: SupabaseClient): Promise<void> {
  check(await db.rpc('delete_account'));
  await db.auth.signOut({ scope: 'local' });
}
