import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayersMap, type MapBubble, type PlayersMapHandle } from '@/components/PlayersMap';
import { Avatar, Button, tap } from '@/components/ui';
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
  { mode: 'ghost', label: 'Invisible' },
  { mode: 'friends', label: 'Amis' },
  { mode: 'public', label: 'Public' },
];

const MODE_HINT: Record<MapVisibility, string> = {
  ghost: 'Personne ne te voit',
  friends: 'Visible par tes amis',
  public: 'Visible par les marcheurs proches · position arrondie',
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { mode: appMode } = useAppStore();
  const { location, position, lastPosition, visibility, players, enableLocation, setVisibility, loadPlayers } = useMapStore();
  const mapRef = useRef<PlayersMapHandle>(null);

  const [initialRegion] = useState<Region>(() => ({ ...(lastPosition ?? DEFAULT_CENTER), ...ZOOM }));
  const [listOpen, setListOpen] = useState(true);
  const [confirmPublic, setConfirmPublic] = useState(false);

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

  const apply = (mode: MapVisibility) =>
    setVisibility(mode).catch((e) => Alert.alert('Erreur', e instanceof Error ? e.message : undefined));

  const choose = (mode: MapVisibility) => {
    if (mode === visibility) return;
    tap('selection');
    // Passer en public demande une confirmation explicite (et l'âge).
    if (mode === 'public') setConfirmPublic(true);
    else apply(mode);
  };

  // Aperçu web : pas de position, on montre quand même la liste autour du point par défaut.
  const showPlayers = location === 'granted' || Platform.OS === 'web';

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

      <View style={[styles.top, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.segment}>
          {MODES.map((m) => (
            <Pressable
              key={m.mode}
              style={[styles.segmentItem, visibility === m.mode && styles.segmentOn]}
              onPress={() => choose(m.mode)}
              accessibilityRole="button"
              accessibilityState={{ selected: visibility === m.mode }}
            >
              <Text style={[styles.segmentText, visibility === m.mode && styles.segmentTextOn]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          {MODE_HINT[visibility]}
          {appMode === 'demo' ? (Platform.OS === 'web' ? ' · démo, plan simplifié' : ' · démo') : ''}
        </Text>
      </View>

      <View style={[styles.bottom, { bottom: spacing.md }]} pointerEvents="box-none">
        {location === 'granted' && (
          <Pressable style={styles.round} onPress={() => mapRef.current?.recenter({ ...here, ...ZOOM })} accessibilityLabel="Recentrer sur moi">
            <Ionicons name="navigate-outline" size={20} color={colors.text} />
          </Pressable>
        )}

        {!showPlayers ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Active ta position</Text>
            <Text style={styles.panelText}>Pour voir les marcheurs autour de toi. Utilisée seulement quand l’app est ouverte.</Text>
            <View style={{ marginTop: spacing.md }}>
              <Button title={location === 'denied' ? 'Ouvrir les réglages' : 'Activer la position'} onPress={onEnableLocation} />
            </View>
          </View>
        ) : (
          <View style={styles.panel}>
            <Pressable style={styles.panelHeader} onPress={() => setListOpen((o) => !o)}>
              <Text style={styles.label}>Autour de toi · aujourd’hui</Text>
              <Ionicons name={listOpen ? 'chevron-down' : 'chevron-up'} size={18} color={colors.textMuted} />
            </Pressable>
            {listOpen &&
              (ranking.length === 0 ? (
                <Text style={styles.panelText}>
                  {visibility === 'public'
                    ? 'Personne de visible autour de toi pour l’instant.'
                    : 'Passe en Public pour voir les marcheurs autour de toi.'}
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 200 }}>
                  {ranking.map((p, i) => (
                    <Pressable key={p.id} style={[styles.row, i > 0 && styles.rowBorder]} onPress={() => openPlayer(p.id)}>
                      <Text style={[styles.rank, i === 0 && { color: colors.primary }]}>{i + 1}</Text>
                      <Avatar id={p.id} name={p.name} size={32} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {p.name}
                          {p.isFriend ? <Text style={styles.rowMeta}> · ami</Text> : null}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {distanceLabel(myCell, p.cell)} · il y a {p.minutesAgo} min
                        </Text>
                      </View>
                      <Text style={styles.rowSteps}>{formatSteps(p.stepsToday)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ))}
          </View>
        )}
      </View>

      <Modal visible={confirmPublic} transparent animationType="fade" onRequestClose={() => setConfirmPublic(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.label}>Visibilité</Text>
            <Text style={styles.sheetTitle}>Passer en public ?</Text>
            <Text style={styles.sheetText}>
              Les marcheurs à moins de 2 km verront ton pseudo, tes pas du jour et ta position arrondie à environ 600 m,
              tant que l’app est ouverte. En échange, tu les verras aussi.
            </Text>
            <Text style={styles.sheetText}>Tu peux redevenir invisible à tout moment. Réservé aux 16 ans et plus.</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                title="J’ai 16 ans ou plus, continuer"
                onPress={() => {
                  setConfirmPublic(false);
                  apply('public');
                }}
              />
              <Button title="Annuler" variant="ghost" onPress={() => setConfirmPublic(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const glass = { backgroundColor: 'rgba(26, 36, 64, 0.94)', borderColor: colors.border, borderWidth: 1 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  label: { color: colors.textMuted, ...font.label },
  top: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', gap: 6 },
  segment: { ...glass, flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segmentItem: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: radius.sm + 1 },
  segmentOn: { backgroundColor: colors.text },
  segmentText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  segmentTextOn: { color: colors.background },
  hint: { ...glass, color: colors.textMuted, fontSize: 12, fontWeight: '600', borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
  bottom: { position: 'absolute', left: spacing.md, right: spacing.md, gap: spacing.sm, alignItems: 'flex-end' },
  panel: { ...glass, borderRadius: radius.lg, padding: spacing.md, alignSelf: 'stretch' },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  panelTitle: { color: colors.text, ...font.heading },
  panelText: { color: colors.textMuted, ...font.body, marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rank: { color: colors.textMuted, width: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rowName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
  rowSteps: { color: colors.text, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  round: { ...glass, width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  sheetTitle: { color: colors.text, ...font.title },
  sheetText: { color: colors.textMuted, ...font.body, lineHeight: 22 },
});
