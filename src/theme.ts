export const colors = {
  background: '#0E0F1A',
  surface: '#1A1C2E',
  surfaceAlt: '#24263D',
  border: '#2E3150',
  text: '#F4F5FF',
  textMuted: '#9A9CC0',
  primary: '#FF5A36',
  secondary: '#7C5CFF',
  success: '#2ED47A',
  warning: '#FFB020',
  danger: '#FF4D6A',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };

export function formatSteps(steps: number): string {
  return steps.toLocaleString('fr-FR');
}
