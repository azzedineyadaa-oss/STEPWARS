import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import type { MapBubble, PlayersMapHandle } from '@/components/PlayersMap';
import { Avatar } from '@/components/ui';
import type { Region } from '@/state/MapStore';
import { colors, formatCompact, radius } from '@/theme';

// react-native-maps n'existe pas sur le web : l'aperçu web dessine un plan
// simplifié (rues stylisées) et place les bulles des joueurs dessus.
export type { MapBubble, PlayersMapHandle } from '@/components/PlayersMap';

type Props = {
  initialRegion: Region;
  players: MapBubble[];
  showsUserLocation: boolean;
  onRegionChangeComplete: (region: Region) => void;
  onPlayerPress: (id: string) => void;
};

/** Rues stylisées, toujours les mêmes, pour donner l'impression d'un quartier. */
function Streets({ width, height }: { width: number; height: number }) {
  const lines: { x1: number; y1: number; x2: number; y2: number; w: number }[] = [];
  for (let i = -2; i < 9; i++) {
    lines.push({ x1: i * 90 - 40, y1: 0, x2: i * 90 + 60, y2: height, w: i % 3 === 0 ? 7 : 3 });
  }
  for (let j = 0; j < 14; j++) {
    lines.push({ x1: 0, y1: j * 80 + 20, x2: width, y2: j * 80 - 30, w: j % 4 === 1 ? 7 : 3 });
  }
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Rect width={width} height={height} fill="#14162b" />
      <Path d={`M ${width * 0.62} 0 C ${width * 0.5} ${height * 0.3}, ${width * 0.9} ${height * 0.5}, ${width * 0.7} ${height}`} stroke="#0a1830" strokeWidth={34} fill="none" />
      <Circle cx={width * 0.2} cy={height * 0.72} r={60} fill="#173024" />
      {lines.map((l, i) => (
        <Line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#24274a" strokeWidth={l.w} />
      ))}
    </Svg>
  );
}

export const PlayersMap = forwardRef<PlayersMapHandle, Props>(function PlayersMap({ initialRegion, players, onPlayerPress }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { latitude, longitude, latitudeDelta, longitudeDelta } = initialRegion;

  // Projection simple sur la zone affichée (suffisante à cette échelle).
  const toPoint = (lat: number, lng: number) => ({
    x: ((lng - (longitude - longitudeDelta / 2)) / longitudeDelta) * size.width,
    y: (((latitude + latitudeDelta / 2) - lat) / latitudeDelta) * size.height,
  });
  const me = toPoint(latitude, longitude);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      {size.width > 0 && (
        <>
          <Streets width={size.width} height={size.height} />
          <View style={[styles.me, { left: me.x - 9, top: me.y - 9 }]} />
          {players.map((p) => {
            const { x, y } = toPoint(p.coordinate.latitude, p.coordinate.longitude);
            if (x < -80 || y < -40 || x > size.width + 80 || y > size.height + 40) return null;
            return (
              <Pressable
                key={p.id}
                onPress={() => onPlayerPress(p.id)}
                style={[styles.bubble, p.isFriend ? styles.friend : styles.stranger, p.isLeader && styles.leader, { left: x - 60, top: y - 22 }]}
              >
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
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  me: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#2F80FF',
    borderWidth: 3,
    borderColor: '#fff',
  },
  bubble: {
    position: 'absolute',
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
