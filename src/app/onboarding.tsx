import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, tap, type IconName } from '@/components/ui';
import { requestReminderPermission } from '@/lib/reminders';
import { useAppStore } from '@/state/AppStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

const GOALS = [
  { steps: 5000, label: 'Régulier', detail: 'Une marche quotidienne' },
  { steps: 8000, label: 'Actif', detail: 'Recommandé pour commencer' },
  { steps: 10000, label: 'Sportif', detail: 'Le classique des 10 000' },
  { steps: 15000, label: 'Intense', detail: 'Pour les gros marcheurs' },
];
const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'shield-outline', title: 'Guerre d’équipes', text: 'Ton équipe contre toutes les autres, chaque semaine.' },
  { icon: 'flash-outline', title: 'Duels', text: 'Défie tes amis sur 1, 3 ou 7 jours.' },
  { icon: 'map-outline', title: 'Carte', text: 'Les marcheurs autour de toi, si tu le choisis.' },
];
const STEPS = 4;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { profile, myId, updateProfile, completeOnboarding, setReminderHour } = useAppStore();
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.progress}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.progressBar, i <= step && styles.progressOn]} />
          ))}
        </View>

        {step === 0 && (
          <View style={styles.page}>
            <View style={{ gap: spacing.md }}>
              <View style={styles.logo}>
                <Ionicons name="flash" size={34} color={colors.onPrimary} />
              </View>
              <Text style={styles.brand}>StepWars</Text>
              <Text style={styles.lead}>Chaque pas compte. Pour toi, pour ton équipe, contre les autres.</Text>
            </View>
            <View style={{ gap: spacing.lg }}>
              {FEATURES.map((f) => (
                <View key={f.title} style={styles.feature}>
                  <Ionicons name={f.icon} size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureText}>{f.text}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Button title="Commencer" onPress={next} />
          </View>
        )}

        {step === 1 && (
          <View style={styles.page}>
            <View style={{ gap: spacing.md }}>
              <Text style={styles.label}>Étape 1 sur 3</Text>
              <Text style={styles.title}>Ton pseudo</Text>
              <Text style={styles.lead}>C’est le nom que verront tes amis et les autres joueurs.</Text>
            </View>
            <View style={styles.nameRow}>
              <Avatar id={myId} name={name || '?'} size={52} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Pseudo"
                placeholderTextColor={colors.textFaint}
                maxLength={20}
                autoFocus
                onSubmitEditing={() => name.trim() && saveName()}
                returnKeyType="next"
              />
            </View>
            <Button title="Continuer" onPress={saveName} disabled={!name.trim()} />
          </View>
        )}

        {step === 2 && (
          <View style={styles.page}>
            <View style={{ gap: spacing.md }}>
              <Text style={styles.label}>Étape 2 sur 3</Text>
              <Text style={styles.title}>Ton objectif quotidien</Text>
              <Text style={styles.lead}>Tu pourras le changer à tout moment dans ton profil.</Text>
            </View>
            <View style={{ gap: spacing.sm }}>
              {GOALS.map((g) => {
                const selected = profile.dailyGoal === g.steps;
                return (
                  <Pressable
                    key={g.steps}
                    onPress={() => {
                      tap('selection');
                      updateProfile({ dailyGoal: g.steps });
                    }}
                    style={[styles.goal, selected && styles.goalOn]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.goalLabel}>{g.label}</Text>
                      <Text style={styles.goalDetail}>{g.detail}</Text>
                    </View>
                    <Text style={styles.goalSteps}>{formatSteps(g.steps)}</Text>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selected ? colors.primary : colors.textFaint}
                    />
                  </Pressable>
                );
              })}
            </View>
            <Button title="Continuer" onPress={next} />
          </View>
        )}

        {step === 3 && (
          <View style={styles.page}>
            <View style={{ gap: spacing.md }}>
              <Text style={styles.label}>Étape 3 sur 3</Text>
              <Text style={styles.title}>Un rappel le soir</Text>
              <Text style={styles.lead}>
                Une notification à 19 h pour ne pas casser ta série. Ensuite, StepWars te demandera l’accès au
                podomètre pour compter tes pas.
              </Text>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Button title="Activer le rappel" icon="notifications-outline" onPress={() => finish(true)} />
              <Button title="Plus tard" variant="ghost" onPress={() => finish(false)} />
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, paddingHorizontal: spacing.lg },
  progress: { flexDirection: 'row', gap: 6, marginBottom: spacing.xl },
  progressBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surfaceAlt },
  progressOn: { backgroundColor: colors.primary },
  page: { flex: 1, justifyContent: 'space-between', gap: spacing.xl },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: colors.text, fontSize: 44, fontWeight: '900', letterSpacing: -1.8 },
  label: { color: colors.primary, ...font.label },
  title: { color: colors.text, ...font.title, fontSize: 32, letterSpacing: -1 },
  lead: { color: colors.textMuted, ...font.body, fontSize: 17, lineHeight: 24 },
  feature: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  featureTitle: { color: colors.text, ...font.heading },
  featureText: { color: colors.textMuted, ...font.body, marginTop: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: spacing.sm,
  },
  goal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  goalOn: { borderColor: colors.primary, backgroundColor: colors.surface },
  goalLabel: { color: colors.text, ...font.heading },
  goalDetail: { color: colors.textMuted, fontSize: 13, fontWeight: '500', marginTop: 2 },
  goalSteps: { color: colors.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
