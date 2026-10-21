import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, GradientCard, SectionTitle, StatusBanner } from '@/components/ui';
import { memberContribution, nextTarget, rankByScore, warTimeLeft } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

const MEDALS = ['🥇', '🥈', '🥉'];

function NoTeam() {
  return (
    <>
      <GradientCard gradient="war" style={{ gap: spacing.md }}>
        <Text style={styles.heroEmoji}>⚔️</Text>
        <Text style={styles.heroTitle}>La guerre des pas</Text>
        <Text style={styles.heroText}>Chaque semaine, ton équipe affronte toutes les autres. Chaque pas est une attaque.</Text>
        <View style={{ gap: spacing.sm }}>
          {[
            ['👥', 'Monte ton équipe : amis, famille, collègues (jusqu’à 30).'],
            ['📈', 'Vos pas s’additionnent du lundi au dimanche, à partir de ton arrivée.'],
            ['👑', 'L’équipe qui marche le plus remporte la semaine.'],
          ].map(([icon, text]) => (
            <View key={icon} style={styles.ruleRow}>
              <Text style={styles.ruleIcon}>{icon}</Text>
              <Text style={styles.ruleText}>{text}</Text>
            </View>
          ))}
        </View>
      </GradientCard>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Button title="Créer mon équipe" onPress={() => router.push('/team/new')} />
        <Button title="Rejoindre avec un code" variant="secondary" onPress={() => router.push({ pathname: '/team/new', params: { mode: 'join' } })} />
      </View>
    </>
  );
}

