import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api.ts';
import { useAuth } from './auth.ts';

export const useAwards = () => {
  const auth = useAuth();
  return useQuery({
    queryKey: ['awards'],
    enabled: auth.status === 'signedIn',
    queryFn: async () => (await unwrap(api.GET('/api/v1/users/me/awards'))).items,
  });
};

export const usePublicAchievements = () =>
  useQuery({ queryKey: ['public-achievements'], queryFn: async () => (await unwrap(api.GET('/api/v1/achievements'))).items });


/** Ergebnis der letzten Einlösung für den Erfolgsbildschirm */
export type RedeemResult = Awaited<ReturnType<typeof redeem>>;
export async function redeem(code: string) {
  return unwrap(api.POST('/api/v1/redemptions', { body: { code } }));
}
let lastResult: RedeemResult | null = null;
export const setLastResult = (r: RedeemResult) => { lastResult = r; };
export const getLastResult = () => lastResult;

export const useMyProfile = () => {
  const auth = useAuth();
  return useQuery({ queryKey: ['my-profile'], enabled: auth.status === 'signedIn', queryFn: () => unwrap(api.GET('/api/v1/users/me/profile')) });
};

import type { components } from '@best-badges/api-client';
export type ProfileInput = components['schemas']['ProfileInput'];
export const saveProfile = (body: ProfileInput) => unwrap(api.PUT('/api/v1/users/me/profile', { body }));

export const usePublicProfile = (handle: string) =>
  useQuery({ queryKey: ['profile', handle], queryFn: () => unwrap(api.GET('/api/v1/profiles/{handle}', { params: { path: { handle } } })) });

// ── Benachrichtigungen ────────────────────────────────────────────────────
export type NotificationItem = components['schemas']['Notification'];
export type NotificationPrefs = components['schemas']['NotificationPrefs'];

export const useNotifications = () => {
  const auth = useAuth();
  return useQuery({
    queryKey: ['notifications'],
    enabled: auth.status === 'signedIn',
    // Neues auch ohne Push sichtbar machen, solange die App offen ist
    refetchInterval: 60_000,
    queryFn: () => unwrap(api.GET('/api/v1/users/me/notifications', { params: { query: { limit: 50 } } })),
  });
};
export const markNotificationsRead = (body: { ids?: string[]; all?: boolean }) => unwrap(api.POST('/api/v1/users/me/notifications/read', { body }));

export const useNotificationSettings = () => {
  const auth = useAuth();
  return useQuery({ queryKey: ['notification-settings'], enabled: auth.status === 'signedIn', queryFn: () => unwrap(api.GET('/api/v1/users/me/notification-settings')) });
};
export const saveNotificationSettings = (body: Partial<NotificationPrefs>) => unwrap(api.PUT('/api/v1/users/me/notification-settings', { body }));
