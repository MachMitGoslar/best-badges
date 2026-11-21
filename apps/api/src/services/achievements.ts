import { BadgeSpecSchema, type BadgeSpec } from '@best-badges/badge-spec';
import type { Transaction } from 'kysely';
import type { Database } from '../db/index.ts';
import type { Achievement, AutoRule, DB, Tier } from '../db/types.ts';
import { ApiError, conflict, invalid, notFound } from '../errors.ts';
import { audit } from './audit.ts';
import { evaluateCollections } from './collections.ts';
import type { NotificationService } from './notifications.ts';
import { earnedIds } from './visibility.ts';
import { secretRef, type PublicAchievement, type PublicSummary } from './publicViews.ts';

export interface TierInput { threshold: number; name?: string | null; awardedText?: string | null }

export interface AchievementInput {
  kind: 'single' | 'tiered' | 'collection';
  name: string;
  description?: string;
  awardedText?: string;
  category?: string[];
  spec: BadgeSpec;
  tiers?: TierInput[];
  hidden?: boolean;
  hint?: string;
  /** Für Kombinationen anderer Organisationen anfragbar */
  openForCollections?: boolean;
  /** Nur Kombination: wie viele der Teile man braucht */
  requiredCount?: number;
  /** Nur Kombination: IDs der Teil-Abzeichen (2–20) */
  items?: string[];
  /** Plattform-Abzeichen (nur Haupt-Admin-Organisation): automatische Vergabe nach Regel */
  autoRule?: AutoRule | null;
  /** Zeitfenster (ISO) */
  availableFrom?: string | null;
  availableUntil?: string | null;
}

export type ItemState = 'approved' | 'pending' | 'rejected';

export interface CollectionItemView {
  achievementId: string;
  orgId: string;
  name: string;
  kind: Achievement['kind'];
  spec: BadgeSpec;
  hidden: boolean;
  /** Platzhalter, weil das Teil versteckt ist und die Person es noch nicht hat */
  masked: boolean;
  state: ItemState;
}

export type AchievementPatch = Partial<AchievementInput>;

