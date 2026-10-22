import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PlayersMapHandle } from '@/components/PlayersMap';
import { colors, font, spacing } from '@/theme';

// react-native-maps n'existe pas sur le web : l'aperçu web montre un message à la place.
export type { MapBubble, PlayersMapHandle } from '@/components/PlayersMap';

export const PlayersMap = forwardRef<PlayersMapHandle, object>(function PlayersMap() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.box]}>
      <Text style={styles.icon}>🗺️</Text>
      <Text style={styles.title}>La carte s’ouvre sur téléphone</Text>
      <Text style={styles.text}>
        Sur l’app, retrouve les marcheurs autour de toi avec leurs pas du jour, et touche une bulle pour voir la fiche
        du joueur.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  icon: { fontSize: 64 },
  title: { color: colors.text, ...font.title, textAlign: 'center' },
  text: { color: colors.textMuted, ...font.body, textAlign: 'center', maxWidth: 360 },
});
