import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppStore } from '@/state/AppStore';
import { colors, font, gradients, radius, spacing } from '@/theme';

/** Petit retour haptique (ignoré sur le web). */
export function tap(kind: 'light' | 'selection' | 'success' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'selection') Haptics.selectionAsync();
  else if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type GradientName = keyof typeof gradients;

export function GradientCard({
  children,
  gradient = 'energy',
  style,
}: {
  children: ReactNode;
  gradient?: GradientName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient colors={gradients[gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.gradientCard, style]}>
      {children}
    </LinearGradient>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'war' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
}) {
  const gradient = variant === 'primary' ? gradients.energy : variant === 'war' ? gradients.war : null;
  const flat = { secondary: colors.surfaceAlt, danger: colors.danger, ghost: 'transparent' } as const;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.buttonOuter,
        { opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      {gradient ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
          <Text style={styles.buttonText}>{title}</Text>
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.button,
            { backgroundColor: flat[variant as keyof typeof flat] },
            variant === 'ghost' && { borderWidth: 1, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.buttonText, variant === 'ghost' && { color: colors.textMuted }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap('selection');
        onPress();
      }}
      style={[styles.chip, selected && { backgroundColor: colors.secondary, borderColor: colors.secondary }]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

/** Pastille de statistique : icône, valeur et libellé. */
export function StatPill({ icon, value, label, tint = colors.text }: { icon: string; value: string; label: string; tint?: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillIcon}>{icon}</Text>
      <View>
        <Text style={[styles.pillValue, { color: tint }]}>{value}</Text>
        <Text style={styles.pillLabel}>{label}</Text>
      </View>
    </View>
  );
}

/** Bandeau d'état : mode démo, connexion en cours ou erreur réseau. Rien quand tout va bien. */
export function StatusBanner() {
  const { mode, sync, retry } = useAppStore();
  let text: string | null = null;
  if (mode === 'demo') {
    text = 'Mode démo : tes pas sont réels, les autres joueurs sont simulés.';
  } else if (sync.status === 'connecting') {
    text = 'Connexion au serveur…';
  } else if (sync.status === 'error') {
    text = `${sync.message} Touchez pour réessayer.`;
  }
  if (!text) return null;
  return (
    <Pressable style={styles.banner} onPress={retry} disabled={sync.status !== 'error'}>
      <Text style={styles.bannerText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gradientCard: { borderRadius: radius.lg, padding: spacing.lg, overflow: 'hidden' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  buttonOuter: { borderRadius: radius.pill, overflow: 'hidden' },
  button: {
    borderRadius: radius.pill,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    paddingHorizontal: 15,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.text, fontWeight: '700' },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  pillIcon: { fontSize: 24 },
  pillValue: { ...font.heading },
  pillLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  banner: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  bannerText: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
});
