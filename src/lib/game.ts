// Logique de jeu pure (sans React ni API native) : dates, défis, classement.
// Gardée sans dépendance pour être testable directement avec `node --test`.

/** Jour local au format AAAA-MM-JJ. */
export type DayKey = string;

/** Pas par jour pour un joueur. */
export type StepHistory = Record<DayKey, number>;

export type Friend = {
  id: string;
  name: string;
  avatar: string;
};

export type Challenge = {
  id: string;
  opponentId: string;
  /** Premier jour compté (inclus). */
  startDay: DayKey;
  /** Durée en jours. */
  days: number;
  createdAt: string;
};

export type ChallengeStatus = 'upcoming' | 'active' | 'finished';

export type ChallengeResult = {
  status: ChallengeStatus;
  myTotal: number;
  opponentTotal: number;
  /** 'me', 'opponent', 'tie' ; null tant que le défi n'est pas terminé. */
  winner: 'me' | 'opponent' | 'tie' | null;
  /** Jours écoulés dans le défi (0 si à venir). */
  daysElapsed: number;
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  avatar: string;
  steps: number;
  rank: number;
  isMe: boolean;
};

export const ME_ID = 'me';

export function toDayKey(date: Date): DayKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DayKey, n: number): DayKey {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + n);
  return toDayKey(date);
}

/** Liste des `count` jours se terminant par `endDay` (inclus), du plus ancien au plus récent. */
export function lastDays(endDay: DayKey, count: number): DayKey[] {
  return Array.from({ length: count }, (_, i) => addDays(endDay, i - count + 1));
}

export function sumSteps(history: StepHistory, days: DayKey[]): number {
  return days.reduce((total, day) => total + (history[day] ?? 0), 0);
}

export function challengeDays(challenge: Challenge): DayKey[] {
  return Array.from({ length: challenge.days }, (_, i) => addDays(challenge.startDay, i));
}

export function evaluateChallenge(
  challenge: Challenge,
  today: DayKey,
  myHistory: StepHistory,
  opponentHistory: StepHistory,
): ChallengeResult {
  const days = challengeDays(challenge);
  const lastDay = days[days.length - 1];

  let status: ChallengeStatus;
  if (today < challenge.startDay) status = 'upcoming';
  else if (today > lastDay) status = 'finished';
  else status = 'active';

  // Seuls les jours déjà commencés comptent.
  const counted = days.filter((day) => day <= today);
  const myTotal = sumSteps(myHistory, counted);
  const opponentTotal = sumSteps(opponentHistory, counted);

  let winner: ChallengeResult['winner'] = null;
  if (status === 'finished') {
    if (myTotal > opponentTotal) winner = 'me';
    else if (myTotal < opponentTotal) winner = 'opponent';
    else winner = 'tie';
  }

  return { status, myTotal, opponentTotal, winner, daysElapsed: counted.length };
}

/**
 * Classe par score décroissant, puis par nom. Les ex æquo partagent le même
 * rang (classement « 1, 1, 3 »).
 */
export function rankByScore<T extends { name: string; steps: number }>(items: T[]): (T & { rank: number })[] {
  const sorted = [...items].sort((a, b) => b.steps - a.steps || a.name.localeCompare(b.name));
  return sorted.map((item) => ({ ...item, rank: sorted.findIndex((q) => q.steps === item.steps) + 1 }));
}

/** Classe les joueurs par pas sur la période. */
export function buildLeaderboard(
  players: { id: string; name: string; avatar: string; history: StepHistory }[],
  days: DayKey[],
): LeaderboardEntry[] {
  return rankByScore(
    players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, steps: sumSteps(p.history, days) })),
  ).map((p) => ({ ...p, isMe: p.id === ME_ID }));
}

// --- Séries -----------------------------------------------------------------

export type Streak = {
  /** Jours d'affilée avec l'objectif atteint, en comptant aujourd'hui s'il est atteint. */
  current: number;
  best: number;
  todayDone: boolean;
};

/**
 * La série reste vivante tant que la journée n'est pas finie : si l'objectif
 * n'est pas encore atteint aujourd'hui, on compte la série jusqu'à hier.
 */
export function computeStreak(history: StepHistory, goal: number, today: DayKey): Streak {
  const done = (day: DayKey) => (history[day] ?? 0) >= goal;
  const todayDone = done(today);

  let current = 0;
  for (let day = todayDone ? today : addDays(today, -1); done(day); day = addDays(day, -1)) current++;

  let best = current;
  let run = 0;
  let previous: DayKey | null = null;
  for (const day of Object.keys(history).filter(done).sort()) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  return { current, best, todayDone };
}

