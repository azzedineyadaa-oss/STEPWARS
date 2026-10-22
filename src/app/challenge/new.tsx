import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, SectionTitle } from '@/components/ui';
import { useAppStore } from '@/state/AppStore';
import { colors, radius, spacing } from '@/theme';

const DURATIONS = [
  { label: '1 jour', days: 1 },
  { label: '3 jours', days: 3 },
  { label: '1 semaine', days: 7 },
];

const STAKES = ['Le perdant paie le café', 'Le perdant paie le resto', 'Le perdant choisit la prochaine balade'];

export default function NewChallengeScreen() {
  const { friends, createChallenge } = useAppStore();
  // Ouvert depuis une fiche joueur ou une revanche : l'adversaire (et la durée) sont déjà choisis.
  const params = useLocalSearchParams<{ opponent?: string; days?: string }>();
  const [opponentId, setOpponentId] = useState<string | null>(
    friends.some((f) => f.id === params.opponent) ? (params.opponent ?? null) : (friends[0]?.id ?? null),
  );
  const [days, setDays] = useState(DURATIONS.some((d) => String(d.days) === params.days) ? Number(params.days) : 1);
  const [stake, setStake] = useState('');
  const [busy, setBusy] = useState(false);
  const opponentName = friends.find((f) => f.id === opponentId)?.name;

  const onCreate = async () => {
    if (!opponentId) return;
    setBusy(true);
    try {
      const challenge = await createChallenge(opponentId, days, stake);
      router.replace({ pathname: '/challenge/[id]', params: { id: challenge.id } });
    } catch (e) {
      Alert.alert('Duel non créé', e instanceof Error ? e.message : undefined);
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <SectionTitle>Adversaire</SectionTitle>
      {friends.length === 0 ? (
        <Text style={styles.muted}>Ajoute d’abord un ami depuis l’onglet Profil.</Text>
      ) : (
        <View style={styles.wrap}>
          {friends.map((f) => (
            <Chip key={f.id} label={f.name} selected={opponentId === f.id} onPress={() => setOpponentId(f.id)} />
          ))}
        </View>
      )}

      <SectionTitle>Durée</SectionTitle>
      <View style={styles.wrap}>
        {DURATIONS.map((d) => (
          <Chip key={d.days} label={d.label} selected={days === d.days} onPress={() => setDays(d.days)} />
        ))}
      </View>

      <SectionTitle>Gage (facultatif)</SectionTitle>
      <TextInput
        style={styles.input}
        value={stake}
        onChangeText={setStake}
        placeholder="Ce que le perdant devra faire"
        placeholderTextColor={colors.textFaint}
        maxLength={60}
      />
      <View style={[styles.wrap, { marginTop: spacing.sm }]}>
        {STAKES.map((s) => (
          <Chip key={s} label={s} selected={stake === s} onPress={() => setStake(stake === s ? '' : s)} />
        ))}
      </View>

      <Text style={[styles.muted, { marginVertical: spacing.lg }]}>
        {opponentName ? `${opponentName} reçoit ton invitation. ` : ''}
        Le duel commence dès qu’elle est acceptée : celui ou celle qui totalise le plus de pas sur la période gagne.
      </Text>

      <Button title={busy ? 'Envoi…' : 'Envoyer le défi'} icon="flash" onPress={onCreate} disabled={!opponentId || busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muted: { color: colors.textMuted, lineHeight: 20 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
  },
});
