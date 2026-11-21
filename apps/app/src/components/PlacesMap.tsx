import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import type { Place } from '../places.ts';
import { colors } from '../theme.ts';

/** Goslar Altstadt */
const GOSLAR: Region = { latitude: 51.9059, longitude: 10.429, latitudeDelta: 0.03, longitudeDelta: 0.03 };

/**
 * Karte mit Orten (Apple Karten unter iOS, dunkel). Gold = offen, gedämpft = erledigt.
 * Der Kreis zeigt, wie nah man zum Einchecken heran muss.
 */
export function PlacesMap({ places, onSelect }: { places: Place[]; onSelect: (p: Place) => void }) {
  const initial = useMemo(() => GOSLAR, []);
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={initial}
      userInterfaceStyle="dark"
      showsUserLocation
      showsMyLocationButton
      showsPointsOfInterests={false}
      pitchEnabled={false}
    >
      {places.map((p) => {
        const done = p.done === true;
        return [
          <Circle key={`${p.id}-r`} center={{ latitude: p.lat, longitude: p.lng }} radius={p.radiusM}
            strokeColor={done ? colors.line : colors.gold} fillColor={done ? 'rgba(255,255,255,0.05)' : 'rgba(245,179,1,0.15)'} strokeWidth={1.5} />,
          <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.name}
            description={done ? 'Schon eingecheckt' : 'Antippen zum Einchecken'}
            pinColor={done ? colors.muted : colors.gold} tracksViewChanges={false}
            onCalloutPress={() => onSelect(p)} />,
        ];
      })}
    </MapView>
  );
}
