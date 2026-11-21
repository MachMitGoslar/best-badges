-- Plattform-Abzeichen: Die Haupt-Admin-Organisation vergibt Abzeichen automatisch nach festen Regeln
-- (App genutzt, Abzeichen gesammelt …). Der Fortschritt ist der aktuelle Wert der Kennzahl, nicht eine Summe.
-- Welche Organisation Regeln setzen darf, prüft die API (ADMIN_ORG_ID).

ALTER TABLE achievements ADD COLUMN auto_rule text
  CHECK (auto_rule IS NULL OR auto_rule IN ('active_days', 'awards_count', 'orgs_count', 'places_count', 'collections_count'));
ALTER TABLE achievements ADD CONSTRAINT achievements_auto_rule_kind CHECK (auto_rule IS NULL OR kind <> 'collection');
CREATE INDEX achievements_auto_rule ON achievements (auto_rule) WHERE auto_rule IS NOT NULL;

-- Tage, an denen jemand die App geöffnet hat (nur das Datum, Europe/Berlin) – für „App genutzt“
CREATE TABLE user_activity_days (
  user_sub  text NOT NULL,
  day       date NOT NULL,
  PRIMARY KEY (user_sub, day)
);