export interface AchievementView {
  id: string;
  orgId: string;
  kind: Achievement['kind'];
  name: string;
  description: string;
  awardedText: string;
  category: string[];
  spec: BadgeSpec;
  status: Achievement['status'];
  visible: boolean;
  veto: { at: string; reason: string } | null;
  tiers: { level: number; threshold: number; name: string | null; awardedText: string | null }[];
  hidden: boolean;
  hint: string;
  openForCollections: boolean;
  /** Platzhalter statt Inhalt (verstecktes Abzeichen, noch nicht verdient) */
  masked: boolean;
  requiredCount: number | null;
  items: CollectionItemView[];
  autoRule: AutoRule | null;
  availableFrom: string | null;
  availableUntil: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function checkWindow(from: string | null, until: string | null) {
  if (from && until && new Date(from) >= new Date(until)) throw invalid('„Verfügbar bis“ muss nach „Verfügbar ab“ liegen');
}

type ItemRow = { collection_id: string; achievement_id: string; approved_at: Date | null; rejected_at: Date | null; position: number;
  org_id: string; name: string; kind: Achievement['kind']; spec: unknown; hidden: boolean };

const stateOf = (r: Pick<ItemRow, 'approved_at' | 'rejected_at'>): ItemState => (r.approved_at ? 'approved' : r.rejected_at ? 'rejected' : 'pending');

export function toView(a: Achievement, tiers: Tier[], items: ItemRow[] = []): AchievementView {
  return {
    id: a.id,
    orgId: a.org_id,
    kind: a.kind,
    name: a.name,
    description: a.description,
    awardedText: a.awarded_text,
    category: a.category,
    spec: a.spec as BadgeSpec,
    status: a.status,
    visible: a.status === 'live' && a.vetoed_at === null,
    veto: a.vetoed_at ? { at: a.vetoed_at.toISOString(), reason: a.veto_reason ?? '' } : null,
    tiers: tiers
      .filter((t) => t.achievement_id === a.id)
      .sort((x, y) => x.level - y.level)
      .map((t) => ({ level: t.level, threshold: t.threshold, name: t.name, awardedText: t.awarded_text })),
    hidden: a.hidden,
    hint: a.hint,
    openForCollections: a.open_for_collections,
    masked: false,
    requiredCount: a.required_count,
    items: items
      .filter((i) => i.collection_id === a.id)
      .sort((x, y) => x.position - y.position)
      .map((i) => ({ achievementId: i.achievement_id, orgId: i.org_id, name: i.name, kind: i.kind, spec: i.spec as BadgeSpec, hidden: i.hidden, masked: false, state: stateOf(i) })),
    autoRule: a.auto_rule,
    availableFrom: iso(a.available_from),
    availableUntil: iso(a.available_until),
    createdAt: a.created_at.toISOString(),
    updatedAt: a.updated_at.toISOString(),
    publishedAt: iso(a.published_at),
  };
}

/**
 * Öffentliche Sicht für eine Person: ohne Verwaltungsfelder. Versteckte Abzeichen und Teile, die sie nicht hat,
 * werden zum Verweis ohne Inhalt; bei Kombinationen erscheinen nur zugestimmte Teile.
 */
export function present(v: AchievementView, earned: Set<string>): PublicAchievement {
  if (v.hidden && !earned.has(v.id)) return { secret: true, id: v.id, orgId: v.orgId, hint: v.hint };
  const items: PublicSummary[] = v.items
    .filter((i) => i.state === 'approved')
    .map((i) => (i.hidden && !earned.has(i.achievementId)
      ? secretRef({ id: i.achievementId, org_id: i.orgId, hint: '' })
      : { secret: false, id: i.achievementId, orgId: i.orgId, name: i.name, kind: i.kind, spec: i.spec, hidden: i.hidden }));
  return {
    secret: false,
    id: v.id, orgId: v.orgId, kind: v.kind, name: v.name, description: v.description, category: v.category, spec: v.spec,
    hidden: v.hidden,
    tiers: v.tiers.map((t) => ({ level: t.level, threshold: t.threshold, name: t.name })),
    requiredCount: v.requiredCount,
    items,
    publishedAt: v.publishedAt,
    availableFrom: v.availableFrom,
    availableUntil: v.availableUntil,
  };
}

/** Prüft und normalisiert die Stufen: „single“ = eine Stufe mit Schwelle 1, „tiered“ = 2–10 aufsteigende Schwellen,
 * „collection“ = eine Stufe mit Schwelle „N von M“. */
function normalizeTiers(kind: AchievementInput['kind'], tiers: TierInput[] | undefined, requiredCount?: number | null): TierInput[] {
  if (kind === 'collection') {
    if (tiers && tiers.length > 0) throw invalid('Kombinationen haben keine Stufenliste');
    return [{ threshold: requiredCount ?? 1 }];
  }
  if (kind === 'single') {
    if (tiers && tiers.length > 0) throw invalid('Abzeichen ohne Stufen haben keine Stufenliste');
    return [{ threshold: 1 }];
  }
  if (!tiers || tiers.length < 2 || tiers.length > 10) throw invalid('Stufen-Abzeichen brauchen 2 bis 10 Stufen');
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i]!.threshold <= tiers[i - 1]!.threshold) throw invalid('Schwellen der Stufen müssen streng aufsteigen');
  }
  return tiers;
}

type Trx = Transaction<DB>;

export class AchievementService {
  constructor(private db: Database, private now: () => number = Date.now, private notifications?: NotificationService, private adminOrgId?: string) {}

  /** Regeln für Plattform-Abzeichen darf nur die Haupt-Admin-Organisation setzen, nicht für Kombinationen. */
  private checkAutoRule(orgId: string, kind: Achievement['kind'], rule: AutoRule | null | undefined) {
    if (!rule) return;
    if (!this.adminOrgId || orgId !== this.adminOrgId) throw new ApiError(403, 'Forbidden', 'Plattform-Abzeichen gibt es nur für die Haupt-Admin-Organisation');
    if (kind === 'collection') throw invalid('Kombinationen lassen sich nicht automatisch vergeben');
  }

