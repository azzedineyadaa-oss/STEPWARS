import type { SupabaseClient } from '@supabase/supabase-js';

import { addDays, type Challenge, type DayKey, type Friend, type StepHistory } from '@/lib/game';
import {
  challengeFromRow,
  friendFromRow,
  friendlyError,
  groupSteps,
  type ChallengeRow,
  type ProfileRow,
  type StepsRow,
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
  /** Pas des amis, par identifiant. */
  friendSteps: Record<string, StepHistory>;
  /** Mes pas connus du serveur (pour restaurer l'historique). */
  mySteps: StepHistory;
};

/** Récupère tout ce que l'app affiche. `today` sert à borner l'historique demandé. */
export async function fetchSnapshot(db: SupabaseClient, myId: string, today: DayKey): Promise<Snapshot> {
  const [profile, friendRows, challengeRows] = await Promise.all([
    db.from('profiles').select('id, name, avatar, daily_goal, friend_code').eq('id', myId).single(),
    db.from('friendships').select('friend:profiles!friendships_friend_id_fkey(id, name, avatar)').eq('user_id', myId),
    db.from('challenges').select('id, challenger_id, opponent_id, start_day, days, created_at').order('created_at', { ascending: false }),
  ]).then(([p, f, c]) => [check(p), check(f), check(c)] as const);

  const friends = (friendRows as unknown as { friend: ProfileRow | null }[])
    .flatMap((r) => (r.friend ? [friendFromRow(r.friend)] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
  const challenges = (challengeRows as ChallengeRow[]).map((r) => challengeFromRow(r, myId));

  // 30 jours pour le classement, plus loin si un défi a commencé avant.
  const since = challenges.reduce((min, c) => (c.startDay < min ? c.startDay : min), addDays(today, -29));
  const stepRows = check(
    await db
      .from('daily_steps')
      .select('user_id, day, steps')
      .in('user_id', [myId, ...friends.map((f) => f.id)])
      .gte('day', since),
  ) as StepsRow[];
  const { [myId]: mySteps = {}, ...friendSteps } = groupSteps(stepRows);

  return { profile: profile as ProfileRow, friends, challenges, friendSteps, mySteps };
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

export async function deleteAccount(db: SupabaseClient): Promise<void> {
  check(await db.rpc('delete_account'));
  await db.auth.signOut({ scope: 'local' });
}
