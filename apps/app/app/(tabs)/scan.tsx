import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Screen, T } from '../../src/components/ui.tsx';
import { font, colors, radius } from '../../src/theme.ts';

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const focused = useIsFocused();
  const lastScan = useRef(0);

  const open = (code: string) => router.push({ pathname: '/redeem', params: { code } });

  return (
    <Screen style={{ padding: 16, gap: 16 }}>
      <View style={s.cameraBox}>
        {permission?.granted && focused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              const now = Date.now();
              if (now - lastScan.current < 2500) return;
              lastScan.current = now;
              open(data);
            }}
          />
        ) : (
          <View style={{ alignItems: 'center', gap: 12, padding: 24 }}>
            <Text style={[T.body, { textAlign: 'center' }]}>Erlaube den Zugriff auf die Kamera, um QR-Codes von Abzeichen zu scannen.</Text>
            {permission && !permission.granted && <Button title="Kamera erlauben" icon="camera" onPress={() => void requestPermission()} />}
          </View>
        )}
        <View pointerEvents="none" style={s.frame} />
      </View>
      <Text style={T.muted}>Halte die Kamera auf den QR-Code an der Station, auf dem Handy der Veranstaltung oder an der Kasse.</Text>

      <View style={s.manual}>
        <Text style={[T.body, { fontFamily: font.bold }]}>Code von Hand eingeben</Text>
        <TextInput
          value={manual}
          onChangeText={setManual}
          placeholder="Link oder Code"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.input}
          returnKeyType="go"
          onSubmitEditing={() => manual.trim() && open(manual.trim())}
        />
        <Button title="Weiter" kind="secondary" disabled={!manual.trim()} onPress={() => open(manual.trim())} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  cameraBox: { height: 340, borderRadius: radius.l, overflow: 'hidden', backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'absolute', width: 220, height: 220, borderRadius: 24, borderWidth: 3, borderColor: colors.gold, opacity: 0.85 },
  manual: { backgroundColor: colors.panel, borderRadius: radius.m, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
  input: { color: colors.text, backgroundColor: colors.bg2, borderRadius: radius.s, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 12, fontFamily: font.regular, fontSize: 15 },
});
