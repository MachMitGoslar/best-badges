-- Versteckte Abzeichen und Kombinations-Abzeichen („N von M“)

-- Versteckt: Name, Beschreibung und Design bleiben öffentlich verborgen, bis man das Abzeichen hat.
-- Der Hinweis darf öffentlich sein („Finde das Geheimnis am Rammelsberg“).
ALTER TABLE achievements ADD COLUMN hidden boolean NOT NULL DEFAULT false;
ALTER TABLE achievements ADD COLUMN hint text NOT NULL DEFAULT '' CHECK (char_length(hint) <= 140);

-- Kombination: required_count ist Pflicht, sonst leer
ALTER TABLE achievements ADD CONSTRAINT achievements_collection_count
  CHECK ((kind = 'collection') = (required_count IS NOT NULL));

-- Teile fremder Organisationen müssen zustimmen; Ablehnung bleibt sichtbar, bis der Teil entfernt wird
ALTER TABLE collection_items ADD COLUMN rejected_at timestamptz;
ALTER TABLE collection_items ADD COLUMN rejected_by text;
ALTER TABLE collection_items ADD CONSTRAINT collection_items_decision CHECK (approved_at IS NULL OR rejected_at IS NULL);
ALTER TABLE collection_items ADD COLUMN position integer NOT NULL DEFAULT 0;
CREATE INDEX collection_items_achievement_idx ON collection_items (achievement_id);
