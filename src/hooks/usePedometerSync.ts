import { Pedometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { addDays, toDayKey, type DayKey } from '@/lib/game';

export type PedometerState = 'checking' | 'available' | 'unavailable' | 'denied';

type Options = {
  enabled: boolean;
  /** Reçoit le total de pas connu pour un jour. */
  onSteps: (day: DayKey, steps: number) => void;
  /** Total déjà enregistré pour un jour (sert de base sur Android). */
  getStoredSteps: (day: DayKey) => number;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Synchronise le podomètre du téléphone avec l'historique local.
 *
 * - iOS : CoreMotion garde 7 jours d'historique, on relit donc les totaux
 *   exacts à chaque retour au premier plan.
 * - Android : seul `watchStepCount` est disponible (pas depuis l'abonnement,
 *   application ouverte uniquement), on ajoute donc les nouveaux pas au total
 *   du jour. Pour compter en arrière-plan, il faudra passer par Health Connect.
 */
export function usePedometerSync({ enabled, onSteps, getStoredSteps }: Options): PedometerState {
  const [state, setState] = useState<PedometerState>('checking');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    const syncIosHistory = async () => {
      const now = new Date();
      const todayStart = startOfDay(now);
      const today = toDayKey(now);
      for (let i = 0; i < 7; i++) {
        const day = addDays(today, -i);
        const start = new Date(todayStart);
        start.setDate(start.getDate() - i);
        const end = i === 0 ? now : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
        try {
          const { steps } = await Pedometer.getStepCountAsync(start, end);
          if (!cancelled) onSteps(day, steps);
        } catch (e) {
          console.warn('Lecture du podomètre impossible', e);
        }
      }
    };

    (async () => {
      const available = await Pedometer.isAvailableAsync().catch(() => false);
      if (!available) {
        if (!cancelled) setState('unavailable');
        return;
      }
      const permission = await Pedometer.requestPermissionsAsync();
      if (cancelled) return;
      if (!permission.granted) {
        setState('denied');
        return;
      }
      setState('available');

      if (Platform.OS === 'ios') {
        await syncIosHistory();
        if (cancelled) return;
        const appStateSub = AppState.addEventListener('change', (s) => {
          if (s === 'active') syncIosHistory();
        });
        cleanups.push(() => appStateSub.remove());

        // Mises à jour en direct : on relit le total exact du jour (au plus toutes les 5 s).
        let lastRead = 0;
        const watchSub = Pedometer.watchStepCount(() => {
          const now = new Date();
          if (now.getTime() - lastRead < 5000) return;
          lastRead = now.getTime();
          Pedometer.getStepCountAsync(startOfDay(now), now)
            .then(({ steps }) => !cancelled && onSteps(toDayKey(now), steps))
            .catch(() => {});
        });
        cleanups.push(() => watchSub.remove());
        return;
      }

      // Android : on ajoute les nouveaux pas au total du jour courant.
      // Le total est tenu localement : plusieurs événements peuvent arriver avant
      // que l'historique stocké ne soit mis à jour.
      let lastReported = 0;
      let currentDay = toDayKey(new Date());
      let dayTotal = getStoredSteps(currentDay);
      const watchSub = Pedometer.watchStepCount(({ steps }) => {
        const delta = steps - lastReported;
        lastReported = steps;
        if (delta <= 0) return;
        const day = toDayKey(new Date());
        if (day !== currentDay) {
          currentDay = day;
          dayTotal = getStoredSteps(day);
        }
        dayTotal += delta;
        onSteps(day, dayTotal);
      });
      cleanups.push(() => watchSub.remove());
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [enabled, onSteps, getStoredSteps]);

  return state;
}
