// Grille d'hexagones mondiale pour la conquête de territoire. Pur (sans import),
// testé avec `node --test`, et identique sur tous les téléphones : une zone a
// le même identifiant pour tout le monde.
//
// Les hexagones (pointe en haut, coordonnées axiales q/r) sont posés sur la
// projection Web Mercator, celle des cartes. Leur taille réelle varie donc
// avec la latitude : environ 210 m de large à Paris, 310 m à l'équateur.

export type LatLng = { latitude: number; longitude: number };
export type Cell = { q: number; r: number };

const EARTH_RADIUS = 6378137;
/** Distance centre-sommet, en mètres Mercator. */
export const HEX_SIZE = 180;
const SQRT3 = Math.sqrt(3);
const MAX_LATITUDE = 85;

function toMercator({ latitude, longitude }: LatLng): { x: number; y: number } {
  const lat = (Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude)) * Math.PI) / 180;
  return {
    x: (EARTH_RADIUS * longitude * Math.PI) / 180,
    y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + lat / 2)),
  };
}

function fromMercator(x: number, y: number): LatLng {
  return {
    latitude: ((2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180) / Math.PI,
    longitude: ((x / EARTH_RADIUS) * 180) / Math.PI,
  };
}

/** Arrondi d'une position fractionnaire à l'hexagone le plus proche. */
function roundCell(q: number, r: number): Cell {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // `+ 0` évite les -0, pour que les identifiants restent stables.
  return { q: rq + 0, r: rr + 0 };
}

export function cellAt(position: LatLng): Cell {
  const { x, y } = toMercator(position);
  return roundCell(((SQRT3 / 3) * x - y / 3) / HEX_SIZE, ((2 / 3) * y) / HEX_SIZE);
}

export function cellCenter({ q, r }: Cell): LatLng {
  return fromMercator(HEX_SIZE * SQRT3 * (q + r / 2), HEX_SIZE * 1.5 * r);
}

/** Les 6 sommets de l'hexagone, à dessiner sur la carte. */
export function cellBoundary({ q, r }: Cell): LatLng[] {
  const cx = HEX_SIZE * SQRT3 * (q + r / 2);
  const cy = HEX_SIZE * 1.5 * r;
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return fromMercator(cx + HEX_SIZE * Math.cos(angle), cy + HEX_SIZE * Math.sin(angle));
  });
}

export function cellKey({ q, r }: Cell): string {
  return `${q}:${r}`;
}

export function parseCellKey(key: string): Cell {
  const [q, r] = key.split(':').map(Number);
  return { q, r };
}

/** Nombre de pas d'hexagone entre deux zones. */
export function cellDistance(a: Cell, b: Cell): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

/** Zones à moins de `radius` hexagones de `center` (centre compris). */
export function cellsAround(center: Cell, radius: number): Cell[] {
  const cells: Cell[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      cells.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return cells;
}

export type Bounds = { minQ: number; maxQ: number; minR: number; maxR: number };

/** Plage q/r qui couvre une zone de carte (avec une marge d'un hexagone). */
export function boundsForRegion(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}): Bounds {
  const corners = [
    { latitude: region.latitude - region.latitudeDelta / 2, longitude: region.longitude - region.longitudeDelta / 2 },
    { latitude: region.latitude - region.latitudeDelta / 2, longitude: region.longitude + region.longitudeDelta / 2 },
    { latitude: region.latitude + region.latitudeDelta / 2, longitude: region.longitude - region.longitudeDelta / 2 },
    { latitude: region.latitude + region.latitudeDelta / 2, longitude: region.longitude + region.longitudeDelta / 2 },
  ].map(cellAt);
  return {
    minQ: Math.min(...corners.map((c) => c.q)) - 1,
    maxQ: Math.max(...corners.map((c) => c.q)) + 1,
    minR: Math.min(...corners.map((c) => c.r)) - 1,
    maxR: Math.max(...corners.map((c) => c.r)) + 1,
  };
}

/** Distance au sol en mètres (formule de haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
