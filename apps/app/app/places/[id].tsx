import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../src/components/Badge';
import { LoginPrompt } from '../../src/components/LoginPrompt.tsx';
import { Button, Screen, T } from '../../src/components/ui.tsx';
import { ApiFailure } from '../../src/api.ts';
import { useAuth } from '../../src/auth.ts';
import { look } from '../../src/badges.ts';
import { setLastResult } from '../../src/data.ts';
import { checkIn, formatDistance, reachable, usePlaces } from '../../src/places.ts';
import { colors } from '../../src/theme.ts';

/** Check-in an einem Ort: zeigt Abzeichen und Entfernung, Einchecken erst im Radius. */
export default function PlaceScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const qc = useQueryClient();
  const places = usePlaces();
  const place = places.data?.find((p) => p.id === id);
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [pos, setPos] = useState<Location.LocationObject | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solange der Bildschirm offen ist: Standort verfolgen (nur auf dem Gerät, für die Entfernungsanzeige)
  useEffect(() => {
    if (!permission?.granted) return;
    let sub: Location.LocationSubscription | null = null;
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5 }, setPos).then((s) => { sub = s; });
    return () => sub?.remove();
  }, [permission?.granted]);

  if (auth.status === 'signedOut') return <Screen><LoginPrompt text="Melde dich an, um an Orten einzuchecken." /></Screen>;
  if (places.isPending) return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><Text style={T.muted}>Lade Ort …</Text></Screen>;
  if (!place) return <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text style={[T.h2, { textAlign: 'center' }]}>Diesen Ort gibt es nicht mehr.</Text></Screen>;

  const a = look(place.achievement);
  const r = reachable(place, pos);

  async function go() {
    setBusy(true); setError(null);
    try {
      const result = await checkIn(place!.id);
      setLastResult(result);
      void qc.invalidateQueries({ queryKey: ['awards'] });
      void qc.invalidateQueries({ queryKey: ['places'] });
      router.replace('/success');
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Das hat nicht geklappt. Bitte noch einmal versuchen.');
    } finally { setBusy(false); }
  }

  let status: string;
  if (place.done) status = 'Hier hast du schon eingecheckt.';
  else if (!permission?.granted) status = 'Zum Einchecken braucht die App deinen Standort.';
  else if (r.distance === null) status = 'Standort wird ermittelt …';
  else if (!r.accurate) status = 'Dein Standort ist noch ungenau. Geh ein paar Schritte ins Freie.';
  else if (r.inRange) status = 'Du bist da!';
  else status = `Noch ${formatDistance(r.distance - place.radiusM)} bis zum Ort.`;

  return (
    <Screen style={{ padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <Stack.Screen options={{ title: place.name }} />
      <Badge spec={a.spec} size={200} title={a.name} locked={place.achievement.secret} />
      <Text style={[T.h1, { textAlign: 'center' }]}>{place.name}</Text>
      <Text style={[T.body, { textAlign: 'center' }]}>{a.name}</Text>
      {a.hint && <Text style={[T.body, { textAlign: 'center', color: colors.gold }]}>Hinweis: {a.hint}</Text>}
      <Text style={[T.muted, { textAlign: 'center', color: r.inRange && !place.done ? colors.ok : colors.muted }]}>{status}</Text>
      {error && <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text>}
      <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>
        {permission && !permission.granted
          ? <Button title="Standort freigeben" icon="navigation" onPress={() => void requestPermission()} />
          : <Button title="Einchecken" icon="map-pin" busy={busy} disabled={place.done === true || !r.inRange || !r.accurate} onPress={() => void go()} />}
        <Button title="Zurück" kind="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
