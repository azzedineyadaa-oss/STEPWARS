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
 * Classe les joueurs par pas sur la période. Les ex æquo partagent le même rang
 * (classement « 1, 1, 3 »).
 */
export function buildLeaderboard(
  players: { id: string; name: string; avatar: string; history: StepHistory }[],
  days: DayKey[],
): LeaderboardEntry[] {
  const sorted = players
    .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, steps: sumSteps(p.history, days) }))
    .sort((a, b) => b.steps - a.steps || a.name.localeCompare(b.name));

  return sorted.map((p, i) => {
    const firstWithSameScore = sorted.findIndex((q) => q.steps === p.steps);
    return { ...p, rank: firstWithSameScore + 1, isMe: p.id === ME_ID };
  });
}

/** Ajoute un relevé de pas pour un jour sans jamais faire baisser le compteur. */
export function recordSteps(history: StepHistory, day: DayKey, steps: number): StepHistory {
  if ((history[day] ?? 0) >= steps) return history;
  return { ...history, [day]: steps };
}

/** Code ami lisible (6 caractères, sans 0/O/1/I ambigus). */
export function generateFriendCode(random: () => number = Math.random): string {
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
