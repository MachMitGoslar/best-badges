-- Einlösen: Einmal-Nonces für Kassen-Codes und Status für die Standortprüfung

-- Jeder an der Kasse erzeugte Einmal-Code trägt eine Nonce; sie darf genau einmal verbraucht werden.
CREATE TABLE code_nonces (
  code_id     uuid NOT NULL REFERENCES codes (id) ON DELETE CASCADE,
  nonce       text NOT NULL CHECK (nonce ~ '^[A-Za-z0-9]{12,32}$'),
  user_sub    text NOT NULL,
  used_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code_id, nonce)
);

ALTER TABLE redemptions DROP CONSTRAINT redemptions_status_check;
ALTER TABLE redemptions ADD CONSTRAINT redemptions_status_check
  CHECK (status IN ('success', 'limit_reached', 'cooldown', 'expired', 'exhausted', 'inactive', 'invalid', 'unavailable', 'out_of_range'));
