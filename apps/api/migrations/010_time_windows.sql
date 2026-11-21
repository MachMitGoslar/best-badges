-- Zeitgebundene Abzeichen
-- 1) Zeitfenster am Abzeichen („Limited Edition“): nur in diesem Zeitraum zu verdienen, egal über welchen Weg.
--    Wer es hat, behält es.
-- 2) Feste Zeiten an Codes und Orten (Wochentage + Uhrzeit, Europe/Berlin), z. B. „samstags 7–13 Uhr“.
--    Format: [{"days":[1..7], "from":"HH:MM", "to":"HH:MM"}], 1 = Montag; „to“ vor „from“ = über Mitternacht.

ALTER TABLE achievements ADD COLUMN available_from timestamptz;
ALTER TABLE achievements ADD COLUMN available_until timestamptz;
ALTER TABLE achievements ADD CONSTRAINT achievements_available_window
  CHECK (available_from IS NULL OR available_until IS NULL OR available_from < available_until);

ALTER TABLE codes ADD COLUMN schedule jsonb CHECK (schedule IS NULL OR jsonb_typeof(schedule) = 'array');

ALTER TABLE redemptions DROP CONSTRAINT redemptions_status_check;
ALTER TABLE redemptions ADD CONSTRAINT redemptions_status_check
  CHECK (status IN ('success', 'limit_reached', 'cooldown', 'expired', 'exhausted', 'inactive', 'invalid', 'unavailable',
                    'out_of_range', 'inaccurate', 'implausible', 'not_started', 'ended', 'closed'));
