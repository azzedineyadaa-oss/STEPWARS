import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, SectionTitle, Stat, TeamBadge } from '@/components/ui';
import { rankLabel, topPercent, winRate, type PlayerCard } from '@/lib/players';
import { useMapStore } from '@/state/MapStore';
import { colors, font, formatSteps, spacing } from '@/theme';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { players, loadPlayerCard, blockPlayer, reportPlayer } = useMapStore();
  const known = players.find((p) => p.id === id);
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPlayerCard(id, known)
      .then((c) => !cancelled && setCard(c))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Fiche indisponible.'));
    return () => {
      cancelled = true;
    };
    // Une seule fois par joueur : `known` sert seulement de repli en mode démo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadPlayerCard]);

  if (error || !card) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
      </View>
    );
  }

  const rate = winRate(card);
  const played = card.duelsWon + card.duelsLost + card.duelsTied;

  const onBlock = () =>
    Alert.alert(
      `Bloquer ${card.name} ?`,
      'Vous ne vous verrez plus sur la carte. S’il fait partie de tes amis, il en sera retiré avec vos duels.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: () =>
            blockPlayer(card.id)
              .then(() => router.back())
              .catch((e) => Alert.alert('Blocage impossible', e instanceof Error ? e.message : undefined)),
        },
      ],
    );

  const onReport = () =>
    Alert.alert(`Signaler ${card.name} ?`, 'Pseudo ou comportement inapproprié. Après plusieurs signalements, le joueur est retiré de la carte publique.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Signaler',
        style: 'destructive',
        onPress: () =>
          reportPlayer(card.id)
            .then(() => Alert.alert('Merci', 'Le signalement a été enregistré.'))
            .catch((e) => Alert.alert('Signalement impossible', e instanceof Error ? e.message : undefined)),
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Avatar id={card.id} name={card.name} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {card.name}
          </Text>
          <Text style={styles.muted}>{card.isFriend ? 'Ami' : 'Marcheur à proximité'}</Text>
        </View>
      </View>
      {card.teamName && (
        <View style={styles.team}>
          <TeamBadge id={card.teamName} name={card.teamName} size={22} />
          <Text style={styles.teamName}>{card.teamName}</Text>
        </View>
      )}

      <Card style={styles.today}>
        <Text style={styles.label}>Aujourd’hui</Text>
        <Text style={styles.big}>{formatSteps(card.stepsToday)}</Text>
        <Text style={styles.muted}>pas</Text>
      </Card>

      <Card style={styles.grid}>
        <Stat label="7 jours" value={formatSteps(card.stepsWeek)} />
        <View style={styles.divider} />
        <Stat label="Série" value={`${card.streak}`} unit="j" tint={card.streak > 0 ? colors.primary : undefined} />
        <View style={styles.divider} />
        <Stat label="Record" value={formatSteps(card.bestDay)} />
      </Card>

      <SectionTitle>Classement de la semaine</SectionTitle>
      <Card style={styles.rankCard}>
        <Text style={styles.rank}>{rankLabel(card.weekRank)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rankText}>sur {formatSteps(card.weekPlayers)} marcheurs</Text>
          <Text style={styles.muted}>Top {topPercent(card.weekRank, card.weekPlayers)} %</Text>
        </View>
      </Card>

      <SectionTitle>Duels</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        {played === 0 ? (
          <Text style={styles.muted}>Aucun duel terminé.</Text>
        ) : (
          <>
            <View style={styles.duelRow}>
              <Stat label="Victoires" value={`${card.duelsWon}`} tint={colors.success} />
              <Stat label="Défaites" value={`${card.duelsLost}`} tint={colors.danger} />
              <Stat label="Nuls" value={`${card.duelsTied}`} />
              <Stat label="Taux" value={rate === null ? '–' : `${rate}`} unit={rate === null ? undefined : '%'} />
            </View>
            {rate !== null && (
              <View style={styles.bar}>
                <View style={{ flex: rate, backgroundColor: colors.success }} />
                <View style={{ flex: 100 - rate, backgroundColor: colors.danger }} />
              </View>
            )}
          </>
        )}
      </Card>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        {card.isFriend ? (
          <Button
            title={`Défier ${card.name}`}
            icon="flash"
            onPress={() => router.push({ pathname: '/challenge/new', params: { opponent: card.id } })}
          />
        ) : (
          <Text style={[styles.muted, { textAlign: 'center' }]}>Pour défier {card.name}, échangez vos codes amis.</Text>
        )}
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button title="Signaler" variant="ghost" onPress={onReport} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Bloquer" variant="danger" onPress={onBlock} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.lg },
  label: { color: colors.textMuted, ...font.label },
  muted: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  name: { color: colors.text, ...font.title, fontSize: 28 },
  team: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  teamName: { color: colors.text, fontWeight: '700' },
  today: { marginTop: spacing.lg, gap: 2 },
  big: { color: colors.text, ...font.display },
  grid: { flexDirection: 'row', marginTop: spacing.sm, alignItems: 'center' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.md },
  rankCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { color: colors.text, ...font.number, fontSize: 34 },
  rankText: { color: colors.text, fontWeight: '700' },
  duelRow: { flexDirection: 'row', gap: spacing.sm },
  bar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
