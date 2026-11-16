import type { BadgeSpec } from '@best-badges/badge-spec';
import type { Achievement } from '../db/types.ts';

/**
 * Öffentliche Sicht auf Abzeichen (App, Partner, öffentliche API).
 * Enthält nichts aus der Verwaltung (Status, Veto, Freigaben, Zustimmungen, Zeitstempel der Bearbeitung).
 * Versteckte Abzeichen, die die betrachtende Person nicht hat, erscheinen nur als `{ secret: true, id, orgId, hint }` –
 * ohne Name, Beschreibung, Design oder Struktur. Den Platzhalter zeichnen Clients selbst (badge-spec: SECRET_SPEC).
 */
export interface SecretRef { secret: true; id: string; orgId: string; hint: string }

export interface PublicSummaryFull {
  secret: false;
  id: string;
  orgId: string;
  name: string;
  kind: Achievement['kind'];
  spec: BadgeSpec;
  /** War ein verstecktes Abzeichen – die Person hat es gefunden */
  hidden: boolean;
}
export type PublicSummary = PublicSummaryFull | SecretRef;

export interface PublicAchievementFull extends PublicSummaryFull {
  description: string;
  category: string[];
  tiers: { level: number; threshold: number; name: string | null }[];
  requiredCount: number | null;
  /** Nur Kombination: zugestimmte Teile */
  items: PublicSummary[];
  publishedAt: string | null;
}
export type PublicAchievement = PublicAchievementFull | SecretRef;

type Row = { id: string; org_id: string; name: string; kind: Achievement['kind']; spec: unknown; hidden: boolean; hint: string };

export const secretRef = (a: Pick<Row, 'id' | 'org_id' | 'hint'>): SecretRef => ({ secret: true, id: a.id, orgId: a.org_id, hint: a.hint });

/** Kurzform; versteckt und nicht verdient → nur Verweis mit Hinweis. */
export function publicSummary(a: Row, earned: boolean): PublicSummary {
  if (a.hidden && !earned) return secretRef(a);
  return { secret: false, id: a.id, orgId: a.org_id, name: a.name, kind: a.kind, spec: a.spec as BadgeSpec, hidden: a.hidden };
}
