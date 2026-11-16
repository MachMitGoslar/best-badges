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
