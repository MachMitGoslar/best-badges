import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Achievement, AchievementInput, Code, CodeInput } from '@best-badges/api-client';
import { api, fetchSession, unwrap } from './api.ts';

export const useSession = () => useQuery({ queryKey: ['session'], queryFn: fetchSession, staleTime: 60_000 });

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => unwrap(api.GET('/api/v1/me')) });

export const useAchievements = (orgId: string) =>
  useQuery({
    queryKey: ['achievements', orgId],
    queryFn: async () => (await unwrap(api.GET('/api/v1/orgs/{orgId}/achievements', { params: { path: { orgId } } }))).items,
  });

export const useAchievement = (orgId: string, id: string | undefined) =>
  useQuery({
    queryKey: ['achievement', orgId, id],
    enabled: !!id,
    queryFn: () => unwrap(api.GET('/api/v1/orgs/{orgId}/achievements/{id}', { params: { path: { orgId, id: id! } } })),
  });

export function useSaveAchievement(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AchievementInput }): Promise<Achievement> =>
      id
        ? unwrap(api.PATCH('/api/v1/orgs/{orgId}/achievements/{id}', { params: { path: { orgId, id } }, body: input }))
        : unwrap(api.POST('/api/v1/orgs/{orgId}/achievements', { params: { path: { orgId } }, body: input })),
    onSuccess: (a) => {
      qc.setQueryData(['achievement', orgId, a.id], a);
      void qc.invalidateQueries({ queryKey: ['achievements', orgId] });
    },
  });
}

export function useTransition(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'archive' }) =>
      action === 'publish'
        ? unwrap(api.POST('/api/v1/orgs/{orgId}/achievements/{id}/publish', { params: { path: { orgId, id } } }))
        : unwrap(api.POST('/api/v1/orgs/{orgId}/achievements/{id}/archive', { params: { path: { orgId, id } } })),
    onSuccess: (a) => {
      qc.setQueryData(['achievement', orgId, a.id], a);
      void qc.invalidateQueries({ queryKey: ['achievements', orgId] });
    },
  });
}

/** POI der Organisation aus dem HSP (beim Abruf frisch geholt) */
export const useOrgPois = (orgId: string) =>
  useQuery({
    queryKey: ['pois', orgId],
    queryFn: async () => (await unwrap(api.GET('/api/v1/orgs/{orgId}/pois', { params: { path: { orgId } } }))).items,
    staleTime: 60_000,
  });

export const useCodes = (orgId: string, achievementId: string) =>
  useQuery({
    queryKey: ['codes', orgId, achievementId],
    queryFn: async () => (await unwrap(api.GET('/api/v1/orgs/{orgId}/codes', { params: { path: { orgId }, query: { achievementId } } }))).items,
  });

export const useCode = (orgId: string, id: string, refetchInterval?: number) =>
  useQuery({
    queryKey: ['code', orgId, id],
    queryFn: () => unwrap(api.GET('/api/v1/orgs/{orgId}/codes/{id}', { params: { path: { orgId, id } } })),
    refetchInterval,
  });

export function useCreateCode(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CodeInput): Promise<Code[]> =>
      (await unwrap(api.POST('/api/v1/orgs/{orgId}/codes', { params: { path: { orgId } }, body: input }))).items,
    onSuccess: (_d, input) => void qc.invalidateQueries({ queryKey: ['codes', orgId, input.achievementId] }),
  });
}

export function useCodeAction(orgId: string, achievementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'rotate' | 'activate' | 'deactivate' }) =>
      action === 'rotate'
        ? unwrap(api.POST('/api/v1/orgs/{orgId}/codes/{id}/rotate', { params: { path: { orgId, id } } }))
        : unwrap(api.PATCH('/api/v1/orgs/{orgId}/codes/{id}', { params: { path: { orgId, id } }, body: { active: action === 'activate' } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['codes', orgId, achievementId] }),
  });
}

/** Mögliche Teile für Kombinationen: eigene und von anderen Organisationen freigegebene. */
export const useCollectionCandidates = (orgId: string) =>
  useQuery({
    queryKey: ['collection-candidates', orgId],
    queryFn: async () => (await unwrap(api.GET('/api/v1/orgs/{orgId}/collection-candidates', { params: { path: { orgId } } }))).items,
    staleTime: 30_000,
  });

export const useCollectionRequests = (orgId: string) =>
  useQuery({
    queryKey: ['collection-requests', orgId],
    queryFn: async () => (await unwrap(api.GET('/api/v1/orgs/{orgId}/collection-requests', { params: { path: { orgId } } }))).items,
  });

export function useDecideItem(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, achievementId, decision }: { collectionId: string; achievementId: string; decision: 'approve' | 'reject' }) => {
      const res = await api.POST('/api/v1/orgs/{orgId}/collection-requests/{collectionId}/items/{achievementId}/{decision}', {
        params: { path: { orgId, collectionId, achievementId, decision } },
      });
      if (!res.response.ok) throw new Error('Entscheidung fehlgeschlagen');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['collection-requests', orgId] }),
  });
}
