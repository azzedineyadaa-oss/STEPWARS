import { useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, tap } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';

const CONFETTI = ['🎉', '✨', '🔥', '⭐', '🎊', '💥', '🏆', '👟'];

// Position et vitesse de chaque confetti, tirées une fois au chargement du module.
const PIECES = Array.from({ length: 18 }, (_, i) => ({
  emoji: CONFETTI[i % CONFETTI.length],
  x: Math.random(),
  delay: Math.random() * 600,
  duration: 1800 + Math.random() * 1400,
  spin: Math.random() > 0.5 ? 1 : -1,
}));

/** Plein écran festif quand l'objectif du jour est atteint. */
export function Celebration({
  visible,
  title,
  subtitle,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  const { width, height } = Dimensions.get('window');
  const [pop] = useState(() => new Animated.Value(0));
  const [fall] = useState(() => PIECES.map(() => new Animated.Value(0)));

  useEffect(() => {
    if (!visible) return;
    tap('success');
    pop.setValue(0);
    fall.forEach((v) => v.setValue(0));
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    Animated.parallel(
      fall.map((v, i) =>
        Animated.timing(v, {
          toValue: 1,
          delay: PIECES[i].delay,
          duration: PIECES[i].duration,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [visible, pop, fall]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {PIECES.map((p, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.confetti,
              {
                left: p.x * (width - 40),
                transform: [
                  { translateY: fall[i].interpolate({ inputRange: [0, 1], outputRange: [-60, height + 60] }) },
                  { rotate: fall[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] }) },
                ],
              },
            ]}
          >
            {p.emoji}
          </Animated.Text>
        ))}
        <Animated.View style={[styles.card, { transform: [{ scale: pop }], opacity: pop }]}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={{ alignSelf: 'stretch', marginTop: spacing.md }}>
            <Button title="Trop fort 💪" onPress={onClose} />
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 6, 15, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  confetti: { position: 'absolute', top: 0, fontSize: 30 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: spacing.lg,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  trophy: { fontSize: 72 },
  title: { ...font.title, color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  subtitle: { ...font.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
