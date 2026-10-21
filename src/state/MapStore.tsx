import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import * as api from '@/lib/api';
import { DEMO_RIVALS, fromDayKey, toDayKey, weekStart } from '@/lib/game';
import { boundsForRegion, cellAt, cellKey, type LatLng } from '@/lib/hex';
import { supabase } from '@/lib/supabase';
import {
  addCellSteps,
  attributeSample,
  demoFriendsOnMap,
  demoTerritory,
  hourBucket,
  myStepsByCell,
  pendingCellUploads,
  pruneCellSteps,
  type CellSteps,
  type FriendOnMap,
  type Sample,
  type TerritoryCell,
} from '@/lib/territory';
import { useAppStore } from '@/state/AppStore';

const STORAGE_KEY = 'stepwars:map:v1';
const UPLOAD_DELAY_MS = 15_000;
const LOCATION_SHARE_INTERVAL_MS = 5 * 60_000;
/** Au-delà, la carte couvre trop de zones : on demande de zoomer. */
const MAX_BOUNDS_SPAN = 60;

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export type LocationState = 'unknown' | 'granted' | 'denied' | 'unavailable';

type PersistedMap = {
  /** Mes pas par zone et par heure, et ce qui a déjà été envoyé. */
  cellSteps: CellSteps;
  uploadedCells: CellSteps;
  /** Ma zone visible par mes amis (désactivé par défaut). */
  shareLocation: boolean;
  lastPosition: LatLng | null;
  accountId: string | null;
};

type MapStore = PersistedMap & {
  location: LocationState;
  position: LatLng | null;
  enableLocation: () => Promise<boolean>;
  setShareLocation: (enabled: boolean) => Promise<void>;
  /** Territoire de la guerre en cours dans la zone affichée (null : trop dézoomé). */
  loadTerritory: (region: Region) => Promise<TerritoryCell[] | null>;
  loadFriendsOnMap: (region: Region) => Promise<FriendOnMap[]>;
};

const initialMap = (): PersistedMap => ({
  cellSteps: {},
  uploadedCells: {},
  shareLocation: false,
  lastPosition: null,
  accountId: null,
});

/** Début et fin (ISO) de la guerre de la semaine, en heure locale. */
function warWindow(): { from: string; to: string; key: string } {
  const start = fromDayKey(weekStart(toDayKey(new Date())));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { from: start.toISOString(), to: end.toISOString(), key: weekStart(toDayKey(new Date())) };
}

const MapStoreContext = createContext<MapStore | null>(null);

