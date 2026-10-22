import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, GradientCard, SectionTitle } from '@/components/ui';
import { rankLabel, topPercent, winRate, type PlayerCard } from '@/lib/players';
import { useMapStore } from '@/state/MapStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

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

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{error}</Text>
      </View>
    );
  }
  if (!card) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const rate = winRate(card);
  const played = card.duelsWon + card.duelsLost + card.duelsTied;

  const onBlock = () =>
    Alert.alert(
      `Bloquer ${card.name} ?`,
      'Vous ne vous verrez plus sur la carte, et s’il fait partie de tes amis, il en sera retiré avec vos duels.',
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
    Alert.alert(`Signaler ${card.name} ?`, 'Pseudo ou comportement inapproprié : après plusieurs signalements, le joueur est retiré de la carte publique.', [
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
      <GradientCard gradient={card.isFriend ? 'war' : 'surface'} style={styles.hero}>
        <Text style={styles.avatar}>{card.avatar}</Text>
        <Text style={styles.name}>{card.name}</Text>
        <Text style={styles.meta}>
          {card.isFriend ? '👥 Ami' : '🌍 Marcheur du quartier'}
          {card.teamName ? ` · ${card.teamEmoji} ${card.teamName}` : ''}
        </Text>
      </GradientCard>

      <View style={styles.stats}>
        <Stat icon="👟" value={formatSteps(card.stepsToday)} label="aujourd’hui" />
        <Stat icon="📅" value={formatSteps(card.stepsWeek)} label="7 derniers jours" />
      </View>
      <View style={styles.stats}>
        <Stat icon="🔥" value={`${card.streak} j`} label="série" />
        <Stat icon="🏅" value={formatSteps(card.bestDay)} label="record en un jour" />
      </View>

      <SectionTitle>Classement</SectionTitle>
      <Card style={styles.rankCard}>
        <Text style={styles.rankValue}>{rankLabel(card.weekRank)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rankText}>sur {formatSteps(card.weekPlayers)} marcheurs cette semaine</Text>
          <Text style={styles.rankTop}>Top {topPercent(card.weekRank, card.weekPlayers)} %</Text>
        </View>
      </Card>

      <SectionTitle>Duels</SectionTitle>
      <Card style={{ gap: spacing.sm }}>
        {played === 0 ? (
          <Text style={styles.muted}>Aucun duel terminé pour l’instant.</Text>
        ) : (
          <>
            <View style={styles.duelRow}>
              <Text style={[styles.duelCount, { color: colors.success }]}>{card.duelsWon} V</Text>
              <Text style={[styles.duelCount, { color: colors.danger }]}>{card.duelsLost} D</Text>
              <Text style={[styles.duelCount, { color: colors.textMuted }]}>{card.duelsTied} N</Text>
              <Text style={styles.rate}>{rate === null ? '—' : `${rate} % de victoires`}</Text>
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
            title={`⚡ Défier ${card.name}`}
            onPress={() => router.push({ pathname: '/challenge/new', params: { opponent: card.id } })}
          />
        ) : (
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            Pour défier {card.name}, échangez vos codes amis (onglet Profil).
          </Text>
        )}
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button title="Signaler" variant="ghost" onPress={onReport} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Bloquer" variant="ghost" onPress={onBlock} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.lg },
  muted: { color: colors.textMuted, fontWeight: '600' },
  hero: { alignItems: 'center', gap: 4 },
  avatar: { fontSize: 64 },
  name: { color: '#fff', ...font.title },
  meta: { color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statIcon: { fontSize: 22 },
  statValue: { color: colors.text, ...font.heading, marginTop: 4 },
  statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  rankCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankValue: { color: colors.gold, fontSize: 32, fontWeight: '900' },
  rankText: { color: colors.text, fontWeight: '700' },
  rankTop: { color: colors.textMuted, fontWeight: '700', marginTop: 2 },
  duelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  duelCount: { fontSize: 18, fontWeight: '900' },
  rate: { color: colors.text, fontWeight: '800', marginLeft: 'auto' },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