  /** Neue Anfragen: Mitglieder der Organisationen, deren Teile angefragt werden, benachrichtigen */
  private async notifyRequests(trx: Trx, collectionId: string, itemIds: string[]) {
    if (!this.notifications || !itemIds.length) return;
    const c = await trx.selectFrom('achievements').select(['name']).where('id', '=', collectionId).executeTakeFirstOrThrow();
    const items = await trx.selectFrom('achievements').select(['org_id', 'name']).where('id', 'in', itemIds).execute();
    for (const it of items) {
      await this.notifications.notify(trx, {
        userSubs: await this.notifications.orgMembers(trx, it.org_id), category: 'requests', link: null,
        title: 'Neue Sammelanfrage', body: `„${c.name}“ möchte „${it.name}“ aufnehmen. Zustimmen oder ablehnen in der Verwaltung.`,
      });
    }
  }

  /** Rückwirkend geschaffte Kombination (bei Veröffentlichung oder Zustimmung): Sammelnde per Push informieren */
  private async notifyRetroactive(trx: Trx, collectionId: string, now: Date) {
    if (!this.notifications) return;
    const won = await trx.selectFrom('awards').select('user_sub').where('achievement_id', '=', collectionId).where('first_earned_at', '=', now).execute();
    if (!won.length) return;
    const c = await trx.selectFrom('achievements').select(['name', 'hidden']).where('id', '=', collectionId).executeTakeFirstOrThrow();
    await this.notifications.notify(trx, {
      userSubs: won.map((w) => w.user_sub), category: 'awards', link: `/achievements/${collectionId}`,
      title: 'Kombination geschafft', body: c.hidden ? 'Du hast ein verstecktes Abzeichen gefunden!' : c.name,
    });
  }

  private async tiersFor(ids: string[]): Promise<Tier[]> {
    if (ids.length === 0) return [];
    return this.db.selectFrom('achievement_tiers').selectAll().where('achievement_id', 'in', ids).execute();
  }

  private async itemsFor(collectionIds: string[]): Promise<ItemRow[]> {
    if (collectionIds.length === 0) return [];
    return this.db.selectFrom('collection_items')
      .innerJoin('achievements', 'achievements.id', 'collection_items.achievement_id')
      .select(['collection_items.collection_id', 'collection_items.achievement_id', 'collection_items.approved_at', 'collection_items.rejected_at',
        'collection_items.position', 'achievements.org_id', 'achievements.name', 'achievements.kind', 'achievements.spec', 'achievements.hidden'])
      .where('collection_items.collection_id', 'in', collectionIds)
      .execute();
  }

  private async views(rows: Achievement[]): Promise<AchievementView[]> {
    const ids = rows.map((r) => r.id);
    const [tiers, items] = await Promise.all([this.tiersFor(ids), this.itemsFor(rows.filter((r) => r.kind === 'collection').map((r) => r.id))]);
    return rows.map((r) => toView(r, tiers, items));
  }

  private async load(orgId: string, id: string): Promise<Achievement> {
    const a = await this.db.selectFrom('achievements').selectAll().where('id', '=', id).where('org_id', '=', orgId).executeTakeFirst();
    if (!a) throw notFound('Abzeichen');
    return a;
  }

  async view(a: Achievement): Promise<AchievementView> {
    return (await this.views([a]))[0]!;
  }

  async list(orgId: string): Promise<AchievementView[]> {
    return this.views(await this.db.selectFrom('achievements').selectAll().where('org_id', '=', orgId).orderBy('created_at', 'desc').execute());
  }

  async get(orgId: string, id: string): Promise<AchievementView> {
    return this.view(await this.load(orgId, id));
  }

