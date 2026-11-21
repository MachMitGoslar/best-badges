-- Ort-Abzeichen: Einchecken allein über den Standort (ohne QR, NFC oder Beacon).
-- Einstiegs-Abzeichen mit weicher Hürde; das Token eines Ortes wird nie veröffentlicht, eingecheckt wird über die ID.

ALTER TABLE codes DROP CONSTRAINT codes_template_check;
ALTER TABLE codes ADD CONSTRAINT codes_template_check
  CHECK (template IN ('station', 'event', 'checkout', 'voucher', 'place'));

-- Öffentlicher Name des Ortes (auf der Karte); `label` bleibt die interne Bezeichnung
ALTER TABLE codes ADD COLUMN place_name text CHECK (place_name IS NULL OR char_length(place_name) BETWEEN 1 AND 80);

-- Ein Ort braucht Name und Standort, der Radius muss zur GPS-Genauigkeit passen
ALTER TABLE codes ADD CONSTRAINT codes_place CHECK (
  (template = 'place') = (place_name IS NOT NULL)
  AND (template <> 'place' OR (geo_lat IS NOT NULL AND geo_radius_m BETWEEN 30 AND 2000))
);

CREATE INDEX codes_places ON codes (geo_lat, geo_lng) WHERE template = 'place';

ALTER TABLE redemptions DROP CONSTRAINT redemptions_source_check;
ALTER TABLE redemptions ADD CONSTRAINT redemptions_source_check CHECK (source IN ('scan', 'api', 'place'));

-- inaccurate: Standort zu ungenau · implausible: vorgetäuschter Standort oder unmöglich schneller Ortswechsel
ALTER TABLE redemptions DROP CONSTRAINT redemptions_status_check;
ALTER TABLE redemptions ADD CONSTRAINT redemptions_status_check
  CHECK (status IN ('success', 'limit_reached', 'cooldown', 'expired', 'exhausted', 'inactive', 'invalid', 'unavailable', 'out_of_range', 'inaccurate', 'implausible'));

-- Letzter erfolgreicher Check-in einer Person (Prüfung der Reisegeschwindigkeit)
CREATE INDEX redemptions_place_user ON redemptions (user_sub, created_at DESC) WHERE source = 'place' AND status = 'success';
