import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Fragment } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, SectionTitle } from '@/components/ui';
import { warTimeLeft } from '@/lib/game';
import {
  DIVISIONS,
  divisionName,
  leagueTarget,
  movementCount,
  zoneFor,
  type League,
  type LeagueTarget,
} from '@/lib/league';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

function targetText(target: LeagueTarget | null, division: number): string {
  if (!target) return '';
  switch (target.kind) {
    case 'escape':
      return `Encore ${formatSteps(target.steps)} pas pour sortir de la zone de descente`;
    case 'promote':
      return `Encore ${formatSteps(target.steps)} pas pour monter en ${divisionName(division + 1)}`;
    case 'overtake':
      return `${formatSteps(target.steps)} pas pour dépasser ${target.name}`;
    case 'lead':
      return target.steps > 0 ? `Tu mènes avec ${formatSteps(target.steps)} pas d’avance` : 'Tu es en tête, à égalité';
    case 'alone':
      return 'Les autres joueurs de ta ligue arrivent au fil de la semaine';
  }
}

/** Les 5 niveaux, le mien en évidence. */
function Ladder({ division }: { division: number }) {
  return (
    <View style={styles.ladder}>
      {DIVISIONS.map((d) => (
        <View key={d.level} style={{ flex: 1, gap: 6 }}>
          <View style={[styles.step, d.level <= division && styles.stepOn]} />
          <Text style={[styles.stepLabel, d.level === division && styles.stepLabelOn]} numberOfLines={1}>
            {d.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Standings({ league }: { league: League }) {
  const members = league.entries.length;
  const count = movementCount(members);
  const showUp = count > 0 && league.division < 5;
  const showDown = count > 0 && league.division > 1;
  return (
    <Card style={{ paddingVertical: spacing.xs }}>
      {league.entries.map((e, i) => {
        const zone = zoneFor(e.position, members, league.division);
        return (
          <Fragment key={e.id}>
            {showDown && e.position === members - count + 1 && (
              <View style={styles.divider}>
                <Ionicons name="arrow-down" size={12} color={colors.danger} />
                <Text style={[styles.dividerText, { color: colors.danger }]}>Zone de descente</Text>
              </View>
            )}
            <View style={[styles.row, i > 0 && !(showDown && e.position === members - count + 1) && styles.rowBorder, e.isMe && styles.rowMe]}>
              <Text
                style={[
                  styles.position,
                  zone === 'up' && { color: colors.success },
                  zone === 'down' && { color: colors.danger },
                ]}
              >
                {e.position}
              </Text>
              <Avatar id={e.id} name={e.name} size={30} />
              <Text style={[styles.name, e.isMe && { color: colors.primary }]} numberOfLines={1}>
                {e.name}
                {e.isMe ? <Text style={styles.meta}> · toi</Text> : null}
              </Text>
              <Text style={styles.steps}>{formatSteps(e.steps)}</Text>
            </View>
            {showUp && e.position === count && (
              <View style={styles.divider}>
                <Ionicons name="arrow-up" size={12} color={colors.success} />
                <Text style={[styles.dividerText, { color: colors.success }]}>Zone de montée</Text>
              </View>
            )}
          </Fragment>
        );
      })}
    </Card>
  );
}

export function LeagueView() {
  const { currentLeague: league, mode, sync } = useAppStore();

  if (!league) {
    return (
      <Card style={styles.pending}>
        {sync.status === 'error' ? (
          <Text style={styles.meta}>Ta ligue s’affichera dès que la connexion sera rétablie.</Text>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.meta}>Recherche de joueurs de ton niveau…</Text>
          </>
        )}
      </Card>
    );
  }

  const me = league.entries.find((e) => e.isMe);
  const members = league.entries.length;
  const count = movementCount(members);
  const left = warTimeLeft(new Date());
  const zone = me ? zoneFor(me.position, members, league.division) : 'stay';

  return (
    <>
      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.badge}>
            <Ionicons name="trophy" size={22} color={colors.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Niveau {league.division}</Text>
            <Text style={styles.division}>Ligue {divisionName(league.division)}</Text>
          </View>
          <Text style={styles.time}>
            {left.days} j {left.hours} h
          </Text>
        </View>

        <View style={styles.numbers}>
          <View>
            <Text style={styles.label}>Ta place</Text>
            <Text style={styles.big}>
              {me?.position ?? '–'}
              <Text style={styles.bigOf}>/{members}</Text>
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.label}>Cette semaine</Text>
            <Text style={styles.big}>{formatSteps(me?.steps ?? 0)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Ionicons
            name={zone === 'up' ? 'trending-up' : zone === 'down' ? 'trending-down' : 'flag-outline'}
            size={18}
            color={zone === 'up' ? colors.success : zone === 'down' ? colors.danger : colors.primary}
          />
          <Text style={styles.footerText}>{targetText(leagueTarget(league), league.division)}</Text>
        </View>
      </Card>

      <Ladder division={league.division} />

      <SectionTitle>Classement</SectionTitle>
      <Standings league={league} />

      <Text style={styles.rules}>
        {count > 0
          ? `Classement sur les pas du lundi au dimanche. Dimanche soir, les ${count} premiers montent d’un niveau et les ${count} derniers descendent.`
          : 'Classement sur les pas du lundi au dimanche. Les montées et descentes commencent à partir de 4 joueurs.'}
        {mode === 'demo' ? ' En démo, les autres joueurs sont simulés.' : ''}
      </Text>

      {mode === 'online' && members < 10 && (
        <View style={{ marginTop: spacing.md }}>
          <Button title="Inviter des amis" variant="secondary" icon="share-outline" onPress={() => router.push('/profile')} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pending: { marginTop: spacing.md, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  hero: { marginTop: spacing.md, gap: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.textMuted, ...font.label },
  division: { color: colors.text, ...font.title, marginTop: 2 },
  time: { color: colors.primary, fontWeight: '800', fontVariant: ['tabular-nums'] },
  numbers: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  big: { color: colors.text, ...font.display, fontSize: 44, letterSpacing: -1.5 },
  bigOf: { color: colors.textMuted, fontSize: 20, fontWeight: '700', letterSpacing: 0 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  footerText: { color: colors.text, fontWeight: '700', flex: 1 },
  ladder: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  step: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt },
  stepOn: { backgroundColor: colors.primary },
  stepLabel: { color: colors.textFaint, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  stepLabelOn: { color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowMe: { backgroundColor: colors.surfaceAlt, marginHorizontal: -spacing.md, paddingHorizontal: spacing.md },
  position: { color: colors.textMuted, width: 22, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  name: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  meta: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  steps: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  dividerText: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  rules: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
});
