// Push auf diesem Gerät: Erlaubnis im Betriebssystem, Geräte-Token bei der API an- und abmelden,
// Antippen einer Nachricht öffnet das Ziel in der App. Versand macht der Server direkt über Apple.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { api, unwrap } from './api.ts';

const KEY = 'bb.push.token.v1';
const ENV = process.env.EXPO_PUBLIC_APNS_ENV === 'production' ? 'production' : 'development';

// Auch bei geöffneter App als Banner zeigen
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

/** Stand auf diesem Gerät: on = Erlaubnis da und bei uns angemeldet */
export async function pushState(): Promise<PushState> {
  if (Platform.OS !== 'ios') return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  if (p.status === 'denied') return 'denied';
  if (p.status !== 'granted') return 'off';
  return (await SecureStore.getItemAsync(KEY)) ? 'on' : 'off';
}

async function register(): Promise<boolean> {
  const t = await Notifications.getDevicePushTokenAsync();
  const token = String(t.data).toLowerCase();
  await unwrap(api.POST('/api/v1/users/me/push-devices', { body: { token, environment: ENV } }));
  await SecureStore.setItemAsync(KEY, token);
  return true;
}

/** Fragt (einmalig) nach der Erlaubnis und meldet das Gerät an. false = abgelehnt. */
export async function enablePush(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  let p = await Notifications.getPermissionsAsync();
  if (p.status !== 'granted' && p.canAskAgain) p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  if (p.status !== 'granted') return false;
  return register();
}

/** Gerät bei uns abmelden (Erlaubnis im System bleibt; ohne Anmeldung schickt der Server nichts) */
export async function disablePush() {
  const token = await SecureStore.getItemAsync(KEY);
  await SecureStore.deleteItemAsync(KEY);
  await Notifications.setBadgeCountAsync(0).catch(() => {});
  if (!token) return;
  try {
    await unwrap(api.DELETE('/api/v1/users/me/push-devices/{token}', { params: { path: { token } } }));
  } catch {
    // Offline o. Ä.: Der Server deaktiviert das Token spätestens, wenn Apple es ablehnt
  }
}

/** Beim App-Start (angemeldet): war Push an, Token auffrischen – Apple kann es ändern */
export async function refreshPush() {
  if ((await pushState()) === 'on') await register().catch(() => {});
}

/** Zähler am App-Symbol an die ungelesenen Nachrichten anpassen */
export const setAppBadge = (n: number) => Notifications.setBadgeCountAsync(n).catch(() => {});

/** Ziel einer angetippten Nachricht (nur Pfade innerhalb der App) */
export function linkOf(response: Notifications.NotificationResponse | null | undefined): string | null {
  const link = response?.notification.request.content.data?.link;
  return typeof link === 'string' && /^\/[A-Za-z0-9/_-]{0,120}$/.test(link) ? link : null;
}

export const useLastNotificationResponse = Notifications.useLastNotificationResponse;
