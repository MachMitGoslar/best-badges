import type { Schedule } from '../services/schedule.ts';
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
  /** Plattform-Abzeichen: automatische Vergabe nach Regel (nur Haupt-Admin-Organisation) */
  auto_rule: Generated<AutoRule | null>;
  /** Zeitfenster: nur in diesem Zeitraum zu verdienen (Limited Edition) */
  available_from: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  available_until: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  vetoed_at: NullableTimestamp;
  vetoed_by: string | null;
  veto_reason: string | null;
  created_by: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  published_at: NullableTimestamp;
}

export type AutoRule = 'active_days' | 'awards_count' | 'orgs_count' | 'places_count' | 'collections_count';

export interface UserActivityDaysTable {
  user_sub: string;
  day: ColumnType<string, string, string>;
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

export type CodeTemplate = 'station' | 'event' | 'checkout' | 'voucher' | 'place';

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
  /** Nur Vorlage `place`: öffentlicher Name des Ortes */
  place_name: Generated<string | null>;
  /** Feste Zeiten (Wochentage + Uhrzeit, Europe/Berlin); null = immer */
  schedule: ColumnType<Schedule | null, string | null | undefined, string | null>;
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

export type RedemptionStatus = 'success' | 'limit_reached' | 'cooldown' | 'expired' | 'exhausted' | 'inactive' | 'invalid' | 'unavailable' | 'out_of_range' | 'inaccurate' | 'implausible' | 'not_started' | 'ended' | 'closed';

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
  source: Generated<'scan' | 'api' | 'place'>;
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

export type NotificationCategory = 'awards' | 'requests' | 'news' | 'campaigns' | 'reminders';

export interface NotificationPrefsTable {
  user_sub: string;
  awards: Generated<boolean>;
  requests: Generated<boolean>;
  news: Generated<boolean>;
  campaigns: Generated<boolean>;
  reminders: Generated<boolean>;
  consent_at: NullableTimestamp;
  last_active_at: NullableTimestamp;
  last_reminder_at: NullableTimestamp;
  updated_at: UpdatedAt;
}

export interface PushDevicesTable {
  id: Generated<string>;
  user_sub: string;
  token: string;
  environment: 'development' | 'production';
  created_at: CreatedAt;
  last_seen_at: UpdatedAt;
  disabled_at: NullableTimestamp;
}

export interface BroadcastsTable {
  id: Generated<string>;
  category: 'news' | 'campaigns';
  title: string;
  body: string;
  link: string | null;
  recipients: Generated<number>;
  created_by: string;
  created_at: CreatedAt;
}

export interface NotificationsTable {
  id: Generated<string>;
  user_sub: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  broadcast_id: string | null;
  created_at: CreatedAt;
  read_at: NullableTimestamp;
}

export interface PushOutboxTable {
  id: Generated<string>;
  notification_id: string;
  device_id: string;
  status: Generated<'pending' | 'sent' | 'failed'>;
  attempts: Generated<number>;
  next_attempt_at: UpdatedAt;
  last_error: string | null;
  created_at: CreatedAt;
  sent_at: NullableTimestamp;
}

export interface OrgMembersSeenTable {
  org_id: string;
  user_sub: string;
  last_seen_at: UpdatedAt;
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
  notification_prefs: NotificationPrefsTable;
  push_devices: PushDevicesTable;
  broadcasts: BroadcastsTable;
  notifications: NotificationsTable;
  push_outbox: PushOutboxTable;
  org_members_seen: OrgMembersSeenTable;
  user_activity_days: UserActivityDaysTable;
}

export type Achievement = Selectable<AchievementsTable>;
export type NewAchievement = Insertable<AchievementsTable>;
export type AchievementUpdate = Updateable<AchievementsTable>;
export type Tier = Selectable<AchievementTiersTable>;
export type Code = Selectable<CodesTable>;
