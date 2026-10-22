import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, Chip, SectionTitle, StatusBanner } from '@/components/ui';
import { ME_ID, buildLeaderboard, challengeDays, evaluateChallenge, lastDays, type Challenge } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, spacing } from '@/theme';

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

  let status = `Jour ${result.daysElapsed}/${challenge.days}`;
  let tint: string = result.myTotal >= result.opponentTotal ? colors.success : colors.danger;
  if (result.winner === 'me') [status, tint] = ['Victoire', colors.success];
  if (result.winner === 'opponent') [status, tint] = ['Défaite', colors.danger];
  if (result.winner === 'tie') [status, tint] = ['Égalité', colors.textMuted];

  return (
    <Link href={{ pathname: '/challenge/[id]', params: { id: challenge.id } }} asChild>
      <Pressable>
        <Card style={{ gap: spacing.md }}>
          <View style={styles.row}>
            <Avatar id={challenge.opponentId} name={opponent?.name ?? '?'} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{opponent?.name ?? 'Ami supprimé'}</Text>
              <Text style={[styles.status, { color: tint }]}>{status}</Text>
            </View>
            <Text style={styles.score}>
              {formatSteps(result.myTotal)}
              <Text style={styles.scoreThem}> – {formatSteps(result.opponentTotal)}</Text>
            </Text>
          </View>
          {result.status !== 'finished' && (
            <View style={styles.bar}>
              <View style={{ flex: myShare, backgroundColor: colors.primary }} />
              <View style={{ flex: 1 - myShare, backgroundColor: colors.surfaceAlt }} />
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
      <Card style={{ paddingVertical: spacing.xs }}>
        {board.map((entry, i) => (
          <View key={entry.id} style={[styles.row, styles.boardRow, i > 0 && styles.rowBorder]}>
            <Text style={[styles.rank, entry.rank === 1 && { color: colors.primary }]}>{entry.rank}</Text>
            <Avatar id={entry.id} name={entry.name} size={32} />
            <Text style={[styles.boardName, entry.isMe && { color: colors.primary }]} numberOfLines={1}>
              {entry.name}
              {entry.isMe ? <Text style={styles.meta}> · toi</Text> : null}
            </Text>
            <Text style={styles.boardSteps}>{formatSteps(entry.steps)}</Text>
          </View>
        ))}
        {friends.length === 0 && (
          <Text style={[styles.meta, { paddingVertical: spacing.md }]}>
            Ajoute des amis avec leur code (onglet Profil) pour les affronter.
          </Text>
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
      <Button title="Nouveau duel" icon="flash" onPress={() => router.push('/challenge/new')} />

      <SectionTitle>Mes duels</SectionTitle>
      {sorted.length === 0 ? (
        <Card>
          <Text style={styles.meta}>Aucun duel pour l’instant. Défie un ami sur 1, 3 ou 7 jours.</Text>
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
  title: { color: colors.text, ...font.heading },
  status: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  score: { color: colors.text, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  scoreThem: { color: colors.textMuted },
  bar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden' },
  periods: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  boardRow: { paddingVertical: spacing.sm + 2 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rank: { color: colors.textMuted, width: 20, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  boardName: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  boardSteps: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  meta: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
});
