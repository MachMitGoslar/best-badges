import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ShowcaseGrid } from '../../src/components/ShowcaseGrid.tsx';
import { Screen, T } from '../../src/components/ui.tsx';
import { usePublicProfile } from '../../src/data.ts';
import { look } from '../../src/badges.ts';
import { colors, font, radius } from '../../src/theme.ts';

/** Öffentliches Profil (auch per Link badges…/u/{kürzel}) */
export default function PublicProfile() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const p = usePublicProfile(handle!);
  if (!p.data) {
    return <Screen><Text style={[T.muted, { padding: 20 }]}>{p.error ? 'Dieses Profil gibt es nicht oder es ist privat.' : 'Lade …'}</Text></Screen>;
  }
  const d = p.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: d.displayName ?? d.handle }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 48 }}>
        <View style={{ alignItems: 'center', gap: 4, paddingVertical: 8 }}>
          <Text style={T.h1}>{d.displayName ?? d.handle}</Text>
          <Text style={T.muted}>@{d.handle}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[[d.stats.badges, 'Abzeichen'], [d.stats.tiers, 'Stufen']].map(([v, l]) => (
            <View key={String(l)} style={{ flex: 1, backgroundColor: colors.panel, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, padding: 14, alignItems: 'center' }}>
              <Text style={{ color: colors.gold, fontSize: 26, fontFamily: font.black }}>{v}</Text>
              <Text style={T.muted}>{l}</Text>
            </View>
          ))}
        </View>
        <Text style={T.h2}>Showcase</Text>
        {d.showcase.length === 0
          ? <Text style={T.muted}>Noch nichts ausgestellt.</Text>
          : <ShowcaseGrid items={d.showcase.map((x) => ({ id: x.achievement.id, name: look(x.achievement).name, spec: look(x.achievement).spec, kind: look(x.achievement).kind ?? 'single', tier: x.tier, tierCount: x.tierCount, progress: x.progress, requiredCount: x.requiredCount }))} />}
      </ScrollView>
    </Screen>
  );
}
