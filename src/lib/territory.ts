// Règles de la conquête de territoire. Pur, testé avec `node --test`.
//
// Chaque pas compte pour la zone (hexagone) où il est fait. Pendant la guerre
// de la semaine, une zone appartient à l'équipe qui y a fait le plus de pas.
import { cellAt, cellKey, cellsAround, parseCellKey, type Cell, type LatLng } from './hex.ts';

/** Pas par zone puis par heure (début d'heure UTC, ISO) : `{ "12:-4": { "2026-10-21T18:00:00.000Z": 830 } }`. */
export type CellSteps = Record<string, Record<string, number>>;

export type Sample = { position: LatLng; time: number; steps: number };

/** Au-delà (≈ 16 km/h), on n'est plus à pied : vélo, voiture, transports. */
export const MAX_SPEED_MPS = 4.5;
/** Cadence maximale crédible (course rapide). */
const MAX_STEPS_PER_SECOND = 3.5;
/** Au-delà de cet écart entre deux positions, on ne sait pas où les pas ont été faits. */
const MAX_GAP_MS = 15 * 60_000;

function distance(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * Pas faits entre deux relevés (position + compteur de pas), attribués à la
 * zone du relevé le plus récent. Rien n'est compté trop vite ou après une longue pause.
 */
export function attributeSample(prev: Sample | null, cur: Sample): { key: string; steps: number } | null {
  if (!prev) return null;
  const dt = (cur.time - prev.time) / 1000;
  const delta = cur.steps - prev.steps;
  if (dt <= 0 || delta <= 0 || cur.time - prev.time > MAX_GAP_MS) return null;
  if (distance(prev.position, cur.position) / dt > MAX_SPEED_MPS) return null;
  return { key: cellKey(cellAt(cur.position)), steps: Math.min(delta, Math.floor(dt * MAX_STEPS_PER_SECOND)) };
}

export function hourBucket(time: number): string {
  return new Date(Math.floor(time / 3_600_000) * 3_600_000).toISOString();
}

export function addCellSteps(store: CellSteps, key: string, hour: string, steps: number): CellSteps {
  if (steps <= 0) return store;
  const hours = store[key] ?? {};
  return { ...store, [key]: { ...hours, [hour]: (hours[hour] ?? 0) + steps } };
}

/** Supprime les heures plus anciennes que `maxAgeHours` (le serveur les refuse). */
export function pruneCellSteps(store: CellSteps, now: number, maxAgeHours = 48): CellSteps {
  const oldest = hourBucket(now - maxAgeHours * 3_600_000);
  const pruned: CellSteps = {};
  for (const [key, hours] of Object.entries(store)) {
    const kept = Object.fromEntries(Object.entries(hours).filter(([hour]) => hour >= oldest));
    if (Object.keys(kept).length > 0) pruned[key] = kept;
  }
  return pruned;
}

export type CellUpload = { q: number; r: number; hour: string; steps: number };

/** Totaux (zone, heure) nouveaux ou en hausse depuis le dernier envoi. */
export function pendingCellUploads(store: CellSteps, uploaded: CellSteps): CellUpload[] {
  const pending: CellUpload[] = [];
  for (const [key, hours] of Object.entries(store)) {
    for (const [hour, steps] of Object.entries(hours)) {
      if (steps > (uploaded[key]?.[hour] ?? 0)) pending.push({ ...parseCellKey(key), hour, steps });
    }
  }
  return pending;
}

/** Total de mes pas par zone depuis `since` (ISO). */
export function myStepsByCell(store: CellSteps, since: string): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [key, hours] of Object.entries(store)) {
    const sum = Object.entries(hours).reduce((s, [hour, steps]) => (hour >= since ? s + steps : s), 0);
    if (sum > 0) totals[key] = sum;
  }
  return totals;
}

// --- Propriétaire d'une zone -------------------------------------------------

export type TeamRef = { id: string; name: string; emoji: string };

