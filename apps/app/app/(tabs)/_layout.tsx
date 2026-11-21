import { Pressable, Text, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useAuth } from '../../src/auth.ts';
import { useNotifications } from '../../src/data.ts';
import { Feather } from '@expo/vector-icons';
import { colors, font } from '../../src/theme.ts';

/** Glocke mit Zahl der ungelesenen Mitteilungen */
function Bell() {
  const auth = useAuth();
  const q = useNotifications();
  if (auth.status !== 'signedIn') return null;
  const n = q.data?.unread ?? 0;
  return (
    <Pressable onPress={() => router.push('/notifications')} hitSlop={10} style={{ marginRight: 16 }} accessibilityRole="button"
      accessibilityLabel={n ? `Mitteilungen, ${n} ungelesen` : 'Mitteilungen'}>
      <Feather name="bell" size={22} color={colors.text} />
      {n > 0 && (
        <View style={{ position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.onGold, fontFamily: font.bold, fontSize: 11 }}>{n > 99 ? '99+' : n}</Text>
        </View>
      )}
    </Pressable>
  );
}

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
        headerRight: () => <Bell />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Sammlung', tabBarIcon: ({ color, size }) => <Feather name="award" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="map" options={{ title: 'Orte', tabBarIcon: ({ color, size }) => <Feather name="map" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="scan" options={{ title: 'Scannen', tabBarIcon: ({ color, size }) => <Feather name="maximize" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ color, size }) => <Feather name="user" color={String(color)} size={size} /> }} />
    </Tabs>
  );
}
