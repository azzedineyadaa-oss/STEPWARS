import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  DEMO_FRIENDS,
  demoHistory,
  generateFriendCode,
  recordSteps,
  toDayKey,
  type Challenge,
  type DayKey,
  type Friend,
  type StepHistory,
} from '@/lib/game';
import { usePedometerSync, type PedometerState } from '@/hooks/usePedometerSync';

const STORAGE_KEY = 'stepwars:v1';

export type Profile = {
  name: string;
  avatar: string;
  dailyGoal: number;
  friendCode: string;
};

type PersistedState = {
  profile: Profile;
  friends: Friend[];
  challenges: Challenge[];
  history: StepHistory;
};

type AppStore = PersistedState & {
  ready: boolean;
  today: DayKey;
  todaySteps: number;
  pedometer: PedometerState;
  updateProfile: (patch: Partial<Profile>) => void;
  addFriend: (name: string) => Friend;
  removeFriend: (id: string) => void;
  createChallenge: (opponentId: string, days: number) => Challenge;
  deleteChallenge: (id: string) => void;
  /** Historique de pas d'un ami sur les jours demandés (simulé en mode démo). */
  friendHistory: (friendId: string, days: DayKey[]) => StepHistory;
};

function initialState(): PersistedState {
  return {
    profile: { name: 'Moi', avatar: '🏃', dailyGoal: 8000, friendCode: generateFriendCode() },
    friends: DEMO_FRIENDS,
    challenges: [],
    history: {},
  };
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(initialState);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Recharge l'état sauvegardé au démarrage.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState((s) => ({ ...s, ...(JSON.parse(raw) as Partial<PersistedState>) }));
      })
      .catch((e) => console.warn('Lecture des données impossible', e))
      .finally(() => setReady(true));
  }, []);

  // Sauvegarde après chaque changement (une fois le chargement terminé).
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
      console.warn('Sauvegarde impossible', e),
    );
  }, [state, ready]);

  // Horloge à la minute : fait avancer les pas simulés et le changement de jour.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const today = toDayKey(now);

  const onSteps = useCallback((day: DayKey, steps: number) => {
    setState((s) => {
      const history = recordSteps(s.history, day, steps);
      return history === s.history ? s : { ...s, history };
    });
  }, []);

  const historyRef = useRef(state.history);
  historyRef.current = state.history;
  const getStoredSteps = useCallback((day: DayKey) => historyRef.current[day] ?? 0, []);

  const pedometer = usePedometerSync({ enabled: ready, onSteps, getStoredSteps });

  const dayProgress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);

  const friendHistory = useCallback(
    (friendId: string, days: DayKey[]) => demoHistory(friendId, days, today, dayProgress),
    [today, dayProgress],
  );

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  }, []);

  const addFriend = useCallback((name: string) => {
    const animals = ['🐻', '🐼', '🦁', '🐸', '🐵', '🦉', '🐙', '🦄'];
    const friend: Friend = {
      id: `friend-${Date.now().toString(36)}`,
      name: name.trim(),
      avatar: animals[Math.floor(Math.random() * animals.length)],
    };
    setState((s) => ({ ...s, friends: [...s.friends, friend] }));
    return friend;
  }, []);

  const removeFriend = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      friends: s.friends.filter((f) => f.id !== id),
      challenges: s.challenges.filter((c) => c.opponentId !== id),
    }));
  }, []);

  const createChallenge = useCallback(
    (opponentId: string, days: number) => {
      const challenge: Challenge = {
        id: `ch-${Date.now().toString(36)}`,
        opponentId,
        startDay: today,
        days,
        createdAt: new Date().toISOString(),
      };
      setState((s) => ({ ...s, challenges: [challenge, ...s.challenges] }));
      return challenge;
    },
    [today],
  );

  const deleteChallenge = useCallback((id: string) => {
    setState((s) => ({ ...s, challenges: s.challenges.filter((c) => c.id !== id) }));
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      ...state,
      ready,
      today,
      todaySteps: state.history[today] ?? 0,
      pedometer,
      updateProfile,
      addFriend,
      removeFriend,
      createChallenge,
      deleteChallenge,
      friendHistory,
    }),
    [state, ready, today, pedometer, updateProfile, addFriend, removeFriend, createChallenge, deleteChallenge, friendHistory],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore doit être utilisé dans <AppStoreProvider>');
  return store;
}