/** Une zone telle que le serveur la décrit. */
export type TerritoryCell = {
  key: string;
  /** Équipe en tête (données d'il y a plus d'une heure), ou null. */
  leader: (TeamRef & { steps: number }) | null;
  /** Pas de mon équipe dans la zone, à jour. */
  myTeamSteps: number;
};

export type CellOwner = TeamRef & { steps: number; isMine: boolean };

/**
 * Mon équipe voit ses propres pas sans délai : elle prend la zone dès
 * qu'elle dépasse l'équipe en tête.
 */
export function cellOwner(cell: TerritoryCell, myTeam: TeamRef | null): CellOwner | null {
  if (myTeam && cell.myTeamSteps > 0 && cell.myTeamSteps > (cell.leader?.id === myTeam.id ? 0 : (cell.leader?.steps ?? 0))) {
    return { ...myTeam, steps: cell.myTeamSteps, isMine: true };
  }
  if (!cell.leader) return null;
  return { ...cell.leader, isMine: cell.leader.id === myTeam?.id };
}

/** Nombre de zones tenues par équipe, du plus grand au plus petit. */
export function territoryStandings(owners: CellOwner[]): (TeamRef & { cells: number; isMine: boolean })[] {
  const byTeam = new Map<string, TeamRef & { cells: number; isMine: boolean }>();
  for (const o of owners) {
    const entry = byTeam.get(o.id) ?? { id: o.id, name: o.name, emoji: o.emoji, cells: 0, isMine: o.isMine };
    entry.cells++;
    byTeam.set(o.id, entry);
  }
  return [...byTeam.values()].sort((a, b) => b.cells - a.cells || a.name.localeCompare(b.name));
}

const RIVAL_COLORS = ['#8B6CFF', '#2EC4B6', '#FFC83D', '#FF4D9D', '#4DA3FF', '#9BE15D', '#B07CFF', '#FF9F6B'];
export const MY_TEAM_COLOR = '#FF5A36';

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Couleur stable d'une équipe sur la carte (la mienne toujours en orange). */
export function teamColor(teamId: string, isMine: boolean): string {
  return isMine ? MY_TEAM_COLOR : RIVAL_COLORS[hash(teamId) % RIVAL_COLORS.length];
}

// --- Démo ----------------------------------------------------------------------

/**
 * Territoire simulé autour du joueur : environ la moitié des zones tenues par
 * des équipes, réparties de façon stable pour la semaine.
 */
export function demoTerritory(
  center: Cell,
  week: string,
  rivals: TeamRef[],
  myTeam: TeamRef | null,
  myCellSteps: Record<string, number>,
  radius = 7,
): TerritoryCell[] {
  const teams = myTeam ? [...rivals, myTeam] : rivals;
  return cellsAround(center, radius).map((cell) => {
    const key = cellKey(cell);
    const h = hash(`${key}|${week}`);
    const held = h % 100 < 55;
    const team = teams[(h >>> 8) % teams.length];
    const steps = 400 + ((h >>> 16) % 4600);
    const leader = held && team.id !== myTeam?.id ? { ...team, steps } : null;
    const teamSteps = held && team.id === myTeam?.id ? steps : 0;
    return { key, leader, myTeamSteps: teamSteps + (myTeam ? (myCellSteps[key] ?? 0) : 0) };
  });
}

export type FriendOnMap = { id: string; name: string; avatar: string; cell: Cell; minutesAgo: number };

/** Amis simulés placés près du joueur. */
export function demoFriendsOnMap(center: Cell, friends: { id: string; name: string; avatar: string }[], hourSeed: string): FriendOnMap[] {
  return friends.map((f) => {
    const h = hash(`${f.id}|${hourSeed}`);
    return {
      ...f,
      cell: { q: center.q + ((h % 9) - 4), r: center.r + (((h >>> 8) % 9) - 4) },
      minutesAgo: (h >>> 16) % 25,
    };
  });
}
