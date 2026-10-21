import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polygon } from 'react-native-maps';

import type { LatLng } from '@/lib/hex';
import type { Region } from '@/state/MapStore';
import { colors, radius } from '@/theme';

export type MapCell = { key: string; boundary: LatLng[]; color: string; selected: boolean };
export type MapFriend = { id: string; name: string; avatar: string; coordinate: LatLng; minutesAgo: number };

export type TerritoryMapHandle = { recenter: (region: Region) => void };

type Props = {
  initialRegion: Region;
  cells: MapCell[];
  /** Contour de la zone touchée, même si personne ne la tient. */
  selection: LatLng[] | null;
  friends: MapFriend[];
  showsUserLocation: boolean;
  onRegionChangeComplete: (region: Region) => void;
  onPress: (coordinate: LatLng) => void;
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

export const TerritoryMap = forwardRef<TerritoryMapHandle, Props>(function TerritoryMap(
  { initialRegion, cells, selection, friends, showsUserLocation, onRegionChangeComplete, onPress },
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
      onPress={(e) => onPress(e.nativeEvent.coordinate)}
    >
      {cells.map((c) => (
        <Polygon
          key={c.key}
          coordinates={c.boundary}
          fillColor={`${c.color}55`}
          strokeColor={c.selected ? '#FFFFFF' : `${c.color}CC`}
          strokeWidth={c.selected ? 3 : 1}
        />
      ))}
      {selection && !cells.some((c) => c.selected) && (
        <Polygon coordinates={selection} fillColor="#FFFFFF22" strokeColor="#FFFFFF" strokeWidth={2} />
      )}
      {friends.map((f) => (
        <Marker key={f.id} coordinate={f.coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.friend}>
            <Text style={styles.friendAvatar}>{f.avatar}</Text>
            <View>
              <Text style={styles.friendName}>{f.name}</Text>
              <Text style={styles.friendTime}>{f.minutesAgo <= 1 ? 'à l’instant' : `il y a ${f.minutesAgo} min`}</Text>
            </View>
          </View>
        </Marker>
      ))}
    </MapView>
  );
});

const styles = StyleSheet.create({
  friend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderColor: colors.secondary,
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
  },
  friendAvatar: { fontSize: 22 },
  friendName: { color: colors.text, fontWeight: '800', fontSize: 13 },
  friendTime: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
});
