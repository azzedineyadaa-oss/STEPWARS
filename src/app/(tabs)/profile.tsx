import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Avatar, Button, Card, Chip, SectionTitle, StatusBanner, type IconName } from '@/components/ui';
import { computeBadges } from '@/lib/badges';
import { friendInviteMessage, friendInviteUrl } from '@/lib/invite';
import { requestReminderPermission } from '@/lib/reminders';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

const GOALS = [5000, 8000, 10000, 15000];
const REMINDER_HOURS = [12, 18, 19, 20, 21];

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : undefined;
}

export default function ProfileScreen() {
  const {
    mode,
    myId,
    profile,
    accountEmail,
    updateProfile,
    friends,
    addFriend,
    removeFriend,
    deleteAccount,
    settings,
    setReminderHour,
    history,
    streak,
  } = useAppStore();
  const badges = computeBadges(history, profile.dailyGoal, streak.best);
  const earned = badges.filter((b) => b.earned).length;
  const [friendInput, setFriendInput] = useState('');
  const [showQr, setShowQr] = useState(false);
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

  const onShareCode = () => Share.share({ message: friendInviteMessage(profile.friendCode) });

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

      {accountEmail ? (
        <View style={styles.saved}>
          <Ionicons name="shield-checkmark" size={18} color={colors.success} />
          <Text style={styles.savedText} numberOfLines={1}>
            Compte sauvegardé · {accountEmail}
          </Text>
        </View>
      ) : (
        <Pressable onPress={() => router.push('/account')}>
          <Card style={styles.backup}>
            <Ionicons name="shield-outline" size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.backupTitle}>Sauvegarde ta progression</Text>
              <Text style={styles.small}>Ajoute ton e-mail pour ne rien perdre si tu changes de téléphone.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Card>
        </Pressable>
      )}

      <SectionTitle>
        Badges · {earned}/{badges.length}
      </SectionTitle>
      <View style={styles.badges}>
        {badges.map((b) => (
          <View key={b.id} style={styles.badge}>
            <View style={[styles.badgeIcon, b.earned && styles.badgeIconOn]}>
              <Ionicons
                name={b.icon as IconName}
                size={22}
                color={b.earned ? colors.onPrimary : colors.textFaint}
              />
            </View>
            <Text style={[styles.badgeTitle, !b.earned && { color: colors.textMuted }]} numberOfLines={2}>
              {b.title}
            </Text>
            {!b.earned && (
              <View style={styles.badgeTrack}>
                <View style={[styles.badgeBar, { width: `${Math.round(b.progress * 100)}%` }]} />
              </View>
            )}
          </View>
        ))}
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

      <SectionTitle>Inviter des amis</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        <View>
          <Text style={styles.label}>Mon code ami</Text>
          <Text style={styles.code}>{profile.friendCode || '······'}</Text>
          <Text style={styles.small}>Envoie le lien, ou fais scanner le QR code avec l’appareil photo.</Text>
        </View>
        {showQr && profile.friendCode ? (
          <View style={styles.qr}>
            <QRCode value={friendInviteUrl(profile.friendCode)} size={196} color="#0A0A0B" backgroundColor="#FFFFFF" />
          </View>
        ) : null}
        <View style={styles.inviteRow}>
          <View style={{ flex: 1 }}>
            <Button title="Inviter" icon="share-outline" onPress={onShareCode} disabled={!profile.friendCode} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title={showQr ? 'Masquer' : 'QR code'}
              variant="secondary"
              icon="qr-code-outline"
              onPress={() => setShowQr((v) => !v)}
              disabled={!profile.friendCode}
            />
          </View>
        </View>
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
            {accountEmail
              ? `Lié à ${accountEmail}. Sur un autre téléphone, choisis « J’ai déjà un compte ».`
              : 'Ton compte est lié à ce téléphone, sans e-mail. Si tu désinstalles l’app sans l’avoir sauvegardé, il sera perdu.'}
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
  label: { color: colors.textMuted, ...font.label },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    width: '31.5%',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  badgeIconOn: { backgroundColor: colors.primary },
  badgeTitle: { color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  badgeTrack: { alignSelf: 'stretch', height: 3, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  badgeBar: { height: 3, backgroundColor: colors.textMuted },
  inviteRow: { flexDirection: 'row', gap: spacing.sm },
  qr: { alignSelf: 'center', padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: radius.lg },
  backup: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, borderColor: colors.primary, borderWidth: 1 },
  backupTitle: { color: colors.text, ...font.heading },
  saved: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  savedText: { color: colors.textMuted, fontWeight: '600', flex: 1 },
  code: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 6, marginTop: 4, fontVariant: ['tabular-nums'] },
  small: { color: colors.textMuted, fontSize: 13, fontWeight: '500', marginTop: 2 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  friendName: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  remove: { color: colors.danger, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
});
