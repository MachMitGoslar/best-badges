import type { ExpoConfig } from 'expo/config';

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
  ],
  experiments: { typedRoutes: false },
};

export default config;