// --- Guerre d'équipes -------------------------------------------------------
// Une guerre dure une semaine, du lundi au dimanche (jours locaux).

export type Team = { id: string; name: string; emoji: string; code: string };

export type TeamMember = {
  id: string;
  name: string;
  avatar: string;
  /** Jour d'arrivée dans l'équipe : seuls les pas à partir de ce jour comptent. */
  joinedOn: DayKey;
};

export type TeamStanding = { id: string; name: string; emoji: string; members: number; steps: number };

export function weekStart(day: DayKey): DayKey {
  const weekday = fromDayKey(day).getDay(); // 0 = dimanche
  return addDays(day, -((weekday + 6) % 7));
}

export function weekDays(day: DayKey): DayKey[] {
  const start = weekStart(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Temps restant avant la fin de la guerre (lundi suivant à minuit, heure locale). */
export function warTimeLeft(now: Date): { days: number; hours: number; minutes: number } {
  const end = fromDayKey(addDays(weekStart(toDayKey(now)), 7));
  const totalMinutes = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 60_000));
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60,
  };
}

/** Pas d'un membre qui comptent pour l'équipe sur la période. */
export function memberContribution(history: StepHistory, days: DayKey[], joinedOn: DayKey): number {
  return sumSteps(history, days.filter((day) => day >= joinedOn));
}

/** Équipe juste devant la mienne et écart à combler (null si je suis premier). */
export function nextTarget(
  ranked: (TeamStanding & { rank: number })[],
  myTeamId: string,
): { team: TeamStanding & { rank: number }; gap: number } | null {
  const mine = ranked.find((t) => t.id === myTeamId);
  if (!mine) return null;
  const ahead = ranked.filter((t) => t.steps > mine.steps);
  if (ahead.length === 0) return null;
  const team = ahead[ahead.length - 1];
  return { team, gap: team.steps - mine.steps + 1 };
}

/** Ajoute un relevé de pas pour un jour sans jamais faire baisser le compteur. */
export function recordSteps(history: StepHistory, day: DayKey, steps: number): StepHistory {
  if ((history[day] ?? 0) >= steps) return history;
  return { ...history, [day]: steps };
}

/** Code ami ou d'équipe lisible (6 caractères, sans 0/O/1/I ambigus). */
export function generateCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
}

// --- Données de démonstration ---------------------------------------------
// En attendant un backend, les amis ont des pas simulés de façon déterministe :
// mêmes valeurs à chaque lancement pour un ami et un jour donnés.

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pas simulés d'un ami pour un jour. Pour le jour en cours, `dayProgress`
 * (0 à 1) représente la part de la journée écoulée.
 */
export function demoStepsFor(friendId: string, day: DayKey, dayProgress = 1): number {
  const base = 4000 + (hash(friendId) % 6000);
  const variation = (hash(`${friendId}:${day}`) % 5000) - 2500;
  return Math.max(0, Math.round((base + variation) * dayProgress));
}

export function demoHistory(friendId: string, days: DayKey[], today: DayKey, dayProgress: number): StepHistory {
  const history: StepHistory = {};
  for (const day of days) {
    if (day > today) continue;
    history[day] = demoStepsFor(friendId, day, day === today ? dayProgress : 1);
  }
  return history;
}

export const DEMO_FRIENDS: Friend[] = [
  { id: 'demo-lina', name: 'Lina', avatar: '🦊' },
  { id: 'demo-yanis', name: 'Yanis', avatar: '🐺' },
  { id: 'demo-sarah', name: 'Sarah', avatar: '🐯' },
];

export const DEMO_TEAM_MEMBERS = 4;

/** Équipes adverses simulées pour la guerre en mode démo. */
export const DEMO_RIVALS: { id: string; name: string; emoji: string; members: number }[] = [
  { id: 'demo-team-gazelles', name: 'Les Gazelles', emoji: '🦌', members: 5 },
  { id: 'demo-team-bitume', name: 'Team Bitume', emoji: '🛹', members: 4 },
  { id: 'demo-team-dimanche', name: 'Marcheurs du Dimanche', emoji: '🥾', members: 6 },
  { id: 'demo-team-escargots', name: 'Escargots Turbo', emoji: '🐌', members: 3 },
];

/** Total simulé d'une équipe adverse sur la période. */
export function demoTeamSteps(team: { id: string; members: number }, days: DayKey[], today: DayKey, dayProgress: number): number {
  let total = 0;
  for (let i = 0; i < team.members; i++) {
    total += sumSteps(demoHistory(`${team.id}-${i}`, days, today, dayProgress), days);
  }
  return total;
}
