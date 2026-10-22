import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Button, tap } from '@/components/ui';
import { fromDayKey } from '@/lib/game';
import { divisionName, resultHeadline } from '@/lib/league';
import { useAppStore } from '@/state/AppStore';
import { colors, formatSteps, radius, spacing } from '@/theme';

// Carte au format story (9:16), capturée en image puis partagée.
const CARD_WIDTH = 360;
const CARD_HEIGHT = 640;

export default function ShareScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { profile, todaySteps, today, streak, currentLeague, weeklyRecap } = useAppStore();
  const { width } = useWindowDimensions();
  const card = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const recap = kind === 'week' ? weeklyRecap : null;
  const me = currentLeague?.entries.find((e) => e.isMe);
  const scale = Math.min(1, (width - spacing.lg * 2) / CARD_WIDTH);
  const goalReached = todaySteps >= profile.dailyGoal;

  const onShare = async () => {
    if (busy || !card.current) return;
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Partage indisponible', 'Ton téléphone ne permet pas de partager cette image.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Partager' });
      tap('success');
    } catch (e) {
      Alert.alert('Partage impossible', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: recap ? 'Partager ma semaine' : 'Partager ma journée' }} />
      <View style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale, alignSelf: 'center' }}>
        <View style={{ transform: [{ scale }], transformOrigin: 'top left' }}>
          <View ref={card} collapsable={false} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.logo}>
                <Ionicons name="flash" size={18} color={colors.onPrimary} />
              </View>
              <Text style={styles.brand}>StepWars</Text>
            </View>

            {recap ? (
              <View style={styles.cardBody}>
                <Text style={styles.label}>Semaine terminée</Text>
                <Text style={styles.headline}>{resultHeadline(recap)}</Text>
                <Text style={styles.big}>{formatSteps(recap.steps)}</Text>
                <Text style={styles.unit}>pas en 7 jours</Text>
                <View style={styles.pill}>
                  <Ionicons name="trophy" size={16} color={colors.primary} />
                  <Text style={styles.pillText}>
                    {recap.position}
                    {recap.position === 1 ? 'er' : 'e'} sur {recap.members} · Ligue {divisionName(recap.division)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.cardBody}>
                <Text style={styles.label}>
                  {fromDayKey(today).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
                <Text style={styles.big}>{formatSteps(todaySteps)}</Text>
                <Text style={styles.unit}>pas aujourd’hui</Text>
                <View style={styles.pills}>
                  {goalReached && (
                    <View style={styles.pill}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={styles.pillText}>Objectif {formatSteps(profile.dailyGoal)} atteint</Text>
                    </View>
                  )}
                  {streak.current > 0 && (
                    <View style={styles.pill}>
                      <Ionicons name="flame" size={16} color={colors.primary} />
                      <Text style={styles.pillText}>
                        {streak.current} jour{streak.current > 1 ? 's' : ''} de série
                      </Text>
                    </View>
                  )}
                  {currentLeague && me && (
                    <View style={styles.pill}>
                      <Ionicons name="trophy" size={16} color={colors.primary} />
                      <Text style={styles.pillText}>
                        {me.position}
                        {me.position === 1 ? 'er' : 'e'} de ma ligue {divisionName(currentLeague.division)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            <View style={styles.cardFooter}>
              <Text style={styles.footerName}>{profile.name}</Text>
              <Text style={styles.footerText}>Viens me défier sur StepWars</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Button title={busy ? '…' : 'Partager'} icon="share-outline" onPress={onShare} disabled={busy || Platform.OS === 'web'} />
        {Platform.OS === 'web' && <Text style={styles.note}>Le partage d’image fonctionne sur téléphone.</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.6 },
  cardBody: { gap: 6 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  headline: { color: colors.primary, fontSize: 26, fontWeight: '900', letterSpacing: -0.6, marginTop: 4 },
  big: { color: colors.text, fontSize: 84, fontWeight: '900', letterSpacing: -3.5, fontVariant: ['tabular-nums'], marginTop: 8 },
  unit: { color: colors.textMuted, fontSize: 18, fontWeight: '700', marginTop: -6 },
  pills: { gap: 8, marginTop: 18 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    marginTop: 10,
  },
  pillText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  cardFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  footerName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  footerText: { color: colors.textMuted, fontSize: 14, fontWeight: '600', marginTop: 2 },
  note: { color: colors.textMuted, textAlign: 'center', fontSize: 13 },
});
