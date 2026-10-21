import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, StatusBanner, SectionTitle } from '@/components/ui';
import { challengeDays, evaluateChallenge, fromDayKey } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, formatSteps, radius, spacing } from '@/theme';

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { challenges, friends, profile, history, today, friendHistory, deleteChallenge } = useAppStore();
  const challenge = challenges.find((c) => c.id === id);

  if (!challenge) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Ce défi n’existe plus.</Text>
      </View>
    );
  }

  const opponent = friends.find((f) => f.id === challenge.opponentId);
  const days = challengeDays(challenge);
  const opponentHistory = friendHistory(challenge.opponentId, days);
  const result = evaluateChallenge(challenge, today, history, opponentHistory);
  const total = result.myTotal + result.opponentTotal;
  const myShare = total === 0 ? 0.5 : result.myTotal / total;

  const verdict = {
    me: 'Vous avez gagné ! 🏆',
    opponent: `${opponent?.name ?? 'Votre adversaire'} a gagné.`,
    tie: 'Égalité parfaite !',
  };

  const onDelete = () =>
    Alert.alert('Supprimer ce défi ?', undefined, [
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
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBanner />
      <Card style={{ gap: spacing.md }}>
        <View style={styles.versus}>
          <View style={styles.player}>
            <Text style={styles.avatar}>{profile.avatar}</Text>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.score}>{formatSteps(result.myTotal)}</Text>
          </View>
          <Text style={styles.vs}>VS</Text>
          <View style={styles.player}>
            <Text style={styles.avatar}>{opponent?.avatar ?? '❔'}</Text>
            <Text style={styles.name}>{opponent?.name ?? 'Ami supprimé'}</Text>
            <Text style={styles.score}>{formatSteps(result.opponentTotal)}</Text>
          </View>
        </View>
        <View style={styles.bar}>
          <View style={[styles.barMine, { flex: myShare }]} />
          <View style={[styles.barTheirs, { flex: 1 - myShare }]} />
        </View>
        <Text style={styles.headline}>
          {result.winner
            ? verdict[result.winner]
            : result.status === 'upcoming'
              ? 'Le défi n’a pas encore commencé.'
              : `Jour ${result.daysElapsed} sur ${challenge.days}`}
        </Text>
      </Card>

      <SectionTitle>Détail par jour</SectionTitle>
      <Card style={{ gap: spacing.sm }}>
        {days.map((day) => (
          <View key={day} style={styles.dayRow}>
            <Text style={styles.muted}>
              {fromDayKey(day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
            <Text style={styles.dayScore}>
              {day > today ? '—' : `${formatSteps(history[day] ?? 0)} / ${formatSteps(opponentHistory[day] ?? 0)}`}
            </Text>
          </View>
        ))}
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Supprimer le défi" variant="danger" onPress={onDelete} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  versus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  player: { alignItems: 'center', flex: 1 },
  avatar: { fontSize: 44 },
  name: { color: colors.text, fontWeight: '700', marginTop: spacing.xs },
  score: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: spacing.xs },
  vs: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  bar: { flexDirection: 'row', height: 12, borderRadius: radius.pill, overflow: 'hidden' },
  barMine: { backgroundColor: colors.primary },
  barTheirs: { backgroundColor: colors.secondary },
  headline: { color: colors.text, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayScore: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.textMuted },
});