  /**
   * Prüft die Teile einer Kombination. Erlaubt: eigene Abzeichen (auch Entwürfe) und veröffentlichte fremde,
   * keine archivierten, keine Kombinationen (keine Verschachtelung), keine Dopplungen.
   */
  private async checkItems(trx: Trx, orgId: string, selfId: string | null, items: string[] | undefined, requiredCount: number | undefined | null) {
    if (!items || items.length < 2 || items.length > 20) throw invalid('Kombinationen brauchen 2 bis 20 Teile');
    if (new Set(items).size !== items.length) throw invalid('Jedes Teil darf nur einmal vorkommen');
    if (selfId && items.includes(selfId)) throw invalid('Eine Kombination kann nicht Teil von sich selbst sein');
    if (!requiredCount || requiredCount < 1 || requiredCount > items.length) throw invalid('„N von M“: N muss zwischen 1 und der Zahl der Teile liegen');
    const rows = await trx.selectFrom('achievements').select(['id', 'org_id', 'kind', 'status', 'vetoed_at', 'open_for_collections']).where('id', 'in', items).execute();
    const kept = selfId
      ? new Set((await trx.selectFrom('collection_items').select('achievement_id').where('collection_id', '=', selfId).execute()).map((r) => r.achievement_id))
      : new Set<string>();
    for (const id of items) {
      const r = rows.find((x) => x.id === id);
      const usable = r && r.status !== 'archived' && (r.org_id === orgId || (r.status === 'live' && r.vetoed_at === null));
      if (!usable) throw invalid('Ein Teil ist unbekannt, archiviert oder nicht veröffentlicht');
      if (r.kind === 'collection') throw invalid('Kombinationen lassen sich nicht verschachteln');
      // Fremde Abzeichen nur, wenn die Organisation sie freigegeben hat (bereits enthaltene Teile bleiben erlaubt)
      if (r.org_id !== orgId && !r.open_for_collections && !kept.has(id)) throw invalid('Ein Teil ist von seiner Organisation nicht für Kombinationen freigegeben');
    }
    return rows;
  }

  /** Setzt die Teile neu. Bestehende Entscheidungen bleiben erhalten; eigene Teile gelten sofort als zugestimmt. */
  private async writeItems(trx: Trx, orgId: string, collectionId: string, items: string[], actor: string) {
    const rows = await this.checkItems(trx, orgId, collectionId, items, items.length); // Grundprüfung (N separat)
    const existing = await trx.selectFrom('collection_items').selectAll().where('collection_id', '=', collectionId).execute();
    await trx.deleteFrom('collection_items').where('collection_id', '=', collectionId).execute();
    const now = new Date(this.now());
    const newForeign = items.filter((id) => !existing.some((e) => e.achievement_id === id) && rows.find((r) => r.id === id)!.org_id !== orgId);
    await trx.insertInto('collection_items').values(items.map((id, position) => {
      const prev = existing.find((e) => e.achievement_id === id);
      const own = rows.find((r) => r.id === id)!.org_id === orgId;
      return {
        collection_id: collectionId, achievement_id: id, position,
        approved_at: own ? (prev?.approved_at ?? now) : (prev?.approved_at ?? null),
        approved_by: own ? (prev?.approved_by ?? actor) : (prev?.approved_by ?? null),
        rejected_at: own ? null : (prev?.rejected_at ?? null),
        rejected_by: own ? null : (prev?.rejected_by ?? null),
      };
    })).execute();
    await this.notifyRequests(trx, collectionId, newForeign);
  }

  private async writeTiers(trx: Trx, id: string, tiers: TierInput[]) {
    await trx.deleteFrom('achievement_tiers').where('achievement_id', '=', id).execute();
    await trx.insertInto('achievement_tiers').values(tiers.map((t, i) => ({
      achievement_id: id, level: i + 1, threshold: t.threshold, name: t.name ?? null, awarded_text: t.awardedText ?? null,
    }))).execute();
  }

