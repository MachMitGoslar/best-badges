import type { Kysely, Transaction } from 'kysely';
import type { DB } from '../db/types.ts';

export interface AuditEntry {
  actorSub: string;
  orgId: string | null;
  action: string;
  entity: 'achievement' | 'code' | 'api_key';
  entityId: string | null;
  data?: Record<string, unknown>;
}

export async function audit(db: Kysely<DB> | Transaction<DB>, e: AuditEntry): Promise<void> {
  await db.insertInto('audit_log').values({
    actor_sub: e.actorSub,
    org_id: e.orgId,
    action: e.action,
    entity: e.entity,
    entity_id: e.entityId,
    data: JSON.stringify(e.data ?? {}),
  }).execute();
}
