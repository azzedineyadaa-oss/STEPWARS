import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Card, Chip, SectionTitle, StatusBanner } from '@/components/ui';
import { requestReminderPermission } from '@/lib/reminders';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

const GOALS = [5000, 8000, 10000, 15000];
const REMINDER_HOURS = [12, 18, 19, 20, 21];

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : undefined;
}

export default function ProfileScreen() {
  const { mode, myId, profile, updateProfile, friends, addFriend, removeFriend, deleteAccount, settings, setReminderHour } =
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
      if (online) Alert.alert('Ami ajouté', `${friend.name} fait maintenant partie de tes amis.`);
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
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBanner />

      <View style={styles.header}>
        <Avatar id={myId} name={profile.name || '?'} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>
            {profile.name}
          </Text>
          <Text style={styles.headerMeta}>Objectif {formatSteps(profile.dailyGoal)} pas par jour</Text>
        </View>
      </View>

      <SectionTitle>Pseudo</SectionTitle>
      <TextInput
        style={styles.input}
        value={profile.name}
        onChangeText={(name) => updateProfile({ name })}
        placeholder="Ton pseudo"
        placeholderTextColor={colors.textMuted}
        maxLength={20}
      />

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
        <View style={{ flex: 1 }}>
          <Text style={styles.code}>{profile.friendCode || '······'}</Text>
          <Text style={styles.small}>Partage ce code pour que tes amis t’ajoutent.</Text>
        </View>
        {online && profile.friendCode ? (
          <Button title="Partager" variant="secondary" icon="share-outline" onPress={onShareCode} />
        ) : null}
      </Card>

      <SectionTitle>Amis ({friends.length})</SectionTitle>
      {friends.length > 0 && (
        <Card style={{ paddingVertical: spacing.xs }}>
          {friends.map((f, i) => (
            <View key={f.id} style={[styles.friendRow, i > 0 && styles.rowBorder]}>
              <Avatar id={f.id} name={f.name} size={32} />
              <Text style={styles.friendName}>{f.name}</Text>
              <Text style={styles.remove} onPress={() => onRemoveFriend(f.id, f.name)}>
                Retirer
              </Text>
            </View>
          ))}
        </Card>
      )}

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
          <Text style={[styles.small, { marginBottom: spacing.sm }]}>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  headerName: { color: colors.text, ...font.title },
  headerMeta: { color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  codeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  code: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  small: { color: colors.textMuted, fontSize: 13, fontWeight: '500', marginTop: 2 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  friendName: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  remove: { color: colors.danger, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
});
