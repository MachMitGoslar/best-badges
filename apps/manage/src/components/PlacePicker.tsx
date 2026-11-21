import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PlaceValue { lat: number; lng: number; radiusM: number }

/** Goslar, Marktplatz – Startpunkt, solange noch kein Ort gesetzt ist */
const GOSLAR: L.LatLngTuple = [51.9059, 10.429];
export const PLACE_RADIUS = { min: 30, max: 2000 } as const;

/**
 * Karte zum Setzen eines Ortes: Klick setzt den Mittelpunkt, der Kreis zeigt den Radius.
 * Kacheln von OpenStreetMap (Namensnennung unten rechts ist Pflicht).
 */
export function PlacePicker({ value, onChange }: { value: PlaceValue | null; onChange: (v: PlaceValue) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const dot = useRef<L.CircleMarker | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: value ? [value.lat, value.lng] : GOSLAR, zoom: value ? 17 : 15 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      const radiusM = latest.current.value?.radiusM ?? 80;
      latest.current.onChange({ lat: round(e.latlng.lat), lng: round(e.latlng.lng), radiusM });
    });
    map.current = m;
    return () => { m.remove(); map.current = null; circle.current = null; dot.current = null; };
    // Karte nur einmal aufbauen; Änderungen am Wert zeichnet der zweite Effekt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) { circle.current?.remove(); dot.current?.remove(); circle.current = dot.current = null; return; }
    const at: L.LatLngTuple = [value.lat, value.lng];
    const style = { color: 'var(--brand, #f5b301)', weight: 2, fillOpacity: 0.18 };
    if (!circle.current) circle.current = L.circle(at, { ...style, radius: value.radiusM }).addTo(m);
    else circle.current.setLatLng(at).setRadius(value.radiusM);
    if (!dot.current) dot.current = L.circleMarker(at, { ...style, radius: 6, fillOpacity: 1 }).addTo(m);
    else dot.current.setLatLng(at);
  }, [value]);

  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => {
      const v = { lat: round(p.coords.latitude), lng: round(p.coords.longitude), radiusM: value?.radiusM ?? 80 };
      onChange(v);
      map.current?.setView([v.lat, v.lng], 17);
    });
  }

  return (
    <div className="stack">
      <div ref={el} className="place-map" role="application" aria-label="Karte: klicke, um den Ort zu setzen" />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 1 }}>Radius: {value?.radiusM ?? 80} m
          <input type="range" min={PLACE_RADIUS.min} max={500} step={10} value={Math.min(value?.radiusM ?? 80, 500)} disabled={!value}
            onChange={(e) => value && onChange({ ...value, radiusM: Number(e.target.value) })} />
        </label>
        <button type="button" className="btn btn-sm" onClick={locate}>Mein Standort</button>
      </div>
      <span className="muted small">
        {value ? `Mittelpunkt ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}. ` : 'Klicke auf die Karte, um den Ort zu setzen. '}
        Unter 50 m wird es für Handys schwierig, GPS ist in der Stadt oft 20–40 m ungenau.
      </span>
    </div>
  );
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
