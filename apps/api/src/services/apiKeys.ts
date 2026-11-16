import { createHash, timingSafeEqual } from 'node:crypto';
import type { Database } from '../db/index.ts';
import type { ApiScope } from '../db/types.ts';
import { conflict, notFound } from '../errors.ts';
import { audit } from './audit.ts';
import { randomToken } from './tokens.ts';

/** Format: bbk_<8 Zeichen sichtbar>_<32 Zeichen geheim>, Base62 */
const KEY_PATTERN = /^bbk_([A-Za-z0-9]{8})_([A-Za-z0-9]{32})$/;
const sha256 = (s: string) => createHash('sha256').update(s).digest();

export interface ApiKeyView {
  id: string;
  name: string;
  /** Erkennungsmerkmal, z. B. bbk_Ab12Cd34_… */
  hint: string;
  scopes: ApiScope[];
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  active: boolean;
}

export interface ApiKeyPrincipal { id: string; orgId: string; name: string; scopes: ApiScope[] }

export class ApiKeyService {
  constructor(private db: Database, private now: () => number = Date.now) {}

  private toView(r: { id: string; name: string; prefix: string; scopes: ApiScope[]; expires_at: Date; revoked_at: Date | null; last_used_at: Date | null; created_at: Date }): ApiKeyView {
    return {
      id: r.id,
      name: r.name,
      hint: `bbk_${r.prefix}_…`,
      scopes: r.scopes,
      expiresAt: r.expires_at.toISOString(),
      revokedAt: r.revoked_at?.toISOString() ?? null,
      lastUsedAt: r.last_used_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
      active: !r.revoked_at && r.expires_at.getTime() > this.now(),
    };
  }

  /** Legt einen Schlüssel an. Der Klartext wird nur dieses eine Mal zurückgegeben. */
  async create(orgId: string, input: { name: string; scopes: ApiScope[]; expiresInDays?: number }, actor: string) {
    const prefix = randomToken(8);
    const secret = randomToken(32);
    const expires = new Date(this.now() + (input.expiresInDays ?? 180) * 86_400_000);
    const row = await this.db.transaction().execute(async (trx) => {
      const r = await trx.insertInto('api_keys').values({
        org_id: orgId, name: input.name, prefix, secret_hash: sha256(secret),
        scopes: [...new Set(input.scopes)], expires_at: expires, revoked_at: null, last_used_at: null, created_by: actor,
      }).returningAll().executeTakeFirstOrThrow();
      await audit(trx, { actorSub: actor, orgId, action: 'api_key.create', entity: 'api_key', entityId: r.id, data: { name: r.name, scopes: r.scopes } });
      return r;
    });
    return { key: this.toView(row), secret: `bbk_${prefix}_${secret}` };
  }

  async list(orgId: string): Promise<ApiKeyView[]> {
    const rows = await this.db.selectFrom('api_keys')
      .select(['id', 'name', 'prefix', 'scopes', 'expires_at', 'revoked_at', 'last_used_at', 'created_at'])
      .where('org_id', '=', orgId).orderBy('created_at', 'desc').execute();
    return rows.map((r) => this.toView(r));
  }

  async revoke(orgId: string, id: string, actor: string): Promise<ApiKeyView> {
    const row = await this.db.transaction().execute(async (trx) => {
      const current = await trx.selectFrom('api_keys').select(['revoked_at']).where('id', '=', id).where('org_id', '=', orgId).executeTakeFirst();
      if (!current) throw notFound('API-Schlüssel');
      if (current.revoked_at) throw conflict('revoked', 'Schlüssel ist bereits widerrufen');
      const r = await trx.updateTable('api_keys').set({ revoked_at: new Date(this.now()) }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, { actorSub: actor, orgId, action: 'api_key.revoke', entity: 'api_key', entityId: id });
      return r;
    });
    return this.toView(row);
  }

  /** Prüft einen Schlüssel. Null bei unbekannt, falsch, abgelaufen oder widerrufen. */
  async authenticate(raw: string | undefined): Promise<ApiKeyPrincipal | null> {
    const m = raw ? KEY_PATTERN.exec(raw.trim()) : null;
    if (!m) return null;
    const row = await this.db.selectFrom('api_keys').selectAll().where('prefix', '=', m[1]!).executeTakeFirst();
    if (!row) return null;
    const given = sha256(m[2]!);
    if (given.length !== row.secret_hash.length || !timingSafeEqual(given, row.secret_hash)) return null;
    if (row.revoked_at || row.expires_at.getTime() <= this.now()) return null;
    // Letzte Nutzung höchstens einmal pro Minute schreiben
    if (!row.last_used_at || this.now() - row.last_used_at.getTime() > 60_000) {
      await this.db.updateTable('api_keys').set({ last_used_at: new Date(this.now()) }).where('id', '=', row.id).execute();
    }
    return { id: row.id, orgId: row.org_id, name: row.name, scopes: row.scopes };
  }
}