  async create(orgId: string, input: AchievementInput, actor: string): Promise<AchievementView> {
    const spec = BadgeSpecSchema.parse(input.spec);
    const isCollection = input.kind === 'collection';
    if (!isCollection && (input.items !== undefined || input.requiredCount !== undefined)) throw invalid('Teile und „N von M“ gibt es nur bei Kombinationen');
    const tiers = normalizeTiers(input.kind, input.tiers, input.requiredCount);
    this.checkAutoRule(orgId, input.kind, input.autoRule);
    checkWindow(input.availableFrom ?? null, input.availableUntil ?? null);
    const row = await this.db.transaction().execute(async (trx) => {
      if (isCollection) await this.checkItems(trx, orgId, null, input.items, input.requiredCount);
      const a = await trx.insertInto('achievements').values({
        org_id: orgId,
        kind: input.kind,
        name: input.name,
        description: input.description ?? '',
        awarded_text: input.awardedText ?? '',
        category: input.category ?? [],
        spec: JSON.stringify(spec),
        required_count: isCollection ? input.requiredCount! : null,
        hidden: input.hidden ?? false,
        hint: input.hint ?? '',
        open_for_collections: input.openForCollections ?? false,
        auto_rule: input.autoRule ?? null,
        available_from: input.availableFrom ?? null,
        available_until: input.availableUntil ?? null,
        vetoed_at: null, vetoed_by: null, veto_reason: null, published_at: null,
        created_by: actor,
      }).returningAll().executeTakeFirstOrThrow();
      await this.writeTiers(trx, a.id, tiers);
      if (isCollection) await this.writeItems(trx, orgId, a.id, input.items!, actor);
      await audit(trx, { actorSub: actor, orgId, action: 'achievement.create', entity: 'achievement', entityId: a.id, data: { name: a.name, kind: a.kind } });
      return a;
    });
    return this.view(row);
  }

