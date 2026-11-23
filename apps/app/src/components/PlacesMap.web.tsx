import { Pressable, ScrollView, Text } from 'react-native';
import type { Place, PublicPoi } from '../places.ts';
import { T } from './ui.tsx';
import { colors, radius } from '../theme.ts';

/** Web: keine native Karte – Orte als Liste */
export function PlacesMap({ places, pois = [], onSelect, onSelectPoi }: { places: Place[]; pois?: PublicPoi[]; onSelect: (p: Place) => void; onSelectPoi?: (p: PublicPoi) => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      {places.map((p) => (
        <Pressable key={p.id} onPress={() => onSelect(p)} accessibilityRole="button"
          style={{ padding: 14, borderRadius: radius.m, borderWidth: 1, borderColor: p.done ? colors.line : colors.gold, backgroundColor: colors.panel }}>
          <Text style={T.h2}>{p.name}</Text>
          <Text style={T.muted}>{p.done ? 'Schon eingecheckt' : `Radius ${p.radiusM} m`}</Text>
        </Pressable>
      ))}
      {pois.map((poi) => (
        <Pressable key={`poi-${poi.id}`} onPress={() => onSelectPoi?.(poi)} accessibilityRole="button"
          style={{ padding: 14, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel }}>
          <Text style={T.h2}>{poi.name}</Text>
          <Text style={T.muted}>{poi.achievements.length} Abzeichen{poi.address ? ` · ${poi.address}` : ''}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