export function MapStoreProvider({ children }: { children: ReactNode }) {
  const app = useAppStore();
  const { mode, myId, accountId, team, friends, todaySteps, settings, ready: appReady } = app;
  const online = mode === 'online' && supabase !== null && accountId !== null && myId === accountId;

  const [state, setState] = useState<PersistedMap>(initialMap);
  const [ready, setReady] = useState(false);
  const [location, setLocation] = useState<LocationState>(Platform.OS === 'web' ? 'unavailable' : 'unknown');
  const [position, setPosition] = useState<LatLng | null>(null);

  const stateRef = useRef(state);
  const stepsRef = useRef(todaySteps);
  useEffect(() => {
    stateRef.current = state;
    stepsRef.current = todaySteps;
  });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setState((s) => ({ ...s, ...(JSON.parse(raw) as Partial<PersistedMap>) })))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  // Nouveau compte (ou compte supprimé) : on repart de zéro. Fait pendant le
  // rendu, comme React le recommande pour un état qui dépend d'une autre valeur.
  if (ready && appReady && state.accountId !== accountId) setState({ ...initialMap(), accountId });

  // Autorisation déjà accordée lors d'une session précédente ?
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Location.getForegroundPermissionsAsync()
      .then((p) => setLocation(p.granted ? 'granted' : p.canAskAgain ? 'unknown' : 'denied'))
      .catch(() => setLocation('unavailable'));
  }, []);

  const enableLocation = useCallback(async () => {
    if (Platform.OS === 'web') return false;
    const p = await Location.requestForegroundPermissionsAsync();
    setLocation(p.granted ? 'granted' : 'denied');
    return p.granted;
  }, []);

  // --- Suivi de la position, app ouverte seulement ------------------------------
  const lastSample = useRef<Sample | null>(null);
  const lastShared = useRef<{ key: string; time: number } | null>(null);
  const shareRef = useRef({ online, share: state.shareLocation });
  useEffect(() => {
    shareRef.current = { online, share: state.shareLocation };
  });

  useEffect(() => {
    if (location !== 'granted' || !settings.onboarded) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 15_000 },
      (loc) => {
        const here = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setPosition(here);
        const sample: Sample = { position: here, time: loc.timestamp, steps: stepsRef.current };
        const credited = attributeSample(lastSample.current, sample);
        lastSample.current = sample;
        setState((s) => ({
          ...s,
          lastPosition: here,
          cellSteps: credited ? addCellSteps(s.cellSteps, credited.key, hourBucket(sample.time), credited.steps) : s.cellSteps,
        }));

        // Zone partagée avec les amis : à chaque changement de zone, sinon toutes les 5 minutes.
        const key = cellKey(cellAt(here));
        const { online: isOnline, share } = shareRef.current;
        const prev = lastShared.current;
        if (supabase && isOnline && share && (!prev || prev.key !== key || Date.now() - prev.time > LOCATION_SHARE_INTERVAL_MS)) {
          lastShared.current = { key, time: Date.now() };
          api.updateMyLocation(supabase, cellAt(here)).catch(() => {});
        }
      },
    )
      .then((s) => (cancelled ? s.remove() : (sub = s)))
      .catch(() => setLocation('unavailable'));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [location, settings.onboarded]);

  // --- Envoi des zones parcourues --------------------------------------------
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!online || !supabase || uploadTimer.current) return;
    if (pendingCellUploads(state.cellSteps, state.uploadedCells).length === 0) return;
    const db = supabase;
    uploadTimer.current = setTimeout(async () => {
      const s = stateRef.current;
      const cellSteps = pruneCellSteps(s.cellSteps, Date.now());
      const entries = pendingCellUploads(cellSteps, s.uploadedCells);
      try {
        await api.recordCellSteps(db, entries);
        setState((cur) => {
          let uploadedCells = pruneCellSteps(cur.uploadedCells, Date.now());
          for (const e of entries) {
            const key = cellKey(e);
            uploadedCells = { ...uploadedCells, [key]: { ...uploadedCells[key], [e.hour]: e.steps } };
          }
          return { ...cur, cellSteps: pruneCellSteps(cur.cellSteps, Date.now()), uploadedCells };
        });
      } catch {
        // Réessayé au prochain pas.
      } finally {
        uploadTimer.current = undefined;
      }
    }, UPLOAD_DELAY_MS);
  }, [online, state.cellSteps, state.uploadedCells]);

  useEffect(() => () => clearTimeout(uploadTimer.current), []);

  // --- Actions --------------------------------------------------------------------

  const setShareLocation = useCallback(
    async (enabled: boolean) => {
      if (online && supabase) {
        await api.setLocationSharing(supabase, enabled);
        lastShared.current = null;
        const here = stateRef.current.lastPosition;
        if (enabled && here) {
          lastShared.current = { key: cellKey(cellAt(here)), time: Date.now() };
          await api.updateMyLocation(supabase, cellAt(here));
        }
      }
      setState((s) => ({ ...s, shareLocation: enabled }));
    },
    [online],
  );

  const loadTerritory = useCallback(
    async (region: Region) => {
      const bounds = boundsForRegion(region);
      if (bounds.maxQ - bounds.minQ > MAX_BOUNDS_SPAN || bounds.maxR - bounds.minR > MAX_BOUNDS_SPAN) return null;
      const war = warWindow();
      if (online && supabase) return api.fetchTerritory(supabase, war.from, war.to, bounds);
      const mine = myStepsByCell(stateRef.current.cellSteps, war.from);
      return demoTerritory(cellAt(region), war.key, DEMO_RIVALS, team, mine, 8);
    },
    [online, team],
  );

  const loadFriendsOnMap = useCallback(
    async (region: Region) => {
      if (online && supabase) return api.fetchFriendsOnMap(supabase);
      return demoFriendsOnMap(cellAt(region), friends, hourBucket(Date.now()));
    },
    [online, friends],
  );

  const value = useMemo<MapStore>(
    () => ({ ...state, location, position, enableLocation, setShareLocation, loadTerritory, loadFriendsOnMap }),
    [state, location, position, enableLocation, setShareLocation, loadTerritory, loadFriendsOnMap],
  );

  return <MapStoreContext.Provider value={value}>{children}</MapStoreContext.Provider>;
}

export function useMapStore(): MapStore {
  const store = useContext(MapStoreContext);
  if (!store) throw new Error('useMapStore doit être utilisé dans <MapStoreProvider>');
  return store;
}
