import { Link, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, DemoBanner } from '@/components/ui';
import { challengeDays, evaluateChallenge, type Challenge } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, formatSteps, spacing } from '@/theme';

const STATUS_LABEL = { upcoming: 'À venir', active: 'En cours', finished: 'Terminé' } as const;

function ChallengeRow({ challenge }: { challenge: Challenge }) {
  const { friends, history, today, friendHistory } = useAppStore();
  const opponent = friends.find((f) => f.id === challenge.opponentId);
  const result = evaluateChallenge(challenge, today, history, friendHistory(challenge.opponentId, challengeDays(challenge)));
  const leading = result.myTotal >= result.opponentTotal;

  let headline: string = STATUS_LABEL[result.status];
  if (result.status === 'active') headline = `Jour ${result.daysElapsed}/${challenge.days}`;
  if (result.winner === 'me') headline = 'Victoire 🏆';
  if (result.winner === 'opponent') headline = 'Défaite';
  if (result.winner === 'tie') headline = 'Égalité';

  return (
    <Link href={{ pathname: '/challenge/[id]', params: { id: challenge.id } }} asChild>
      <Pressable>
        <Card style={styles.row}>
          <Text style={styles.avatar}>{opponent?.avatar ?? '❔'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Duel contre {opponent?.name ?? 'ami supprimé'}</Text>
            <Text style={styles.subtitle}>
              {formatSteps(result.myTotal)} – {formatSteps(result.opponentTotal)} pas
            </Text>
          </View>
          <Text style={[styles.status, { color: leading ? colors.success : colors.danger }]}>{headline}</Text>
        </Card>
      </Pressable>
    </Link>
  );
}

export default function ChallengesScreen() {
  const { challenges } = useAppStore();

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={challenges}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
          <DemoBanner />
          <Button title="⚡ Lancer un défi" onPress={() => router.push('/challenge/new')} />
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>Aucun défi pour l'instant. Défiez un ami pour commencer !</Text>
      }
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      renderItem={({ item }) => <ChallengeRow challenge={item} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { fontSize: 32 },
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  status: { fontWeight: '700' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
});
