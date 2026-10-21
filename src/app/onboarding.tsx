import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip } from '@/components/ui';
import { requestReminderPermission } from '@/lib/reminders';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

const AVATARS = ['🏃', '🚶', '🧗', '🚴', '🦸', '🐆', '🦊', '🐺'];
const GOALS = [
  { steps: 5000, label: 'Tranquille', icon: '🌱' },
  { steps: 8000, label: 'Actif', icon: '⚡' },
  { steps: 10000, label: 'Guerrier', icon: '⚔️' },
  { steps: 15000, label: 'Légende', icon: '👑' },
];
const STEPS = 4;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, completeOnboarding, setReminderHour } = useAppStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.name === 'Moi' ? '' : profile.name);

  const next = () => setStep((s) => s + 1);

  const saveName = () => {
    updateProfile({ name: name.trim() || 'Moi' });
    next();
  };

  const finish = async (withReminder: boolean) => {
    if (withReminder) {
      const granted = await requestReminderPermission();
      setReminderHour(granted ? 19 : null);
    } else {
      setReminderHour(null);
    }
    // Le podomètre demande son autorisation dès que l'accueil est terminé.
    completeOnboarding();
  };

  return (
    <LinearGradient colors={['#1B1240', colors.background]} style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.dots}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
            ))}
          </View>

          {step === 0 && (
            <View style={styles.page}>
              <Text style={styles.logo}>⚡</Text>
              <Text style={styles.brand}>StepWars</Text>
              <Text style={styles.tagline}>Chaque pas est une attaque.</Text>
              <View style={styles.features}>
                {[
                  ['⚔️', 'Guerre d’équipes', 'Ton équipe contre toutes les autres, chaque semaine.'],
                  ['⚡', 'Duels', 'Défie tes amis sur 1, 3 ou 7 jours.'],
                  ['🔥', 'Séries', 'Atteins ton objectif chaque jour et fais grandir ta flamme.'],
                ].map(([icon, title, text]) => (
                  <View key={title} style={styles.feature}>
                    <Text style={styles.featureIcon}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.featureTitle}>{title}</Text>
                      <Text style={styles.featureText}>{text}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.full}>
                <Button title="C’est parti" onPress={next} />
              </View>
            </View>
          )}

          {step === 1 && (
            <View style={styles.page}>
              <Text style={styles.big}>{profile.avatar}</Text>
              <Text style={styles.title}>Qui es-tu, soldat ?</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ton pseudo"
                placeholderTextColor={colors.textMuted}
                maxLength={20}
                autoFocus
                onSubmitEditing={saveName}
                returnKeyType="next"
              />
              <View style={styles.wrap}>
                {AVATARS.map((a) => (
                  <Chip key={a} label={a} selected={profile.avatar === a} onPress={() => updateProfile({ avatar: a })} />
                ))}
              </View>
              <View style={styles.full}>
                <Button title="Suivant" onPress={saveName} disabled={!name.trim()} />
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.page}>
              <Text style={styles.big}>🎯</Text>
              <Text style={styles.title}>Ton objectif quotidien</Text>
              <Text style={styles.subtitle}>Tu pourras le changer à tout moment.</Text>
              <View style={{ gap: spacing.sm, alignSelf: 'stretch' }}>
                {GOALS.map((g) => {
                  const selected = profile.dailyGoal === g.steps;
                  return (
                    <Chip
                      key={g.steps}
                      label={`${g.icon}  ${g.label} · ${formatSteps(g.steps)} pas`}
                      selected={selected}
                      onPress={() => updateProfile({ dailyGoal: g.steps })}
                    />
                  );
                })}
              </View>
              <View style={styles.full}>
                <Button title="Suivant" onPress={next} />
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.page}>
              <Text style={styles.big}>🔔</Text>
              <Text style={styles.title}>Ne laisse jamais ta flamme s’éteindre</Text>
              <Text style={styles.subtitle}>
                Un petit rappel chaque soir à 19 h pour garder ta série en vie. Ensuite, StepWars te demandera
                l’accès au podomètre pour compter tes pas.
              </Text>
              <View style={{ gap: spacing.sm, alignSelf: 'stretch' }}>
                <Button title="Activer les rappels" onPress={() => finish(true)} />
                <Button title="Plus tard" variant="ghost" onPress={() => finish(false)} />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: spacing.lg },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  dotActive: { width: 28, backgroundColor: colors.primary },
  dotDone: { backgroundColor: colors.secondary },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  logo: { fontSize: 88 },
  brand: { color: colors.text, fontSize: 44, fontWeight: '900', letterSpacing: -1.5, marginTop: -spacing.md },
  tagline: { color: colors.primary, fontSize: 18, fontWeight: '800', marginTop: -spacing.md },
  features: { alignSelf: 'stretch', gap: spacing.md, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: radius.lg, padding: spacing.md },
  feature: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  featureIcon: { fontSize: 30 },
  featureTitle: { color: colors.text, ...font.heading },
  featureText: { color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  big: { fontSize: 72 },
  title: { color: colors.text, ...font.title, textAlign: 'center' },
  subtitle: { color: colors.textMuted, ...font.body, textAlign: 'center', marginTop: -spacing.sm },
  input: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  full: { alignSelf: 'stretch' },
});
