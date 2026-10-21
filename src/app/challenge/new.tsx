import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, SectionTitle } from '@/components/ui';
import { useAppStore } from '@/state/AppStore';
import { colors, spacing } from '@/theme';

const DURATIONS = [
  { label: '1 jour', days: 1 },
  { label: '3 jours', days: 3 },
  { label: '1 semaine', days: 7 },
];

export default function NewChallengeScreen() {
  const { friends, createChallenge } = useAppStore();
  const [opponentId, setOpponentId] = useState<string | null>(friends[0]?.id ?? null);
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    if (!opponentId) return;
    setBusy(true);
    try {
      const challenge = await createChallenge(opponentId, days);
      router.replace({ pathname: '/challenge/[id]', params: { id: challenge.id } });
    } catch (e) {
      Alert.alert('Défi non créé', e instanceof Error ? e.message : undefined);
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionTitle>Adversaire</SectionTitle>
      {friends.length === 0 ? (
        <Text style={styles.muted}>Ajoutez d’abord un ami depuis l’onglet Profil.</Text>
      ) : (
        <View style={styles.wrap}>
          {friends.map((f) => (
            <Chip
              key={f.id}
              label={`${f.avatar} ${f.name}`}
              selected={opponentId === f.id}
              onPress={() => setOpponentId(f.id)}
            />
          ))}
        </View>
      )}

      <SectionTitle>Durée</SectionTitle>
      <View style={styles.wrap}>
        {DURATIONS.map((d) => (
          <Chip key={d.days} label={d.label} selected={days === d.days} onPress={() => setDays(d.days)} />
        ))}
      </View>

      <Text style={[styles.muted, { marginVertical: spacing.lg }]}>
        Le défi commence aujourd’hui. Celui ou celle qui fait le plus de pas sur la période gagne.
      </Text>

      <Button title={busy ? 'Envoi…' : 'Lancer le défi'} onPress={onCreate} disabled={!opponentId || busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muted: { color: colors.textMuted },
});
