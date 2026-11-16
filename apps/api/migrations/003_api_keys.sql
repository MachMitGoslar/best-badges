-- API-Schlüssel pro Organisation für Maschinen-Zugänge (Kassensysteme, Plattformen)
-- Gespeichert wird nur ein SHA-256-Hash des geheimen Teils; der Schlüssel ist zufällig mit ~190 Bit.

CREATE TABLE api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  prefix        text NOT NULL UNIQUE CHECK (prefix ~ '^[A-Za-z0-9]{8}$'),   -- sichtbarer Teil zum Wiedererkennen
  secret_hash   bytea NOT NULL,
  scopes        text[] NOT NULL CHECK (scopes <@ ARRAY['awards:create', 'codes:mint']::text[] AND cardinality(scopes) > 0),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_org_idx ON api_keys (org_id);

-- Einlösungen über die API: welcher Schlüssel, und eine Referenz für Idempotenz
ALTER TABLE redemptions ADD COLUMN api_key_id uuid REFERENCES api_keys (id) ON DELETE SET NULL;
ALTER TABLE redemptions ADD COLUMN reference text CHECK (reference IS NULL OR char_length(reference) BETWEEN 1 AND 120);
CREATE UNIQUE INDEX redemptions_api_reference_idx ON redemptions (api_key_id, reference) WHERE reference IS NOT NULL AND status = 'success';
