import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LeagueView } from '@/components/LeagueView';
import { Avatar, Button, Card, SectionTitle, StatusBanner, TeamBadge, tap, type IconName } from '@/components/ui';
import { isoWeek, memberContribution, nextTarget, rankByScore, warTimeLeft } from '@/lib/game';
import { teamInviteMessage } from '@/lib/invite';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

const RULES: { icon: IconName; text: string }[] = [
  { icon: 'people-outline', text: 'Monte ton équipe : amis, famille, collègues, jusqu’à 30.' },
  { icon: 'trending-up-outline', text: 'Vos pas s’additionnent du lundi au dimanche, à partir de ton arrivée.' },
  { icon: 'trophy-outline', text: 'L’équipe qui totalise le plus de pas remporte la semaine.' },
];

function NoTeam() {
  return (
    <>
      <Text style={styles.intro}>En plus de ta ligue, monte une équipe : chaque semaine, elle affronte toutes les autres au total de pas.</Text>
      <Card style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {RULES.map((r) => (
          <View key={r.icon} style={styles.ruleRow}>
            <Ionicons name={r.icon} size={20} color={colors.primary} />
            <Text style={styles.ruleText}>{r.text}</Text>
          </View>
        ))}
      </Card>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Button title="Créer une équipe" onPress={() => router.push('/team/new')} />
        <Button
          title="Rejoindre avec un code"
          variant="secondary"
          onPress={() => router.push({ pathname: '/team/new', params: { mode: 'join' } })}
        />
      </View>
    </>
  );
}

type Section = 'league' | 'teams';

export default function CompetitionScreen() {
  const insets = useSafeAreaInsets();
  const { today } = useAppStore();
  const [section, setSection] = useState<Section>('league');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.screenTitle}>Compétition</Text>
      <Text style={styles.label}>Semaine {isoWeek(today)}</Text>
      <StatusBanner />
      <View style={styles.segment}>
        {(
          [
            ['league', 'Ligue'],
            ['teams', 'Équipes'],
          ] as const
        ).map(([key, title]) => (
          <Pressable
            key={key}
            onPress={() => {
              tap('selection');
              setSection(key);
            }}
            style={[styles.segmentItem, section === key && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, section === key && styles.segmentTextOn]}>{title}</Text>
          </Pressable>
        ))}
      </View>
      {section === 'league' ? <LeagueView /> : <TeamsSection />}
    </ScrollView>
  );
}

function TeamsSection() {
  const { team, teamMembers, teamStandings, warDays, friendHistory, myId, profile, leaveTeam, reportTeam, mode } =
    useAppStore();

  if (!team) return <NoTeam />;

  const ranked = rankByScore(teamStandings);
  const mine = ranked.find((t) => t.id === team.id);
  const target = nextTarget(ranked, team.id);
  const left = warTimeLeft(new Date());

  const contributions = teamMembers
    .map((m) => ({
      ...m,
      name: m.id === myId ? profile.name : m.name,
      steps: memberContribution(friendHistory(m.id, warDays), warDays, m.joinedOn),
    }))
    .sort((a, b) => b.steps - a.steps);
  const teamTotal = Math.max(1, contributions.reduce((sum, m) => sum + m.steps, 0));

  const onInvite = () =>
    Share.share({ message: teamInviteMessage(team.name, team.code) });

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
    <>
      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <TeamBadge id={team.id} name={team.name} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.teamName} numberOfLines={2}>
              {team.name}
            </Text>
            <Text style={styles.meta}>
              {teamMembers.length} membre{teamMembers.length > 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <View style={styles.heroNumbers}>
          <View>
            <Text style={styles.label}>Classement</Text>
            <Text style={styles.bigNumber}>
              {mine?.rank ?? '–'}
              <Text style={styles.bigOf}>/{ranked.length}</Text>
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.label}>Total</Text>
            <Text style={styles.bigNumber}>{formatSteps(mine?.steps ?? 0)}</Text>
          </View>
        </View>
        <View style={styles.heroFooter}>
          <Text style={styles.footerText}>
            {target ? `${formatSteps(target.gap)} pas pour dépasser ${target.team.name}` : 'En tête du classement'}
          </Text>
          <Text style={styles.footerTime}>
            {left.days} j {left.hours} h
          </Text>
        </View>
      </Card>

      <SectionTitle>Classement de la semaine</SectionTitle>
      <Card style={{ paddingVertical: spacing.sm }}>
        {ranked.map((t, i) => {
          const isMine = t.id === team.id;
          return (
            <Pressable key={t.id} onLongPress={() => onRival(t.id, t.name)} style={[styles.rankRow, i > 0 && styles.rowBorder]}>
              <Text style={[styles.rankNumber, isMine && { color: colors.primary }]}>{t.rank}</Text>
              <TeamBadge id={t.id} name={t.name} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, isMine && { color: colors.primary }]} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={styles.meta}>
                  {t.members} membre{t.members > 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={styles.rowSteps}>{formatSteps(t.steps)}</Text>
            </Pressable>
          );
        })}
      </Card>

      <SectionTitle>Ton équipe</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        {contributions.map((m) => (
          <View key={m.id}>
            <View style={styles.memberRow}>
              <Avatar id={m.id} name={m.name} size={32} />
              <Text style={styles.memberName} numberOfLines={1}>
                {m.name}
                {m.id === myId ? <Text style={styles.meta}> · toi</Text> : null}
              </Text>
              <Text style={styles.rowSteps}>{formatSteps(m.steps)}</Text>
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

      <SectionTitle>Recruter</SectionTitle>
      <Card style={styles.invite}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Code d’équipe</Text>
          <Text style={styles.code}>{team.code}</Text>
        </View>
        <Button title="Inviter" variant="secondary" icon="share-outline" onPress={onInvite} />
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Quitter l’équipe" variant="ghost" onPress={onLeave} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  screenTitle: { color: colors.text, ...font.title, fontSize: 30 },
  label: { color: colors.textMuted, ...font.label },
  intro: { color: colors.text, ...font.body, fontSize: 17, lineHeight: 24, marginTop: spacing.md },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    marginTop: spacing.md,
  },
  segmentItem: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segmentOn: { backgroundColor: colors.text },
  segmentText: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  segmentTextOn: { color: colors.background },
  ruleRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  ruleText: { color: colors.text, ...font.body, flex: 1 },
  hero: { marginTop: spacing.md, gap: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  teamName: { color: colors.text, ...font.title },
  meta: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 2 },
  heroNumbers: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  bigNumber: { color: colors.text, ...font.display, fontSize: 44, letterSpacing: -1.5 },
  bigOf: { color: colors.textMuted, fontSize: 20, fontWeight: '700', letterSpacing: 0 },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  footerText: { color: colors.text, fontWeight: '700', flex: 1 },
  footerTime: { color: colors.primary, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rankNumber: { color: colors.textMuted, width: 22, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rowName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSteps: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberName: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  shareTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, marginTop: 8, overflow: 'hidden' },
  shareBar: { height: 4, borderRadius: 2, backgroundColor: colors.textMuted },
  invite: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  code: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: 4, marginTop: 4, fontVariant: ['tabular-nums'] },
});
