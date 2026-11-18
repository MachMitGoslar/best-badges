import { mmh } from '@best-badges/design-tokens';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge } from '../src/components/Badge';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Badge3D } from '../src/components/Badge3D';
import { Burst } from '../src/components/Burst';
import { Button, ProgressBar, Screen, T } from '../src/components/ui.tsx';
import { getLastResult } from '../src/data.ts';
import { look } from '../src/badges.ts';
import { font, colors, radius } from '../src/theme.ts';

const cs = StyleSheet.create({
  combo: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.panel, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, padding: 12, marginTop: 6 },
  comboDone: { borderColor: colors.gold, shadowColor: colors.glow, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
});

const SIZE = 260;

export default function Success() {
  const r = getLastResult();
  const ra = r ? look(r.achievement) : null;
  const tiered = ra?.kind === 'tiered';
  // Bei einem Stufenaufstieg erst die alte Stufe zeigen, dann verwandeln
  const startTier = r && r.tierUp && r.previousTier > 0 ? r.previousTier : r?.tier ?? 0;
  const [shownTier, setShownTier] = useState(startTier);
  const [burst, setBurst] = useState(0);
  const scale = useSharedValue(0.2);
  const glow = useSharedValue(0);
  const textIn = useSharedValue(0);

  useEffect(() => {
    if (!r) return;
    scale.value = withSpring(1, { damping: 9, stiffness: 120 });
    const morph = r.tierUp && r.previousTier > 0;
    const t1 = setTimeout(() => {
      if (morph) {
        scale.value = withSequence(withTiming(1.18, { duration: 160 }), withSpring(1, { damping: 7 }));
        glow.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 700 }));
        setShownTier(r.tier);
      }
      if (r.tierUp || r.firstTime || r.collections.some((c) => c.firstTime)) {
        setBurst((b) => b + 1);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }, morph ? 900 : 250);
    textIn.value = withDelay(500, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    return () => clearTimeout(t1);
  }, [r, scale, glow, textIn]);

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textIn.value, transform: [{ translateY: 16 * (1 - textIn.value) }] }));

  if (!r) {
    return <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}><Button title="Zur Sammlung" onPress={() => router.replace('/')} /></Screen>;
  }

  const headline = r.achievement.secret
    ? 'Spur gefunden …'
    : r.tierUp ? (r.tier === 1 || !tiered ? (!r.achievement.secret && r.achievement.hidden ? 'Geheimnis gelüftet!' : 'Neues Abzeichen!') : `Stufe ${r.tier} erreicht!`) : `+${r.value} Fortschritt`;

  return (
    <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: SIZE * 1.2, height: SIZE * 1.2, borderRadius: SIZE, backgroundColor: mmh.ripeMango[200] }, flashStyle]} />
        <Animated.View style={badgeStyle}>
          <Badge3D spinOnShow spec={ra!.spec} size={SIZE} tier={tiered ? Math.max(1, shownTier) : undefined} tierCount={tiered ? r.tierCount : undefined} locked={shownTier === 0} rarity={r.rarity ?? undefined} title={ra!.name} />
        </Animated.View>
        <Burst size={SIZE * 1.5} trigger={burst} />
      </View>
      <Animated.View style={[{ alignItems: 'center', gap: 8, alignSelf: 'stretch' }, textStyle]}>
        <Text style={{ color: colors.gold, fontSize: 15, fontFamily: font.black, letterSpacing: 1 }}>{headline.toUpperCase()}</Text>
        <Text style={[T.h1, { textAlign: 'center' }]}>{ra!.name}</Text>
        {!!r.awardedText && <Text style={[T.body, { textAlign: 'center', color: colors.muted }]}>{r.awardedText}</Text>}
        {tiered && (
          <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 8 }}>
            {r.nextThreshold !== null ? (
              <>
                <ProgressBar value={r.progress} max={r.nextThreshold} />
                <Text style={[T.muted, { textAlign: 'center' }]}>{r.progress} / {r.nextThreshold} · noch {r.nextThreshold - r.progress} bis Stufe {r.tier + 1}</Text>
              </>
            ) : <Text style={[T.muted, { textAlign: 'center' }]}>Höchste Stufe erreicht!</Text>}
          </View>
        )}
        {r.collections.map((c) => (
          <Pressable key={c.achievement.id} style={[cs.combo, c.firstTime && cs.comboDone]} onPress={() => { router.dismissAll(); router.push(`/achievements/${c.achievement.id}`); }}>
            <Badge spec={look(c.achievement).spec} size={56} gems={c.achievement.secret ? undefined : { total: c.requiredCount, filled: Math.min(c.progress, c.requiredCount) }} locked={!c.completed} title={look(c.achievement).name} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[T.label, c.firstTime && { color: colors.gold }]}>{c.firstTime ? 'Kombination freigeschaltet!' : 'Kombination'}</Text>
              <Text style={[T.body, { fontFamily: font.bold }]} numberOfLines={1}>{look(c.achievement).name}</Text>
              {!c.completed && <ProgressBar value={c.progress} max={c.requiredCount} />}
              {!c.completed && <Text style={T.muted}>{c.progress} von {c.requiredCount} Teilen</Text>}
            </View>
          </Pressable>
        ))}
      </Animated.View>
      <View style={{ alignSelf: 'stretch', gap: 10 }}>
        <Button title="Zur Sammlung" onPress={() => { router.dismissAll(); router.replace('/'); }} />
        <Button title="Abzeichen ansehen" kind="secondary" onPress={() => { router.dismissAll(); router.push(`/achievements/${r.achievement.id}`); }} />
      </View>
    </Screen>
  );
}
