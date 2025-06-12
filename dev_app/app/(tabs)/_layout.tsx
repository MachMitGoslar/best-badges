import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Text, StyleSheet, Button } from 'react-native';
import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getAuth, signOut } from '@react-native-firebase/auth';

export default function TabLayout() {
  const auth = getAuth();
  const colorScheme = useColorScheme();

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out: ', error);
    }
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
      }}>
      <Tabs.Screen
        name="home"
        options={{
          headerShown: true,
          headerRight: () => (
            <Button onPress={handleLogout} title='Logout'>

            </Button>
          ),
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan Badge',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="qrcode.viewfinder" color={color} />,
        }}
      />
      <Tabs.Screen
        name="impressum"
        options={{
          title: 'Impressum',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="text.document.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  header: {
    marginRight: 16
  }
});
