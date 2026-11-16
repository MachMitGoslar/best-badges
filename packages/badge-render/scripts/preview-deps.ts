export * from '@best-badges/badge-spec';
import { MATERIALS, materialForTier } from '@best-badges/badge-spec';
export const resolveMaterialName = (t: number, n: number) => MATERIALS[materialForTier(t, n)];
