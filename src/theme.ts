export const colors = {
  background: '#0B0C17',
  surface: '#171930',
  surfaceAlt: '#22254A',
  border: '#2C3060',
  text: '#F6F6FF',
  textMuted: '#9A9CC6',
  primary: '#FF5A36',
  secondary: '#7C5CFF',
  success: '#2ED47A',
  warning: '#FFB020',
  danger: '#FF4D6A',
  gold: '#FFC83D',
  flame: '#FF8A00',
};

/** Dégradés de la marque : énergie (orange-rose), guerre (violet), victoire (or). */
export const gradients = {
  energy: ['#FF7A3D', '#FF2D78'],
  war: ['#8B6CFF', '#4A35D6'],
  victory: ['#FFD54A', '#FF9F1C'],
  surface: ['#1D2040', '#151730'],
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const font = {
  hero: { fontSize: 48, fontWeight: '900' as const, letterSpacing: -1.5 },
  title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '800' as const },
  body: { fontSize: 16, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '600' as const },
};

export function formatSteps(steps: number): string {
  return steps.toLocaleString('fr-FR');
}

/** 12 400 → « 12,4 k » pour les espaces étroits. */
export function formatCompact(steps: number): string {
  if (steps < 10_000) return formatSteps(steps);
  return `${(steps / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k`;
}
