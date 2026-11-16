import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { hydrate } from '../src/auth.ts';
import { Medal3DPrewarm } from '../src/components/Medal3DPrewarm';
import { colors, font } from '../src/theme.ts';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } });

export default function RootLayout() {
  useEffect(() => { void hydrate(); }, []);
  // Schriften laden; bei einem Fehler mit Systemschrift weiter statt leerem Bildschirm
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  if (!fontsLoaded && !fontError) return <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.night[0] },
            headerTitleStyle: { fontFamily: font.bold },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
            headerBackTitle: 'Zurück',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="achievements/[id]" options={{ title: '' }} />
          <Stack.Screen name="redeem" options={{ presentation: 'modal', title: 'Abzeichen einlösen' }} />
          <Stack.Screen name="success" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="c/[token]" options={{ headerShown: false }} />
          <Stack.Screen name="u/[handle]" options={{ title: 'Profil' }} />
          <Stack.Screen name="dev/medaille" options={{ title: 'Medaille testen' }} />
        </Stack>
        <Medal3DPrewarm />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
