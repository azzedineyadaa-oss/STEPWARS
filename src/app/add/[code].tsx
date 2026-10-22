import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, tap } from '@/components/ui';
import { parseInviteCode } from '@/lib/invite';
import type { Friend } from '@/lib/game';
import { useAppStore } from '@/state/AppStore';
import { colors, font, radius, spacing } from '@/theme';

/** Ouvert par un lien d'invitation d'ami (stepwars://add/CODE ou QR code). */
export default function AddFriendScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = parseInviteCode(raw);
  const { profile, mode, addFriend } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMe = code !== null && code === profile.friendCode;

  const onAdd = async () => {
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      // En démo, l'ami simulé prend le code comme nom.
      setFriend(await addFriend(mode === 'online' ? code : `Ami ${code}`));
      tap('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ajout impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (friend) {
    return (
      <View style={styles.screen}>
        <Avatar id={friend.id} name={friend.name} size={72} />
        <Text style={styles.title}>{friend.name} est ton ami</Text>
        <Text style={styles.lead}>Vous voyez maintenant vos pas. Lance-lui un premier duel !</Text>
        <View style={styles.actions}>
          <Button
            title={`Défier ${friend.name}`}
            icon="flash"
            onPress={() => router.replace({ pathname: '/challenge/new', params: { opponent: friend.id } })}
          />
          <Button title="Plus tard" variant="ghost" onPress={() => router.dismissTo('/')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.icon}>
        <Ionicons name="person-add-outline" size={30} color={colors.primary} />
      </View>
      <Text style={styles.title}>{code ? 'Invitation d’un ami' : 'Lien d’invitation invalide'}</Text>
      {code && <Text style={styles.code}>{code}</Text>}
      <Text style={styles.lead}>
        {!code
          ? 'Demande-lui de te renvoyer son lien, ou ajoute son code dans ton profil.'
          : isMe
            ? 'C’est ton propre code : envoie ce lien à tes amis pour qu’ils t’ajoutent.'
            : 'Ajoute ce joueur pour voir ses pas et le défier en duel.'}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        {code && !isMe && <Button title={busy ? '…' : 'Ajouter cet ami'} onPress={onAdd} disabled={busy} />}
        <Button title="Fermer" variant="ghost" onPress={() => router.dismissTo('/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, ...font.title, textAlign: 'center' },
  code: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 6 },
  lead: { color: colors.textMuted, ...font.body, textAlign: 'center', lineHeight: 22 },
  error: { color: colors.danger, fontWeight: '600', textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
});
