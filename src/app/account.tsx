import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, tap } from '@/components/ui';
import { useAppStore } from '@/state/AppStore';
import { colors, font, radius, spacing } from '@/theme';

type Step = 'email' | 'code' | 'done';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Deux parcours avec un code à 6 chiffres reçu par e-mail :
 * - `link` : ajouter une adresse au compte actuel pour le retrouver plus tard ;
 * - `login` : sur un autre téléphone, retrouver un compte existant.
 */
export default function AccountScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const login = params.mode === 'login';
  const { mode, settings, requestEmailLink, confirmEmailLink, requestLogin, confirmLogin, completeOnboarding } =
    useAppStore();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, next: Step) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      tap(next === 'done' ? 'success' : 'light');
      setStep(next);
    } catch (e) {
      tap('error');
      setError(e instanceof Error ? e.message : 'Une erreur est survenue. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(() => (login ? requestLogin(email) : requestEmailLink(email)), 'code');
  const verify = () => run(() => (login ? confirmLogin(email, code) : confirmEmailLink(email, code)), 'done');

  const [leaving, setLeaving] = useState(false);

  // Compte retrouvé depuis le premier lancement : on termine l'accueil, puis on
  // ouvre l'app une fois les écrans protégés débloqués.
  useEffect(() => {
    if (leaving && settings.onboarded) router.replace('/');
  }, [leaving, settings.onboarded]);

  const finish = () => {
    if (settings.onboarded) {
      router.back();
      return;
    }
    completeOnboarding();
    setLeaving(true);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: login ? 'Retrouver mon compte' : 'Sauvegarder mon compte' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {step === 'email' && (
          <>
            <View style={styles.icon}>
              <Ionicons name={login ? 'log-in-outline' : 'shield-checkmark-outline'} size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>{login ? 'Ton adresse e-mail' : 'Ne perds jamais ta progression'}</Text>
            <Text style={styles.lead}>
              {login
                ? 'Celle que tu as ajoutée à ton compte. Tu vas recevoir un code à 6 chiffres.'
                : 'Ajoute ton e-mail pour retrouver tes pas, ta série, tes amis et tes duels si tu changes de téléphone. Pas de mot de passe : un code à 6 chiffres suffit.'}
            </Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="prenom@exemple.fr"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => EMAIL_RE.test(email.trim()) && sendCode()}
            />
            <Button
              title={busy ? '…' : 'Recevoir le code'}
              onPress={sendCode}
              disabled={!EMAIL_RE.test(email.trim()) || busy}
            />
          </>
        )}

        {step === 'code' && (
          <>
            <View style={styles.icon}>
              <Ionicons name="mail-unread-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>Entre le code</Text>
            <Text style={styles.lead}>
              {mode === 'demo'
                ? 'Mode démo : aucun e-mail n’est envoyé, tape n’importe quels 6 chiffres.'
                : `Envoyé à ${email.trim().toLowerCase()}. Pense à regarder dans les indésirables.`}
            </Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              onSubmitEditing={() => code.length === 6 && verify()}
            />
            <Button title={busy ? '…' : 'Valider'} onPress={verify} disabled={code.length !== 6 || busy} />
            <View style={styles.row}>
              <Text
                style={styles.link}
                onPress={() => {
                  setCode('');
                  setError(null);
                  setStep('email');
                }}
              >
                Changer d’adresse
              </Text>
              <Text style={[styles.link, busy && { opacity: 0.4 }]} onPress={busy ? undefined : sendCode}>
                Renvoyer le code
              </Text>
            </View>
          </>
        )}

        {step === 'done' && (
          <>
            <View style={[styles.icon, styles.iconDone]}>
              <Ionicons name="checkmark" size={30} color={colors.onPrimary} />
            </View>
            <Text style={styles.title}>{login ? 'Compte retrouvé' : 'Compte sauvegardé'}</Text>
            <Text style={styles.lead}>
              {login
                ? 'Tes pas, ta série, tes amis et tes duels arrivent. Les pas de ce téléphone s’y ajoutent.'
                : `Sur un nouveau téléphone, choisis « J’ai déjà un compte » et entre ${email.trim().toLowerCase()}.`}
            </Text>
            <Button title="Continuer" onPress={finish} />
          </>
        )}

        {error && (
          <View style={styles.error}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconDone: { backgroundColor: colors.success },
  title: { color: colors.text, ...font.title, fontSize: 28 },
  lead: { color: colors.textMuted, ...font.body, fontSize: 16, lineHeight: 23, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 17,
    fontWeight: '600',
  },
  codeInput: { fontSize: 28, letterSpacing: 10, fontWeight: '800', textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  link: { color: colors.textMuted, fontWeight: '700', fontSize: 15, padding: spacing.xs },
  error: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
  },
  errorText: { color: colors.danger, fontWeight: '600', flex: 1 },
});
