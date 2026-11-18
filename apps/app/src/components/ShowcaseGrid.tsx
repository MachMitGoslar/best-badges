import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BadgeSpec, Rarity } from '@best-badges/badge-spec';
import { Badge } from './Badge';
import { Badge3D } from './Badge3D';
import { Icon } from './Icon.tsx';
import { colors, font, radius } from '../theme.ts';

export interface ShowcaseItem {
  id: string;
  name: string;
  spec: BadgeSpec;
  kind: string;
  tier: number;
  tierCount: number;
  progress: number;
  requiredCount: number | null;
  rarity?: Rarity | null;
}

const medalProps = (it: ShowcaseItem) => ({
  spec: it.spec,
  tier: it.kind === 'tiered' ? Math.max(1, it.tier) : undefined,
  tierCount: it.kind === 'tiered' ? it.tierCount : undefined,
  gems: it.kind === 'collection' && it.requiredCount ? { total: it.requiredCount, filled: it.requiredCount } : undefined,
  rarity: it.rarity ?? undefined,
  title: it.name,
});

/**
 * Vitrine: bis zu sechs Abzeichen in zwei Reihen, wie im öffentlichen Profil. Die Vitrine selbst bleibt 2D
 * (sechs 3D-Ansichten gleichzeitig wären zu teuer); Antippen öffnet die Medaille groß in 3D.
 * Mit onPress (Auswahl im eigenen Profil) öffnet langes Drücken die 3D-Ansicht.
 */
export function ShowcaseGrid({ items, onPress, selected }: { items: ShowcaseItem[]; onPress?: (id: string) => void; selected?: string[] }) {
  const [open, setOpen] = useState<ShowcaseItem | null>(null);
  return (
    <View style={s.grid}>
      {items.map((it) => {
        const pos = selected ? selected.indexOf(it.id) : -1;
        const on = !selected || pos >= 0;
        return (
          <Pressable key={it.id} onPress={() => (onPress ? onPress(it.id) : setOpen(it))} onLongPress={() => setOpen(it)}
            accessibilityHint={onPress ? 'Lang drücken zeigt die Medaille in 3D' : 'Zeigt die Medaille in 3D'} style={[s.cell, selected && on && s.on, selected && !on && { opacity: 0.55 }]}>
            <Badge {...medalProps(it)} size={84} />
            <Text style={s.name} numberOfLines={2}>{it.name}</Text>
            {selected && pos >= 0 && <View style={s.pos}><Text style={s.posText}>{pos + 1}</Text></View>}
          </Pressable>
        );
      })}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(null)} accessibilityLabel="Schließen">
          {open && (
            // Klicks auf die Medaille schließen nicht (dort wird gekippt)
            <Pressable style={s.sheet} onPress={() => {}}>
              <Badge3D {...medalProps(open)} size={290} />
              <Text style={s.title}>{open.name}</Text>
              <Pressable onPress={() => setOpen(null)} style={s.close} accessibilityRole="button" accessibilityLabel="Schließen">
                <Icon name="x" size={20} color={colors.text} />
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },
  cell: { width: '31%', alignItems: 'center', gap: 4, padding: 8, borderRadius: radius.m, borderWidth: 1, borderColor: 'transparent' },
  on: { borderColor: colors.gold, backgroundColor: colors.panel },
  name: { color: colors.text, fontFamily: font.semibold, fontSize: 12, textAlign: 'center' },
  pos: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,6,4,0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 20, textAlign: 'center' },
  close: { marginTop: 8, width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  posText: { color: colors.onGold, fontFamily: font.black, fontSize: 11 },
});
