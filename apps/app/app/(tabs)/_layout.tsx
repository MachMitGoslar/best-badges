import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, font } from '../../src/theme.ts';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.night[0] },
        headerTitleStyle: { fontFamily: font.bold },
        tabBarLabelStyle: { fontFamily: font.semibold },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.night[2], borderTopColor: colors.line },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Sammlung', tabBarIcon: ({ color, size }) => <Feather name="award" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="scan" options={{ title: 'Scannen', tabBarIcon: ({ color, size }) => <Feather name="maximize" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ color, size }) => <Feather name="user" color={String(color)} size={size} /> }} />
    </Tabs>
  );
}
