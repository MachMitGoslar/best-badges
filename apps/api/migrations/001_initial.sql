-- Best Badges: Grundschema
-- Organisationen kommen aus dem HSP; hier stehen nur ihre IDs (org_id) als Fremdschlüssel ohne eigene Tabelle.
-- Personen werden über den OIDC-sub identifiziert (user_sub).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Achievement = ein Abzeichen als Definition (Open Badges 3.0: Achievement)
CREATE TABLE achievements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('single', 'tiered', 'collection')),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description     text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),   -- Bedingung: wie man es bekommt
  awarded_text    text NOT NULL DEFAULT '' CHECK (char_length(awarded_text) <= 500),  -- Text beim Erhalt
  category        text[] NOT NULL DEFAULT '{}',
  spec            jsonb NOT NULL,                                                     -- Badge-Spezifikation (badge-spec)
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  -- Meta-Badge (später): „N von M“
  required_count  integer CHECK (required_count IS NULL OR required_count > 0),
  -- Nachkontrolle durch die Haupt-Admin-Organisation
  vetoed_at       timestamptz,
  vetoed_by       text,
  veto_reason     text CHECK (veto_reason IS NULL OR char_length(veto_reason) <= 500),
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,
  CHECK ((vetoed_at IS NULL) = (veto_reason IS NULL))
);
CREATE INDEX achievements_org_idx ON achievements (org_id);
CREATE INDEX achievements_public_idx ON achievements (status) WHERE status = 'live' AND vetoed_at IS NULL;

-- Stufen eines Achievements; „single“ hat genau eine Stufe mit Schwelle 1
CREATE TABLE achievement_tiers (
  achievement_id  uuid NOT NULL REFERENCES achievements (id) ON DELETE CASCADE,
  level           integer NOT NULL CHECK (level BETWEEN 1 AND 20),
  threshold       integer NOT NULL CHECK (threshold > 0),
  name            text CHECK (name IS NULL OR char_length(name) <= 80),
  awarded_text    text CHECK (awarded_text IS NULL OR char_length(awarded_text) <= 500),
  PRIMARY KEY (achievement_id, level)
);

-- Teil-Abzeichen eines Meta-Badges (später, Schema schon vorbereitet)
CREATE TABLE collection_items (
  collection_id   uuid NOT NULL REFERENCES achievements (id) ON DELETE CASCADE,
  achievement_id  uuid NOT NULL REFERENCES achievements (id) ON DELETE RESTRICT,
  approved_at     timestamptz,
  approved_by     text,
  PRIMARY KEY (collection_id, achievement_id),
  CHECK (collection_id <> achievement_id)
);

-- Code = Weg zur Einlösung, mit drei Stellschrauben: pro Person, Wert, gesamt
CREATE TABLE codes (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id             uuid NOT NULL REFERENCES achievements (id) ON DELETE CASCADE,
  org_id                     uuid NOT NULL,
  template                   text NOT NULL CHECK (template IN ('station', 'event', 'checkout', 'voucher')),
  label                      text NOT NULL DEFAULT '' CHECK (char_length(label) <= 120),
  -- Öffentlicher Teil im QR-Link. Bei 'event' und 'checkout' ergänzt um eine HMAC-Signatur mit `secret`.
  token                      text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9]{16,64}$'),
  secret                     bytea,
  -- pro Person: wie oft (NULL = unbegrenzt) und mit welchem Abstand
  per_user_limit             integer CHECK (per_user_limit IS NULL OR per_user_limit > 0),
  per_user_cooldown_seconds  integer CHECK (per_user_cooldown_seconds IS NULL OR per_user_cooldown_seconds > 0),
  -- Wert einer Einlösung
  value                      integer NOT NULL DEFAULT 1 CHECK (value BETWEEN 1 AND 1000),
  -- gesamt
  max_total                  integer CHECK (max_total IS NULL OR max_total > 0),
  uses                       integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  valid_from                 timestamptz,
  valid_until                timestamptz,
  active                     boolean NOT NULL DEFAULT true,
  -- optionale Standort-Plausibilisierung
  geo_lat                    double precision CHECK (geo_lat IS NULL OR geo_lat BETWEEN -90 AND 90),
  geo_lng                    double precision CHECK (geo_lng IS NULL OR geo_lng BETWEEN -180 AND 180),
  geo_radius_m               integer CHECK (geo_radius_m IS NULL OR geo_radius_m BETWEEN 10 AND 5000),
  batch_id                   uuid,
  created_by                 text NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (max_total IS NULL OR uses <= max_total),
  CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until),
  CHECK ((geo_lat IS NULL) = (geo_lng IS NULL) AND (geo_lat IS NULL) = (geo_radius_m IS NULL)),
  CHECK ((template IN ('event', 'checkout')) = (secret IS NOT NULL))
);
CREATE INDEX codes_org_idx ON codes (org_id);
CREATE INDEX codes_achievement_idx ON codes (achievement_id);
CREATE INDEX codes_batch_idx ON codes (batch_id) WHERE batch_id IS NOT NULL;

-- Award = eine Person besitzt ein Achievement (Open Badges 3.0: AchievementCredential)
CREATE TABLE awards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id  uuid NOT NULL REFERENCES achievements (id) ON DELETE RESTRICT,
  user_sub        text NOT NULL,
  progress        integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  tier            integer NOT NULL DEFAULT 0 CHECK (tier >= 0),   -- 0 = noch keine Stufe erreicht
  first_earned_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (achievement_id, user_sub)
);
CREATE INDEX awards_user_idx ON awards (user_sub);

-- Redemption = eine einzelne Einlösung; zugleich Protokoll aller Versuche
CREATE TABLE redemptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id         uuid REFERENCES codes (id) ON DELETE SET NULL,
  achievement_id  uuid REFERENCES achievements (id) ON DELETE SET NULL,
  user_sub        text NOT NULL,
  value           integer NOT NULL DEFAULT 0,
  status          text NOT NULL CHECK (status IN ('success', 'limit_reached', 'cooldown', 'expired', 'exhausted', 'inactive', 'invalid', 'unavailable')),
  source          text NOT NULL DEFAULT 'scan' CHECK (source IN ('scan', 'api')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX redemptions_user_code_idx ON redemptions (code_id, user_sub, created_at) WHERE status = 'success';
CREATE INDEX redemptions_code_idx ON redemptions (code_id, created_at);

-- Audit-Log für Verwaltungsaktionen
CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_sub   text NOT NULL,
  org_id      uuid,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_org_idx ON audit_log (org_id, created_at DESC);
