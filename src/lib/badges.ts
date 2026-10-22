// Badges : des étapes à atteindre, calculées à partir de l'historique. Pur,
// testé avec `node --test`.
import { addDays, weekStart, type DayKey, type StepHistory } from './game.ts';

export type Badge = {
  id: string;
  title: string;
  description: string;
  /** Nom d'icône Ionicons. */
  icon: string;
  earned: boolean;
  /** Avancement de 0 à 1 (1 une fois obtenu). */
  progress: number;
};

type Stats = {
  goalDays: number;
  bestDay: number;
  bestWeek: number;
  total: number;
  bestStreak: number;
};

function stats(history: StepHistory, goal: number, bestStreak: number): Stats {
  const days = Object.keys(history);
  const weeks: Record<DayKey, number> = {};
  for (const day of days) {
    const week = weekStart(day);
    weeks[week] = (weeks[week] ?? 0) + history[day];
  }
  return {
    goalDays: days.filter((d) => history[d] >= goal).length,
    bestDay: Math.max(0, ...days.map((d) => history[d])),
    bestWeek: Math.max(0, ...Object.values(weeks)),
    total: days.reduce((sum, d) => sum + history[d], 0),
    bestStreak,
  };
}

const DEFINITIONS: {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  value: (s: Stats) => number;
}[] = [
  { id: 'first-goal', title: 'Premier objectif', description: 'Atteindre ton objectif une première fois', icon: 'checkmark-circle', target: 1, value: (s) => s.goalDays },
  { id: 'ten-k', title: 'Les 10 000', description: '10 000 pas en une journée', icon: 'footsteps', target: 10_000, value: (s) => s.bestDay },
  { id: 'streak-7', title: 'Une semaine', description: '7 jours de série', icon: 'flame', target: 7, value: (s) => s.bestStreak },
  { id: 'twenty-k', title: 'Grande marche', description: '20 000 pas en une journée', icon: 'trail-sign', target: 20_000, value: (s) => s.bestDay },
  { id: 'week-100k', title: 'Grosse semaine', description: '100 000 pas du lundi au dimanche', icon: 'calendar', target: 100_000, value: (s) => s.bestWeek },
  { id: 'streak-30', title: 'Un mois', description: '30 jours de série', icon: 'ribbon', target: 30, value: (s) => s.bestStreak },
  { id: 'million', title: 'Le million', description: '1 000 000 de pas au total', icon: 'trophy', target: 1_000_000, value: (s) => s.total },
];

export function computeBadges(history: StepHistory, goal: number, bestStreak: number): Badge[] {
  const s = stats(history, goal, bestStreak);
  return DEFINITIONS.map((d) => {
    const progress = Math.min(1, d.value(s) / d.target);
    return { id: d.id, title: d.title, description: d.description, icon: d.icon, earned: progress >= 1, progress };
  });
}

/** Badges obtenus aujourd'hui (absents de l'historique arrêté à hier) : à fêter. */
export function newBadges(history: StepHistory, goal: number, bestStreak: number, bestStreakYesterday: number, today: DayKey): Badge[] {
  const yesterday: StepHistory = {};
  for (const [day, steps] of Object.entries(history)) if (day <= addDays(today, -1)) yesterday[day] = steps;
  const before = new Set(computeBadges(yesterday, goal, bestStreakYesterday).filter((b) => b.earned).map((b) => b.id));
  return computeBadges(history, goal, bestStreak).filter((b) => b.earned && !before.has(b.id));
}
