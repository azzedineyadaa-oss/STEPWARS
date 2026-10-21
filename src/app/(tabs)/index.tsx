import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Celebration } from '@/components/Celebration';
import { ProgressRing } from '@/components/ProgressRing';
import { Button, Card, GradientCard, SectionTitle, StatPill, StatusBanner } from '@/components/ui';
import {
  challengeDays,
  evaluateChallenge,
  fromDayKey,
  lastDays,
  nextTarget,
  rankByScore,
  warTimeLeft,
} from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, gradients, radius, spacing } from '@/theme';

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
// Longueur moyenne d'un pas, pour donner un ordre de grandeur en km.
const STEP_KM = 0.00075;
// Géométrie du graphique : étiquette de valeur au-dessus, puis barre.
const BAR_TOP = 14;
const BAR_HEIGHT = 110;

function greeting(hour: number) {
  if (hour < 6) return 'Encore debout';
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Salut';
  return 'Bonsoir';
}

function motivation(steps: number, goal: number) {
  if (steps >= goal * 1.5) return 'Mode légende activé. Personne ne t’arrête. 🚀';
  if (steps >= goal) return 'Objectif pulvérisé ! Chaque pas en plus compte pour ton équipe. 🔥';
  const left = goal - steps;
  if (steps === 0) return 'La journée commence. Premier pas, première victoire.';
  if (left < 1000) return `Plus que ${formatSteps(left)} pas. Tu y es presque !`;
  return `Encore ${formatSteps(left)} pas pour atteindre ton objectif.`;
}

function WarCard() {
  const { team, teamStandings } = useAppStore();
  const left = warTimeLeft(new Date());

  if (!team) {
    return (
      <Pressable onPress={() => router.push('/team/new')}>
        <GradientCard gradient="war">
          <Text style={styles.cardKicker}>GUERRE D’ÉQUIPES</Text>
          <Text style={styles.cardTitle}>⚔️ Rejoins la bataille</Text>
          <Text style={styles.cardText}>
            Crée ton équipe avec tes amis ou tes collègues et affrontez les autres équipes chaque semaine.
          </Text>
          <Text style={styles.cardCta}>Créer ou rejoindre une équipe →</Text>
        </GradientCard>
      </Pressable>
    );
  }

  const ranked = rankByScore(teamStandings);
  const mine = ranked.find((t) => t.id === team.id);
  const target = nextTarget(ranked, team.id);

  return (
    <Pressable onPress={() => router.navigate('/war')}>
      <GradientCard gradient="war">
        <View style={styles.rowBetween}>
          <Text style={styles.cardKicker}>GUERRE DE LA SEMAINE</Text>
          <Text style={styles.cardKicker}>
            ⏳ {left.days} j {left.hours} h
          </Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {team.emoji} {team.name}
          </Text>
          <Text style={styles.rankBadge}>
            {mine?.rank === 1 ? '👑 1er' : `${mine?.rank ?? '–'}ᵉ`}
            <Text style={styles.rankTotal}> / {ranked.length}</Text>
          </Text>
        </View>
        <Text style={styles.cardText}>
          {target
            ? `Plus que ${formatSteps(target.gap)} pas pour dépasser ${target.team.emoji} ${target.team.name} !`
            : 'Vous êtes en tête. Tenez bon jusqu’à dimanche minuit !'}
        </Text>
      </GradientCard>
    </Pressable>
  );
}

