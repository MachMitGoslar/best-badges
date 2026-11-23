import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { hydrate, onBeforeSignOut, useAuth } from '../src/auth.ts';
import { disablePush, linkOf, refreshPush, useLastNotificationResponse } from '../src/push';
import { reportActivity } from '../src/data.ts';
import { Medal3DPrewarm } from '../src/components/Medal3DPrewarm';
// Hintergrund-Aufgabe für Orts-Hinweise muss beim Start registriert sein
import '../src/placeHints';
import { colors, font } from '../src/theme.ts';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } });
// Beim Abmelden das Push-Gerät abmelden, solange die Anmeldung noch gilt
onBeforeSignOut(disablePush);

/** Push: Token auffrischen und angetippte Mitteilungen öffnen */
function PushBridge() {
  const auth = useAuth();
  const response = useLastNotificationResponse();
  useEffect(() => { if (auth.status === 'signedIn') void refreshPush(); }, [auth.status]);
  useEffect(() => {
    if (!response) return;
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['awards'] });
    const link = linkOf(response);
    router.push((link ?? '/notifications') as never);
  }, [response]);
  return null;
}

/** App geöffnet oder zurückgeholt: Tag melden (nur Datum) – der Server prüft dabei Plattform-Abzeichen wie „App genutzt“. */
function ActivityBridge() {
  const auth = useAuth();
  useEffect(() => {
    if (auth.status !== 'signedIn') return;
    let last = 0;
    const ping = () => {
      // Der Server zählt ohnehin nur einmal pro Tag; hier höchstens einmal pro Stunde fragen
      if (Date.now() - last < 3600_000) return;
      last = Date.now();
      void reportActivity().then((r) => {
        if (r.bonus.length) {
          void queryClient.invalidateQueries({ queryKey: ['awards'] });
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      }).catch(() => { last = 0; });
    };
    ping();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') ping(); });
    return () => sub.remove();
  }, [auth.status]);
  return null;
}

export default function RootLayout() {
  useEffect(() => { void hydrate(); }, []);
  // Schriften laden; bei einem Fehler mit Systemschrift weiter statt leerem Bildschirm
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  if (!fontsLoaded && !fontError) return <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <PushBridge />
        <ActivityBridge />
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
          <Stack.Screen name="places/[id]" options={{ presentation: 'modal', title: 'Ort' }} />
          <Stack.Screen name="pois/[id]" options={{ title: '' }} />
          <Stack.Screen name="c/[token]" options={{ headerShown: false }} />
          <Stack.Screen name="u/[handle]" options={{ title: 'Profil' }} />
          <Stack.Screen name="notifications" options={{ title: 'Mitteilungen' }} />
          <Stack.Screen name="settings/notifications" options={{ title: 'Benachrichtigungen' }} />
          <Stack.Screen name="dev/medaille" options={{ title: 'Medaille testen' }} />
        </Stack>
        <Medal3DPrewarm />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
