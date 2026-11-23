import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Badge } from '../../src/components/Badge';
import { Icon } from '../../src/components/Icon.tsx';
import { Screen, T } from '../../src/components/ui.tsx';
import { look } from '../../src/badges.ts';
import { usePois } from '../../src/places.ts';
import { colors, font, radius } from '../../src/theme.ts';

/** Ein Geschäft oder Ort aus dem HSP mit seinen Abzeichen */
export default function PoiScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const pois = usePois();
  const poi = pois.data?.find((p) => p.id === id);

  if (pois.isPending) return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><Text style={T.muted}>Lade …</Text></Screen>;
  if (!poi) return <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text style={[T.h2, { textAlign: 'center' }]}>Hier gibt es gerade keine Abzeichen.</Text></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: poi.name }} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
        <View style={{ gap: 6 }}>
          <Text style={T.h1}>{poi.name}</Text>
          {!!poi.address && <Text style={T.muted}>{poi.address}</Text>}
          {!!poi.openingHoursText && (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Icon name="clock" size={14} color={colors.muted} />
              <Text style={T.muted}>{poi.openingHoursText}</Text>
            </View>
          )}
        </View>
        <Text style={T.label}>{poi.achievements.length === 1 ? 'Abzeichen hier' : `${poi.achievements.length} Abzeichen hier`}</Text>
        {poi.achievements.map((a) => {
          const l = look(a);
          return (
            <Pressable key={a.id} style={s.row} accessibilityRole="button" accessibilityLabel={l.name}
              onPress={() => router.push(`/achievements/${a.id}`)}>
              <Badge spec={l.spec} size={64} title={l.name} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[T.body, { fontFamily: font.bold }]}>{l.name}</Text>
                {a.secret && <Text style={[T.muted, { color: colors.gold }]}>{l.hint ? `Hinweis: ${l.hint}` : 'Geheim – finde es selbst heraus'}</Text>}
              </View>
              <Icon name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: radius.m, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
});
