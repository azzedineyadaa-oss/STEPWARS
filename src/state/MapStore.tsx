import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import * as api from '@/lib/api';
import { cellAt, cellKey, type LatLng } from '@/lib/hex';
import { demoPlayerCard, demoPlayersAround, type MapPlayer, type MapVisibility, type PlayerCard } from '@/lib/players';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/state/AppStore';

const STORAGE_KEY = 'stepwars:map:v2';
const LOCATION_SHARE_INTERVAL_MS = 5 * 60_000;

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export type LocationState = 'unknown' | 'granted' | 'denied' | 'unavailable';

type PersistedMap = {
  /** Qui me voit sur la carte. Fantôme par défaut. */
  visibility: MapVisibility;
  lastPosition: LatLng | null;
  accountId: string | null;
};

type MapStore = PersistedMap & {
  location: LocationState;
  position: LatLng | null;
  /** Derniers joueurs chargés pour la carte. */
  players: MapPlayer[];
  enableLocation: () => Promise<boolean>;
  setVisibility: (mode: MapVisibility) => Promise<void>;
  /** Joueurs visibles : mes amis, et les joueurs proches si je suis public. */
  loadPlayers: (center: LatLng) => Promise<MapPlayer[]>;
  /** `known` : ce que la carte sait déjà du joueur (sert au mode démo). */
  loadPlayerCard: (playerId: string, known?: MapPlayer) => Promise<PlayerCard>;
  blockPlayer: (playerId: string) => Promise<void>;
  reportPlayer: (playerId: string) => Promise<void>;
};

const initialMap = (accountId: string | null = null): PersistedMap => ({
  visibility: 'ghost',
  lastPosition: null,
  accountId,
});

const MapStoreContext = createContext<MapStore | null>(null);

export function MapStoreProvider({ children }: { children: ReactNode }) {
  const { mode, myId, accountId, friends, today, settings, ready: appReady, refresh } = useAppStore();
  const online = mode === 'online' && supabase !== null && accountId !== null && myId === accountId;

  const [state, setState] = useState<PersistedMap>(initialMap);
  const [ready, setReady] = useState(false);
  const [location, setLocation] = useState<LocationState>(Platform.OS === 'web' ? 'unavailable' : 'unknown');
  const [position, setPosition] = useState<LatLng | null>(null);
  const [players, setPlayers] = useState<MapPlayer[]>([]);
  // Joueurs bloqués en mode démo (en ligne, c'est le serveur qui filtre).
  const [demoBlocked, setDemoBlocked] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setState((s) => ({ ...s, ...(JSON.parse(raw) as Partial<PersistedMap>) })))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  // Nouveau compte (ou compte supprimé) : retour en mode fantôme. Fait pendant
  // le rendu, comme React le recommande pour un état qui dépend d'une autre valeur.
  if (ready && appReady && state.accountId !== accountId) setState(initialMap(accountId));

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

  // --- Position, app ouverte seulement ------------------------------------------
  const lastShared = useRef<{ key: string; time: number } | null>(null);
  const shareRef = useRef({ online, visibility: state.visibility });
  useEffect(() => {
    shareRef.current = { online, visibility: state.visibility };
  });

  useEffect(() => {
    if (location !== 'granted' || !settings.onboarded) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 30, timeInterval: 20_000 }, (loc) => {
      const here = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setPosition(here);
      setState((s) => ({ ...s, lastPosition: here }));

      // Seule la zone (≈ 200 m) part au serveur : à chaque changement de zone, sinon toutes les 5 minutes.
      const { online: isOnline, visibility } = shareRef.current;
      const key = cellKey(cellAt(here));
      const prev = lastShared.current;
      if (supabase && isOnline && visibility !== 'ghost' && (!prev || prev.key !== key || Date.now() - prev.time > LOCATION_SHARE_INTERVAL_MS)) {
        lastShared.current = { key, time: Date.now() };
        api.updateMyLocation(supabase, cellAt(here)).catch(() => {});
      }
    })
      .then((s) => (cancelled ? s.remove() : (sub = s)))
      .catch(() => setLocation('unavailable'));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [location, settings.onboarded]);

  // --- Actions --------------------------------------------------------------------

  const setVisibility = useCallback(
    async (mode: MapVisibility) => {
      if (online && supabase) {
        await api.setMapVisibility(supabase, mode);
        lastShared.current = null;
        const here = state.lastPosition;
        if (mode !== 'ghost' && here) {
          lastShared.current = { key: cellKey(cellAt(here)), time: Date.now() };
          await api.updateMyLocation(supabase, cellAt(here));
        }
      }
      setState((s) => ({ ...s, visibility: mode }));
    },
    [online, state.lastPosition],
  );

  const loadPlayers = useCallback(
    async (center: LatLng) => {
      let loaded: MapPlayer[];
      if (online && supabase) {
        loaded = await api.fetchPlayersOnMap(supabase, today);
      } else {
        const now = new Date();
        const dayProgress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
        const hourSeed = `${today}T${now.getHours()}`;
        loaded = demoPlayersAround(cellAt(center), friends, state.visibility, today, dayProgress, hourSeed).filter(
          (p) => !demoBlocked.includes(p.id),
        );
      }
      setPlayers(loaded);
      return loaded;
    },
    [online, today, friends, state.visibility, demoBlocked],
  );

  const loadPlayerCard = useCallback(
    async (playerId: string, known?: MapPlayer) => {
      if (online && supabase) return api.fetchPlayerCard(supabase, playerId, today);
      if (!known) throw new api.ApiError('Ce joueur n’est plus visible.');
      return demoPlayerCard(known);
    },
    [online, today],
  );

  const blockPlayer = useCallback(
    async (playerId: string) => {
      if (online && supabase) {
        await api.blockPlayer(supabase, playerId);
        await refresh();
      } else {
        setDemoBlocked((b) => [...b, playerId]);
      }
    },
    [online, refresh],
  );

  const reportPlayer = useCallback(
    async (playerId: string) => {
      if (online && supabase) await api.reportPlayer(supabase, playerId);
    },
    [online],
  );

  const value = useMemo<MapStore>(
    () => ({
      ...state,
      location,
      position,
      players,
      enableLocation,
      setVisibility,
      loadPlayers,
      loadPlayerCard,
      blockPlayer,
      reportPlayer,
    }),
    [state, location, position, players, enableLocation, setVisibility, loadPlayers, loadPlayerCard, blockPlayer, reportPlayer],
  );

  return <MapStoreContext.Provider value={value}>{children}</MapStoreContext.Provider>;
}

export function useMapStore(): MapStore {
  const store = useContext(MapStoreContext);
  if (!store) throw new Error('useMapStore doit être utilisé dans <MapStoreProvider>');
  return store;
}
