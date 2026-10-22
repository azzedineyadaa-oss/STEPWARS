import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayersMap, type MapBubble, type PlayersMapHandle } from '@/components/PlayersMap';
import { Button, tap } from '@/components/ui';
import { cellAt, cellCenter, type LatLng } from '@/lib/hex';
import { dayLeader, distanceLabel, type MapVisibility } from '@/lib/players';
import { useAppStore } from '@/state/AppStore';
import { useMapStore, type Region } from '@/state/MapStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

// Sans position connue : Paris.
const DEFAULT_CENTER = { latitude: 48.8566, longitude: 2.3522 };
const ZOOM = { latitudeDelta: 0.03, longitudeDelta: 0.03 };
const REFRESH_MS = 60_000;

const MODES: { mode: MapVisibility; label: string }[] = [
  { mode: 'ghost', label: '👻 Fantôme' },
  { mode: 'friends', label: '👥 Amis' },
  { mode: 'public', label: '🌍 Tout le monde' },
];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { mode: appMode } = useAppStore();
  const { location, position, lastPosition, visibility, players, enableLocation, setVisibility, loadPlayers } = useMapStore();
  const mapRef = useRef<PlayersMapHandle>(null);

  const [initialRegion] = useState<Region>(() => ({ ...(lastPosition ?? DEFAULT_CENTER), ...ZOOM }));
  const [listOpen, setListOpen] = useState(true);

  // Recentre sur le joueur la première fois qu'on connaît sa position.
  const centered = useRef(lastPosition !== null);
  useEffect(() => {
    if (position && !centered.current) {
      centered.current = true;
      mapRef.current?.recenter({ ...position, ...ZOOM });
    }
  }, [position]);

  const here: LatLng = position ?? lastPosition ?? DEFAULT_CENTER;
  const hereKey = `${here.latitude.toFixed(3)},${here.longitude.toFixed(3)}`;
  const load = useCallback(() => {
    loadPlayers(here).catch((e) => console.warn('Joueurs indisponibles', e));
    // `hereKey` suffit : recharger à chaque petit mouvement serait inutile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPlayers, hereKey]);
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const leaderId = dayLeader(players);
  const bubbles: MapBubble[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    stepsToday: p.stepsToday,
    coordinate: cellCenter(p.cell),
    isFriend: p.isFriend,
    goalReached: p.goalReached,
    isLeader: p.id === leaderId,
  }));
  const myCell = cellAt(here);
  const ranking = [...players].sort((a, b) => b.stepsToday - a.stepsToday);

  const openPlayer = (id: string) => {
    tap('selection');
    router.push({ pathname: '/player/[id]', params: { id } });
  };

  const onRecenter = () => mapRef.current?.recenter({ ...here, ...ZOOM });

  const choose = (mode: MapVisibility) => {
    if (mode === visibility) return;
    const apply = () => setVisibility(mode).catch((e) => Alert.alert('Erreur', e instanceof Error ? e.message : undefined));
    if (mode === 'public') {
      Alert.alert(
        'Apparaître pour tout le monde ?',
        'Les joueurs à moins de 2 km verront ton pseudo, tes pas du jour et ta position arrondie à environ 600 m, tant que l’app est ouverte. En échange, tu les verras aussi.\n\nRéservé aux 16 ans et plus.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'J’ai 16 ans ou plus', onPress: apply },
        ],
      );
    } else {
      apply();
    }
  };

  const onEnableLocation = async () => {
    if (location === 'denied') Linking.openSettings();
    else await enableLocation();
  };

  return (
    <View style={styles.screen}>
      <PlayersMap
        ref={mapRef}
        initialRegion={initialRegion}
        players={bubbles}
        showsUserLocation={location === 'granted'}
        onRegionChangeComplete={() => {}}
        onPlayerPress={openPlayer}
      />

      {Platform.OS !== 'web' && (
        <>
          <View style={[styles.top, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
            <View style={styles.modes}>
              {MODES.map((m) => (
                <Pressable
                  key={m.mode}
                  style={[styles.mode, visibility === m.mode && styles.modeOn]}
                  onPress={() => choose(m.mode)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: visibility === m.mode }}
                >
                  <Text style={styles.modeText}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.modeHint}>
              {visibility === 'ghost'
                ? 'Personne ne te voit.'
                : visibility === 'friends'
                  ? 'Seuls tes amis te voient.'
                  : 'Les marcheurs proches te voient (position arrondie).'}
              {appMode === 'demo' ? ' · Démo' : ''}
            </Text>
          </View>

          <View style={[styles.bottom, { bottom: spacing.md }]} pointerEvents="box-none">
            {location !== 'granted' ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>📍 Active ta position</Text>
                <Text style={styles.line}>Pour voir les marcheurs autour de toi. Elle sert seulement quand l’app est ouverte.</Text>
                <View style={{ marginTop: spacing.sm }}>
                  <Button title={location === 'denied' ? 'Ouvrir les réglages' : 'Activer la position'} onPress={onEnableLocation} />
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                <Pressable style={styles.listHeader} onPress={() => setListOpen((o) => !o)}>
                  <Text style={styles.cardTitle}>🏃 Marcheurs du quartier</Text>
                  <Ionicons name={listOpen ? 'chevron-down' : 'chevron-up'} size={20} color={colors.textMuted} />
                </Pressable>
                {listOpen &&
                  (ranking.length === 0 ? (
                    <Text style={styles.line}>
                      {visibility === 'public'
                        ? 'Personne de visible autour de toi pour l’instant.'
                        : 'Passe en 🌍 Tout le monde pour voir les marcheurs autour de toi.'}
                    </Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 190 }}>
                      {ranking.map((p, i) => (
                        <Pressable key={p.id} style={styles.row} onPress={() => openPlayer(p.id)}>
                          <Text style={styles.rank}>{i === 0 ? '👑' : `${i + 1}`}</Text>
                          <Text style={styles.rowAvatar}>{p.avatar}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowName} numberOfLines={1}>
                              {p.name}
                              {p.isFriend ? ' · ami' : ''}
                            </Text>
                            <Text style={styles.rowMeta}>
                              {distanceLabel(myCell, p.cell)} · il y a {p.minutesAgo} min
                            </Text>
                          </View>
                          <Text style={styles.rowSteps}>
                            {formatSteps(p.stepsToday)}
                            {p.goalReached ? ' 🔥' : ''}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ))}
              </View>
            )}

            {location === 'granted' && (
              <Pressable style={styles.round} onPress={onRecenter} accessibilityLabel="Recentrer sur moi">
                <Ionicons name="locate" size={22} color={colors.text} />
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const panel = {
  backgroundColor: 'rgba(23, 25, 48, 0.95)',
  borderColor: colors.border,
  borderWidth: 1,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', gap: 6 },
  modes: { ...panel, flexDirection: 'row', borderRadius: radius.pill, padding: 4, gap: 4 },
  mode: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.pill },
  modeOn: { backgroundColor: colors.secondary },
  modeText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  modeHint: { ...panel, color: colors.text, fontSize: 12, fontWeight: '600', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12, overflow: 'hidden' },
  bottom: { position: 'absolute', left: spacing.md, right: spacing.md, gap: spacing.sm, alignItems: 'flex-end' },
  card: { ...panel, borderRadius: radius.md, padding: spacing.md, alignSelf: 'stretch' },
  cardTitle: { color: colors.text, ...font.heading },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  line: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  rank: { color: colors.textMuted, width: 24, textAlign: 'center', fontWeight: '900' },
  rowAvatar: { fontSize: 22 },
  rowName: { color: colors.text, fontWeight: '800', fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  rowSteps: { color: colors.text, fontWeight: '900' },
  round: {
    ...panel,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: -60,
    right: 0,
  },
});
