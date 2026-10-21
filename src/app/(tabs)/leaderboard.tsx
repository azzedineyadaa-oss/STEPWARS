import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Chip, StatusBanner } from '@/components/ui';
import { ME_ID, buildLeaderboard, lastDays } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, formatSteps, spacing } from '@/theme';

const PERIODS = [
  { label: "Aujourd'hui", days: 1 },
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardScreen() {
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
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBanner />
      <View style={styles.periods}>
        {PERIODS.map((p) => (
          <Chip key={p.days} label={p.label} selected={periodDays === p.days} onPress={() => setPeriodDays(p.days)} />
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        {board.map((entry) => (
          <Card key={entry.id} style={[styles.row, entry.isMe && styles.me]}>
            <Text style={styles.rank}>{MEDALS[entry.rank - 1] ?? `#${entry.rank}`}</Text>
            <Text style={styles.avatar}>{entry.avatar}</Text>
            <Text style={styles.name}>{entry.isMe ? `${entry.name} (vous)` : entry.name}</Text>
            <Text style={styles.steps}>{formatSteps(entry.steps)}</Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md },
  periods: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  me: { borderColor: colors.primary },
  rank: { color: colors.textMuted, fontSize: 18, width: 36, textAlign: 'center', fontWeight: '700' },
  avatar: { fontSize: 28 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
  steps: { color: colors.text, fontSize: 16, fontWeight: '800' },
});
