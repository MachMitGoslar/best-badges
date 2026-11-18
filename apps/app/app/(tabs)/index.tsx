import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge } from '../../src/components/Badge';
import { LoginPrompt } from '../../src/components/LoginPrompt.tsx';
import { ProgressBar, Screen, T } from '../../src/components/ui.tsx';
import { useAuth } from '../../src/auth.ts';
import { useAwards, usePublicAchievements } from '../../src/data.ts';
import { look, type PublicAchievement } from '../../src/badges.ts';
import { font, colors, radius } from '../../src/theme.ts';

export default function Collection() {
  const auth = useAuth();
  const awards = useAwards();
  const discover = usePublicAchievements();

  const earnedIds = useMemo(() => new Set((awards.data ?? []).map((a) => a.achievement.id)), [awards.data]);
  const toDiscover = (discover.data ?? []).filter((a) => !earnedIds.has(a.id));
  const earned = (awards.data ?? []).filter((a) => a.tier > 0);
  const inProgress = (awards.data ?? []).filter((a) => a.tier === 0);

  if (auth.status === 'loading') return <Screen />;
  if (auth.status === 'signedOut') return <Screen><LoginPrompt /></Screen>;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 22 }}
        refreshControl={<RefreshControl tintColor={colors.gold} refreshing={awards.isRefetching} onRefresh={() => { void awards.refetch(); void discover.refetch(); }} />}
      >
        <View style={s.stats}>
          <Stat value={earned.length} label="Abzeichen" />
          <Stat value={earned.reduce((n, a) => n + a.tier, 0)} label="Stufen" />
          <Stat value={inProgress.length} label="Begonnen" />
        </View>

        {(awards.error || discover.error) && (
          <View style={s.empty}>
            <Text style={T.h2}>Verbindung fehlgeschlagen</Text>
            <Text style={T.muted}>{(awards.error ?? discover.error)?.message}</Text>
          </View>
        )}

        {awards.data && awards.data.length === 0 && (
          <View style={s.empty}>
            <Text style={T.h2}>Noch leer – aber nicht mehr lange</Text>
            <Text style={T.muted}>Scanne den QR-Code an einer Station, einer Veranstaltung oder an der Kasse.</Text>
          </View>
        )}

        {awards.data && awards.data.length > 0 && (
          <Section title="Deine Abzeichen">
            {awards.data.map((a) => { const l = look(a.achievement); return (
              <Tile key={a.achievement.id} onPress={() => router.push(`/achievements/${a.achievement.id}`)}>
                <Badge spec={l.spec} size={104} tier={l.kind === 'tiered' ? Math.max(1, a.tier) : undefined} tierCount={l.kind === 'tiered' ? a.tierCount : undefined} gems={l.kind === 'collection' && a.requiredCount ? { total: a.requiredCount, filled: Math.min(a.progress, a.requiredCount) } : undefined} locked={a.tier === 0} rarity={a.rarity ?? undefined} title={l.name} />
                <Text style={s.name} numberOfLines={2}>{l.name}</Text>
                {l.kind === 'tiered' && (
                  <View style={{ alignSelf: 'stretch', gap: 4 }}>
                    <Text style={s.small}>Stufe {a.tier}/{a.tierCount}</Text>
                    {a.nextThreshold !== null && <ProgressBar value={a.progress} max={a.nextThreshold} />}
                  </View>
                )}
                {l.kind === 'collection' && a.tier === 0 && a.nextThreshold !== null && (
                  <View style={{ alignSelf: 'stretch', gap: 4 }}>
                    <Text style={s.small}>{a.progress} von {a.nextThreshold} Teilen</Text>
                    <ProgressBar value={a.progress} max={a.nextThreshold} />
                  </View>
                )}
              </Tile>
            ); })}
          </Section>
        )}

        {toDiscover.length > 0 && (
          <Section title="Entdecken">
            {toDiscover.map((a) => (
              <Tile key={a.id} onPress={() => router.push(`/achievements/${a.id}`)}>
                <Badge spec={look(a).spec} size={104}
                  tier={!a.secret && a.kind === 'tiered' ? 1 : undefined} tierCount={!a.secret && a.kind === 'tiered' ? a.tiers.length : undefined}
                  gems={!a.secret && a.kind === 'collection' && a.requiredCount ? { total: a.requiredCount, filled: 0 } : undefined} locked title={look(a).name} />
                <Text style={s.name} numberOfLines={2}>{look(a).name}</Text>
                <Text style={s.small} numberOfLines={2}>{subtitle(a)}</Text>
              </Tile>
            ))}
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}

function subtitle(a: PublicAchievement) {
  if (a.secret) return a.hint ? `Hinweis: ${a.hint}` : 'Geheim – finde es selbst heraus';
  if (a.kind === 'collection') return `Kombination · ${a.requiredCount} von ${a.items.length}`;
  return a.kind === 'tiered' ? `${a.tiers.length} Stufen` : 'Einzelabzeichen';
}

function Stat({ value, label }: { value: number; label: string }) {
  return <View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.small}>{label}</Text></View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={{ gap: 12 }}><Text style={T.h2}>{title}</Text><View style={s.grid}>{children}</View></View>;
}

function Tile({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.tile, pressed && { transform: [{ scale: 0.97 }] }]}>{children}</Pressable>;
}

const s = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.panel, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, padding: 14, alignItems: 'center' },
  statValue: { color: colors.gold, fontSize: 26, fontFamily: font.black },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47.8%', backgroundColor: colors.panel, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, padding: 12, alignItems: 'center', gap: 6 },
  name: { color: colors.text, fontFamily: font.bold, fontSize: 15, textAlign: 'center' },
  small: { color: colors.muted, fontFamily: font.regular, fontSize: 12.5, textAlign: 'center' },
  empty: { backgroundColor: colors.panel, borderRadius: radius.m, padding: 18, gap: 6, borderWidth: 1, borderColor: colors.line },
});
