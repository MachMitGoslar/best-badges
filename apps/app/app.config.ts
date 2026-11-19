import type { ExpoConfig } from 'expo/config';

// APNs-Umgebung des Builds: Entwicklungs-Signatur (Xcode, Gerät per Kabel) = development,
// TestFlight/App Store = production. Muss zum Eintrag aps-environment passen; die App meldet sie mit dem Token.
const apnsEnvironment = process.env.EXPO_PUBLIC_APNS_ENV === 'production' ? 'production' : 'development';

const config: ExpoConfig = {
  name: 'Best Badges',
  slug: 'best-badges',
  scheme: 'bestbadges',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0b0d1c',
  ios: {
    bundleIdentifier: 'de.machmitgoslar.bestbadges.dev',
    supportsTablet: false,
    appleTeamId: 'JPNPSJ256T',
    infoPlist: {
      // Nur für die lokale Entwicklung: http zu localhost (Mock-OIDC, API)
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: { package: 'de.machmitgoslar.bestbadges.dev' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    ['expo-camera', { cameraPermission: 'Best Badges braucht die Kamera, um QR-Codes von Abzeichen zu scannen.' }],
    './plugins/withMetroIpOutput',
    // Nur Erlaubnis, Geräte-Token und Antippen – Versand direkt über Apple (APNs), nicht über Expo
    ['expo-notifications', { mode: apnsEnvironment, enableBackgroundRemoteNotifications: false }],
  ],
  experiments: { typedRoutes: false },
};

export default config;
