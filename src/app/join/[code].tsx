import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, tap } from '@/components/ui';
import { parseInviteCode } from '@/lib/invite';
import { useAppStore } from '@/state/AppStore';
import { colors, font, radius, spacing } from '@/theme';

/** Ouvert par un lien d'invitation d'équipe (stepwars://join/CODE). */
export default function JoinTeamScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = parseInviteCode(raw);
  const { team, joinTeam } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyIn = team !== null && team.code === code;

  const onJoin = async () => {
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      await joinTeam(code);
      tap('success');
      router.dismissTo('/war');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de rejoindre cette équipe.');
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.icon}>
        <Ionicons name="people-outline" size={30} color={colors.primary} />
      </View>
      <Text style={styles.title}>{code ? 'Invitation dans une équipe' : 'Lien d’invitation invalide'}</Text>
      {code && <Text style={styles.code}>{code}</Text>}
      <Text style={styles.lead}>
        {!code
          ? 'Demande à ton équipe de te renvoyer le lien, ou entre le code dans l’onglet Ligue, puis Équipes.'
          : alreadyIn
            ? 'Tu fais déjà partie de cette équipe.'
            : team
              ? `Tu es dans l’équipe « ${team.name} ». Quitte-la d’abord dans l’onglet Ligue pour en rejoindre une autre.`
              : 'Vos pas s’additionnent chaque semaine contre les autres équipes.'}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        {code && !team && <Button title={busy ? '…' : 'Rejoindre l’équipe'} onPress={onJoin} disabled={busy} />}
        <Button title="Fermer" variant="ghost" onPress={() => router.dismissTo(team ? '/war' : '/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, ...font.title, textAlign: 'center' },
  code: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 6 },
  lead: { color: colors.textMuted, ...font.body, textAlign: 'center', lineHeight: 22 },
  error: { color: colors.danger, fontWeight: '600', textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
});
