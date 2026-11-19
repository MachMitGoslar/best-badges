-- Benachrichtigungen: Postfach in der App und Push über Apple (APNs), nur mit Zustimmung.
--
-- Kategorien:
--   awards     neue Stufe, neues Abzeichen, Kombination geschafft      (Standard an)
--   requests   Sammelanfragen für Organisationsmitglieder             (Standard an)
--   news       Neuigkeiten der Plattform, z. B. neue Abzeichen        (Werbung: nur mit Einwilligung)
--   campaigns  Sonderaktionen                                          (Werbung: nur mit Einwilligung)
--   reminders  „Schau mal wieder rein“                                 (nur mit Einwilligung)

CREATE TABLE notification_prefs (
  user_sub          text PRIMARY KEY,
  awards            boolean NOT NULL DEFAULT true,
  requests          boolean NOT NULL DEFAULT true,
  news              boolean NOT NULL DEFAULT false,
  campaigns         boolean NOT NULL DEFAULT false,
  reminders         boolean NOT NULL DEFAULT false,
  -- Nachweis der Einwilligung: Zeitpunkt der letzten Änderung an news/campaigns/reminders
  consent_at        timestamptz,
  last_active_at    timestamptz,
  last_reminder_at  timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Geräte mit Push-Erlaubnis. Das Token gehört zum Gerät: meldet sich dort jemand anderes an,
-- wechselt es den Besitzer. Abgemeldete oder von Apple abgelehnte Tokens werden gelöscht bzw. deaktiviert.
CREATE TABLE push_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_sub      text NOT NULL,
  token         text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{64,200}$'),
  environment   text NOT NULL CHECK (environment IN ('development', 'production')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz
);
CREATE INDEX push_devices_user_idx ON push_devices (user_sub) WHERE disabled_at IS NULL;

-- Nachrichten der Haupt-Admin-Organisation an alle, die der Kategorie zugestimmt haben
CREATE TABLE broadcasts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL CHECK (category IN ('news', 'campaigns')),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 180),
  link        text CHECK (link IS NULL OR link ~ '^/[A-Za-z0-9/_-]{0,120}$'),
  recipients  integer NOT NULL DEFAULT 0,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_sub      text NOT NULL,
  category      text NOT NULL CHECK (category IN ('awards', 'requests', 'news', 'campaigns', 'reminders')),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body          text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  -- Ziel in der App, z. B. /achievements/<id>
  link          text CHECK (link IS NULL OR link ~ '^/[A-Za-z0-9/_-]{0,120}$'),
  broadcast_id  uuid REFERENCES broadcasts (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz
);
CREATE INDEX notifications_user_idx ON notifications (user_sub, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_sub) WHERE read_at IS NULL;

-- Warteschlange für Push: eine Zeile je Nachricht und Gerät, mit Wiederholungen bei Fehlern.
-- next_attempt_at dient zugleich als Sperre, solange ein Versand läuft.
CREATE TABLE push_outbox (
  id               bigserial PRIMARY KEY,
  notification_id  uuid NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
  device_id        uuid NOT NULL REFERENCES push_devices (id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);
CREATE INDEX push_outbox_due_idx ON push_outbox (next_attempt_at) WHERE status = 'pending';

-- Wer zuletzt als Mitglied welcher Organisation aktiv war. Das HSP liefert Mitgliedschaften nur je Person;
-- für Benachrichtigungen an eine Organisation (Sammelanfragen) merken wir uns aktive Mitglieder.
CREATE TABLE org_members_seen (
  org_id        uuid NOT NULL,
  user_sub      text NOT NULL,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_sub)
);
