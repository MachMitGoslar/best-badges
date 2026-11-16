import { SECRET_NAME, SECRET_SPEC, type BadgeSpec } from '@best-badges/badge-spec';
import type { components } from '@best-badges/api-client';

export type AchievementRef = components['schemas']['AchievementRef'];
export type PublicAchievement = components['schemas']['PublicAchievement'];

/**
 * Darstellung eines Abzeichens: Versteckte, die man noch nicht hat, liefert die API nur als
 * `{ secret: true, hint }` – Name und Design des Platzhalters kommen aus badge-spec.
 */
export function look(a: AchievementRef | PublicAchievement): { name: string; spec: BadgeSpec; kind: 'single' | 'tiered' | 'collection' | null; hint: string | null } {
  return a.secret
    ? { name: SECRET_NAME, spec: SECRET_SPEC as unknown as BadgeSpec, kind: null, hint: a.hint }
    : { name: a.name, spec: a.spec, kind: a.kind, hint: null };
}
