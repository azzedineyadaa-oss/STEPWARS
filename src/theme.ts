// Identité « sport premium » : noir profond, une seule couleur d'accent,
// gros chiffres, étiquettes en petites capitales. Pas d'emoji dans l'interface.
export const colors = {
  background: '#0A0A0B',
  surface: '#141416',
  surfaceAlt: '#1D1D20',
  border: '#2A2A2E',
  text: '#F5F5F7',
  textMuted: '#8E8E93',
  textFaint: '#5A5A60',
  /** L'unique couleur d'accent : actions, progression, mon équipe. */
  primary: '#FF5A1F',
  onPrimary: '#0A0A0B',
  success: '#30D158',
  danger: '#FF453A',
  warning: '#FFD60A',
};

/** Couleurs des pastilles de joueurs et d'équipes (jamais pour l'interface). */
export const identityColors = ['#FF5A1F', '#3D8BFF', '#30D158', '#BF5AF2', '#FFD60A', '#64D2FF', '#FF375F', '#C9A26B'];

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
