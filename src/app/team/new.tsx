import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, SectionTitle, TeamBadge } from '@/components/ui';
import { useAppStore } from '@/state/AppStore';
import { colors, font, radius, spacing } from '@/theme';

// Emblème enregistré côté serveur ; l'app affiche les initiales de l'équipe.
const DEFAULT_EMBLEM = '⚔️';

export default function NewTeamScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { createTeam, joinTeam, mode: appMode } = useAppStore();
  const [mode, setMode] = useState<'create' | 'join'>(params.mode === 'join' ? 'join' : 'create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = mode === 'create' ? name.trim().length >= 2 : code.trim().length === 6;

  const onSubmit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (mode === 'create') await createTeam(name, DEFAULT_EMBLEM);
      else await joinTeam(code);
      router.dismissTo('/war');
    } catch (e) {
      Alert.alert(mode === 'create' ? 'Création impossible' : 'Impossible de rejoindre', e instanceof Error ? e.message : undefined);
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.tabs}>
        <Chip label="Créer" selected={mode === 'create'} onPress={() => setMode('create')} />
        <Chip label="Rejoindre" selected={mode === 'join'} onPress={() => setMode('join')} />
      </View>

      {mode === 'create' ? (
        <>
          <View style={styles.preview}>
            <TeamBadge id={name.trim() || 'team'} name={name.trim() || 'Équipe'} size={56} />
            <Text style={styles.previewName} numberOfLines={1}>
              {name.trim() || 'Nom de l’équipe'}
            </Text>
          </View>

          <SectionTitle>Nom de l’équipe</SectionTitle>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Les Fusées, Team Bureau 3…"
            placeholderTextColor={colors.textFaint}
            maxLength={24}
            autoFocus
          />
          <Text style={styles.hint}>Visible par toutes les équipes dans le classement.</Text>
        </>
      ) : (
        <>
          <SectionTitle>Code d’équipe</SectionTitle>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="ABC234"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            autoFocus
          />
          <Text style={styles.hint}>
            {appMode === 'demo'
              ? 'En mode démo, n’importe quel code fonctionne.'
              : 'Demande le code à un membre de l’équipe (onglet Guerre).'}
          </Text>
        </>
      )}

      <View style={{ marginTop: spacing.xl }}>
        <Button
          title={busy ? '…' : mode === 'create' ? 'Créer l’équipe' : 'Rejoindre l’équipe'}
          onPress={onSubmit}
          disabled={!valid || busy}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  previewName: { color: colors.text, ...font.title, flex: 1 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 17,
    fontWeight: '600',
  },
  codeInput: { fontSize: 24, letterSpacing: 6, fontWeight: '800', textAlign: 'center' },
  hint: { color: colors.textMuted, marginTop: spacing.sm, fontSize: 13 },
});
