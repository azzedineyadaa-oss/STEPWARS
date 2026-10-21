import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import * as api from '@/lib/api';
import {
  DEMO_FRIENDS,
  addDays,
  demoHistory,
  generateFriendCode,
  recordSteps,
  toDayKey,
  type Challenge,
  type DayKey,
  type Friend,
  type StepHistory,
} from '@/lib/game';
import { pendingUploads } from '@/lib/remote';
import { supabase } from '@/lib/supabase';
import { usePedometerSync, type PedometerState } from '@/hooks/usePedometerSync';

const STORAGE_KEY = 'stepwars:v1';
const REFRESH_INTERVAL_MS = 5 * 60_000;
const UPLOAD_DELAY_MS = 10_000;
const PROFILE_SAVE_DELAY_MS = 800;

export type Profile = {
  name: string;
  avatar: string;
  dailyGoal: number;
  friendCode: string;
};

/** 'demo' : pas de serveur configuré, amis simulés. 'online' : Supabase. */
export type Mode = 'demo' | 'online';

export type SyncState = { status: 'connecting' | 'ok' } | { status: 'error'; message: string };

type PersistedState = {
  profile: Profile;
  friends: Friend[];
  challenges: Challenge[];
  /** Mes pas par jour, mesurés sur ce téléphone ou restaurés du serveur. */
  history: StepHistory;
  /** En ligne : pas des amis, et derniers totaux envoyés au serveur. */
  friendSteps: Record<string, StepHistory>;
  uploaded: StepHistory;
  /** Compte auquel appartiennent les données en cache. */
  accountId: string | null;
};

type AppStore = PersistedState & {
  mode: Mode;
  sync: SyncState;
  ready: boolean;
  today: DayKey;
  todaySteps: number;
  pedometer: PedometerState;
  updateProfile: (patch: Partial<Omit<Profile, 'friendCode'>>) => void;
  /** En ligne : `input` est le code ami. En démo : le nom de l'ami. */
  addFriend: (input: string) => Promise<Friend>;
  removeFriend: (id: string) => Promise<void>;
  createChallenge: (opponentId: string, days: number) => Promise<Challenge>;
  deleteChallenge: (id: string) => Promise<void>;
  /** Supprime le compte et toutes ses données (en ligne uniquement). */
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Après une erreur : rouvre la session si besoin, sinon rafraîchit. */
  retry: () => void;
  /** Historique de pas d'un ami sur les jours demandés (simulé en mode démo). */
  friendHistory: (friendId: string, days: DayKey[]) => StepHistory;
};

const mode: Mode = supabase ? 'online' : 'demo';

function initialState(): PersistedState {
  return {
    profile: { name: 'Moi', avatar: '🏃', dailyGoal: 8000, friendCode: mode === 'demo' ? generateFriendCode() : '' },
    friends: mode === 'demo' ? DEMO_FRIENDS : [],
    challenges: [],
    history: {},
    friendSteps: {},
    uploaded: {},
    accountId: null,
  };
}

