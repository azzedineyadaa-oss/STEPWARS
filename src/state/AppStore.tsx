import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import * as api from '@/lib/api';
import {
  DEMO_FRIENDS,
  DEMO_RIVALS,
  ME_ID,
  addDays,
  computeStreak,
  demoHistory,
  demoTeamSteps,
  generateCode,
  memberContribution,
  recordSteps,
  toDayKey,
  weekDays,
  weekStart,
  type Challenge,
  type DayKey,
  type Friend,
  type StepHistory,
  type Streak,
  type Team,
  type TeamMember,
  type TeamStanding,
} from '@/lib/game';
import { demoLeague, demoLeagueResult, type League, type LeagueResult } from '@/lib/league';
import { pendingUploads } from '@/lib/remote';
import { supabase } from '@/lib/supabase';
import { usePedometerSync, type PedometerState } from '@/hooks/usePedometerSync';

const STORAGE_KEY = 'stepwars:v1';
const REFRESH_INTERVAL_MS = 5 * 60_000;
const UPLOAD_DELAY_MS = 10_000;
const PROFILE_SAVE_DELAY_MS = 800;
// La ligue suit les envois de pas, mais pas plus d'une fois par minute.
const LEAGUE_MIN_INTERVAL_MS = 60_000;

export type Profile = {
  name: string;
  avatar: string;
  dailyGoal: number;
  friendCode: string;
};

/** 'demo' : pas de serveur configuré, amis simulés. 'online' : Supabase. */
export type Mode = 'demo' | 'online';

export type SyncState = { status: 'connecting' | 'ok' } | { status: 'error'; message: string };

export type Settings = {
  /** Écrans d'accueil du premier lancement terminés. */
  onboarded: boolean;
  /** Heure du rappel quotidien (0-23), ou null si désactivé. */
  reminderHour: number | null;
};

type PersistedState = {
  profile: Profile;
  settings: Settings;
  /** Dernier jour où l'objectif atteint a été fêté (une seule fois par jour). */
  celebratedDay: DayKey | null;
  friends: Friend[];
  challenges: Challenge[];
  /** Mes pas par jour, mesurés sur ce téléphone ou restaurés du serveur. */
  history: StepHistory;
  /** Mon équipe, ses membres et le classement des équipes de la semaine (en ligne). */
  team: Team | null;
  teamMembers: TeamMember[];
  teamBoard: TeamStanding[];
  /** En ligne : pas des amis et coéquipiers, et derniers totaux envoyés au serveur. */
  playerSteps: Record<string, StepHistory>;
  uploaded: StepHistory;
  /** Compte auquel appartiennent les données en cache. */
  accountId: string | null;
  /** Adresse qui permet de retrouver le compte sur un autre téléphone (null : compte anonyme). */
  accountEmail: string | null;
  /** En ligne : ma ligue de la semaine, gardée pour l'affichage hors connexion. */
  league: League | null;
  /** En ligne : bilan de ma ligue la semaine passée. */
  lastWeekResult: LeagueResult | null;
  /** Semaine dont le bilan a déjà été fermé. */
  recapDismissedWeek: DayKey | null;
};

