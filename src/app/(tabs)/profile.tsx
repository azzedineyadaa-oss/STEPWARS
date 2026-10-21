import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Chip, SectionTitle } from '@/components/ui';
import { useAppStore } from '@/state/AppStore';
import { colors, formatSteps, radius, spacing } from '@/theme';

const GOALS = [5000, 8000, 10000, 15000];
const AVATARS = ['🏃', '🚶', '🧗', '🚴', '🦸', '🐆'];

export default function ProfileScreen() {
  const { profile, updateProfile, friends, addFriend, removeFriend } = useAppStore();
  const [friendName, setFriendName] = useState('');

  const onAddFriend = () => {
    if (!friendName.trim()) return;
    addFriend(friendName);
    setFriendName('');
  };

  const onRemoveFriend = (id: string, name: string) => {
    Alert.alert('Retirer cet ami ?', `${name} et vos défis contre lui ou elle seront supprimés.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => removeFriend(id) },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <SectionTitle>Pseudo</SectionTitle>
      <TextInput
        style={styles.input}
        value={profile.name}
        onChangeText={(name) => updateProfile({ name })}
        placeholder="Votre pseudo"
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

      <SectionTitle>Mon code ami</SectionTitle>
      <Card style={styles.codeCard}>
        <Text style={styles.code}>{profile.friendCode}</Text>
        <Text style={styles.muted}>Partagez ce code pour que vos amis vous ajoutent.</Text>
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
          style={[styles.input, { flex: 1 }]}
          value={friendName}
          onChangeText={setFriendName}
          placeholder="Nom de l'ami (démo)"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={onAddFriend}
          maxLength={20}
        />
        <Button title="Ajouter" onPress={onAddFriend} disabled={!friendName.trim()} />
      </View>
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  codeCard: { alignItems: 'center', gap: spacing.xs },
  code: { color: colors.primary, fontSize: 32, fontWeight: '800', letterSpacing: 6 },
  muted: { color: colors.textMuted, textAlign: 'center' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { fontSize: 26 },
  friendName: { color: colors.text, fontSize: 16, flex: 1 },
  remove: { color: colors.danger, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
});