function messageOf(e: unknown): string {
  return e instanceof api.ApiError ? e.message : 'Pas de connexion au serveur.';
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(initialState);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [userId, setUserId] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({ status: mode === 'online' ? 'connecting' : 'ok' });
  // Incrémenté pour rouvrir une session (après suppression du compte).
  const [sessionNonce, setSessionNonce] = useState(0);

  // Dernier état, pour les rappels asynchrones (podomètre, minuteurs).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

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

  // --- Podomètre ------------------------------------------------------------

  const onSteps = useCallback((day: DayKey, steps: number) => {
    setState((s) => {
      const history = recordSteps(s.history, day, steps);
      return history === s.history ? s : { ...s, history };
    });
  }, []);

  const getStoredSteps = useCallback((day: DayKey) => stateRef.current.history[day] ?? 0, []);

  const pedometer = usePedometerSync({ enabled: ready, onSteps, getStoredSteps });

  // --- Synchronisation avec Supabase -----------------------------------------

  useEffect(() => {
    if (!supabase || !ready) return;
    let cancelled = false;
    api
      .ensureSession(supabase)
      .then((id) => !cancelled && setUserId(id))
      .catch((e) => !cancelled && setSync({ status: 'error', message: messageOf(e) }));
    return () => {
      cancelled = true;
    };
  }, [ready, sessionNonce]);

  // Modifications de profil pas encore envoyées : un rafraîchissement ne doit pas les écraser.
  const pendingProfile = useRef<{ name?: string; avatar?: string; daily_goal?: number } | null>(null);
  const profileTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) return;
    try {
      const snap = await api.fetchSnapshot(supabase, userId, toDayKey(new Date()));
      setState((s) => {
        const sameAccount = s.accountId === userId;
        let history = s.history;
        for (const [day, steps] of Object.entries(snap.mySteps)) history = recordSteps(history, day, steps);
        const p = snap.profile;
        return {
          ...s,
          accountId: userId,
          profile: pendingProfile.current
            ? { ...s.profile, friendCode: p.friend_code }
            : { name: p.name, avatar: p.avatar, dailyGoal: p.daily_goal, friendCode: p.friend_code },
          friends: snap.friends,
          challenges: snap.challenges,
          friendSteps: snap.friendSteps,
          history,
          uploaded: sameAccount ? { ...s.uploaded, ...snap.mySteps } : snap.mySteps,
        };
      });
      setSync({ status: 'ok' });
    } catch (e) {
      setSync({ status: 'error', message: messageOf(e) });
    }
  }, [userId]);

  // Rafraîchit à la connexion, toutes les 5 minutes et au retour dans l'app.
  useEffect(() => {
    if (!userId) return;
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, refresh]);

  // Envoie les nouveaux pas au plus toutes les 10 s. Le minuteur n'est pas
  // relancé à chaque pas, sinon rien ne partirait pendant une marche.
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!supabase || !userId || state.accountId !== userId || uploadTimer.current) return;
    const sinceDay = () => addDays(toDayKey(new Date()), -7);
    if (pendingUploads(state.history, state.uploaded, sinceDay()).length === 0) return;
    const db = supabase;
    uploadTimer.current = setTimeout(async () => {
      const s = stateRef.current;
      const entries = pendingUploads(s.history, s.uploaded, sinceDay());
      try {
        await api.uploadSteps(db, entries);
        setState((cur) => ({
          ...cur,
          uploaded: { ...cur.uploaded, ...Object.fromEntries(entries.map((e) => [e.day, e.steps])) },
        }));
      } catch (e) {
        setSync({ status: 'error', message: messageOf(e) });
      } finally {
        uploadTimer.current = undefined;
      }
    }, UPLOAD_DELAY_MS);
    // `uploaded` en dépendance : relance un envoi si des pas sont arrivés pendant le précédent.
  }, [state.history, state.uploaded, state.accountId, userId]);

  useEffect(() => () => clearTimeout(uploadTimer.current), []);

  // --- Actions ----------------------------------------------------------------

  const updateProfile = useCallback(
    (patch: Partial<Omit<Profile, 'friendCode'>>) => {
      setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
      if (!supabase || !userId) return;
      const db = supabase;
      const row: NonNullable<typeof pendingProfile.current> = {};
      // Un pseudo vide (en cours de saisie) n'est pas envoyé.
      if (patch.name?.trim()) row.name = patch.name.trim();
      if (patch.avatar) row.avatar = patch.avatar;
      if (patch.dailyGoal) row.daily_goal = patch.dailyGoal;
      pendingProfile.current = { ...pendingProfile.current, ...row };
      clearTimeout(profileTimer.current);
      profileTimer.current = setTimeout(() => {
        const pending = pendingProfile.current;
        pendingProfile.current = null;
        if (pending && Object.keys(pending).length > 0) {
          api.updateProfile(db, userId, pending).catch((e) => setSync({ status: 'error', message: messageOf(e) }));
        }
      }, PROFILE_SAVE_DELAY_MS);
    },
    [userId],
  );

  const requireOnline = useCallback(() => {
    if (!supabase || !userId) throw new api.ApiError('Connexion au serveur en cours. Réessayez dans un instant.');
    return { db: supabase, uid: userId };
  }, [userId]);

  const addFriend = useCallback(
    async (input: string) => {
      if (mode === 'demo') {
        const animals = ['🐻', '🐼', '🦁', '🐸', '🐵', '🦉', '🐙', '🦄'];
        const friend: Friend = {
          id: `friend-${Date.now().toString(36)}`,
          name: input.trim(),
          avatar: animals[Math.floor(Math.random() * animals.length)],
        };
        setState((s) => ({ ...s, friends: [...s.friends, friend] }));
        return friend;
      }
      const { db } = requireOnline();
      const friend = await api.addFriend(db, input);
      await refresh();
      return friend;
    },
    [requireOnline, refresh],
  );

  const removeFriend = useCallback(
    async (id: string) => {
      const removeLocally = () =>
        setState((s) => ({
          ...s,
          friends: s.friends.filter((f) => f.id !== id),
          challenges: s.challenges.filter((c) => c.opponentId !== id),
        }));
      if (mode === 'demo') return removeLocally();
      const { db } = requireOnline();
      await api.removeFriend(db, id);
      removeLocally();
    },
    [requireOnline],
  );

  const createChallenge = useCallback(
    async (opponentId: string, days: number) => {
      let challenge: Challenge;
      if (mode === 'demo') {
        challenge = {
          id: `ch-${Date.now().toString(36)}`,
          opponentId,
          startDay: today,
          days,
          createdAt: new Date().toISOString(),
        };
      } else {
        const { db, uid } = requireOnline();
        challenge = await api.createChallenge(db, uid, opponentId, today, days);
      }
      setState((s) => ({ ...s, challenges: [challenge, ...s.challenges] }));
      return challenge;
    },
    [today, requireOnline],
  );

  const deleteChallenge = useCallback(
    async (id: string) => {
      if (mode === 'online') {
        const { db } = requireOnline();
        await api.deleteChallenge(db, id);
      }
      setState((s) => ({ ...s, challenges: s.challenges.filter((c) => c.id !== id) }));
    },
    [requireOnline],
  );

  const deleteAccount = useCallback(async () => {
    const { db } = requireOnline();
    await api.deleteAccount(db);
    await AsyncStorage.removeItem(STORAGE_KEY);
    pendingProfile.current = null;
    setUserId(null);
    setState(initialState());
    setSync({ status: 'connecting' });
    setSessionNonce((n) => n + 1);
  }, [requireOnline]);

  const retry = useCallback(() => {
    if (userId) refresh();
    else {
      setSync({ status: 'connecting' });
      setSessionNonce((n) => n + 1);
    }
  }, [userId, refresh]);

  const dayProgress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const { friendSteps } = state;

  const friendHistory = useCallback(
    (friendId: string, days: DayKey[]) =>
      mode === 'demo' ? demoHistory(friendId, days, today, dayProgress) : (friendSteps[friendId] ?? {}),
    [today, dayProgress, friendSteps],
  );

  const value = useMemo<AppStore>(
    () => ({
      ...state,
      mode,
      sync,
      ready,
      today,
      todaySteps: state.history[today] ?? 0,
      pedometer,
      updateProfile,
      addFriend,
      removeFriend,
      createChallenge,
      deleteChallenge,
      deleteAccount,
      refresh,
      retry,
      friendHistory,
    }),
    [
      state,
      sync,
      ready,
      today,
      pedometer,
      updateProfile,
      addFriend,
      removeFriend,
      createChallenge,
      deleteChallenge,
      deleteAccount,
      refresh,
      retry,
      friendHistory,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore doit être utilisé dans <AppStoreProvider>');
  return store;
}
