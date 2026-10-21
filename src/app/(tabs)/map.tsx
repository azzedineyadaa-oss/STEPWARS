import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TerritoryMap, type MapCell, type MapFriend, type TerritoryMapHandle } from '@/components/TerritoryMap';
import { Button, tap } from '@/components/ui';
import { cellAt, cellBoundary, cellCenter, cellKey, parseCellKey, type LatLng } from '@/lib/hex';
import { cellOwner, teamColor, territoryStandings, type FriendOnMap, type TerritoryCell } from '@/lib/territory';
import { useAppStore } from '@/state/AppStore';
import { useMapStore, type Region } from '@/state/MapStore';
import { colors, font, formatSteps, radius, spacing } from '@/theme';

// Sans position connue : Paris.
const DEFAULT_CENTER = { latitude: 48.8566, longitude: 2.3522 };
const ZOOM = { latitudeDelta: 0.014, longitudeDelta: 0.014 };
const REFRESH_MS = 60_000;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { team, mode } = useAppStore();
  const { location, position, lastPosition, shareLocation, enableLocation, setShareLocation, loadTerritory, loadFriendsOnMap } =
    useMapStore();
  const mapRef = useRef<TerritoryMapHandle>(null);

  const [initialRegion] = useState<Region>(() => ({ ...(lastPosition ?? DEFAULT_CENTER), ...ZOOM }));
  const [region, setRegion] = useState<Region>(initialRegion);
  const [territory, setTerritory] = useState<TerritoryCell[] | null>([]);
  const [friends, setFriends] = useState<FriendOnMap[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  // Recentre sur le joueur la première fois qu'on connaît sa position.
  const centered = useRef(lastPosition !== null);
  useEffect(() => {
    if (position && !centered.current) {
      centered.current = true;
      mapRef.current?.recenter({ ...position, ...ZOOM });
    }
  }, [position]);

  // Recharge le territoire et les amis quand la carte bouge, puis chaque minute.
  const load = useCallback(
    (r: Region) => {
      loadTerritory(r)
        .then(setTerritory)
        .catch((e) => console.warn('Territoire indisponible', e));
      loadFriendsOnMap(r)
        .then(setFriends)
        .catch(() => {});
    },
    [loadTerritory, loadFriendsOnMap],
  );
  useEffect(() => {
    const timer = setTimeout(() => load(region), 400);
    const refresh = setInterval(() => load(region), REFRESH_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(refresh);
    };
  }, [region, load]);

  const owners = useMemo(
    () =>
      (territory ?? []).flatMap((cell) => {
        const owner = cellOwner(cell, team);
        return owner ? [{ cell, owner }] : [];
      }),
    [territory, team],
  );

  const mapCells: MapCell[] = owners.map(({ cell, owner }) => ({
    key: cell.key,
    boundary: cellBoundary(parseCellKey(cell.key)),
    color: teamColor(owner.id, owner.isMine),
    selected: cell.key === selected,
  }));
  const mapFriends: MapFriend[] = friends.map((f) => ({ ...f, coordinate: cellCenter(f.cell) }));
  const standings = territoryStandings(owners.map((o) => o.owner));
  const myCells = standings.find((s) => s.isMine)?.cells ?? 0;
  const leader = standings[0];

  const selectedOwner = selected ? owners.find((o) => o.cell.key === selected)?.owner : undefined;

  const onPress = (coordinate: LatLng) => {
    tap('selection');
    const key = cellKey(cellAt(coordinate));
    setSelected((cur) => (cur === key ? null : key));
  };

  const onRecenter = () => {
    const here = position ?? lastPosition;
    if (here) mapRef.current?.recenter({ ...here, ...ZOOM });
  };

  const onToggleShare = () => {
    if (shareLocation) {
      setShareLocation(false).catch((e) => Alert.alert('Erreur', e instanceof Error ? e.message : undefined));
      return;
    }
    Alert.alert(
      'Apparaître sur la carte de tes amis ?',
      'Tes amis (pas les inconnus) verront la zone où tu te trouves, à environ 200 m près, tant que l’app est ouverte. Tu peux repasser en mode fantôme à tout moment.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Me montrer',
          onPress: () =>
            setShareLocation(true).catch((e) => Alert.alert('Erreur', e instanceof Error ? e.message : undefined)),
        },
      ],
    );
  };

  const onEnableLocation = async () => {
    if (location === 'denied') {
      Linking.openSettings();
      return;
    }
    await enableLocation();
  };

  return (
    <View style={styles.screen}>
      <TerritoryMap
        ref={mapRef}
        initialRegion={initialRegion}
        cells={mapCells}
        selection={selected ? cellBoundary(parseCellKey(selected)) : null}
        friends={mapFriends}
        showsUserLocation={location === 'granted'}
        onRegionChangeComplete={setRegion}
        onPress={onPress}
      />

      {Platform.OS !== 'web' && (
        <>
          <View style={[styles.top, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
            <View style={styles.card}>
              <Text style={styles.kicker}>TERRITOIRES DE LA SEMAINE{mode === 'demo' ? ' · DÉMO' : ''}</Text>
              {territory === null ? (
                <Text style={styles.line}>Zoome pour voir les territoires.</Text>
              ) : team ? (
                <Text style={styles.line}>
                  <Text style={{ color: colors.primary }}>
                    {team.emoji} {team.name}
                  </Text>{' '}
                  tient {myCells} zone{myCells > 1 ? 's' : ''} ici
                  {leader && !leader.isMine ? ` · en tête : ${leader.emoji} ${leader.name} (${leader.cells})` : leader ? ' · 👑 en tête' : ''}
                </Text>
              ) : (
                <Pressable onPress={() => router.push('/team/new')}>
                  <Text style={styles.line}>
                    Rejoins une équipe pour conquérir des zones. <Text style={styles.link}>C’est par ici →</Text>
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={[styles.bottom, { bottom: spacing.md }]} pointerEvents="box-none">
            {selected && (
              <View style={styles.card}>
                {selectedOwner ? (
                  <Text style={styles.line}>
                    {selectedOwner.emoji}{' '}
                    <Text style={{ color: teamColor(selectedOwner.id, selectedOwner.isMine), fontWeight: '900' }}>
                      {selectedOwner.name}
                    </Text>{' '}
                    tient cette zone avec {formatSteps(selectedOwner.steps)} pas cette semaine.
                    {selectedOwner.isMine ? ' Défendez-la ! 🛡️' : ' Viens la reprendre ⚔️'}
                  </Text>
                ) : (
                  <Text style={styles.line}>Zone libre : marche ici pour la conquérir 🚩</Text>
                )}
              </View>
            )}

            {location !== 'granted' ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>📍 Active ta position</Text>
                <Text style={styles.line}>
                  Pour que tes pas conquièrent les zones où tu marches. Elle sert seulement quand l’app est ouverte.
                </Text>
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    title={location === 'denied' ? 'Ouvrir les réglages' : 'Activer la position'}
                    onPress={onEnableLocation}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.actions}>
                <Pressable style={[styles.chip, shareLocation && styles.chipOn]} onPress={onToggleShare}>
                  <Text style={styles.chipText}>{shareLocation ? '📍 Visible par mes amis' : '👻 Mode fantôme'}</Text>
                </Pressable>
                <Pressable style={styles.round} onPress={onRecenter} accessibilityLabel="Recentrer sur moi">
                  <Ionicons name="locate" size={22} color={colors.text} />
                </Pressable>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { position: 'absolute', left: spacing.md, right: spacing.md },
  bottom: { position: 'absolute', left: spacing.md, right: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: 'rgba(23, 25, 48, 0.94)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  kicker: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  cardTitle: { color: colors.text, ...font.heading, marginBottom: 4 },
  line: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  link: { color: colors.primary, fontWeight: '900' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    backgroundColor: 'rgba(23, 25, 48, 0.94)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  chipOn: { borderColor: colors.secondary, backgroundColor: '#2A2160' },
  chipText: { color: colors.text, fontWeight: '800' },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 25, 48, 0.94)',
    borderColor: colors.border,
    borderWidth: 1,
  },
});
