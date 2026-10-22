import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Celebration } from '@/components/Celebration';
import { ProgressRing } from '@/components/ProgressRing';
import { Avatar, Button, Card, SectionTitle, Stat, StatusBanner, TeamBadge } from '@/components/ui';
import {
  challengeDays,
  evaluateChallenge,
  fromDayKey,
  isoWeek,
  lastDays,
  nextTarget,
  rankByScore,
  warTimeLeft,
} from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
// Longueur moyenne d'un pas, pour donner un ordre de grandeur en km.
const STEP_KM = 0.00075;
const BAR_HEIGHT = 96;

function greeting(hour: number) {
  if (hour < 5) return 'Bonne nuit';
  if (hour < 18) return 'Bonjour';
  return 'Bonsoir';
}

function message(steps: number, goal: number) {
  if (steps >= goal) return `Objectif atteint. ${formatSteps(steps - goal)} pas de plus pour ton équipe.`;
  if (steps === 0) return 'Aucun pas pour l’instant aujourd’hui.';
  return `Encore ${formatSteps(goal - steps)} pas pour atteindre ton objectif.`;
}

function WarCard() {
  const { team, teamStandings, today } = useAppStore();
  const left = warTimeLeft(new Date());

  if (!team) {
    return (
      <Pressable onPress={() => router.push('/team/new')}>
        <Card style={styles.warCard}>
          <Text style={styles.cardTitle}>Rejoins une équipe</Text>
          <Text style={styles.cardText}>Chaque semaine, ton équipe affronte toutes les autres au total de pas.</Text>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>Créer ou rejoindre</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
          </View>
        </Card>
      </Pressable>
    );
  }

  const ranked = rankByScore(teamStandings);
  const mine = ranked.find((t) => t.id === team.id);
  const target = nextTarget(ranked, team.id);

  return (
    <Pressable onPress={() => router.navigate('/war')}>
      <Card style={styles.warCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Semaine {isoWeek(today)}</Text>
          <Text style={styles.label}>
            Fin dans {left.days} j {left.hours} h
          </Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
          <View style={styles.teamRow}>
            <TeamBadge id={team.id} name={team.name} size={40} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {team.name}
              </Text>
              <Text style={styles.cardMeta}>{formatSteps(mine?.steps ?? 0)} pas</Text>
            </View>
          </View>
          <Text style={styles.rank}>
            {mine?.rank ?? '–'}
            <Text style={styles.rankOf}>/{ranked.length}</Text>
          </Text>
        </View>
        <Text style={[styles.cardText, { marginTop: spacing.md }]}>
          {target
            ? `${formatSteps(target.gap)} pas pour dépasser ${target.team.name}.`
            : 'En tête du classement. Garde le rythme jusqu’à dimanche.'}
        </Text>
      </Card>
    </Pressable>
  );
}

function DuelCard() {
  const { challenges, friends, history, today, friendHistory } = useAppStore();
  const active = challenges
    .map((c) => ({ c, r: evaluateChallenge(c, today, history, friendHistory(c.opponentId, challengeDays(c))) }))
    .filter(({ r }) => r.status === 'active');

  if (active.length === 0) {
    return (
      <Pressable onPress={() => router.push('/challenge/new')}>
        <Card style={styles.duelCard}>
          <Ionicons name="flash-outline" size={22} color={colors.textMuted} />
          <Text style={[styles.cardText, { flex: 1, marginTop: 0 }]}>Aucun duel en cours.</Text>
          <Text style={styles.ctaText}>Défier un ami</Text>
        </Card>
      </Pressable>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {active.slice(0, 3).map(({ c, r }) => {
        const opponent = friends.find((f) => f.id === c.opponentId);
        const ahead = r.myTotal >= r.opponentTotal;
        return (
          <Pressable key={c.id} onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })}>
            <Card style={styles.duelCard}>
              <Avatar id={c.opponentId} name={opponent?.name ?? '?'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.duelName}>{opponent?.name ?? 'Ami'}</Text>
                <Text style={styles.cardMeta}>
                  Jour {r.daysElapsed}/{c.days}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.duelScore}>
                  {formatSteps(r.myTotal)} <Text style={styles.duelVs}>– {formatSteps(r.opponentTotal)}</Text>
                </Text>
                <Text style={[styles.cardMeta, { color: ahead ? colors.success : colors.danger }]}>
                  {ahead ? 'Tu mènes' : 'En retard'}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { todaySteps, profile, history, today, pedometer, streak, celebratedDay, markCelebrated, ready, simulateSteps } =
    useAppStore();
  const goal = profile.dailyGoal;
  const done = todaySteps >= goal;
  const week = lastDays(today, 7);
  const weekMax = Math.max(goal, ...week.map((d) => history[d] ?? 0));
  const now = new Date();

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>
              {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <Text style={styles.hello} numberOfLines={1}>
              {greeting(now.getHours())}, {profile.name}
            </Text>
          </View>
          <View style={styles.streak}>
            <Ionicons name="flame" size={16} color={streak.current > 0 ? colors.primary : colors.textFaint} />
            <Text style={[styles.streakText, streak.current === 0 && { color: colors.textMuted }]}>{streak.current}</Text>
          </View>
        </View>

        <StatusBanner />

        {pedometer === 'denied' && (
          <Card style={styles.alert}>
            <Text style={styles.cardText}>StepWars a besoin de l’accès à l’activité physique pour compter tes pas.</Text>
            <Button title="Ouvrir les réglages" variant="secondary" onPress={() => Linking.openSettings()} />
          </Card>
        )}
        {pedometer === 'unavailable' &&
          (simulateSteps ? (
            <Card style={styles.alert}>
              <Text style={styles.cardText}>Aperçu web : pas de podomètre dans un navigateur. Simule une marche.</Text>
              <Button title="Ajouter 1 000 pas" variant="secondary" icon="walk-outline" onPress={() => simulateSteps(1000)} />
            </Card>
          ) : (
            <Card style={styles.alert}>
              <Text style={styles.cardText}>Aucun podomètre détecté sur cet appareil.</Text>
            </Card>
          ))}

        <View style={styles.ringWrap}>
          <ProgressRing progress={todaySteps / goal} color={done ? colors.success : colors.primary}>
            <Text style={styles.label}>Aujourd’hui</Text>
            <Text style={styles.steps}>{formatSteps(todaySteps)}</Text>
            <Text style={styles.goal}>/ {formatSteps(goal)} pas</Text>
          </ProgressRing>
          <Text style={styles.message}>{message(todaySteps, goal)}</Text>
        </View>

        <Card style={styles.stats}>
          <Stat label="Série" value={`${streak.current}`} unit="j" tint={streak.current > 0 ? colors.primary : undefined} />
          <View style={styles.divider} />
          <Stat label="Record" value={`${streak.best}`} unit="j" />
          <View style={styles.divider} />
          <Stat
            label="Distance"
            value={(todaySteps * STEP_KM).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
            unit="km"
          />
        </Card>

        <SectionTitle>Guerre d’équipes</SectionTitle>
        <WarCard />

        <SectionTitle>Duels</SectionTitle>
        <DuelCard />

        <SectionTitle>7 derniers jours</SectionTitle>
        <Card>
          <View style={styles.chart}>
            <View style={[styles.goalLine, { bottom: 20 + BAR_HEIGHT * (goal / weekMax) }]} />
            {week.map((day) => {
              const steps = history[day] ?? 0;
              return (
                <View key={day} style={styles.barColumn}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${(steps / weekMax) * 100}%`,
                          backgroundColor: steps >= goal ? colors.primary : colors.surfaceAlt,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barLabel, day === today && { color: colors.text }]}>
                    {WEEKDAYS[fromDayKey(day).getDay()]}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      </ScrollView>

      <Celebration
        visible={ready && done && celebratedDay !== today}
        steps={todaySteps}
        subtitle={
          streak.current >= 2
            ? `${streak.current} jours d’affilée. Ta série continue.`
            : 'Premier jour de ta série. Reviens demain pour la prolonger.'
        }
        onClose={markCelebrated}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  label: { color: colors.textMuted, ...font.label },
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.sm, gap: spacing.md },
  hello: { color: colors.text, ...font.title, marginTop: 4 },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  streakText: { color: colors.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  alert: { gap: spacing.sm, marginBottom: spacing.md },
  ringWrap: { alignItems: 'center', marginTop: spacing.md },
  steps: { color: colors.text, ...font.display, marginTop: 2 },
  goal: { color: colors.textMuted, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  message: { color: colors.textMuted, marginTop: spacing.md, textAlign: 'center', ...font.body },
  stats: { flexDirection: 'row', marginTop: spacing.lg, alignItems: 'center' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  warCard: { padding: spacing.md + 2 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  cardTitle: { color: colors.text, ...font.heading },
  cardMeta: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
  cardText: { color: colors.text, ...font.body, marginTop: 4 },
  rank: { color: colors.text, ...font.number },
  rankOf: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  ctaText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  duelCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  duelName: { color: colors.text, ...font.heading },
  duelScore: { color: colors.text, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  duelVs: { color: colors.textMuted },
  chart: { flexDirection: 'row', justifyContent: 'space-between', height: BAR_HEIGHT + 20 },
  barColumn: { flex: 1, alignItems: 'center' },
  barTrack: { height: BAR_HEIGHT, width: 18, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 3 },
  barLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 6 },
  goalLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.textFaint },
});
