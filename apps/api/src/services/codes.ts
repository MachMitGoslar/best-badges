import { randomUUID } from 'node:crypto';
import type { Database } from '../db/index.ts';
import type { Code, CodeTemplate } from '../db/types.ts';
import { invalid, notFound } from '../errors.ts';
import type { AchievementService } from './achievements.ts';
import { audit } from './audit.ts';
import { checkoutUrl, eventUrl } from './signing.ts';
import { randomSecret, randomToken } from './tokens.ts';

export interface CodeInput {
  achievementId: string;
  template: CodeTemplate;
  label?: string;
  perUserLimit?: number | null;
  perUserCooldownSeconds?: number | null;
  value?: number;
  maxTotal?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  geo?: { lat: number; lng: number; radiusM: number } | null;
  /** Nur für Gutschein-Stapel: Anzahl einmaliger Codes */
  count?: number;
}

export interface CodePatch {
  label?: string;
  active?: boolean;
  validUntil?: string | null;
  maxTotal?: number | null;
}

export interface CodeView {
  id: string;
  achievementId: string;
  template: CodeTemplate;
  label: string;
  /** Link für statische Codes und Gutscheine; rotierende und Kassen-Codes werden erst im Ausgabe-Modus erzeugt. */
  url: string | null;
  perUserLimit: number | null;
  perUserCooldownSeconds: number | null;
  value: number;
  maxTotal: number | null;
  uses: number;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
  geo: { lat: number; lng: number; radiusM: number } | null;
  batchId: string | null;
  createdAt: string;
}

/**
 * Vorlagen setzen die drei Stellschrauben vor.
 * `fixed` sind Werte, die die Vorlage erzwingt (Sicherheitsregeln), `defaults` lassen sich überschreiben.
 */
