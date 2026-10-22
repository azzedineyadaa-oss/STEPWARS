import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import type { LatLng } from '@/lib/hex';
import type { Region } from '@/state/MapStore';
import { colors, formatCompact, radius } from '@/theme';

export type MapBubble = {
  id: string;
  name: string;
  avatar: string;
  stepsToday: number;
  coordinate: LatLng;
  isFriend: boolean;
  goalReached: boolean;
  isLeader: boolean;
};

export type PlayersMapHandle = { recenter: (region: Region) => void };

type Props = {
  initialRegion: Region;
  players: MapBubble[];
  showsUserLocation: boolean;
  onRegionChangeComplete: (region: Region) => void;
  onPlayerPress: (id: string) => void;
};

// Style sombre pour Google Maps (Android) ; sur iPhone, Apple Plans suit `userInterfaceStyle`.
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#14162b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8db8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0c17' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#24274a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1830' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export const PlayersMap = forwardRef<PlayersMapHandle, Props>(function PlayersMap(
  { initialRegion, players, showsUserLocation, onRegionChangeComplete, onPlayerPress },
  ref,
) {
  const map = useRef<MapView>(null);
  useImperativeHandle(ref, () => ({ recenter: (region) => map.current?.animateToRegion(region, 600) }));

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      userInterfaceStyle="dark"
      customMapStyle={DARK_STYLE}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      onRegionChangeComplete={onRegionChangeComplete}
    >
      {players.map((p) => (
        <Marker
          // La clé change avec le contenu : la bulle est redessinée quand les pas changent.
          key={`${p.id}-${p.stepsToday}-${p.isLeader}`}
          coordinate={p.coordinate}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          onPress={() => onPlayerPress(p.id)}
        >
          <View style={[styles.bubble, p.isFriend ? styles.friend : styles.stranger, p.isLeader && styles.leader]}>
            <Text style={styles.avatar}>{p.avatar}</Text>
            <View>
              <Text style={styles.name} numberOfLines={1}>
                {p.isLeader ? '👑 ' : ''}
                {p.name}
              </Text>
              <Text style={styles.steps}>
                {formatCompact(p.stepsToday)} pas{p.goalReached ? ' 🔥' : ''}
              </Text>
            </View>
          </View>
        </Marker>
      ))}
    </MapView>
  );
});

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    maxWidth: 170,
  },
  friend: { borderColor: colors.secondary },
  stranger: { borderColor: colors.border },
  leader: { borderColor: colors.gold },
  avatar: { fontSize: 22 },
  name: { color: colors.text, fontWeight: '800', fontSize: 13 },
  steps: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
});