type AppStore = PersistedState & {
  mode: Mode;
  sync: SyncState;
  ready: boolean;
  today: DayKey;
  todaySteps: number;
  /** Mon identifiant de joueur (ME_ID en démo). */
  myId: string;
  streak: Streak;
  /** Jours de la guerre en cours (lundi-dimanche). */
  warDays: DayKey[];
  /** Classement des équipes de la semaine, mon équipe comprise, non trié. */
  teamStandings: TeamStanding[];
  pedometer: PedometerState;
  updateProfile: (patch: Partial<Omit<Profile, 'friendCode'>>) => void;
  /** En ligne : `input` est le code ami. En démo : le nom de l'ami. */
  addFriend: (input: string) => Promise<Friend>;
  removeFriend: (id: string) => Promise<void>;
  /** Lance un duel ; il attend que l'adversaire l'accepte. */
  createChallenge: (opponentId: string, days: number, stake?: string | null) => Promise<Challenge>;
  acceptChallenge: (id: string) => Promise<void>;
  deleteChallenge: (id: string) => Promise<void>;
  createTeam: (name: string, emoji: string) => Promise<Team>;
  joinTeam: (code: string) => Promise<Team>;
  leaveTeam: () => Promise<void>;
  reportTeam: (id: string) => Promise<void>;
  completeOnboarding: () => void;
  setReminderHour: (hour: number | null) => void;
  markCelebrated: () => void;
  /** Aperçu web en mode démo uniquement (pas de podomètre dans un navigateur). */
  simulateSteps: ((steps: number) => void) | null;
  /** Supprime le compte et toutes ses données (en ligne uniquement). */
  deleteAccount: () => Promise<void>;
  /** Sauvegarde : envoie un code à l'adresse, puis la lie au compte une fois le code saisi. */
  requestEmailLink: (email: string) => Promise<void>;
  confirmEmailLink: (email: string, code: string) => Promise<void>;
  /** Autre téléphone : envoie un code, puis remplace ce compte par celui de l'adresse. */
  requestLogin: (email: string) => Promise<void>;
  confirmLogin: (email: string, code: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Après une erreur : rouvre la session si besoin, sinon rafraîchit. */
  retry: () => void;
  /** Ma ligue de la semaine (simulée en démo) ; null tant que le serveur ne m'a pas placé. */
  currentLeague: League | null;
  /** Bilan de la semaine passée, à montrer jusqu'à ce qu'il soit fermé. */
  weeklyRecap: LeagueResult | null;
  dismissRecap: () => void;
  /** Historique de pas d'un autre joueur (ami ou coéquipier) ; simulé en mode démo. */
  friendHistory: (playerId: string, days: DayKey[]) => StepHistory;
};

const mode: Mode = supabase ? 'online' : 'demo';

function initialState(): PersistedState {
  return {
    profile: { name: 'Moi', avatar: '🏃', dailyGoal: 10000, friendCode: mode === 'demo' ? generateCode() : '' },
    settings: { onboarded: false, reminderHour: 19 },
    celebratedDay: null,
    friends: mode === 'demo' ? DEMO_FRIENDS : [],
    // En démo, Lina vient de te défier : de quoi voir une invitation.
    challenges:
      mode === 'demo'
        ? [
            {
              id: 'demo-invitation',
              opponentId: 'demo-lina',
              startDay: toDayKey(new Date()),
              days: 3,
              createdAt: new Date().toISOString(),
              status: 'pending',
              incoming: true,
              stake: 'Le perdant paie le café',
            },
          ]
        : [],
    history: {},
    team: null,
    teamMembers: [],
    teamBoard: [],
    playerSteps: {},
    uploaded: {},
    accountId: null,
    accountEmail: null,
    league: null,
    lastWeekResult: null,
    recapDismissedWeek: null,
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
  // Incrémenté à chaque rafraîchissement : recharge aussi la ligue.
  const [leagueTick, setLeagueTick] = useState(0);
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

  // Le podomètre (et sa demande d'autorisation) attend la fin de l'accueil.
  const pedometer = usePedometerSync({ enabled: ready && state.settings.onboarded, onSteps, getStoredSteps });

  // --- Synchronisation avec Supabase -----------------------------------------

  useEffect(() => {
    if (!supabase || !ready) return;
    let cancelled = false;
    const db = supabase;
    api
      .ensureSession(db)
      .then(async (id) => {
        if (cancelled) return;
        setUserId(id);
        const accountEmail = await api.currentEmail(db);
        if (!cancelled) setState((s) => (s.accountEmail === accountEmail ? s : { ...s, accountEmail }));
      })
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
          team: snap.team,
          teamMembers: snap.teamMembers,
          teamBoard: snap.teamBoard,
          playerSteps: snap.playerSteps,
          history,
          uploaded: sameAccount ? { ...s.uploaded, ...snap.mySteps } : snap.mySteps,
        };
      });
      setSync({ status: 'ok' });
      setLeagueTick((t) => t + 1);
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

  // Ligue : chargée une fois mes pas envoyés, pour que le serveur me place au
  // bon niveau dès ma première semaine, puis à chaque rafraîchissement.
  const leagueLoadedAt = useRef(0);
  const stepsInSync =
    state.accountId === userId && pendingUploads(state.history, state.uploaded, addDays(today, -7)).length === 0;
  useEffect(() => {
    if (!supabase || !userId || !stepsInSync) return;
    const stale = state.league === null || state.league.weekStart !== weekStart(today);
    if (!stale && Date.now() - leagueLoadedAt.current < LEAGUE_MIN_INTERVAL_MS) return;
    leagueLoadedAt.current = Date.now();
    const db = supabase;
    const previousWeek = addDays(weekStart(today), -7);
    api
      .fetchLeague(db, today)
      .then((league) => setState((s) => ({ ...s, league })))
      .catch((e) => console.warn('Ligue indisponible', e));
    if (state.lastWeekResult?.weekStart !== previousWeek) {
      api
        .fetchLeagueResult(db, previousWeek)
        .then((lastWeekResult) => setState((s) => ({ ...s, lastWeekResult })))
        .catch((e) => console.warn('Bilan indisponible', e));
    }
    // `state.league` exclu : le recharger ne doit pas relancer un appel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, stepsInSync, today, leagueTick]);

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
    async (opponentId: string, days: number, stake: string | null = null) => {
      let challenge: Challenge;
      if (mode === 'demo') {
        challenge = {
          id: `ch-${Date.now().toString(36)}`,
          opponentId,
          startDay: today,
          days,
          createdAt: new Date().toISOString(),
          status: 'pending',
          incoming: false,
          stake: stake?.trim() || null,
        };
        // L'ami simulé accepte au bout de quelques secondes.
        setTimeout(
          () =>
            setState((s) => ({
              ...s,
              challenges: s.challenges.map((c) => (c.id === challenge.id ? { ...c, status: 'accepted' } : c)),
            })),
          4000,
        );
      } else {
        const { db, uid } = requireOnline();
        challenge = await api.createChallenge(db, uid, opponentId, today, days, stake);
      }
      setState((s) => ({ ...s, challenges: [challenge, ...s.challenges] }));
      return challenge;
    },
    [today, requireOnline],
  );

  const acceptChallenge = useCallback(
    async (id: string) => {
      const startDay = mode === 'online' ? await api.acceptChallenge(requireOnline().db, id, today) : today;
      setState((s) => ({
        ...s,
        challenges: s.challenges.map((c) =>
          c.id === id ? { ...c, status: 'accepted', startDay: startDay > c.startDay ? startDay : c.startDay } : c,
        ),
      }));
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

  // --- Compte par e-mail -------------------------------------------------------
  // En démo, rien n'est envoyé : n'importe quel code à 6 chiffres est accepté.

  const checkCode = (code: string) => {
    if (!/^\d{6}$/.test(code.trim())) throw new api.ApiError('Le code fait 6 chiffres.');
  };

  const requestEmailLink = useCallback(
    async (email: string) => {
      if (mode === 'online') await api.requestEmailLink(requireOnline().db, email);
    },
    [requireOnline],
  );

  const confirmEmailLink = useCallback(
    async (email: string, code: string) => {
      checkCode(code);
      if (mode === 'online') await api.confirmEmailLink(requireOnline().db, email, code);
      setState((s) => ({ ...s, accountEmail: email.trim().toLowerCase() }));
    },
    [requireOnline],
  );

  const requestLogin = useCallback(async (email: string) => {
    if (mode === 'online' && supabase) await api.requestLoginCode(supabase, email);
  }, []);

  const confirmLogin = useCallback(
    async (email: string, code: string) => {
      checkCode(code);
      if (mode === 'online' && supabase) {
        const id = await api.confirmLoginCode(supabase, email, code);
        // Les pas de ce téléphone restent et seront envoyés sur le compte retrouvé.
        pendingProfile.current = null;
        setUserId(id);
      }
      setState((s) => ({ ...s, accountEmail: email.trim().toLowerCase(), league: mode === 'online' ? null : s.league }));
    },
    [],
  );

  const retry = useCallback(() => {
    if (userId) refresh();
    else {
      setSync({ status: 'connecting' });
      setSessionNonce((n) => n + 1);
    }
  }, [userId, refresh]);

  // --- Guerre d'équipes -------------------------------------------------------

  const createTeam = useCallback(
    async (name: string, emoji: string) => {
      let team: Team;
      if (mode === 'demo') {
        // En démo, les amis simulés rejoignent l'équipe pour animer la guerre.
        team = { id: 'demo-my-team', name: name.trim(), emoji, code: generateCode() };
        const joinedOn = weekStart(today);
        setState((s) => ({
          ...s,
          team,
          teamMembers: [
            { id: ME_ID, name: s.profile.name, avatar: s.profile.avatar, joinedOn },
            ...DEMO_FRIENDS.map((f) => ({ ...f, joinedOn })),
          ],
        }));
        return team;
      }
      const { db } = requireOnline();
      team = await api.createTeam(db, name, emoji);
      await refresh();
      return team;
    },
    [today, requireOnline, refresh],
  );

  const joinTeam = useCallback(
    async (code: string) => {
      if (mode === 'demo') return createTeam(`Équipe ${code.toUpperCase()}`, '⚔️');
      const { db } = requireOnline();
      const team = await api.joinTeam(db, code);
      await refresh();
      return team;
    },
    [createTeam, requireOnline, refresh],
  );

  const leaveTeam = useCallback(async () => {
    if (mode === 'online') {
      const { db } = requireOnline();
      await api.leaveTeam(db);
    }
    setState((s) => ({ ...s, team: null, teamMembers: [] }));
    if (mode === 'online') await refresh();
  }, [requireOnline, refresh]);

  const reportTeam = useCallback(
    async (id: string) => {
      if (mode === 'demo') return;
      const { db } = requireOnline();
      await api.reportTeam(db, id);
    },
    [requireOnline],
  );

  // --- Réglages -----------------------------------------------------------------

  const completeOnboarding = useCallback(() => {
    setState((s) => ({ ...s, settings: { ...s.settings, onboarded: true } }));
  }, []);

  const setReminderHour = useCallback((reminderHour: number | null) => {
    setState((s) => ({ ...s, settings: { ...s.settings, reminderHour } }));
  }, []);

  const simulateSteps = useCallback(
    (steps: number) => onSteps(toDayKey(new Date()), getStoredSteps(toDayKey(new Date())) + steps),
    [onSteps, getStoredSteps],
  );
  const canSimulate = mode === 'demo' && Platform.OS === 'web';

  const markCelebrated = useCallback(() => {
    setState((s) => ({ ...s, celebratedDay: toDayKey(new Date()) }));
  }, []);

  // --- Valeurs dérivées ---------------------------------------------------------

  const dayProgress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const { playerSteps, history, teamMembers, team, teamBoard } = state;
  const myId = mode === 'online' ? (userId ?? ME_ID) : ME_ID;

  const friendHistory = useCallback(
    (playerId: string, days: DayKey[]) => {
      if (playerId === myId) return history;
      return mode === 'demo' ? demoHistory(playerId, days, today, dayProgress) : (playerSteps[playerId] ?? {});
    },
    [myId, history, today, dayProgress, playerSteps],
  );

  const streak = useMemo(
    () => computeStreak(history, state.profile.dailyGoal, today),
    [history, state.profile.dailyGoal, today],
  );

  const warDays = useMemo(() => weekDays(today), [today]);

  const teamStandings = useMemo(() => {
    // Total de mon équipe calculé localement : il inclut mes derniers pas sans attendre le serveur.
    const myTeamTotal = teamMembers.reduce(
      (sum, m) => sum + memberContribution(friendHistory(m.id, warDays), warDays, m.joinedOn),
      0,
    );
    const others: TeamStanding[] =
      mode === 'demo'
        ? DEMO_RIVALS.map((r) => ({ ...r, steps: demoTeamSteps(r, warDays, today, dayProgress) }))
        : teamBoard.filter((t) => t.id !== team?.id);
    if (!team) return others;
    const server = teamBoard.find((t) => t.id === team.id);
    return [
      ...others,
      {
        id: team.id,
        name: team.name,
        emoji: team.emoji,
        members: teamMembers.length,
        steps: Math.max(myTeamTotal, server?.steps ?? 0),
      },
    ];
  }, [teamMembers, friendHistory, warDays, teamBoard, team, today, dayProgress]);

  const currentLeague = useMemo(
    () =>
      mode === 'demo'
        ? demoLeague({ id: ME_ID, name: state.profile.name }, history, today, weekStart(today), dayProgress)
        : state.league,
    [state.profile.name, state.league, history, today, dayProgress],
  );

  const thisWeek = weekStart(today);
  const weeklyRecap = useMemo(() => {
    const result =
      mode === 'demo' ? demoLeagueResult({ id: ME_ID, name: state.profile.name }, history, thisWeek) : state.lastWeekResult;
    if (!result || result.weekStart !== addDays(thisWeek, -7) || state.recapDismissedWeek === result.weekStart) return null;
    return result;
  }, [state.profile.name, state.lastWeekResult, state.recapDismissedWeek, history, thisWeek]);

  const dismissRecap = useCallback(() => {
    setState((s) => ({ ...s, recapDismissedWeek: addDays(weekStart(toDayKey(new Date())), -7) }));
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      ...state,
      mode,
      sync,
      ready,
      today,
      todaySteps: state.history[today] ?? 0,
      myId,
      streak,
      warDays,
      teamStandings,
      pedometer,
      updateProfile,
      addFriend,
      removeFriend,
      createChallenge,
      acceptChallenge,
      deleteChallenge,
      createTeam,
      joinTeam,
      leaveTeam,
      reportTeam,
      completeOnboarding,
      setReminderHour,
      markCelebrated,
      simulateSteps: canSimulate ? simulateSteps : null,
      deleteAccount,
      requestEmailLink,
      confirmEmailLink,
      requestLogin,
      confirmLogin,
      refresh,
      retry,
      friendHistory,
      currentLeague,
      weeklyRecap,
      dismissRecap,
    }),
    [
      state,
      sync,
      ready,
      today,
      myId,
      streak,
      warDays,
      teamStandings,
      pedometer,
      updateProfile,
      addFriend,
      removeFriend,
      createChallenge,
      acceptChallenge,
      deleteChallenge,
      createTeam,
      joinTeam,
      leaveTeam,
      reportTeam,
      completeOnboarding,
      setReminderHour,
      markCelebrated,
      canSimulate,
      simulateSteps,
      deleteAccount,
      requestEmailLink,
      confirmEmailLink,
      requestLogin,
      confirmLogin,
      refresh,
      retry,
      friendHistory,
      currentLeague,
      weeklyRecap,
      dismissRecap,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore doit être utilisé dans <AppStoreProvider>');
  return store;
}
