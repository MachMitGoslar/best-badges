-- Plattform-Abzeichen mit Zeitraum: „Was zählt?“
-- count_window = true: Gezählt wird nur, was zwischen available_from und available_until passiert ist
-- (z. B. „5 neue Abzeichen im Advent“). false: alles bisher; der Zeitraum begrenzt nur, wann man es bekommen kann.
ALTER TABLE achievements ADD COLUMN count_window boolean NOT NULL DEFAULT false;
ALTER TABLE achievements ADD CONSTRAINT achievements_count_window
  CHECK (NOT count_window OR (auto_rule IS NOT NULL AND (available_from IS NOT NULL OR available_until IS NOT NULL)));
