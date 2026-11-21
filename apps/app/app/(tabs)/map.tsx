import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { PlacesMap } from '../../src/components/PlacesMap';
import { Icon } from '../../src/components/Icon.tsx';
import { Screen, T } from '../../src/components/ui.tsx';
import { useAuth } from '../../src/auth.ts';
import { usePlaces } from '../../src/places.ts';
import { enableHints, hintState, syncHints, type HintState } from '../../src/placeHints';
import { colors, font, radius } from '../../src/theme.ts';

/** Reiter „Orte“: Karte aller Orte; Antippen öffnet den Check-in. */
export default function MapTab() {
  const auth = useAuth();
  const places = usePlaces();
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [hints, setHints] = useState<HintState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { void hintState().then(setHints); }, []);

  // Bei jedem Öffnen: Liste auffrischen und die nächstgelegenen offenen Orte für Hinweise anmelden
  useFocusEffect(useCallback(() => {
    void places.refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));
  useEffect(() => {
    if (!places.data || hints !== 'on') return;
    void Location.getLastKnownPositionAsync().then((p) => syncHints(places.data!, p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null)).catch(() => {});
  }, [places.data, hints]);

  async function turnOnHints() {
    const ok = await enableHints();
    setHints(await hintState());
    if (!ok) setDismissed(true);
  }

  return (
    <Screen>
      <PlacesMap places={places.data ?? []} onSelect={(p) => router.push(`/places/${p.id}`)} />
      <View style={s.overlay} pointerEvents="box-none">
        {permission && !permission.granted && (
          <Card icon="navigation" title="Standort freigeben" text="Damit du siehst, wo du bist, und an Orten einchecken kannst." onPress={() => void requestPermission()} />
        )}
        {permission?.granted && auth.status === 'signedIn' && hints === 'off' && !dismissed && (
          <Card icon="bell" title="Hinweis, wenn du an einem Ort bist?" onClose={() => setDismissed(true)}
            text="Die App meldet sich, sobald du in der Nähe eines Ortes bist – auch wenn sie geschlossen ist. Dein Standort bleibt auf dem Handy."
            onPress={() => void turnOnHints()} />
        )}
        {places.data?.length === 0 && <Card icon="map" title="Noch keine Orte" text="Sobald Organisationen Orte anlegen, erscheinen sie hier." />}
      </View>
    </Screen>
  );
}

function Card({ icon, title, text, onPress, onClose }: { icon: 'navigation' | 'bell' | 'map'; title: string; text: string; onPress?: () => void; onClose?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={s.card}>
      <Icon name={icon} size={22} color={colors.gold} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={T.muted}>{text}</Text>
      </View>
      {onClose && (
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Schließen">
          <Icon name="x" size={18} color={colors.muted} />
        </Pressable>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 8 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: radius.m, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
  cardTitle: { color: colors.text, fontFamily: font.bold, fontSize: 16 },
});
