import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { tap } from '@/components/ui';
import { SCENE_HEIGHT, SCENE_WIDTH, STARS, SUMMIT, pointAt, skyFor, trailPath } from '@/lib/scene';
import { SVG_FONT, colors, identityColor, initials } from '@/theme';

type Walker = { id: string; name: string; progress: number };

// Ciel ajouté au-dessus de la scène, pour le titre et le compteur de pas.
const SKY_EXTRA = 150;

type Props = {
  /** Ma progression du jour (pas / objectif). */
  progress: number;
  /** Amis sur le sentier (leur progression du jour). */
  friends?: Walker[];
  children?: ReactNode;
};

/**
 * La journée en montagne : le ciel suit l'heure, et le marcheur monte vers
 * le sommet au rythme des pas. La montée se rejoue à chaque ouverture.
 */
export function Ascent({ progress, friends = [], children }: Props) {
  const { width } = useWindowDimensions();
  const height = (width / SCENE_WIDTH) * (SCENE_HEIGHT + SKY_EXTRA);
  const sky = skyFor(new Date().getHours());
  const target = Math.min(1, Math.max(0, progress));
  const reached = target >= 1;

  // Progression animée : de la dernière valeur affichée jusqu'à la nouvelle.
  const [shown, setShown] = useState(0);
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const id = anim.addListener(({ value }) => setShown(value));
    return () => anim.removeListener(id);
  }, [anim]);
  useEffect(() => {
    Animated.timing(anim, {
      toValue: target,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && target >= 1) tap('success');
    });
  }, [anim, target]);

  const me = pointAt(shown);
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = width / SCENE_WIDTH;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 ${-SKY_EXTRA} ${SCENE_WIDTH} ${SCENE_HEIGHT + SKY_EXTRA}`}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sky.top} />
            <Stop offset="1" stopColor={sky.bottom} />
          </LinearGradient>
          <LinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sky.near} />
            <Stop offset="1" stopColor={colors.background} />
          </LinearGradient>
        </Defs>
        <Rect y={-SKY_EXTRA} width={SCENE_WIDTH} height={SCENE_HEIGHT + SKY_EXTRA} fill="url(#sky)" />
        {sky.stars &&
          STARS.map((s, i) => (
            <Circle key={i} cx={s.x} cy={s.y - (i % 2 ? 110 : 0)} r={i % 3 === 0 ? 1.6 : 1} fill="#FFFFFF" opacity={0.8} />
          ))}
        <Circle cx={sky.body.x} cy={sky.body.y} r={sky.body.r} fill={sky.body.color} opacity={0.95} />
        <Circle cx={sky.body.x} cy={sky.body.y} r={sky.body.r * 1.8} fill={sky.body.color} opacity={0.12} />

        {/* Crêtes lointaines, montagne principale et son sommet enneigé. */}
        <Path d="M0 214 L58 168 L104 196 L150 150 L180 172 L214 96 L262 150 L300 118 L346 160 L390 132 L390 330 L0 330 Z" fill={sky.far} />
        <Path d="M214 96 L232 118 L222 115 L214 126 L204 114 L196 119 Z" fill="#F7F1EA" opacity={0.92} />
        <Path d="M0 300 L52 262 L112 284 L176 228 L238 270 L300 236 L390 268 L390 330 L0 330 Z" fill="url(#ground)" />

        {/* Sentier complet, puis la partie déjà parcourue. */}
        <Path d={trailPath(1)} fill="none" stroke="#F7F1EA" strokeOpacity={0.35} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" />
        <Path d={trailPath(shown)} fill="none" stroke={colors.primary} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />

        {/* Drapeau du sommet. */}
        <G>
          <Path d={`M${SUMMIT.x} ${SUMMIT.y} L${SUMMIT.x} ${SUMMIT.y - 26}`} stroke="#F7F1EA" strokeWidth={2} />
          <Path
            d={`M${SUMMIT.x} ${SUMMIT.y - 26} L${SUMMIT.x + 16} ${SUMMIT.y - 21} L${SUMMIT.x} ${SUMMIT.y - 16} Z`}
            fill={reached ? colors.primary : '#F7F1EA'}
          />
        </G>

        {/* Amis sur le sentier. */}
        {friends.slice(0, 4).map((f) => {
          const p = pointAt(Math.min(1, f.progress));
          return (
            <G key={f.id}>
              <Circle cx={p.x} cy={p.y} r={9} fill={identityColor(f.id)} stroke={colors.background} strokeWidth={2} />
              <SvgText x={p.x} y={p.y + 3.5} fontSize={9} fontWeight="bold" fontFamily={SVG_FONT} fill={colors.background} textAnchor="middle">
                {initials(f.name, 1)}
              </SvgText>
            </G>
          );
        })}

        {/* Moi. */}
        <Circle cx={me.x} cy={me.y} r={10} fill={colors.primary} stroke="#F7F1EA" strokeWidth={3} />
      </Svg>

      {/* Halo qui bat autour de moi. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            left: me.x * scale - 22,
            top: (me.y + SKY_EXTRA) * scale - 22,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }],
          },
        ]}
      />
      <View pointerEvents="none" style={[styles.tag, { left: me.x * scale + 14, top: (me.y + SKY_EXTRA) * scale - 12 }]}>
        <Text style={styles.tagText}>{reached ? 'Sommet !' : 'Toi'}</Text>
      </View>

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary },
  tag: { position: 'absolute', backgroundColor: '#F7F1EA', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { color: colors.background, fontSize: 12, fontWeight: '800' },
});