const TEMPLATES: Record<CodeTemplate, { defaults: Partial<CodeInput>; fixed: Partial<CodeInput>; dynamic: boolean }> = {
  // Gedruckter, statischer QR-Code. Wert immer 1, damit ein abfotografierter Code wenig hergibt.
  station: { defaults: { perUserLimit: 1 }, fixed: { value: 1 }, dynamic: false },
  // Rotierender Code im Ausgabe-Modus, signiert mit `secret`.
  event: { defaults: { perUserLimit: 1 }, fixed: { value: 1 }, dynamic: true },
  // Kasse: daraus werden einmalige Codes mit Wert pro Einlösung erzeugt (BBPOC-4/7).
  checkout: { defaults: { perUserLimit: null }, fixed: {}, dynamic: true },
  // Gutschein-Stapel: jeder Code genau einmal einlösbar.
  voucher: { defaults: {}, fixed: { perUserLimit: 1, maxTotal: 1 }, dynamic: false },
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export class CodeService {
  constructor(
    private db: Database,
    private achievements: AchievementService,
    private publicBaseUrl: string,
    private now: () => number = Date.now,
  ) {}

  toView(c: Code): CodeView {
    return {
      id: c.id,
      achievementId: c.achievement_id,
      template: c.template,
      label: c.label,
      url: TEMPLATES[c.template].dynamic ? null : `${this.publicBaseUrl}/c/${c.token}`,
      perUserLimit: c.per_user_limit,
      perUserCooldownSeconds: c.per_user_cooldown_seconds,
      value: c.value,
      maxTotal: c.max_total,
      uses: c.uses,
      validFrom: iso(c.valid_from),
      validUntil: iso(c.valid_until),
      active: c.active,
      geo: c.geo_lat !== null && c.geo_lng !== null && c.geo_radius_m !== null ? { lat: c.geo_lat, lng: c.geo_lng, radiusM: c.geo_radius_m } : null,
      batchId: c.batch_id,
      createdAt: c.created_at.toISOString(),
    };
  }

  async create(orgId: string, input: CodeInput, actor: string): Promise<CodeView[]> {
    await this.achievements.requireActive(orgId, input.achievementId);
    const t = TEMPLATES[input.template];
    for (const [k, v] of Object.entries(t.fixed)) {
      const given = input[k as keyof CodeInput];
      if (given !== undefined && given !== v) throw invalid(`Vorlage „${input.template}“ erlaubt für ${k} nur ${String(v)}`);
    }
    const merged = { ...t.defaults, ...input, ...t.fixed };
    const count = input.count ?? 1;
    if (input.template !== 'voucher' && count !== 1) throw invalid('Mehrere Codes auf einmal gibt es nur als Gutschein-Stapel');
    if (merged.validFrom && merged.validUntil && new Date(merged.validFrom) >= new Date(merged.validUntil)) {
      throw invalid('Gültig-bis muss nach Gültig-ab liegen');
    }
    const batchId = input.template === 'voucher' && count > 1 ? randomUUID() : null;

    const rows = await this.db.transaction().execute(async (trx) => {
      const created = await trx.insertInto('codes').values(Array.from({ length: count }, () => ({
        achievement_id: input.achievementId,
        org_id: orgId,
        template: input.template,
        label: merged.label ?? '',
        token: randomToken(),
        secret: t.dynamic ? randomSecret() : null,
        per_user_limit: merged.perUserLimit ?? null,
        per_user_cooldown_seconds: merged.perUserCooldownSeconds ?? null,
        value: merged.value ?? 1,
        max_total: merged.maxTotal ?? null,
        valid_from: merged.validFrom ?? null,
        valid_until: merged.validUntil ?? null,
        geo_lat: merged.geo?.lat ?? null,
        geo_lng: merged.geo?.lng ?? null,
        geo_radius_m: merged.geo?.radiusM ?? null,
        batch_id: batchId,
        created_by: actor,
      }))).returningAll().execute();
      await audit(trx, {
        actorSub: actor, orgId, action: 'code.create', entity: 'code', entityId: created[0]!.id,
        data: { template: input.template, achievementId: input.achievementId, count, batchId },
      });
      return created;
    });
    return rows.map((r) => this.toView(r));
  }

  async list(orgId: string, achievementId?: string): Promise<CodeView[]> {
    let q = this.db.selectFrom('codes').selectAll().where('org_id', '=', orgId);
    if (achievementId) q = q.where('achievement_id', '=', achievementId);
    return (await q.orderBy('created_at', 'desc').limit(1000).execute()).map((r) => this.toView(r));
  }

  private async load(orgId: string, id: string): Promise<Code> {
    const c = await this.db.selectFrom('codes').selectAll().where('id', '=', id).where('org_id', '=', orgId).executeTakeFirst();
    if (!c) throw notFound('Code');
    return c;
  }

  async get(orgId: string, id: string): Promise<CodeView> {
    return this.toView(await this.load(orgId, id));
  }

  async update(orgId: string, id: string, patch: CodePatch, actor: string): Promise<CodeView> {
    const current = await this.load(orgId, id);
    if (patch.maxTotal !== undefined && patch.maxTotal !== null && patch.maxTotal < current.uses) {
      throw invalid(`Gesamtlimit darf nicht unter den bisherigen ${current.uses} Einlösungen liegen`);
    }
    if (current.template === 'voucher' && patch.maxTotal !== undefined) throw invalid('Gutscheine sind immer genau einmal einlösbar');
    if (patch.validUntil && current.valid_from && new Date(patch.validUntil) <= current.valid_from) {
      throw invalid('Gültig-bis muss nach Gültig-ab liegen');
    }
    const row = await this.db.transaction().execute(async (trx) => {
      const values: Record<string, unknown> = {};
      if (patch.label !== undefined) values.label = patch.label;
      if (patch.active !== undefined) values.active = patch.active;
      if (patch.validUntil !== undefined) values.valid_until = patch.validUntil;
      if (patch.maxTotal !== undefined) values.max_total = patch.maxTotal;
      if (Object.keys(values).length === 0) return current;
      const c = await trx.updateTable('codes').set(values).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, { actorSub: actor, orgId, action: 'code.update', entity: 'code', entityId: id, data: { fields: Object.keys(patch) } });
      return c;
    });
    return this.toView(row);
  }

  /** Neuen Code erzeugen: Der alte Link und das alte Geheimnis werden sofort ungültig. */
  async rotate(orgId: string, id: string, actor: string): Promise<CodeView> {
    const current = await this.load(orgId, id);
    const row = await this.db.transaction().execute(async (trx) => {
      const c = await trx.updateTable('codes')
        .set({ token: randomToken(), secret: TEMPLATES[current.template].dynamic ? randomSecret() : null })
        .where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, { actorSub: actor, orgId, action: 'code.rotate', entity: 'code', entityId: id });
      return c;
    });
    return this.toView(row);
  }

  /** Ausgabe-Modus: aktueller Link eines rotierenden Codes. */
  async currentEvent(orgId: string, id: string) {
    const c = await this.load(orgId, id);
    if (c.template !== 'event' || !c.secret) throw invalid('Nur Veranstaltungs-Codes rotieren');
    const { url, expiresInMs } = eventUrl(this.publicBaseUrl, c.token, c.secret, this.now());
    return { url, expiresInSeconds: Math.max(1, Math.ceil(expiresInMs / 1000)), active: c.active };
  }

  /** Kasse: einmaligen Code mit Wert erzeugen (gültig 10 Minuten, genau einmal einlösbar). */
  async mintCheckout(orgId: string, id: string, value: number, actor: string) {
    const c = await this.load(orgId, id);
    if (c.template !== 'checkout' || !c.secret) throw invalid('Nur Kassen-Codes erzeugen Einmal-Codes');
    const minted = checkoutUrl(this.publicBaseUrl, c.token, c.secret, value, this.now());
    await audit(this.db, { actorSub: actor, orgId, action: 'code.mint', entity: 'code', entityId: id, data: { value } });
    return { url: minted.url, value, expiresAt: minted.expiresAt.toISOString() };
  }
}
