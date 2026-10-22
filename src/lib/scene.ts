// Scène « L'ascension du jour » : le ciel suit l'heure et la progression du
// jour fait monter le marcheur sur le sentier, jusqu'au sommet à 100 %.
// Pur, testé avec `node --test`. Coordonnées dans une vue de 390 × 330.

export const SCENE_WIDTH = 390;
export const SCENE_HEIGHT = 330;

export type Sky = {
  top: string;
  bottom: string;
  /** Soleil (jour) ou lune (nuit). */
  body: { x: number; y: number; r: number; color: string };
  stars: boolean;
  /** Couleur des crêtes lointaines et proches. */
  far: string;
  near: string;
};

/** Ciel selon l'heure locale (0 à 23). */
export function skyFor(hour: number): Sky {
  if (hour >= 6 && hour < 10) {
    return { top: '#2B3A67', bottom: '#F2A07B', body: { x: 70, y: 150, r: 30, color: '#FFD3A8' }, stars: false, far: '#3A4677', near: '#2A3360' };
  }
  if (hour >= 10 && hour < 17) {
    return { top: '#2E6BB8', bottom: '#8FC3E8', body: { x: 334, y: 104, r: 28, color: '#FFE7A8' }, stars: false, far: '#4B6FA3', near: '#2F4C7D' };
  }
  if (hour >= 17 && hour < 21) {
    return { top: '#2A2350', bottom: '#F07E5A', body: { x: 320, y: 140, r: 34, color: '#FFB38A' }, stars: false, far: '#4A3866', near: '#2E2A52' };
  }
  return { top: '#0B1124', bottom: '#1F2A4D', body: { x: 332, y: 100, r: 20, color: '#E9E4D8' }, stars: true, far: '#26304F', near: '#1A2240' };
}

type Point = { x: number; y: number };

// Points de passage du sentier, du pied de la montagne au sommet.
const WAYPOINTS: Point[] = [
  { x: 28, y: 312 },
  { x: 92, y: 288 },
  { x: 146, y: 252 },
  { x: 168, y: 206 },
  { x: 192, y: 160 },
  { x: 204, y: 124 },
  { x: 214, y: 96 },
];

/** Sentier lissé (Catmull-Rom), échantillonné en petits segments. */
function sample(): Point[] {
  const pts: Point[] = [];
  const p = [WAYPOINTS[0], ...WAYPOINTS, WAYPOINTS[WAYPOINTS.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    for (let s = 0; s < 16; s++) {
      const t = s / 16;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ x: f(p[i - 1].x, p[i].x, p[i + 1].x, p[i + 2].x), y: f(p[i - 1].y, p[i].y, p[i + 1].y, p[i + 2].y) });
    }
  }
  pts.push(WAYPOINTS[WAYPOINTS.length - 1]);
  return pts;
}

const TRAIL = sample();
const LENGTHS = TRAIL.reduce<number[]>((acc, pt, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + Math.hypot(pt.x - TRAIL[i - 1].x, pt.y - TRAIL[i - 1].y));
  return acc;
}, []);
const TOTAL = LENGTHS[LENGTHS.length - 1];

export const SUMMIT: Point = WAYPOINTS[WAYPOINTS.length - 1];
export const TRAIL_START: Point = WAYPOINTS[0];

function clamp(progress: number) {
  return Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
}

/** Position sur le sentier pour une progression de 0 à 1 (au-delà : le sommet). */
export function pointAt(progress: number): Point {
  const target = clamp(progress) * TOTAL;
  for (let i = 1; i < TRAIL.length; i++) {
    if (LENGTHS[i] >= target) {
      const seg = LENGTHS[i] - LENGTHS[i - 1] || 1;
      const k = (target - LENGTHS[i - 1]) / seg;
      return { x: TRAIL[i - 1].x + (TRAIL[i].x - TRAIL[i - 1].x) * k, y: TRAIL[i - 1].y + (TRAIL[i].y - TRAIL[i - 1].y) * k };
    }
  }
  return SUMMIT;
}

const fmt = (n: number) => Math.round(n * 10) / 10;

/** Chemin SVG du sentier entier, ou de son début jusqu'à `progress`. */
export function trailPath(progress = 1): string {
  const target = clamp(progress) * TOTAL;
  const parts = [`M${fmt(TRAIL[0].x)} ${fmt(TRAIL[0].y)}`];
  for (let i = 1; i < TRAIL.length; i++) {
    if (LENGTHS[i] > target) {
      const end = pointAt(clamp(progress));
      parts.push(`L${fmt(end.x)} ${fmt(end.y)}`);
      return parts.join(' ');
    }
    parts.push(`L${fmt(TRAIL[i].x)} ${fmt(TRAIL[i].y)}`);
  }
  return parts.join(' ');
}

/** Étoiles fixes (mêmes positions à chaque affichage). */
export const STARS: Point[] = [
  { x: 24, y: 30 }, { x: 64, y: 82 }, { x: 118, y: 22 }, { x: 160, y: 60 }, { x: 236, y: 30 },
  { x: 262, y: 110 }, { x: 350, y: 26 }, { x: 372, y: 96 }, { x: 196, y: 14 }, { x: 90, y: 128 },
];
