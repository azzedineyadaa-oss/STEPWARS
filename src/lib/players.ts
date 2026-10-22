// Joueurs sur la carte et fiches joueur. Pur, testé avec `node --test`.
import { demoStepsFor, type DayKey } from './game.ts';
import { cellCenter, distanceMeters, type Cell } from './hex.ts';

export type MapVisibility = 'ghost' | 'friends' | 'public';

export type MapPlayer = {
  id: string;
  name: string;
  avatar: string;
  teamName: string | null;
  teamEmoji: string | null;
  stepsToday: number;
  goalReached: boolean;
  isFriend: boolean;
  /** Zone exacte pour un ami, bloc arrondi (≈ 600 m) pour un inconnu. */
  cell: Cell;
  minutesAgo: number;
};

export type PlayerCard = {
  id: string;
  name: string;
  avatar: string;
  teamName: string | null;
  teamEmoji: string | null;
  isFriend: boolean;
  stepsToday: number;
  stepsWeek: number;
  bestDay: number;
  streak: number;
  weekRank: number;
  weekPlayers: number;
  duelsWon: number;
  duelsLost: number;
  duelsTied: number;
};

/** Même arrondi que le serveur pour les inconnus : centre d'un bloc de 3 × 3 zones. */
export function coarseCell({ q, r }: Cell): Cell {
  return { q: Math.floor(q / 3) * 3 + 1, r: Math.floor(r / 3) * 3 + 1 };
}

/** Pourcentage de victoires (égalités exclues), ou null sans duel terminé. */
export function winRate(card: Pick<PlayerCard, 'duelsWon' | 'duelsLost'>): number | null {
  const played = card.duelsWon + card.duelsLost;
  return played === 0 ? null : Math.round((card.duelsWon / played) * 100);
}

export function rankLabel(rank: number): string {
  return rank === 1 ? '1er' : `${rank}ᵉ`;
}

/** « Top 3 % » à partir du rang et du nombre de joueurs. */
export function topPercent(rank: number, players: number): number {
  return Math.min(100, Math.max(1, Math.ceil((rank / Math.max(players, 1)) * 100)));
}

/** Distance lisible entre deux zones, volontairement approximative. */
export function distanceLabel(from: Cell, to: Cell): string {
  const meters = distanceMeters(cellCenter(from), cellCenter(to));
  if (meters < 350) return 'tout près';
  if (meters < 1000) return `à ~${Math.round(meters / 100) * 100} m`;
  return `à ~${(Math.round(meters / 500) / 2).toLocaleString('fr-FR')} km`;
}

/** Joueur avec le plus de pas aujourd'hui (pour la couronne), ou null. */
export function dayLeader(players: Pick<MapPlayer, 'id' | 'stepsToday'>[]): string | null {
  const top = players.reduce<Pick<MapPlayer, 'id' | 'stepsToday'> | null>(
    (best, p) => (p.stepsToday > (best?.stepsToday ?? 0) ? p : best),
    null,
  );
  return top?.id ?? null;
}

// --- Démo ----------------------------------------------------------------------

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const DEMO_STRANGERS = [
  { name: 'Inès', avatar: '🦄' },
  { name: 'Karim', avatar: '🦁' },
  { name: 'Manon', avatar: '🐼' },
  { name: 'Théo', avatar: '🐸' },
  { name: 'Yasmine', avatar: '🦉' },
  { name: 'Lucas', avatar: '🐻' },
  { name: 'Nora', avatar: '🐙' },
  { name: 'Hugo', avatar: '🐵' },
];
const DEMO_TEAMS = [
  { name: 'Les Gazelles', emoji: '🦌' },
  { name: 'Team Bitume', emoji: '🛹' },
  null,
  { name: 'Marcheurs du Dimanche', emoji: '🥾' },
];

/**
 * Joueurs simulés autour de `center`, comme le serveur les renverrait :
 * les amis partout, les inconnus seulement si je suis moi-même public.
 */
export function demoPlayersAround(
  center: Cell,
  friends: { id: string; name: string; avatar: string }[],
  visibility: MapVisibility,
  today: DayKey,
  dayProgress: number,
  hourSeed: string,
): MapPlayer[] {
  const place = (id: string, spread: number): Cell => {
    const h = hash(`${id}|${hourSeed}`);
    return { q: center.q + ((h % (2 * spread + 1)) - spread), r: center.r + (((h >>> 8) % (2 * spread + 1)) - spread) };
  };
  const player = (id: string, name: string, avatar: string, isFriend: boolean, cell: Cell): MapPlayer => {
    const h = hash(id);
    const team = DEMO_TEAMS[h % DEMO_TEAMS.length];
    const stepsToday = demoStepsFor(id, today, dayProgress);
    return {
      id,
      name,
      avatar,
      teamName: team?.name ?? null,
      teamEmoji: team?.emoji ?? null,
      stepsToday,
      goalReached: stepsToday >= 8000,
      isFriend,
      cell,
      minutesAgo: (hash(`${id}|${hourSeed}|t`) % 25) + 1,
    };
  };
  const friendPlayers = friends.map((f) => player(f.id, f.name, f.avatar, true, place(f.id, 4)));
  if (visibility !== 'public') return friendPlayers;
  const strangers = DEMO_STRANGERS.map((s, i) => {
    const id = `demo-stranger-${i}`;
    return player(id, s.name, s.avatar, false, coarseCell(place(id, 6)));
  });
  return [...friendPlayers, ...strangers];
}

/** Fiche simulée, cohérente avec les pas du joueur sur la carte. */
export function demoPlayerCard(p: Pick<MapPlayer, 'id' | 'name' | 'avatar' | 'teamName' | 'teamEmoji' | 'isFriend' | 'stepsToday'>): PlayerCard {
  const h = hash(`card|${p.id}`);
  const stepsWeek = p.stepsToday + 30000 + (h % 35000);
  const weekPlayers = 1200 + ((h >>> 4) % 3000);
  return {
    ...p,
    stepsWeek,
    bestDay: Math.max(p.stepsToday, 9000 + ((h >>> 8) % 9000)),
    streak: (h >>> 12) % 15,
    weekRank: 1 + ((h >>> 16) % Math.floor(weekPlayers / 3)),
    weekPlayers,
    duelsWon: (h >>> 20) % 12,
    duelsLost: (h >>> 24) % 8,
    duelsTied: (h >>> 28) % 3,
  };
}
