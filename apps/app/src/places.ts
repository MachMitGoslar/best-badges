// Orte: Liste für die Karte und Einchecken mit Standort. Hinweise im Hintergrund: placeHints.ts.
// Datenschutz: Der Standort verlässt das Gerät nur beim Einchecken. Ob man an einem Ort ist, entscheidet für die
// Hinweise das Betriebssystem auf dem Gerät; der Server erfährt davon nichts.
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import type { components } from '@best-badges/api-client';
import { api, unwrap } from './api.ts';
import { useAuth } from './auth.ts';

export type Place = components['schemas']['Place'];
export type PublicPoi = components['schemas']['PublicPoi'];

/** POI (Geschäfte, Filialen) mit gerade verfügbaren Abzeichen */
export const usePois = () => {
  const auth = useAuth();
  return useQuery({
    queryKey: ['pois', auth.status],
    enabled: auth.status !== 'loading',
    queryFn: async () => (await unwrap(api.GET('/api/v1/pois'))).items,
  });
};

export const usePlaces = () => {
  const auth = useAuth();
  return useQuery({
    // Mit Anmeldung inkl. eigenem Stand (done)
    queryKey: ['places', auth.status],
    enabled: auth.status !== 'loading',
    queryFn: async () => (await unwrap(api.GET('/api/v1/places'))).items,
  });
};

/** Entfernung in Metern (Haversine) */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Wie der Server: Ungenauigkeit zählt höchstens 50 m zum Radius; schlechter als 150 m geht nicht. */
export const MAX_ACCURACY_M = 150;
export function reachable(place: Place, pos: Location.LocationObject | null) {
  if (!pos) return { inRange: false, distance: null as number | null, accurate: false };
  const distance = distanceM({ lat: pos.coords.latitude, lng: pos.coords.longitude }, place);
  const accuracy = pos.coords.accuracy ?? Infinity;
  return { inRange: distance <= place.radiusM + Math.min(accuracy, 50), distance, accurate: accuracy <= MAX_ACCURACY_M };
}

export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

/** Einchecken: frischen, genauen Standort holen und an den Server schicken. */
export async function checkIn(placeId: string) {
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return unwrap(api.POST('/api/v1/places/{id}/checkins', {
    params: { path: { id: placeId } },
    body: {
      geo: {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Math.round(pos.coords.accuracy ?? 9999),
        ...(pos.mocked ? { mocked: true } : {}),
      },
    },
  }));
}
