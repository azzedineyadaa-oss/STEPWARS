import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TerritoryMapHandle } from '@/components/TerritoryMap';
import { colors, font, spacing } from '@/theme';

// react-native-maps n'existe pas sur le web : l'aperçu web montre un message à la place.
export type { MapCell, MapFriend, TerritoryMapHandle } from '@/components/TerritoryMap';

export const TerritoryMap = forwardRef<TerritoryMapHandle, object>(function TerritoryMap() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.box]}>
      <Text style={styles.icon}>🗺️</Text>
      <Text style={styles.title}>La carte s’ouvre sur téléphone</Text>
      <Text style={styles.text}>
        Sur l’app, la ville est découpée en zones : marche dans une zone pour la conquérir avec ton équipe, et
        retrouve tes amis sur la carte.
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
