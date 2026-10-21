import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProgressRing } from '@/components/ProgressRing';
import { Button, Card, SectionTitle } from '@/components/ui';
import { fromDayKey, lastDays } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, formatSteps, spacing } from '@/theme';

const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function TodayScreen() {
  const { todaySteps, profile, history, today, pedometer } = useAppStore();
  const goal = profile.dailyGoal;
  const week = lastDays(today, 7);
  const weekMax = Math.max(goal, ...week.map((d) => history[d] ?? 0));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {pedometer === 'denied' && (
        <Card style={styles.alert}>
          <Text style={styles.alertText}>
            StepWars a besoin de l’accès à l’activité physique pour compter vos pas.
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
        <ProgressRing progress={todaySteps / goal} color={todaySteps >= goal ? colors.success : colors.primary}>
          <Text style={styles.steps}>{formatSteps(todaySteps)}</Text>
          <Text style={styles.goal}>sur {formatSteps(goal)} pas</Text>
        </ProgressRing>
        <Text style={styles.message}>
          {todaySteps >= goal
            ? 'Objectif atteint, bravo ! 🔥'
            : `Encore ${formatSteps(goal - todaySteps)} pas pour atteindre votre objectif.`}
        </Text>
      </View>

      <SectionTitle>7 derniers jours</SectionTitle>
      <Card>
        <View style={styles.chart}>
          {week.map((day) => {
            const steps = history[day] ?? 0;
            const date = fromDayKey(day);
            return (
              <View key={day} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${(steps / weekMax) * 100}%`,
                        backgroundColor: steps >= goal ? colors.success : colors.secondary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barLabel, day === today && { color: colors.text }]}>
                  {WEEKDAYS[date.getDay()]}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  alert: { gap: spacing.sm, marginBottom: spacing.md },
  alertText: { color: colors.text },
  ringWrap: { alignItems: 'center', marginTop: spacing.md },
  steps: { color: colors.text, fontSize: 44, fontWeight: '800' },
  goal: { color: colors.textMuted, fontSize: 15 },
  message: { color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },
  chart: { flexDirection: 'row', justifyContent: 'space-between', height: 140 },
  barColumn: { flex: 1, alignItems: 'center' },
  barTrack: { flex: 1, width: 18, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 6, minHeight: 4 },
  barLabel: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
});
