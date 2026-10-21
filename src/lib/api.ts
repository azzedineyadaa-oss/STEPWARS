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
import {
  challengeFromRow,
  friendFromRow,
  friendlyError,
  groupSteps,
  teamFromRow,
  teamMemberFromRow,
  teamStandingFromRow,
  type ChallengeRow,
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

/** Ouvre (ou reprend) une session. Le compte est anonyme : aucun e-mail demandé. */
export async function ensureSession(db: SupabaseClient): Promise<string> {
  const { data } = await db.auth.getSession();
  if (data.session) return data.session.user.id;
  const signIn = check(await db.auth.signInAnonymously());
  if (!signIn.user) throw new ApiError(friendlyError(undefined));
  return signIn.user.id;
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
    db.from('challenges').select('id, challenger_id, opponent_id, start_day, days, created_at').order('created_at', { ascending: false }),
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

export async function createChallenge(
  db: SupabaseClient,
  myId: string,
  opponentId: string,
  startDay: DayKey,
  days: number,
): Promise<Challenge> {
  const row = check(
    await db
      .from('challenges')
      .insert({ challenger_id: myId, opponent_id: opponentId, start_day: startDay, days })
      .select('id, challenger_id, opponent_id, start_day, days, created_at')
      .single(),
  ) as ChallengeRow;
  return challengeFromRow(row, myId);
}

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

export async function deleteAccount(db: SupabaseClient): Promise<void> {
  check(await db.rpc('delete_account'));
  await db.auth.signOut({ scope: 'local' });
}
