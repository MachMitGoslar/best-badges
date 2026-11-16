import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge3D } from '../../src/components/Badge3D';
import { Badge } from '../../src/components/Badge';
import { ProgressBar, Screen, T } from '../../src/components/ui.tsx';
import { Icon } from '../../src/components/Icon.tsx';
import { api, unwrap } from '../../src/api.ts';
import { useAwards } from '../../src/data.ts';
import { look } from '../../src/badges.ts';
import { font, colors, radius } from '../../src/theme.ts';

export default function AchievementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [touching, setTouching] = useState(false);
  const achievement = useQuery({ queryKey: ['achievement', id], queryFn: () => unwrap(api.GET('/api/v1/achievements/{id}', { params: { path: { id: id! } } })) });
  const awards = useAwards().data;
  const award = awards?.find((a) => a.achievement.id === id);
  const a = achievement.data;
  if (!a) return <Screen><Text style={[T.muted, { padding: 20 }]}>{achievement.error ? 'Dieses Abzeichen ist nicht verfügbar.' : 'Lade …'}</Text></Screen>;

  // Verstecktes Abzeichen, das du noch nicht hast: nur Platzhalter und Hinweis
  if (a.secret) {
    const l = look(a);
    return (
      <Screen>
        <ScrollView scrollEnabled={!touching} contentContainerStyle={{ padding: 20, gap: 18, alignItems: 'center', paddingBottom: 48 }}>
          <Badge3D spec={l.spec} size={290} locked title={l.name} onInteract={setTouching} />
          <Text style={[T.h1, { textAlign: 'center' }]}>{l.name}</Text>
          <View style={[s.card, { alignItems: 'center' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="eye-off" size={18} color={colors.gold} />
              <Text style={T.label}>Verstecktes Abzeichen</Text>
            </View>
            <Text style={[T.body, { textAlign: 'center' }]}>{a.hint ? `Hinweis: ${a.hint}` : 'Kein Hinweis. Halte die Augen offen!'}</Text>
            <Text style={[T.muted, { textAlign: 'center' }]}>Was es ist, siehst du, sobald du es gefunden hast.</Text>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const tiered = a.kind === 'tiered';
  const collection = a.kind === 'collection';
  const earnedItem = (itemId: string) => (awards?.find((x) => x.achievement.id === itemId)?.tier ?? 0) >= 1;
  const tier = award?.tier ?? 0;
  const progress = award?.progress ?? 0;
  const next = a.tiers.find((t) => t.threshold > progress);

  return (
    <Screen>
      <ScrollView scrollEnabled={!touching} contentContainerStyle={{ padding: 20, gap: 18, alignItems: 'center', paddingBottom: 48 }}>
        <Badge3D onInteract={setTouching} spec={a.spec} size={290} tier={tiered ? Math.max(1, tier) : undefined} tierCount={tiered ? a.tiers.length : undefined} gems={a.kind === 'collection' && a.requiredCount ? { total: a.requiredCount, filled: Math.min(progress, a.requiredCount) } : undefined} locked={tier === 0} title={a.name} />
        <Text style={[T.h1, { textAlign: 'center' }]}>{a.name}</Text>
        {tier > 0 && tiered && <Text style={{ color: colors.gold, fontFamily: font.bold }}>Stufe {tier}{a.tiers[tier - 1]?.name ? ` · ${a.tiers[tier - 1]!.name}` : ''}</Text>}
        {a.hidden && <Text style={T.label}>Geheimnis gelüftet</Text>}
        {!!a.description && <Text style={[T.body, { textAlign: 'center', color: colors.muted }]}>{a.description}</Text>}

        {collection && (
          <View style={[s.card, { gap: 14 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={T.h2}>Kombination</Text>
              <Text style={{ color: colors.gold, fontFamily: font.black, fontSize: 18 }}>{Math.min(progress, a.requiredCount ?? 0)} / {a.requiredCount}</Text>
            </View>
            {tier === 0 && <ProgressBar value={progress} max={a.requiredCount ?? 1} />}
            <Text style={T.muted}>{tier > 0 ? 'Geschafft! Du hast die Kombination.' : `Sammle ${a.requiredCount} von ${a.items.length} dieser Abzeichen.`}</Text>
            <View style={s.items}>
              {a.items.map((item) => {
                const has = earnedItem(item.id);
                const l = look(item);
                return (
                  <Pressable key={item.id} style={s.item} onPress={() => router.push(`/achievements/${item.id}`)}>
                    <Badge spec={l.spec} size={72} locked={!has} title={l.name} />
                    <Text style={[T.muted, { textAlign: 'center', fontSize: 12, color: has ? colors.text : colors.muted }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>{l.name}</Text>
                    {has && <Icon name="check-circle" size={14} color={colors.ok} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {tiered && (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={T.h2}>Fortschritt</Text>
              <Text style={{ color: colors.gold, fontFamily: font.black, fontSize: 18 }}>{progress}{next ? ` / ${next.threshold}` : ''}</Text>
            </View>
            {next ? <ProgressBar value={progress} max={next.threshold} /> : <Text style={T.muted}>Alle Stufen geschafft. Stark!</Text>}
            {next && <Text style={T.muted}>Noch {next.threshold - progress} bis Stufe {next.level}{next.name ? ` „${next.name}“` : ''}</Text>}
          </View>
        )}

        {tiered && (
          <View style={[s.card, { gap: 14 }]}>
            <Text style={T.h2}>Stufen</Text>
            {a.tiers.map((t) => {
              const done = progress >= t.threshold;
              return (
                <View key={t.level} style={s.tierRow}>
                  <Badge spec={a.spec} size={64} tier={t.level} tierCount={a.tiers.length} locked={!done} title={`Stufe ${t.level}`} />
                  <View style={{ flex: 1 }}>
                    <Text style={[T.body, { fontFamily: font.bold }]}>Stufe {t.level}{t.name ? ` · ${t.name}` : ''}</Text>
                    <Text style={T.muted}>ab {t.threshold}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {done && <Icon name="check" size={16} color={colors.ok} />}
                    <Text style={{ color: done ? colors.ok : colors.muted, fontFamily: font.bold }}>{done ? 'geschafft' : 'offen'}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!tiered && !collection && (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={tier > 0 ? 'check-circle' : 'circle'} size={20} color={tier > 0 ? colors.ok : colors.muted} />
              <Text style={T.body}>{tier > 0 ? 'Gesammelt' : 'Noch nicht gesammelt'}</Text>
            </View>
            {award?.firstEarnedAt && <Text style={T.muted}>seit {new Date(award.firstEarnedAt).toLocaleDateString('de-DE')}</Text>}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { alignSelf: 'stretch', backgroundColor: colors.panel, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  item: { width: 100, alignItems: 'center', gap: 4 },
});
