-- Freigabe für Kombinationen anderer Organisationen und öffentliche Profile (Showcase)

-- Nur freigegebene Abzeichen dürfen andere Organisationen für ihre Kombinationen anfragen.
-- Die Zustimmung im Einzelfall bleibt trotzdem nötig. Standard: nicht freigegeben.
ALTER TABLE achievements ADD COLUMN open_for_collections boolean NOT NULL DEFAULT false;

-- Profil einer sammelnden Person. Privat, bis sie es selbst öffentlich schaltet.
-- Kein Klarname aus der Goslar ID: Anzeigename und Kürzel wählt die Person selbst.
CREATE TABLE profiles (
  user_sub      text PRIMARY KEY,
  handle        text UNIQUE CHECK (handle IS NULL OR handle ~ '^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$'),
  display_name  text CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 40),
  public        boolean NOT NULL DEFAULT false,
  showcase      uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(showcase) <= 6),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT public OR handle IS NOT NULL)
);
