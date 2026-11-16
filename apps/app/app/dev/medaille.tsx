import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { RARITIES, type BadgeSpec, type Rarity } from '@best-badges/badge-spec';
import { AnimatedBadge } from '../../src/components/AnimatedBadge';
import { Badge3DGL, type GLStats } from '../../src/components/Badge3DGL';
import { Badge3DWebView } from '../../src/components/Badge3DWebView';
import { prewarmInfo } from '../../src/components/Medal3DPrewarm';
import { Screen, T } from '../../src/components/ui.tsx';
import { colors, font, radius } from '../../src/theme.ts';

/**
 * Gerätetest der 3D-Medaille – ohne Netzwerk und ohne Anmeldung (bestbadges://dev/medaille).
 * Zeigt alle Materialien, vergleicht 2D und 3D und misst erstes Bild und Bildrate.
 */
const spec = (shape: BadgeSpec['emblem']['shape'], pattern: BadgeSpec['emblem']['pattern'], ref: string, palette: BadgeSpec['emblem']['palette']): BadgeSpec =>
  ({ version: 1, frame: 'classic', emblem: { shape, pattern, motif: { type: 'icon', ref }, palette } } as BadgeSpec);

const SAMPLES: { label: string; spec: BadgeSpec; tier?: number; tierCount?: number; gems?: { total: number; filled: number }; locked?: boolean }[] = [
  { label: 'Gold', spec: spec('circle', 'forest', 'trees', 'moss'), tier: 3, tierCount: 3 },
  { label: 'Silber', spec: spec('shield', 'timber', 'building-castle', 'kaiser'), tier: 2, tierCount: 3 },
  { label: 'Bronze', spec: spec('hexagon', 'mountains', 'pick', 'ore'), tier: 1, tierCount: 3 },
  { label: 'Holz', spec: spec('circle', 'waves', 'books', 'river'), tier: 1, tierCount: 5 },
  { label: 'Kristall', spec: spec('diamond', 'rays', 'star', 'heather'), tier: 5, tierCount: 5 },
  { label: 'Emaille', spec: spec('circle', 'rays', 'trophy', 'mango') },
  { label: 'Sammlung', spec: spec('hexagon', 'rays', 'map-2', 'mango'), gems: { total: 4, filled: 4 } },
  { label: 'Gesperrt', spec: spec('circle', 'forest', 'trees', 'moss'), tier: 2, tierCount: 3, locked: true },
];

export default function MedalDevScreen() {
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<'3d' | 'web' | '2d'>('3d');
  const [stats, setStats] = useState<GLStats | null>(null);
  const [rarity, setRarity] = useState<Rarity>('common');
  // Während der Finger auf der Medaille liegt, scrollt die Seite nicht
  const [touching, setTouching] = useState(false);
  // Erhöhen = neue WebView (misst einen frischen Start bei warmen System-Caches)
  const [webKey, setWebKey] = useState(0);
  const s = SAMPLES[i]!;
  const size = 300;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Medaille testen' }} />
      <ScrollView scrollEnabled={!touching} contentContainerStyle={{ padding: 16, gap: 16, alignItems: 'center', paddingBottom: 48 }}>
        <View style={{ height: size, justifyContent: 'center' }}>
          {mode === 'web'
            ? // Eine WebView für alle Muster: Wechsel schicken nur neue Daten hinein (wie später im Profil)
            <Badge3DWebView key={`web${webKey}`} spec={s.spec} tier={s.tier} tierCount={s.tierCount} gems={s.gems} locked={s.locked} rarity={rarity} size={size} title={s.label} onStats={setStats} onInteract={setTouching} />
            : mode === '3d'
            // key: bei jedem Wechsel neue Bühne, damit die Messung des ersten Bildes stimmt
            ? <Badge3DGL key={`${i}`} spec={s.spec} tier={s.tier} tierCount={s.tierCount} gems={s.gems} locked={s.locked} rarity={rarity} size={size} title={s.label} onStats={setStats} onInteract={setTouching} />
            : <AnimatedBadge spec={s.spec} tier={s.tier} tierCount={s.tierCount} gems={s.gems} locked={s.locked} rarity={rarity} size={size * 0.9} title={s.label} onInteract={setTouching} />}
        </View>
        <Text style={T.h2}>{s.label}</Text>
        {mode !== '2d' && (
          <Text style={T.muted}>
            {stats ? `Erstes Bild nach ${stats.firstFrameMs ?? '–'} ms · ${stats.fps} Bilder/s` : 'Wird vorbereitet …'}
          </Text>
        )}
        {mode === 'web' && (
          <Text style={[T.muted, { textAlign: 'center' }]}>
            {`Wechsel ${stats?.switchMs ?? '–'} ms · Shader vorgewärmt in ${stats?.warmMs ?? '–'} ms\nBeim App-Start vorgewärmt: ${prewarmInfo.warmMs !== null ? `ja (${prewarmInfo.warmMs} ms)` : 'nein'}`}
          </Text>
        )}
        <View style={st.row}>
          {(['3d', 'web', '2d'] as const).map((m) => (
            <Pressable key={m} onPress={() => { setMode(m); setStats(null); }} style={[st.chip, mode === m && st.on]}>
              <Text style={[st.chipText, mode === m && st.onText]}>{m === '3d' ? '3D nativ' : m === 'web' ? '3D WebView' : '2D'}</Text>
            </Pressable>
          ))}
        </View>
        {mode === 'web' && (
          <Pressable onPress={() => { setStats(null); setWebKey((k) => k + 1); }} style={st.chip}>
            <Text style={st.chipText}>WebView neu starten</Text>
          </Pressable>
        )}
        <View style={[st.row, { flexWrap: 'wrap', justifyContent: 'center' }]}>
          {SAMPLES.map((x, j) => (
            <Pressable key={x.label} onPress={() => { setI(j); if (mode !== 'web') setStats(null); }} style={[st.chip, i === j && st.on]}>
              <Text style={[st.chipText, i === j && st.onText]}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={st.row}>
          {(Object.keys(RARITIES) as Rarity[]).map((r) => (
            <Pressable key={r} onPress={() => setRarity(r)} style={[st.chip, rarity === r && st.on]}>
              <Text style={[st.chipText, rarity === r && st.onText]}>{RARITIES[r]}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[T.muted, { textAlign: 'center' }]}>Mit dem Finger über die Medaille ziehen, um sie zu kippen.</Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  on: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.text, fontFamily: font.semibold, fontSize: 14 },
  onText: { color: colors.onGold },
});
