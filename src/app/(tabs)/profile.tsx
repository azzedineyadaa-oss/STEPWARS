import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Chip, SectionTitle, StatusBanner } from '@/components/ui';
import { requestReminderPermission } from '@/lib/reminders';
import { useAppStore } from '@/state/AppStore';
import { colors, formatSteps, radius, spacing } from '@/theme';

const GOALS = [5000, 8000, 10000, 15000];
const AVATARS = ['🏃', '🚶', '🧗', '🚴', '🦸', '🐆', '🦊', '🐺'];
const REMINDER_HOURS = [12, 18, 19, 20, 21];

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : undefined;
}

export default function ProfileScreen() {
  const { mode, profile, updateProfile, friends, addFriend, removeFriend, deleteAccount, settings, setReminderHour } =
    useAppStore();
  const [friendInput, setFriendInput] = useState('');
  const [busy, setBusy] = useState(false);
  const online = mode === 'online';

  const canAdd = online ? friendInput.trim().length === 6 : friendInput.trim().length > 0;

  const onAddFriend = async () => {
    if (!canAdd || busy) return;
    setBusy(true);
    try {
      const friend = await addFriend(friendInput);
      setFriendInput('');
      if (online) Alert.alert('Ami ajouté', `${friend.avatar} ${friend.name} fait maintenant partie de tes amis.`);
    } catch (e) {
      Alert.alert('Ajout impossible', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onRemoveFriend = (id: string, name: string) => {
    Alert.alert('Retirer cet ami ?', `${name} et tes duels contre lui ou elle seront supprimés.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () => removeFriend(id).catch((e) => Alert.alert('Retrait impossible', errorMessage(e))),
      },
    ]);
  };

  const onReminder = async (hour: number | null) => {
    if (hour !== null && !(await requestReminderPermission())) {
      Alert.alert('Notifications désactivées', 'Autorise les notifications de StepWars dans les réglages du téléphone.');
      return;
    }
    setReminderHour(hour);
  };

  const onShareCode = () =>
    Share.share({
      message: `Défie-moi sur StepWars ! Mon code ami : ${profile.friendCode}`,
    });

  const onDeleteAccount = () => {
    Alert.alert(
      'Supprimer ton compte ?',
      'Ton profil, tes amis, tes duels, ton équipe et tes pas enregistrés sur le serveur seront définitivement effacés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () =>
            deleteAccount()
              .then(() => Alert.alert('Compte supprimé', 'Toutes tes données ont été effacées.'))
              .catch((e) => Alert.alert('Suppression impossible', errorMessage(e))),
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <StatusBanner />

      <SectionTitle>Pseudo</SectionTitle>
      <TextInput
        style={styles.input}
        value={profile.name}
        onChangeText={(name) => updateProfile({ name })}
        placeholder="Ton pseudo"
        placeholderTextColor={colors.textMuted}
        maxLength={20}
      />

      <SectionTitle>Avatar</SectionTitle>
      <View style={styles.wrap}>
        {AVATARS.map((a) => (
          <Chip key={a} label={a} selected={profile.avatar === a} onPress={() => updateProfile({ avatar: a })} />
        ))}
      </View>

      <SectionTitle>Objectif quotidien</SectionTitle>
      <View style={styles.wrap}>
        {GOALS.map((g) => (
          <Chip
            key={g}
            label={formatSteps(g)}
            selected={profile.dailyGoal === g}
            onPress={() => updateProfile({ dailyGoal: g })}
          />
        ))}
      </View>

      <SectionTitle>Rappel du soir</SectionTitle>
      <View style={styles.wrap}>
        <Chip label="Désactivé" selected={settings.reminderHour === null} onPress={() => onReminder(null)} />
        {REMINDER_HOURS.map((h) => (
          <Chip key={h} label={`${h} h`} selected={settings.reminderHour === h} onPress={() => onReminder(h)} />
        ))}
      </View>

      <SectionTitle>Mon code ami</SectionTitle>
      <Card style={styles.codeCard}>
        <Text style={styles.code}>{profile.friendCode || '······'}</Text>
        <Text style={styles.muted}>Partage ce code pour que tes amis t’ajoutent.</Text>
        {online && profile.friendCode ? <Button title="Partager mon code" variant="secondary" onPress={onShareCode} /> : null}
      </Card>

      <SectionTitle>Amis ({friends.length})</SectionTitle>
      <View style={{ gap: spacing.sm }}>
        {friends.map((f) => (
          <Card key={f.id} style={styles.friendRow}>
            <Text style={styles.avatar}>{f.avatar}</Text>
            <Text style={styles.friendName}>{f.name}</Text>
            <Text style={styles.remove} onPress={() => onRemoveFriend(f.id, f.name)}>
              Retirer
            </Text>
          </Card>
        ))}
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }, online && styles.codeInput]}
          value={friendInput}
          onChangeText={(text) => setFriendInput(online ? text.toUpperCase() : text)}
          placeholder={online ? 'Code ami (6 caractères)' : "Nom de l'ami (démo)"}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={onAddFriend}
          autoCapitalize={online ? 'characters' : 'words'}
          autoCorrect={false}
          maxLength={online ? 6 : 20}
        />
        <Button title={busy ? '…' : 'Ajouter'} onPress={onAddFriend} disabled={!canAdd || busy} />
      </View>

      {online && (
        <>
          <SectionTitle>Compte</SectionTitle>
          <Text style={[styles.muted, { textAlign: 'left', marginBottom: spacing.sm }]}>
            Ton compte est lié à ce téléphone, sans e-mail. Si tu désinstalles l’app, il sera perdu.
          </Text>
          <Button title="Supprimer mon compte" variant="danger" onPress={onDeleteAccount} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
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
  codeInput: { letterSpacing: 3, fontWeight: '700' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  codeCard: { alignItems: 'center', gap: spacing.sm },
  code: { color: colors.primary, fontSize: 32, fontWeight: '800', letterSpacing: 6 },
  muted: { color: colors.textMuted, textAlign: 'center' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { fontSize: 26 },
  friendName: { color: colors.text, fontSize: 16, flex: 1 },
  remove: { color: colors.danger, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
});
