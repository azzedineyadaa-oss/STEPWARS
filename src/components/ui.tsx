import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppStore } from '@/state/AppStore';
import { colors, font, identityColor, initials, radius, spacing } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Petit retour haptique (ignoré sur le web). */
export function tap(kind: 'light' | 'selection' | 'success' | 'error' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'selection') Haptics.selectionAsync();
  else if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.label}>{children}</Text>
      {action}
    </View>
  );
}

/** Valeur chiffrée avec son étiquette, pour les rangées de statistiques. */
export function Stat({ label, value, unit, tint }: { label: string; value: string; unit?: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.statValue, tint ? { color: tint } : null]} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

/** Pastille ronde avec l'initiale du joueur. */
export function Avatar({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  const color = identityColor(id);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}26`,
        borderWidth: 1,
        borderColor: `${color}66`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color, fontSize: size * 0.42, fontWeight: '800' }}>{initials(name)}</Text>
    </View>
  );
}

/** Badge carré avec les initiales de l'équipe. */
export function TeamBadge({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.sm,
        backgroundColor: identityColor(id),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.onPrimary, fontSize: size * 0.36, fontWeight: '900', letterSpacing: -0.5 }}>
        {initials(name, 2)}
      </Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
}) {
  const look = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surfaceAlt, fg: colors.text, border: colors.surfaceAlt },
    danger: { bg: 'transparent', fg: colors.danger, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: colors.border },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: look.bg, borderColor: look.border, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={look.fg} />}
      <Text style={[styles.buttonText, { color: look.fg }]}>{title}</Text>
    </Pressable>
  );
}

/** Option d'un sélecteur (objectif, durée, période…). */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap('selection');
        onPress();
      }}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** Bandeau d'état : mode démo, connexion en cours ou erreur réseau. Rien quand tout va bien. */
export function StatusBanner() {
  const { mode, sync, retry } = useAppStore();
  let text: string | null = null;
  if (mode === 'demo') {
    text = 'Mode démo · tes pas sont réels, les autres joueurs sont simulés';
  } else if (sync.status === 'connecting') {
    text = 'Connexion au serveur…';
  } else if (sync.status === 'error') {
    text = `${sync.message} Touche pour réessayer.`;
  }
  if (!text) return null;
  return (
    <Pressable style={styles.banner} onPress={retry} disabled={sync.status !== 'error'}>
      <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
      <Text style={styles.bannerText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  label: { color: colors.textMuted, ...font.label },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  stat: { flex: 1, gap: 4 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  statUnit: { color: colors.textMuted, fontSize: 13, fontWeight: '600', letterSpacing: 0 },
  button: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
  chip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chipTextOn: { color: colors.background },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  bannerText: { color: colors.textMuted, fontSize: 12, fontWeight: '500', flex: 1 },
});
