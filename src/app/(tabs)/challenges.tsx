import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, SectionTitle, StatusBanner } from '@/components/ui';
import { ME_ID, buildLeaderboard, challengeDays, evaluateChallenge, lastDays, type Challenge } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, spacing } from '@/theme';

const MEDALS = ['🥇', '🥈', '🥉'];
const PERIODS = [
  { label: 'Aujourd’hui', days: 1 },
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 },
];

function ChallengeRow({ challenge }: { challenge: Challenge }) {
  const { friends, history, today, friendHistory } = useAppStore();
  const opponent = friends.find((f) => f.id === challenge.opponentId);
  const result = evaluateChallenge(challenge, today, history, friendHistory(challenge.opponentId, challengeDays(challenge)));
  const total = result.myTotal + result.opponentTotal;
  const myShare = total === 0 ? 0.5 : result.myTotal / total;

  let headline = `Jour ${result.daysElapsed}/${challenge.days}`;
  let tint: string = result.myTotal >= result.opponentTotal ? colors.success : colors.danger;
  if (result.winner === 'me') [headline, tint] = ['Victoire 🏆', colors.gold];
  if (result.winner === 'opponent') [headline, tint] = ['Défaite', colors.textMuted];
  if (result.winner === 'tie') [headline, tint] = ['Égalité', colors.textMuted];

  return (
    <Link href={{ pathname: '/challenge/[id]', params: { id: challenge.id } }} asChild>
      <Pressable>
        <Card style={{ gap: spacing.sm }}>
          <View style={styles.row}>
            <Text style={styles.avatar}>{opponent?.avatar ?? '❔'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Contre {opponent?.name ?? 'ami supprimé'}</Text>
              <Text style={styles.subtitle}>
                {formatSteps(result.myTotal)} – {formatSteps(result.opponentTotal)} pas
              </Text>
            </View>
            <Text style={[styles.status, { color: tint }]}>{headline}</Text>
          </View>
          {result.status !== 'finished' && (
            <View style={styles.bar}>
              <View style={{ flex: myShare, backgroundColor: colors.primary }} />
              <View style={{ flex: 1 - myShare, backgroundColor: colors.secondary }} />
            </View>
          )}
        </Card>
      </Pressable>
    </Link>
  );
}

function FriendsLeaderboard() {
  const { profile, friends, history, today, friendHistory } = useAppStore();
  const [periodDays, setPeriodDays] = useState(7);
  const days = lastDays(today, periodDays);
  const board = buildLeaderboard(
    [
      { id: ME_ID, name: profile.name, avatar: profile.avatar, history },
      ...friends.map((f) => ({ ...f, history: friendHistory(f.id, days) })),
    ],
    days,
  );

  return (
    <>
      <SectionTitle>Classement des amis</SectionTitle>
      <View style={styles.periods}>
        {PERIODS.map((p) => (
          <Chip key={p.days} label={p.label} selected={periodDays === p.days} onPress={() => setPeriodDays(p.days)} />
        ))}
      </View>
      <Card style={{ gap: spacing.md }}>
        {board.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <Text style={styles.rank}>{MEDALS[entry.rank - 1] ?? `${entry.rank}`}</Text>
            <Text style={styles.boardAvatar}>{entry.avatar}</Text>
            <Text style={[styles.boardName, entry.isMe && { color: colors.primary }]} numberOfLines={1}>
              {entry.isMe ? `${entry.name} (toi)` : entry.name}
            </Text>
            <Text style={styles.boardSteps}>{formatSteps(entry.steps)}</Text>
          </View>
        ))}
        {friends.length === 0 && (
          <Text style={styles.empty}>Ajoute des amis avec leur code (onglet Profil) pour les affronter.</Text>
        )}
      </Card>
    </>
  );
}

export default function ChallengesScreen() {
  const { challenges, today, history, friendHistory } = useAppStore();
  // En cours d'abord, puis terminés.
  const sorted = [...challenges].sort((a, b) => {
    const fa = evaluateChallenge(a, today, history, friendHistory(a.opponentId, challengeDays(a))).status === 'finished';
    const fb = evaluateChallenge(b, today, history, friendHistory(b.opponentId, challengeDays(b))).status === 'finished';
    return Number(fa) - Number(fb);
  });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <StatusBanner />
      <Button title="⚡ Lancer un duel" onPress={() => router.push('/challenge/new')} />

      <SectionTitle>Mes duels</SectionTitle>
      {sorted.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Aucun duel pour l’instant. Défie un ami et montre qui marche le plus !</Text>
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {sorted.map((c) => (
            <ChallengeRow key={c.id} challenge={c} />
          ))}
        </View>
      )}

      <FriendsLeaderboard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { fontSize: 32 },
  title: { color: colors.text, ...font.heading },
  subtitle: { color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  status: { fontWeight: '900' },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  periods: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  rank: { color: colors.textMuted, fontSize: 18, width: 30, textAlign: 'center', fontWeight: '900' },
  boardAvatar: { fontSize: 24 },
  boardName: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  boardSteps: { color: colors.text, fontSize: 16, fontWeight: '900' },
  empty: { color: colors.textMuted, textAlign: 'center' },
});
