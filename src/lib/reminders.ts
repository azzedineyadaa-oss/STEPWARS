import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'daily-reminder';

// Affiche aussi la notification quand l'app est ouverte.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Demande l'autorisation d'envoyer des notifications. Renvoie true si accordée. */
export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Message du rappel. Il est programmé à l'avance (l'app ne tourne pas en
 * arrière-plan), donc il parle de la série en cours plutôt que des pas du jour.
 */
export function reminderMessage(streak: number, hasTeam: boolean): { title: string; body: string } {
  if (streak >= 2) {
    return {
      title: `${streak} jours de série en jeu`,
      body: 'Atteins ton objectif aujourd’hui pour ne pas la perdre.',
    };
  }
  if (hasTeam) {
    return { title: 'Ton équipe compte sur toi', body: 'Chaque pas compte pour l’équipe cette semaine.' };
  }
  return { title: 'Il est encore temps', body: 'Une petite marche ce soir pour atteindre ton objectif ?' };
}

/** Remplace le rappel quotidien (ou le supprime si `hour` est null). */
export async function scheduleDailyReminder(
  hour: number | null,
  message: { title: string; body: string },
): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (hour === null) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Rappel quotidien',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.scheduleNotificationAsync({
    content: message,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0, channelId: CHANNEL_ID },
  });
}
