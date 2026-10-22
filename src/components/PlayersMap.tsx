import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Avatar } from '@/components/ui';
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
            <Avatar id={p.id} name={p.name} size={28} />
            <View>
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.steps}>
                {formatCompact(p.stepsToday)}
                {p.goalReached ? <Text style={{ color: colors.success }}> ●</Text> : null}
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
    backgroundColor: 'rgba(20, 20, 22, 0.94)',
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 10,
    maxWidth: 160,
  },
  friend: { borderColor: colors.text },
  stranger: { borderColor: colors.border },
  leader: { borderColor: colors.primary },
  name: { color: colors.text, fontWeight: '700', fontSize: 12 },
  steps: { color: colors.text, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
