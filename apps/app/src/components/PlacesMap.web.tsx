import { Pressable, ScrollView, Text } from 'react-native';
import type { Place } from '../places.ts';
import { T } from './ui.tsx';
import { colors, radius } from '../theme.ts';

/** Web: keine native Karte – Orte als Liste */
export function PlacesMap({ places, onSelect }: { places: Place[]; onSelect: (p: Place) => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      {places.map((p) => (
        <Pressable key={p.id} onPress={() => onSelect(p)} accessibilityRole="button"
          style={{ padding: 14, borderRadius: radius.m, borderWidth: 1, borderColor: p.done ? colors.line : colors.gold, backgroundColor: colors.panel }}>
          <Text style={T.h2}>{p.name}</Text>
          <Text style={T.muted}>{p.done ? 'Schon eingecheckt' : `Radius ${p.radiusM} m`}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
