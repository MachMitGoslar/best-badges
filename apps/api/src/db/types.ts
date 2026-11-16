import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
type UpdatedAt = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null, Date | string | null>;

export interface AchievementsTable {
  id: Generated<string>;
  org_id: string;
  kind: 'single' | 'tiered' | 'collection';
  name: string;
  description: Generated<string>;
  awarded_text: Generated<string>;
  category: Generated<string[]>;
  spec: ColumnType<unknown, string, string>;
  status: Generated<'draft' | 'live' | 'archived'>;
  required_count: number | null;
  hidden: Generated<boolean>;
  hint: Generated<string>;
  open_for_collections: Generated<boolean>;
  vetoed_at: NullableTimestamp;
  vetoed_by: string | null;
  veto_reason: string | null;
  created_by: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  published_at: NullableTimestamp;
}

export interface AchievementTiersTable {
  achievement_id: string;
  level: number;
  threshold: number;
  name: string | null;
  awarded_text: string | null;
}

export interface ProfilesTable {
  user_sub: string;
  handle: string | null;
  display_name: string | null;
  public: Generated<boolean>;
  showcase: Generated<string[]>;
  updated_at: UpdatedAt;
}

export interface CollectionItemsTable {
  collection_id: string;
  achievement_id: string;
  approved_at: NullableTimestamp;
  approved_by: string | null;
  rejected_at: NullableTimestamp;
  rejected_by: string | null;
  position: Generated<number>;
}

export type CodeTemplate = 'station' | 'event' | 'checkout' | 'voucher';

export interface CodesTable {
  id: Generated<string>;
  achievement_id: string;
  org_id: string;
  template: CodeTemplate;
  label: Generated<string>;
  token: string;
  secret: Buffer | null;
  per_user_limit: number | null;
  per_user_cooldown_seconds: number | null;
  value: Generated<number>;
  max_total: number | null;
  uses: Generated<number>;
  valid_from: NullableTimestamp;
  valid_until: NullableTimestamp;
  active: Generated<boolean>;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_m: number | null;
  batch_id: string | null;
  created_by: string;
  created_at: CreatedAt;
}

export interface AwardsTable {
  id: Generated<string>;
  achievement_id: string;
  user_sub: string;
  progress: Generated<number>;
  tier: Generated<number>;
  first_earned_at: NullableTimestamp;
  updated_at: UpdatedAt;
}

export type RedemptionStatus = 'success' | 'limit_reached' | 'cooldown' | 'expired' | 'exhausted' | 'inactive' | 'invalid' | 'unavailable' | 'out_of_range';

export interface CodeNoncesTable {
  code_id: string;
  nonce: string;
  user_sub: string;
  used_at: CreatedAt;
}

export interface RedemptionsTable {
  id: Generated<string>;
  code_id: string | null;
  achievement_id: string | null;
  user_sub: string;
  value: Generated<number>;
  status: RedemptionStatus;
  source: Generated<'scan' | 'api'>;
  api_key_id: Generated<string | null>;
  reference: Generated<string | null>;
  created_at: CreatedAt;
}

export type ApiScope = 'awards:create' | 'codes:mint';

export interface ApiKeysTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  prefix: string;
  secret_hash: Buffer;
  scopes: ApiScope[];
  expires_at: ColumnType<Date, Date | string, Date | string>;
  revoked_at: NullableTimestamp;
  last_used_at: NullableTimestamp;
  created_by: string;
  created_at: CreatedAt;
}

export interface AuditLogTable {
  id: Generated<string>;
  actor_sub: string;
  org_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  data: ColumnType<unknown, string | undefined, never>;
  created_at: CreatedAt;
}

export interface DB {
  achievements: AchievementsTable;
  achievement_tiers: AchievementTiersTable;
  collection_items: CollectionItemsTable;
  profiles: ProfilesTable;
  codes: CodesTable;
  awards: AwardsTable;
  redemptions: RedemptionsTable;
  code_nonces: CodeNoncesTable;
  api_keys: ApiKeysTable;
  audit_log: AuditLogTable;
}

export type Achievement = Selectable<AchievementsTable>;
export type NewAchievement = Insertable<AchievementsTable>;
export type AchievementUpdate = Updateable<AchievementsTable>;
export type Tier = Selectable<AchievementTiersTable>;
export type Code = Selectable<CodesTable>;
