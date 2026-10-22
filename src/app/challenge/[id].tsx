import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, SectionTitle, StatusBanner } from '@/components/ui';
import { challengeDays, evaluateChallenge, fromDayKey } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, spacing } from '@/theme';

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { challenges, friends, profile, myId, history, today, friendHistory, deleteChallenge } = useAppStore();
  const challenge = challenges.find((c) => c.id === id);

  if (!challenge) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Ce duel n’existe plus.</Text>
      </View>
    );
  }

  const opponent = friends.find((f) => f.id === challenge.opponentId);
  const opponentName = opponent?.name ?? 'Ami supprimé';
  const days = challengeDays(challenge);
  const opponentHistory = friendHistory(challenge.opponentId, days);
  const result = evaluateChallenge(challenge, today, history, opponentHistory);
  const total = result.myTotal + result.opponentTotal;
  const myShare = total === 0 ? 0.5 : result.myTotal / total;

  const headline = result.winner
    ? { me: 'Victoire', opponent: 'Défaite', tie: 'Égalité' }[result.winner]
    : result.status === 'upcoming'
      ? 'Pas encore commencé'
      : `Jour ${result.daysElapsed} sur ${challenge.days}`;

  const onDelete = () =>
    Alert.alert('Supprimer ce duel ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteChallenge(challenge.id);
            router.back();
          } catch (e) {
            Alert.alert('Suppression impossible', e instanceof Error ? e.message : undefined);
          }
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <StatusBanner />
      <Card style={{ gap: spacing.lg }}>
        <Text style={[styles.label, { textAlign: 'center' }]}>{headline}</Text>
        <View style={styles.versus}>
          <View style={styles.player}>
            <Avatar id={myId} name={profile.name} size={48} />
            <Text style={styles.name} numberOfLines={1}>
              {profile.name}
            </Text>
            <Text style={[styles.score, result.myTotal >= result.opponentTotal && { color: colors.primary }]}>
              {formatSteps(result.myTotal)}
            </Text>
          </View>
          <Text style={styles.vs}>VS</Text>
          <View style={styles.player}>
            <Avatar id={challenge.opponentId} name={opponentName} size={48} />
            <Text style={styles.name} numberOfLines={1}>
              {opponentName}
            </Text>
            <Text style={styles.score}>{formatSteps(result.opponentTotal)}</Text>
          </View>
        </View>
        <View style={styles.bar}>
          <View style={{ flex: myShare, backgroundColor: colors.primary }} />
          <View style={{ flex: 1 - myShare, backgroundColor: colors.surfaceAlt }} />
        </View>
      </Card>

      <SectionTitle>Détail par jour</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        {days.map((day, i) => (
          <View key={day} style={[styles.dayRow, i > 0 && styles.rowBorder]}>
            <Text style={styles.muted}>
              {fromDayKey(day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
            </Text>
            <Text style={styles.dayScore}>
              {day > today ? '—' : `${formatSteps(history[day] ?? 0)}  ·  ${formatSteps(opponentHistory[day] ?? 0)}`}
            </Text>
          </View>
        ))}
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Supprimer le duel" variant="danger" onPress={onDelete} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  label: { color: colors.textMuted, ...font.label },
  versus: { flexDirection: 'row', alignItems: 'center' },
  player: { alignItems: 'center', flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontWeight: '700', marginTop: spacing.xs },
  score: { color: colors.text, ...font.number },
  vs: { color: colors.textFaint, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  bar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm + 2 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  dayScore: { color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  muted: { color: colors.textMuted, textTransform: 'capitalize' },
});
