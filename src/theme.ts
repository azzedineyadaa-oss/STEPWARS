// Identité « Sommet » : bleu nuit de montagne et orange de lever de soleil.
// La journée est une ascension : gros chiffres, étiquettes en petites
// capitales, une seule couleur d'accent. Pas d'emoji dans l'interface.
export const colors = {
  background: '#111A2E',
  surface: '#1A2440',
  surfaceAlt: '#24304F',
  border: '#2E3B5E',
  text: '#F7F1EA',
  textMuted: '#A3B0CC',
  textFaint: '#6B7899',
  /** L'unique couleur d'accent : actions, progression, mon équipe. */
  primary: '#FF8A4C',
  onPrimary: '#121A2E',
  success: '#4ADE9B',
  danger: '#FF6B6B',
  warning: '#FFD166',
};

/** Couleurs des pastilles de joueurs et d'équipes (jamais pour l'interface). */
export const identityColors = ['#FF8A4C', '#5B9BFF', '#4ADE9B', '#C38BFF', '#FFD166', '#6FD3F2', '#FF7A9C', '#D9B38C'];

/** Police des textes dessinés en SVG : celle du système, aussi dans un navigateur. */
export const SVG_FONT: string | undefined = typeof document === 'undefined' ? undefined : 'system-ui, -apple-system, sans-serif';

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };

export const font = {
  /** Gros chiffre principal d'un écran. */
  display: { fontSize: 60, fontWeight: '800' as const, letterSpacing: -2.5, fontVariant: ['tabular-nums' as const] },
  /** Chiffre important dans une carte. */
  number: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -1, fontVariant: ['tabular-nums' as const] },
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.6 },
  heading: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' as const },
  /** Petite étiquette en capitales, au-dessus d'une valeur. */
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const },
};

export function formatSteps(steps: number): string {
  // Groupement manuel : selon le moteur, toLocaleString('fr-FR') écrit « 1580 » mais « 6 420 ».
  const sign = steps < 0 ? '-' : '';
  return sign + String(Math.round(Math.abs(steps))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
}

/** 12 400 → « 12,4 k » pour les espaces étroits. */
export function formatCompact(steps: number): string {
  if (steps < 10_000) return formatSteps(steps);
  return `${(steps / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k`;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Couleur stable d'un joueur ou d'une équipe. */
export function identityColor(id: string): string {
  return identityColors[hash(id) % identityColors.length];
}

/** « Azzedine » → « A », « Les Fusées » → « LF ». */
export function initials(name: string, max = 1): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? words.map((w) => w[0]) : [...(words[0] ?? '?')]).slice(0, max);
  return letters.join('').toUpperCase() || '?';
}
