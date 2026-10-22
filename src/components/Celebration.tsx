import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';

import { Button, tap } from '@/components/ui';
import { colors, font, formatSteps, spacing } from '@/theme';

/** Plein écran quand l'objectif du jour est atteint : le chiffre, une ligne qui se déploie. */
export function Celebration({
  visible,
  steps,
  subtitle,
  onClose,
}: {
  visible: boolean;
  steps: number;
  subtitle: string;
  onClose: () => void;
}) {
  const [appear] = useState(() => new Animated.Value(0));
  const [line] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    tap('success');
    appear.setValue(0);
    line.setValue(0);
    Animated.sequence([
      Animated.timing(appear, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(line, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [visible, appear, line]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Animated.View
          style={[
            styles.content,
            { opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
          ]}
        >
          <Text style={styles.kicker}>OBJECTIF ATTEINT</Text>
          <Text style={styles.number}>{formatSteps(steps)}</Text>
          <Text style={styles.unit}>pas aujourd’hui</Text>
          <Animated.View style={[styles.line, { transform: [{ scaleX: line }] }]} />
          <Text style={styles.subtitle}>{subtitle}</Text>
        </Animated.View>
        <View style={styles.action}>
          <Button title="Continuer" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  content: { gap: spacing.sm },
  kicker: { color: colors.primary, ...font.label, fontSize: 13 },
  number: { color: colors.text, ...font.display, fontSize: 84, letterSpacing: -4 },
  unit: { color: colors.textMuted, ...font.heading, marginTop: -spacing.sm },
  line: { height: 4, backgroundColor: colors.primary, marginVertical: spacing.lg, transformOrigin: 'left' },
  subtitle: { color: colors.text, ...font.body, fontSize: 17, lineHeight: 24 },
  action: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xl * 1.5 },
});
