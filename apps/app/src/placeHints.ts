// Hinweise im Hintergrund (Geofencing): Das Betriebssystem meldet das Betreten eines Ortes, die App zeigt eine
// lokale Mitteilung. Der Server erfährt davon nichts. Muss beim Start geladen werden (Task-Definition).
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { distanceM, type Place } from './places.ts';

const TASK = 'bb-place-hints';
const FLAG = 'bb.placeHints.v1';
const SEEN = 'bb.placeHints.seen.v1';
/** iOS überwacht höchstens 20 Regionen pro App */
const MAX_REGIONS = 18;
/** Kleinere Regionen meldet iOS unzuverlässig; der Hinweis darf großzügiger sein als der Check-in */
const MIN_REGION_M = 100;
/** Denselben Ort höchstens alle 12 Stunden melden */
const QUIET_MS = 12 * 3600 * 1000;

// Kennung der Region: ID und Name, damit der Hinweis ohne Netz und ohne Speicher auskommt
const regionId = (p: Place) => `${p.id}|${p.name.slice(0, 60)}`;

TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(TASK, async ({ data, error }) => {
  if (error || !data || data.eventType !== Location.GeofencingEventType.Enter) return;
  const [id, name] = (data.region.identifier ?? '').split('|');
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
  const seen = await readSeen();
  if (seen[id] && Date.now() - seen[id] < QUIET_MS) return;
  seen[id] = Date.now();
  await SecureStore.setItemAsync(SEEN, JSON.stringify(seen));
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Ort in der Nähe', body: `Du bist bei ${name || 'einem Ort'}. Jetzt einchecken und Abzeichen holen?`, data: { link: `/places/${id}` } },
    trigger: null,
  });
});

async function readSeen(): Promise<Record<string, number>> {
  try {
    const raw = JSON.parse((await SecureStore.getItemAsync(SEEN)) ?? '{}') as Record<string, number>;
    // Alte Einträge verwerfen, damit der Speicher klein bleibt
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => Date.now() - t < QUIET_MS));
  } catch { return {}; }
}

export type HintState = 'unsupported' | 'off' | 'on' | 'denied';

export async function hintState(): Promise<HintState> {
  if (Platform.OS === 'web') return 'unsupported';
  if ((await SecureStore.getItemAsync(FLAG)) !== '1') return 'off';
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'on' : 'denied';
}

/** Hinweise einschalten: Standort „Immer“ und Mitteilungen erlauben. false = nicht erlaubt. */
export async function enableHints(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return false;
  const n = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
  if (n.status !== 'granted') return false;
  await SecureStore.setItemAsync(FLAG, '1');
  return true;
}

export async function disableHints() {
  await SecureStore.deleteItemAsync(FLAG);
  if (await Location.hasStartedGeofencingAsync(TASK).catch(() => false)) await Location.stopGeofencingAsync(TASK);
}

/** Die nächstgelegenen offenen Orte beim Betriebssystem anmelden (bei jedem Laden der Karte neu). */
export async function syncHints(places: Place[], pos: { lat: number; lng: number } | null) {
  if ((await hintState()) !== 'on') return;
  const open = places.filter((p) => p.done !== true);
  const sorted = pos ? [...open].sort((a, b) => distanceM(pos, a) - distanceM(pos, b)) : open;
  const regions = sorted.slice(0, MAX_REGIONS).map((p) => ({
    identifier: regionId(p), latitude: p.lat, longitude: p.lng, radius: Math.max(p.radiusM, MIN_REGION_M), notifyOnEnter: true, notifyOnExit: false,
  }));
  if (regions.length === 0) {
    if (await Location.hasStartedGeofencingAsync(TASK).catch(() => false)) await Location.stopGeofencingAsync(TASK);
    return;
  }
  await Location.startGeofencingAsync(TASK, regions);
}
