-- POI aus dem HSP (Geschäfte, Filialen, Orte einer Organisation)
-- Kopie für die öffentliche Anzeige; Quelle bleibt das HSP. Aufgefrischt, wenn Mitglieder der Organisation
-- ihre POI in der Verwaltung abrufen. Verschwindet ein POI im HSP, bleibt die Kopie (removed_at gesetzt),
-- damit bestehende Abzeichen und Orte ihren Bezug behalten.

CREATE TABLE pois (
  id            text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 100),
  org_id        uuid NOT NULL,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  street        text,
  house_number  text,
  zip_code      text,
  city          text,
  category      text,
  lat           double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  -- Öffnungszeiten im Format der festen Zeiten (1 = Montag)
  opening_hours jsonb CHECK (opening_hours IS NULL OR jsonb_typeof(opening_hours) = 'array'),
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz
);
CREATE INDEX pois_org ON pois (org_id);

-- Ein Abzeichen gehört der Organisation – und optional einem ihrer POI („Kaffee in der Filiale Breite Straße“)
ALTER TABLE achievements ADD COLUMN poi_id text REFERENCES pois (id);
-- Ein Code oder Ort kann an einem POI hängen (Koordinaten und Name kommen von dort)
ALTER TABLE codes ADD COLUMN poi_id text REFERENCES pois (id);
CREATE INDEX achievements_poi ON achievements (poi_id) WHERE poi_id IS NOT NULL;
