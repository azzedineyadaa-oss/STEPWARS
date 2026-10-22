// Ligues hebdomadaires par niveau. Pur, testé avec `node --test`.
//
// Chaque semaine (lundi-dimanche), un joueur affronte jusqu'à 29 autres
// joueurs de son niveau. Les premiers montent d'un niveau, les derniers
// descendent. Les règles sont les mêmes que dans
// supabase/migrations/20261026000000_leagues.sql : garder les deux alignés.
import { addDays, demoStepsFor, sumSteps, type DayKey } from './game.ts';

export type Division = 1 | 2 | 3 | 4 | 5;

export const DIVISIONS: { level: Division; name: string }[] = [
  { level: 1, name: 'Sentier' },
  { level: 2, name: 'Chemin' },
  { level: 3, name: 'Route' },
  { level: 4, name: 'Col' },
  { level: 5, name: 'Sommet' },
];

export const LEAGUE_SIZE = 30;

export function divisionName(level: number): string {
  return DIVISIONS.find((d) => d.level === level)?.name ?? DIVISIONS[0].name;
}

/** Niveau d'un nouveau joueur, d'après sa moyenne de pas par jour. */
export function divisionForAverage(averageSteps: number): Division {
  if (averageSteps < 5000) return 1;
  if (averageSteps < 7500) return 2;
  if (averageSteps < 10000) return 3;
  if (averageSteps < 13000) return 4;
  return 5;
}

/** Nombre de joueurs qui montent (et qui descendent) : jusqu'à 5, aucun sous 4 joueurs. */
export function movementCount(members: number): number {
  return members < 4 ? 0 : Math.min(5, Math.floor(members / 4));
}

export type Zone = 'up' | 'stay' | 'down';

/** Zone d'une place (1 = premier) dans une ligue de `members` joueurs. */
export function zoneFor(position: number, members: number, division: number): Zone {
  const count = movementCount(members);
  if (position <= count && division < 5) return 'up';
  if (position > members - count && division > 1) return 'down';
  return 'stay';
}

/** Niveau de la semaine suivante. */
export function nextDivision(division: number, position: number, members: number): Division {
  const zone = zoneFor(position, members, division);
  const next = zone === 'up' ? division + 1 : zone === 'down' ? division - 1 : division;
  return Math.min(5, Math.max(1, next)) as Division;
}

export type LeagueEntry = { id: string; name: string; steps: number; position: number; isMe: boolean };

export type League = {
  /** Mon niveau (celui qui monte ou descend). */
  division: Division;
  weekStart: DayKey;
  entries: LeagueEntry[];
};

/** Classe par pas décroissants ; à égalité, l'ordre fourni départage (arrivée dans la ligue). */
export function rankLeague(players: { id: string; name: string; steps: number }[], meId: string): LeagueEntry[] {
  return players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.steps - a.p.steps || a.i - b.i)
    .map(({ p }, i) => ({ id: p.id, name: p.name, steps: p.steps, position: i + 1, isMe: p.id === meId }));
}

export type LeagueTarget =
  | { kind: 'escape'; steps: number }
  | { kind: 'promote'; steps: number }
  | { kind: 'overtake'; steps: number; name: string }
  | { kind: 'lead'; steps: number }
  | { kind: 'alone' };

/** Prochain objectif à afficher : sortir de la zone de descente, entrer dans celle de montée, etc. */
export function leagueTarget(league: League): LeagueTarget | null {
  const { entries, division } = league;
  const me = entries.find((e) => e.isMe);
  if (!me) return null;
  if (entries.length < 2) return { kind: 'alone' };
  const count = movementCount(entries.length);
  const zone = zoneFor(me.position, entries.length, division);
  // Pas pour dépasser le joueur à la place `position` (une place devant lui).
  const gapTo = (position: number) => entries[position - 1].steps - me.steps + 1;

  if (zone === 'down') return { kind: 'escape', steps: gapTo(entries.length - count) };
  if (zone === 'stay' && count > 0 && division < 5) return { kind: 'promote', steps: gapTo(count) };
  if (me.position > 1) {
    const ahead = entries[me.position - 2];
    return { kind: 'overtake', steps: gapTo(me.position - 1), name: ahead.name };
  }
  return { kind: 'lead', steps: me.steps - entries[1].steps };
}

// --- Démo ---------------------------------------------------------------------

const DEMO_NAMES = [
  'Camille', 'Nadia', 'Julien', 'Sofia', 'Mehdi', 'Chloé', 'Thomas', 'Inès', 'Karim', 'Léa',
  'Hugo', 'Yasmine', 'Lucas', 'Nora', 'Amine', 'Manon', 'Rayan', 'Clara', 'Bilal',
];

/**
 * Ligue simulée de 20 joueurs autour de ma moyenne. Les pas sont
 * déterministes : mêmes adversaires et mêmes chiffres à chaque lancement.
 */
export function demoLeague(
  me: { id: string; name: string },
  myHistory: Record<DayKey, number>,
  today: DayKey,
  weekStart: DayKey,
  dayProgress: number,
): League {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d <= today);
  const lastWeek = Array.from({ length: 7 }, (_, i) => addDays(today, -7 + i));
  const average = sumSteps(myHistory, lastWeek) / 7;
  const division = divisionForAverage(average);
  // Adversaires centrés sur ma moyenne (demoStepsFor tourne autour de 7 000 pas par jour).
  const scale = Math.max(3000, average) / 7000;
  const players = DEMO_NAMES.map((name, i) => {
    const id = `demo-league-${i}`;
    const steps = days.reduce(
      (sum, day) => sum + Math.round(demoStepsFor(id, day, day === today ? dayProgress : 1) * scale),
      0,
    );
    return { id, name, steps };
  });
  players.push({ id: me.id, name: me.name, steps: sumSteps(myHistory, days) });
  return { division, weekStart, entries: rankLeague(players, me.id) };
}
