import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, SectionTitle, StatusBanner, tap } from '@/components/ui';
import { challengeDays, evaluateChallenge, fromDayKey } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

function durationLabel(days: number) {
  return days === 7 ? '1 semaine' : `${days} jour${days > 1 ? 's' : ''}`;
}

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { challenges, friends, profile, myId, history, today, friendHistory, deleteChallenge, acceptChallenge } =
    useAppStore();
  const [busy, setBusy] = useState(false);
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

  const remove = async () => {
    try {
      await deleteChallenge(challenge.id);
      router.back();
    } catch (e) {
      Alert.alert('Action impossible', e instanceof Error ? e.message : undefined);
    }
  };

  const confirmRemove = (title: string, action: string) =>
    Alert.alert(title, undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: action, style: 'destructive', onPress: remove },
    ]);

  const onAccept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await acceptChallenge(challenge.id);
      tap('success');
    } catch (e) {
      Alert.alert('Acceptation impossible', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const stake = challenge.stake ? (
    <View style={styles.stake}>
      <Ionicons name="cafe-outline" size={18} color={colors.primary} />
      <Text style={styles.stakeText}>{challenge.stake}</Text>
    </View>
  ) : null;

  if (result.status === 'pending') {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
        <StatusBanner />
        <Card style={styles.pendingCard}>
          <Avatar id={challenge.opponentId} name={opponentName} size={64} />
          <Text style={styles.pendingTitle}>
            {challenge.incoming ? `${opponentName} te défie !` : `En attente de ${opponentName}`}
          </Text>
          <Text style={styles.muted}>
            Duel de {durationLabel(challenge.days)} : le plus de pas gagne.
            {challenge.incoming ? ' Il commence dès que tu acceptes.' : ' Il commencera dès que l’invitation sera acceptée.'}
          </Text>
          {stake}
        </Card>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {challenge.incoming ? (
            <>
              <Button title={busy ? '…' : 'Relever le défi'} icon="flash" onPress={onAccept} disabled={busy} />
              <Button title="Refuser" variant="ghost" onPress={() => confirmRemove('Refuser ce duel ?', 'Refuser')} />
            </>
          ) : (
            <Button title="Annuler l’invitation" variant="ghost" onPress={() => confirmRemove('Annuler ce duel ?', 'Annuler le duel')} />
          )}
        </View>
      </ScrollView>
    );
  }

  const headline = result.winner
    ? { me: 'Victoire', opponent: 'Défaite', tie: 'Égalité' }[result.winner]
    : result.status === 'upcoming'
      ? 'Commence demain'
      : `Jour ${result.daysElapsed} sur ${challenge.days}`;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <StatusBanner />
      <Card style={{ gap: spacing.lg }}>
        <Text
          style={[
            styles.label,
            { textAlign: 'center' },
            result.winner === 'me' && { color: colors.success },
            result.winner === 'opponent' && { color: colors.danger },
          ]}
        >
          {headline}
        </Text>
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
        {stake}
      </Card>

      <SectionTitle>Détail par jour</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        {days.map((day, i) => (
          <View key={day} style={[styles.dayRow, i > 0 && styles.rowBorder]}>
            <Text style={[styles.muted, { textTransform: 'capitalize' }]}>
              {fromDayKey(day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
            </Text>
            <Text style={styles.dayScore}>
              {day > today ? '—' : `${formatSteps(history[day] ?? 0)}  ·  ${formatSteps(opponentHistory[day] ?? 0)}`}
            </Text>
          </View>
        ))}
      </Card>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        {result.status === 'finished' && opponent && (
          <Button
            title={result.winner === 'opponent' ? 'Prendre ma revanche' : 'Rejouer'}
            icon="refresh"
            onPress={() =>
              router.push({
                pathname: '/challenge/new',
                params: { opponent: challenge.opponentId, days: String(challenge.days) },
              })
            }
          />
        )}
        <Button title="Supprimer le duel" variant="ghost" onPress={() => confirmRemove('Supprimer ce duel ?', 'Supprimer')} />
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
  muted: { color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  pendingCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  pendingTitle: { color: colors.text, ...font.title, textAlign: 'center' },
  stake: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  stakeText: { color: colors.text, fontWeight: '700', flex: 1 },
});