export default function WarScreen() {
  const insets = useSafeAreaInsets();
  const { team, teamMembers, teamStandings, warDays, friendHistory, myId, profile, leaveTeam, reportTeam, mode } =
    useAppStore();

  if (!team) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.screenTitle}>Guerre</Text>
        <StatusBanner />
        <NoTeam />
      </ScrollView>
    );
  }

  const ranked = rankByScore(teamStandings);
  const mine = ranked.find((t) => t.id === team.id);
  const target = nextTarget(ranked, team.id);
  const left = warTimeLeft(new Date());

  const contributions = teamMembers
    .map((m) => ({
      ...m,
      name: m.id === myId ? profile.name : m.name,
      avatar: m.id === myId ? profile.avatar : m.avatar,
      steps: memberContribution(friendHistory(m.id, warDays), warDays, m.joinedOn),
    }))
    .sort((a, b) => b.steps - a.steps);
  const teamTotal = Math.max(1, contributions.reduce((sum, m) => sum + m.steps, 0));

  const onInvite = () =>
    Share.share({
      message: `Rejoins mon équipe ${team.emoji} ${team.name} sur StepWars ! Code d’équipe : ${team.code}`,
    });

  const onLeave = () =>
    Alert.alert('Quitter l’équipe ?', 'Tes pas ne compteront plus pour elle cette semaine.', [
      { text: 'Rester', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: () => leaveTeam().catch((e) => Alert.alert('Impossible de quitter', e instanceof Error ? e.message : undefined)),
      },
    ]);

  const onRival = (id: string, name: string) => {
    if (id === team.id || mode === 'demo') return;
    Alert.alert(name, 'Ce nom d’équipe est offensant ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Signaler',
        style: 'destructive',
        onPress: () =>
          reportTeam(id)
            .then(() => Alert.alert('Merci', 'Le signalement a été enregistré.'))
            .catch((e) => Alert.alert('Signalement impossible', e instanceof Error ? e.message : undefined)),
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.screenTitle}>Guerre</Text>
      <StatusBanner />

      <GradientCard gradient={mine?.rank === 1 ? 'victory' : 'war'}>
        <View style={styles.rowBetween}>
          <Text style={styles.kicker}>SEMAINE EN COURS</Text>
          <Text style={styles.kicker}>
            ⏳ {left.days} j {left.hours} h {left.minutes} min
          </Text>
        </View>
        <View style={styles.heroRow}>
          <Text style={styles.teamEmoji}>{team.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.teamName} numberOfLines={2}>
              {team.name}
            </Text>
            <Text style={styles.teamSteps}>{formatSteps(mine?.steps ?? 0)} pas</Text>
            <Text style={styles.teamMeta}>
              {teamMembers.length} membre{teamMembers.length > 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.rankBox}>
            <Text style={styles.rankValue}>{mine?.rank === 1 ? '👑' : `${mine?.rank ?? '–'}ᵉ`}</Text>
            <Text style={styles.rankLabel}>sur {ranked.length}</Text>
          </View>
        </View>
        <Text style={styles.heroText}>
          {target
            ? `🎯 Plus que ${formatSteps(target.gap)} pas pour dépasser ${target.team.emoji} ${target.team.name}`
            : '👑 Vous êtes en tête ! Gardez le rythme jusqu’à dimanche minuit.'}
        </Text>
      </GradientCard>

      <SectionTitle>Classement de la semaine</SectionTitle>
      <View style={{ gap: spacing.sm }}>
        {ranked.map((t) => {
          const isMine = t.id === team.id;
          return (
            <Pressable key={t.id} onLongPress={() => onRival(t.id, t.name)}>
              <Card style={[styles.rankRow, isMine && styles.rankRowMine]}>
                <Text style={styles.medal}>{MEDALS[t.rank - 1] ?? `${t.rank}`}</Text>
                <Text style={styles.rowEmoji}>{t.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {t.name}
                    {isMine ? ' (vous)' : ''}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {t.members} membre{t.members > 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={styles.rowSteps}>{formatSteps(t.steps)}</Text>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle>Ton équipe</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        {contributions.map((m, i) => (
          <View key={m.id}>
            <View style={styles.memberRow}>
              <Text style={styles.memberAvatar}>{m.avatar}</Text>
              <Text style={styles.memberName} numberOfLines={1}>
                {m.name}
                {m.id === myId ? ' (toi)' : ''}
                {i === 0 && m.steps > 0 ? ' 👑' : ''}
              </Text>
              <Text style={styles.memberSteps}>{formatSteps(m.steps)}</Text>
            </View>
            <View style={styles.shareTrack}>
              <View
                style={[
                  styles.shareBar,
                  { width: `${(m.steps / teamTotal) * 100}%` },
                  m.id === myId && { backgroundColor: colors.primary },
                ]}
              />
            </View>
          </View>
        ))}
      </Card>

      <Card style={styles.inviteCard}>
        <Text style={styles.inviteLabel}>Code d’équipe</Text>
        <Text style={styles.inviteCode}>{team.code}</Text>
        <Button title="📣 Recruter des soldats" variant="war" onPress={onInvite} />
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Quitter l’équipe" variant="ghost" onPress={onLeave} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  screenTitle: { color: colors.text, ...font.title, marginBottom: spacing.md },
  heroEmoji: { fontSize: 56 },
  heroTitle: { color: '#fff', ...font.title },
  heroText: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '700', marginTop: spacing.md },
  ruleRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  ruleIcon: { fontSize: 20 },
  ruleText: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  teamEmoji: { fontSize: 46 },
  teamName: { color: '#fff', ...font.title, fontSize: 24, lineHeight: 28 },
  teamSteps: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 2 },
  teamMeta: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginTop: 2 },
  rankBox: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  rankValue: { color: '#fff', fontSize: 26, fontWeight: '900' },
  rankLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankRowMine: { borderColor: colors.secondary, backgroundColor: '#1E1A45' },
  medal: { color: colors.textMuted, fontSize: 20, width: 32, textAlign: 'center', fontWeight: '900' },
  rowEmoji: { fontSize: 28 },
  rowName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  rowMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  rowSteps: { color: colors.text, fontSize: 16, fontWeight: '900' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberAvatar: { fontSize: 24 },
  memberName: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  memberSteps: { color: colors.text, fontWeight: '900' },
  shareTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, marginTop: 6, overflow: 'hidden' },
  shareBar: { height: 6, borderRadius: 3, backgroundColor: colors.secondary },
  inviteCard: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  inviteLabel: { color: colors.textMuted, fontWeight: '700' },
  inviteCode: { color: colors.secondary, fontSize: 32, fontWeight: '900', letterSpacing: 6 },
});