  async update(orgId: string, id: string, patch: AchievementPatch, actor: string): Promise<AchievementView> {
    const current = await this.load(orgId, id);
    if (current.status === 'archived') throw conflict('archived', 'Archivierte Abzeichen lassen sich nicht ändern');
    const structural = patch.kind !== undefined || patch.tiers !== undefined || patch.items !== undefined || patch.requiredCount !== undefined;
    if ((structural || patch.autoRule !== undefined) && current.status !== 'draft') {
      throw conflict('not_draft', 'Art, Stufen, Teile und Regel lassen sich nur im Entwurf ändern');
    }
    const nextRule = patch.autoRule !== undefined ? patch.autoRule : current.auto_rule;
    this.checkAutoRule(orgId, patch.kind ?? current.kind, nextRule);
    checkWindow(
      patch.availableFrom !== undefined ? patch.availableFrom : iso(current.available_from),
      patch.availableUntil !== undefined ? patch.availableUntil : iso(current.available_until),
    );
    const row = await this.db.transaction().execute(async (trx) => {
      const values: Record<string, unknown> = { updated_at: new Date(this.now()) };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.description !== undefined) values.description = patch.description;
      if (patch.awardedText !== undefined) values.awarded_text = patch.awardedText;
      if (patch.category !== undefined) values.category = patch.category;
      if (patch.hidden !== undefined) values.hidden = patch.hidden;
      if (patch.hint !== undefined) values.hint = patch.hint;
      if (patch.openForCollections !== undefined) values.open_for_collections = patch.openForCollections;
      if (patch.autoRule !== undefined) values.auto_rule = patch.autoRule;
      // Zeitfenster lässt sich jederzeit ändern (z. B. Aktion verlängern)
      if (patch.availableFrom !== undefined) values.available_from = patch.availableFrom;
      if (patch.availableUntil !== undefined) values.available_until = patch.availableUntil;
      if (patch.spec !== undefined) values.spec = JSON.stringify(BadgeSpecSchema.parse(patch.spec));
      if (structural) {
        const kind = patch.kind ?? current.kind;
        if (kind === 'collection') {
          const existingItems = (await trx.selectFrom('collection_items').select(['achievement_id', 'position']).where('collection_id', '=', id).orderBy('position').execute()).map((r) => r.achievement_id);
          const items = patch.items ?? existingItems;
          const requiredCount = patch.requiredCount ?? current.required_count ?? undefined;
          await this.checkItems(trx, orgId, id, items, requiredCount);
          await this.writeItems(trx, orgId, id, items, actor);
          await this.writeTiers(trx, id, normalizeTiers('collection', patch.tiers, requiredCount));
          values.kind = 'collection';
          values.required_count = requiredCount;
        } else {
          if (patch.items !== undefined || patch.requiredCount !== undefined) throw invalid('Teile und „N von M“ gibt es nur bei Kombinationen');
          const existing = await trx.selectFrom('achievement_tiers').selectAll().where('achievement_id', '=', id).orderBy('level').execute();
          const keep = current.kind === 'tiered' ? existing.map((t) => ({ threshold: t.threshold, name: t.name, awardedText: t.awarded_text })) : undefined;
          await this.writeTiers(trx, id, normalizeTiers(kind, patch.tiers ?? (kind === 'single' ? undefined : keep)));
          await trx.deleteFrom('collection_items').where('collection_id', '=', id).execute();
          values.kind = kind;
          values.required_count = null;
        }
      }
      const a = await trx.updateTable('achievements').set(values).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, { actorSub: actor, orgId, action: 'achievement.update', entity: 'achievement', entityId: id, data: { fields: Object.keys(patch) } });
      return a;
    });
    return this.view(row);
  }

  async publish(orgId: string, id: string, actor: string): Promise<AchievementView> {
    const current = await this.load(orgId, id);
    if (current.vetoed_at) throw conflict('vetoed', 'Abzeichen ist durch ein Veto gesperrt');
    if (current.status !== 'draft') throw conflict('not_draft', 'Nur Entwürfe lassen sich veröffentlichen');
    if (current.kind !== 'collection') return this.transition(orgId, id, actor, 'achievement.publish', { status: 'live', published_at: new Date(this.now()) });

    const row = await this.db.transaction().execute(async (trx) => {
      const items = await trx.selectFrom('collection_items')
        .innerJoin('achievements', 'achievements.id', 'collection_items.achievement_id')
        .select(['collection_items.approved_at', 'achievements.status', 'achievements.vetoed_at'])
        .where('collection_items.collection_id', '=', id).execute();
      if (items.some((i) => !i.approved_at)) throw conflict('approval_pending', 'Noch nicht alle Organisationen haben ihren Teilen zugestimmt');
      if (items.some((i) => i.status !== 'live' || i.vetoed_at)) throw conflict('items_not_live', 'Alle Teile müssen veröffentlicht sein');
      const now = new Date(this.now());
      const a = await trx.updateTable('achievements').set({ status: 'live', published_at: now, updated_at: now }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      // Rückwirkend: Wer die Teile schon hat, bekommt die Kombination sofort
      await evaluateCollections(trx, { collectionId: id }, now);
      await this.notifyRetroactive(trx, id, now);
      await audit(trx, { actorSub: actor, orgId, action: 'achievement.publish', entity: 'achievement', entityId: id });
      return a;
    });
    return this.view(row);
  }

  async archive(orgId: string, id: string, actor: string): Promise<AchievementView> {
    const current = await this.load(orgId, id);
    if (current.status === 'archived') throw conflict('archived', 'Abzeichen ist bereits archiviert');
    return this.transition(orgId, id, actor, 'achievement.archive', { status: 'archived' });
  }

  private async transition(orgId: string, id: string, actor: string, action: string, values: { status: 'live' | 'archived'; published_at?: Date }) {
    const row = await this.db.transaction().execute(async (trx) => {
      const a = await trx.updateTable('achievements').set({ ...values, updated_at: new Date(this.now()) }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, { actorSub: actor, orgId, action, entity: 'achievement', entityId: id });
      return a;
    });
    return this.view(row);
  }

  // ---- Zustimmung zu Kombinationen anderer Organisationen

  /** Anfragen an eine Organisation: fremde Kombinationen, die ihre Abzeichen als Teil nutzen wollen. */
  async collectionRequests(orgId: string) {
    const rows = await this.db.selectFrom('collection_items')
      .innerJoin('achievements as c', 'c.id', 'collection_items.collection_id')
      .innerJoin('achievements as i', 'i.id', 'collection_items.achievement_id')
      .select(['c.id as c_id', 'c.org_id as c_org', 'c.name as c_name', 'c.spec as c_spec', 'c.status as c_status', 'c.required_count as c_required', 'c.hidden as c_hidden',
        'i.id as i_id', 'i.name as i_name', 'i.spec as i_spec',
        'collection_items.approved_at', 'collection_items.rejected_at'])
      .where('i.org_id', '=', orgId).where('c.org_id', '<>', orgId).where('c.status', '<>', 'archived')
      .orderBy('c.created_at', 'desc')
      .execute();
    const counts = rows.length
      ? await this.db.selectFrom('collection_items').select(['collection_id', (eb) => eb.fn.countAll<string>().as('n')])
        .where('collection_id', 'in', [...new Set(rows.map((r) => r.c_id))]).groupBy('collection_id').execute()
      : [];
    return rows.map((r) => ({
      collection: { id: r.c_id, orgId: r.c_org, name: r.c_name, spec: r.c_spec as BadgeSpec, status: r.c_status, hidden: r.c_hidden,
        requiredCount: r.c_required ?? 0, itemCount: Number(counts.find((c) => c.collection_id === r.c_id)?.n ?? 0) },
      achievement: { id: r.i_id, name: r.i_name, spec: r.i_spec as BadgeSpec },
      state: stateOf(r),
    }));
  }

  /** Zustimmen oder ablehnen. Nur die Organisation, der das Teil gehört. */
  async decideItem(orgId: string, collectionId: string, achievementId: string, decision: 'approve' | 'reject', actor: string) {
    await this.db.transaction().execute(async (trx) => {
      const item = await trx.selectFrom('collection_items')
        .innerJoin('achievements', 'achievements.id', 'collection_items.achievement_id')
        .select(['achievements.org_id']).where('collection_items.collection_id', '=', collectionId).where('collection_items.achievement_id', '=', achievementId)
        .forUpdate().executeTakeFirst();
      if (!item || item.org_id !== orgId) throw notFound('Anfrage');
      const now = new Date(this.now());
      const values = decision === 'approve'
        ? { approved_at: now, approved_by: actor, rejected_at: null, rejected_by: null }
        : { approved_at: null, approved_by: null, rejected_at: now, rejected_by: actor };
      await trx.updateTable('collection_items').set(values).where('collection_id', '=', collectionId).where('achievement_id', '=', achievementId).execute();
      if (decision === 'approve') {
        // Ist die Kombination schon live, zählt das Teil ab sofort – auch rückwirkend
        await evaluateCollections(trx, { collectionId }, now);
        await this.notifyRetroactive(trx, collectionId, now);
      }
      if (this.notifications) {
        const c = await trx.selectFrom('achievements').select(['org_id', 'name']).where('id', '=', collectionId).executeTakeFirstOrThrow();
        const it = await trx.selectFrom('achievements').select('name').where('id', '=', achievementId).executeTakeFirstOrThrow();
        await this.notifications.notify(trx, {
          userSubs: await this.notifications.orgMembers(trx, c.org_id), category: 'requests', link: null,
          title: decision === 'approve' ? 'Sammelanfrage angenommen' : 'Sammelanfrage abgelehnt',
          body: `„${it.name}“ für „${c.name}“`,
        });
      }
      await audit(trx, { actorSub: actor, orgId, action: `collection_item.${decision}`, entity: 'achievement', entityId: collectionId, data: { achievementId } });
    });
  }

  /** Veto der Haupt-Admin-Organisation: nimmt ein Abzeichen sofort offline, vergebene Awards bleiben. */
  async veto(id: string, reason: string, actor: string): Promise<AchievementView> {
    const row = await this.db.transaction().execute(async (trx) => {
      const a = await trx.updateTable('achievements')
        .set({ vetoed_at: new Date(this.now()), vetoed_by: actor, veto_reason: reason, updated_at: new Date(this.now()) })
        .where('id', '=', id).returningAll().executeTakeFirst();
      if (!a) throw notFound('Abzeichen');
      await audit(trx, { actorSub: actor, orgId: a.org_id, action: 'achievement.veto', entity: 'achievement', entityId: id, data: { reason } });
      return a;
    });
    return this.view(row);
  }

  async liftVeto(id: string, actor: string): Promise<AchievementView> {
    const row = await this.db.transaction().execute(async (trx) => {
      const a = await trx.updateTable('achievements')
        .set({ vetoed_at: null, vetoed_by: null, veto_reason: null, updated_at: new Date(this.now()) })
        .where('id', '=', id).returningAll().executeTakeFirst();
      if (!a) throw notFound('Abzeichen');
      await audit(trx, { actorSub: actor, orgId: a.org_id, action: 'achievement.veto_lift', entity: 'achievement', entityId: id });
      return a;
    });
    return this.view(row);
  }

  /** Öffentlich sichtbar: live und ohne Veto. Versteckte erscheinen als Platzhalter, bis die Person sie hat. */
  async getPublic(id: string, userSub?: string): Promise<PublicAchievement> {
    const a = await this.db.selectFrom('achievements').selectAll()
      .where('id', '=', id).where('status', '=', 'live').where('vetoed_at', 'is', null).executeTakeFirst();
    if (!a) throw notFound('Abzeichen');
    const v = await this.view(a);
    return present(v, await earnedIds(this.db, userSub, [v.id, ...v.items.map((i) => i.achievementId)]));
  }

  async listPublic(orgId?: string, userSub?: string): Promise<PublicAchievement[]> {
    let q = this.db.selectFrom('achievements').selectAll().where('status', '=', 'live').where('vetoed_at', 'is', null);
    if (orgId) q = q.where('org_id', '=', orgId);
    const views = await this.views(await q.orderBy('published_at', 'desc').limit(500).execute());
    const earned = await earnedIds(this.db, userSub);
    return views.map((v) => present(v, earned));
  }

  /**
   * Mögliche Teile einer Kombination: eigene (auch Entwürfe) und fremde, die ihre Organisation freigegeben hat.
   * Fremde versteckte erscheinen ohne Inhalt – die anfragende Organisation erfährt das Geheimnis nicht.
   */
  async collectionCandidates(orgId: string) {
    const rows = await this.db.selectFrom('achievements')
      .select(['id', 'org_id', 'name', 'kind', 'spec', 'status', 'hidden', 'hint'])
      .where('kind', '<>', 'collection').where('status', '<>', 'archived')
      .where((eb) => eb.or([
        eb('org_id', '=', orgId),
        eb.and([eb('status', '=', 'live'), eb('vetoed_at', 'is', null), eb('open_for_collections', '=', true)]),
      ]))
      .orderBy('published_at', 'desc').limit(500).execute();
    return rows.map((r) => {
      const own = r.org_id === orgId;
      const secret = !own && r.hidden;
      return {
        id: r.id, orgId: r.org_id, own, draft: r.status === 'draft', secret,
        name: secret ? null : r.name, kind: r.kind, spec: secret ? null : (r.spec as BadgeSpec), hint: secret ? r.hint : null,
      };
    });
  }

  /** Für andere Dienste: Achievement einer Organisation, das noch nicht archiviert ist. */
  async requireActive(orgId: string, id: string): Promise<Achievement> {
    const a = await this.load(orgId, id);
    if (a.status === 'archived') throw new ApiError(409, 'archived', 'Für archivierte Abzeichen lassen sich keine Codes anlegen');
    if (a.kind === 'collection') throw new ApiError(409, 'collection', 'Kombinationen bekommt man über ihre Teile, nicht über Codes');
    return a;
  }
}
