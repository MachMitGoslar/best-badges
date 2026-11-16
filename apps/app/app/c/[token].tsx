import { Redirect, useLocalSearchParams } from 'expo-router';

/** Deep Link bestbadges://c/{token}?… bzw. https://…/c/{token}?… öffnet die Einlöse-Vorschau. */
export default function CodeLink() {
  const { token, ...rest } = useLocalSearchParams<Record<string, string>>();
  const query = new URLSearchParams(Object.entries(rest).filter(([, v]) => typeof v === 'string') as [string, string][]).toString();
  const code = `https://badges.invalid/c/${token}${query ? `?${query}` : ''}`;
  return <Redirect href={{ pathname: '/redeem', params: { code } }} />;
}
