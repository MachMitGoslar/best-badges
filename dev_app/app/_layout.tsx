import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';
import {getApp, initializeApp} from '@react-native-firebase/app';
import firebase from '@react-native-firebase/app';
import "../db_connect.js";

import { useColorScheme } from '@/hooks/useColorScheme';
import firebaseConnect from '../db_connect.js';

let app;
if (firebase.apps.length === 0) {
  app = initializeApp(firebaseConnect);
} else {
  app = firebase.app()
}

if (__DEV__) {
  firestore().useEmulator('localhost', 8080);
}

const db = firestore();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