function DuelsCard() {
  const { challenges, friends, history, today, friendHistory } = useAppStore();
  const active = challenges
    .map((c) => ({ c, r: evaluateChallenge(c, today, history, friendHistory(c.opponentId, challengeDays(c))) }))
    .filter(({ r }) => r.status === 'active');

  if (active.length === 0) {
    return (
      <Card style={styles.duelCard}>
        <Text style={styles.duelEmoji}>⚡</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.duelTitle}>Aucun duel en cours</Text>
          <Text style={styles.duelText}>Défie un ami sur 1, 3 ou 7 jours.</Text>
        </View>
        <Text style={styles.link} onPress={() => router.push('/challenge/new')}>
          Défier
        </Text>
      </Card>
    );
  }

  const leading = active.filter(({ r }) => r.myTotal > r.opponentTotal).length;
  const { c, r } = active[0];
  const opponent = friends.find((f) => f.id === c.opponentId);
  return (
    <Pressable onPress={() => router.navigate('/challenges')}>
      <Card style={styles.duelCard}>
        <Text style={styles.duelEmoji}>{opponent?.avatar ?? '⚡'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.duelTitle}>
            {active.length === 1 ? `Duel contre ${opponent?.name ?? '…'}` : `${active.length} duels en cours`}
          </Text>
          <Text style={styles.duelText}>
            {active.length === 1
              ? `${formatSteps(r.myTotal)} – ${formatSteps(r.opponentTotal)}`
              : `Tu mènes dans ${leading} sur ${active.length}`}
          </Text>
        </View>
        <Text style={[styles.duelStatus, { color: r.myTotal >= r.opponentTotal ? colors.success : colors.danger }]}>
          {active.length === 1 ? (r.myTotal >= r.opponentTotal ? 'Tu mènes' : 'À la traîne') : '→'}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { todaySteps, profile, history, today, pedometer, streak, celebratedDay, markCelebrated, ready } =
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
            <Text style={styles.date}>
              {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <Text style={styles.hello} numberOfLines={1}>
              {greeting(now.getHours())} {profile.name} {profile.avatar}
            </Text>
          </View>
          <View style={[styles.flame, streak.current > 0 && styles.flameOn]}>
            <Text style={styles.flameIcon}>🔥</Text>
            <Text style={styles.flameCount}>{streak.current}</Text>
          </View>
        </View>

        <StatusBanner />

        {pedometer === 'denied' && (
          <Card style={styles.alert}>
            <Text style={styles.alertText}>
              StepWars a besoin de l’accès à l’activité physique pour compter tes pas.
            </Text>
            <Button title="Ouvrir les réglages" variant="secondary" onPress={() => Linking.openSettings()} />
          </Card>
        )}
        {pedometer === 'unavailable' && (
          <Card style={styles.alert}>
            <Text style={styles.alertText}>Aucun podomètre détecté sur cet appareil.</Text>
          </Card>
        )}

        <View style={styles.ringWrap}>
          <ProgressRing progress={todaySteps / goal} gradient={done ? gradients.victory : gradients.energy}>
            <Text style={styles.ringLabel}>{done ? 'OBJECTIF ATTEINT' : 'AUJOURD’HUI'}</Text>
            <Text style={styles.steps}>{formatSteps(todaySteps)}</Text>
            <Text style={styles.goal}>sur {formatSteps(goal)} pas</Text>
          </ProgressRing>
          <Text style={styles.message}>{motivation(todaySteps, goal)}</Text>
        </View>

        <View style={styles.stats}>
          <StatPill icon="🔥" value={`${streak.current} j`} label="Série" tint={streak.current > 0 ? colors.flame : colors.text} />
          <StatPill icon="🏅" value={`${streak.best} j`} label="Record" />
          <StatPill
            icon="📍"
            value={`${(todaySteps * STEP_KM).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`}
            label="Distance"
          />
        </View>

        <SectionTitle>Guerre d’équipes</SectionTitle>
        <WarCard />

        <SectionTitle>Duels</SectionTitle>
        <DuelsCard />

        <SectionTitle>7 derniers jours</SectionTitle>
        <Card>
          <View style={styles.chart}>
            <View style={[styles.goalLine, { top: BAR_TOP + BAR_HEIGHT * (1 - goal / weekMax) }]} />
            {week.map((day) => {
              const steps = history[day] ?? 0;
              const reached = steps >= goal;
              return (
                <View key={day} style={styles.barColumn}>
                  <Text style={styles.barValue}>{steps > 0 ? `${Math.round(steps / 1000)}k` : ''}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${(steps / weekMax) * 100}%`,
                          backgroundColor: reached ? colors.gold : colors.secondary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barLabel, day === today && styles.barLabelToday]}>
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
        title="Objectif atteint !"
        subtitle={
          streak.current >= 2
            ? `${streak.current} jours d’affilée 🔥 Ta série continue, ne la lâche pas !`
            : 'Premier jour de ta série 🔥 Reviens demain pour la faire grandir.'
        }
        onClose={markCelebrated}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  date: { color: colors.textMuted, ...font.caption, textTransform: 'capitalize' },
  hello: { color: colors.text, ...font.title, marginTop: 2 },
  flame: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.6,
  },
  flameOn: { opacity: 1, borderColor: colors.flame, backgroundColor: '#2A1A12' },
  flameIcon: { fontSize: 18 },
  flameCount: { color: colors.text, fontSize: 18, fontWeight: '900' },
  alert: { gap: spacing.sm, marginBottom: spacing.md },
  alertText: { color: colors.text },
  ringWrap: { alignItems: 'center', marginTop: spacing.sm },
  ringLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  steps: { color: colors.text, ...font.hero },
  goal: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  message: { color: colors.text, marginTop: spacing.md, textAlign: 'center', fontSize: 16, fontWeight: '600', paddingHorizontal: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardKicker: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  cardTitle: { color: '#fff', ...font.title, flexShrink: 1 },
  cardText: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600', marginTop: spacing.sm },
  cardCta: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: spacing.md },
  rankBadge: { color: '#fff', fontSize: 24, fontWeight: '900' },
  rankTotal: { fontSize: 15, color: 'rgba(255,255,255,0.7)' },
  duelCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  duelEmoji: { fontSize: 32 },
  duelTitle: { color: colors.text, ...font.heading },
  duelText: { color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  duelStatus: { fontWeight: '900' },
  link: { color: colors.primary, fontWeight: '900', fontSize: 16 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', height: 150 },
  barColumn: { flex: 1, alignItems: 'center' },
  barValue: { color: colors.textMuted, fontSize: 10, fontWeight: '700', height: BAR_TOP },
  barTrack: { height: BAR_HEIGHT, width: 20, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 7, minHeight: 4 },
  barLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  barLabelToday: { color: colors.primary },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gold,
    opacity: 0.5,
  },
});
