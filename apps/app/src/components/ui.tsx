import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radius } from '../theme.ts';
import { Icon, type IconName } from './Icon.tsx';
import { NightSky } from './NightSky';

export function Screen({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <NightSky />
      {children}
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, busy, icon }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary'; disabled?: boolean; busy?: boolean; icon?: IconName }) {
  const primary = kind === 'primary';
  const fg = primary ? colors.onGold : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.btn, primary ? s.primary : s.secondary, (disabled || busy) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : (
        <View style={s.btnRow}>
          {icon && <Icon name={icon} size={20} color={fg} />}
          <Text style={[s.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(1, value / max) : 1;
  return (
    <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%` }]} /></View>
  );
}

export const T = StyleSheet.create({
  h1: { color: colors.text, fontSize: 28, fontFamily: font.black, letterSpacing: -0.4 },
  h2: { color: colors.text, fontSize: 20, fontFamily: font.bold },
  body: { color: colors.text, fontSize: 16, lineHeight: 22, fontFamily: font.regular },
  muted: { color: colors.muted, fontSize: 14, fontFamily: font.regular },
  label: { color: colors.muted, fontSize: 12, fontFamily: font.semibold, letterSpacing: 0.8, textTransform: 'uppercase' },
});

const s = StyleSheet.create({
  btn: { minHeight: 52, paddingHorizontal: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primary: { backgroundColor: colors.gold, shadowColor: colors.glow, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  secondary: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
  btnText: { fontSize: 17, fontFamily: font.bold },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.progressFill },
});
