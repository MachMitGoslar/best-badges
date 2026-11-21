import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { LoginPrompt } from '../../src/components/LoginPrompt.tsx';
import { Button, Screen, T } from '../../src/components/ui.tsx';
import { useAuth } from '../../src/auth.ts';
import { saveNotificationSettings, useNotificationSettings, type NotificationPrefs } from '../../src/data.ts';
import { disablePush, enablePush, pushState, type PushState } from '../../src/push';
import { disableHints, enableHints, hintState, type HintState } from '../../src/placeHints';
import { colors, font, radius } from '../../src/theme.ts';

type Key = keyof NotificationPrefs;
const ROWS: { key: Key; title: string; text: string; consent?: boolean }[] = [
  { key: 'awards', title: 'Abzeichen und Stufen', text: 'Wenn du ein Abzeichen, eine neue Stufe oder eine Kombination bekommst – auch wenn es z. B. an der Kasse vergeben wurde.' },
  { key: 'requests', title: 'Sammelanfragen', text: 'Nur für Mitglieder von Organisationen: Anfragen anderer Organisationen und Antworten auf eure Anfragen.' },
  { key: 'news', title: 'Neuigkeiten', text: 'Hinweise auf neue Abzeichen und Orte in Goslar. Höchstens wenige Male im Monat, nur zwischen 9 und 20 Uhr.', consent: true },
  { key: 'campaigns', title: 'Sonderaktionen', text: 'Besondere Aktionen, z. B. zu Festen oder Ferien. Nur zwischen 9 und 20 Uhr.', consent: true },
  { key: 'reminders', title: 'Erinnerungen', text: 'Eine freundliche Erinnerung, wenn du 14 Tage nicht in der App warst – höchstens alle 14 Tage.', consent: true },
];

/** Einstellungen für Benachrichtigungen; werbliche Kategorien sind Einwilligungen (Standard aus) */
export default function NotificationSettings() {
  const auth = useAuth();
  const q = useNotificationSettings();
  const qc = useQueryClient();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<Key | 'push' | 'hints' | null>(null);
  const [hints, setHints] = useState<HintState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { void pushState().then(setPush); void hintState().then(setHints); }, []);
  if (auth.status !== 'signedIn') return <Screen><LoginPrompt /></Screen>;
  const s = q.data;

  const toggle = async (key: Key, value: boolean) => {
    setBusy(key); setMsg(null);
    try {
      qc.setQueryData(['notification-settings'], await saveNotificationSettings({ [key]: value }));
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(null); }
  };

  const togglePush = async (on: boolean) => {
    setBusy('push'); setMsg(null);
    try {
      if (on) {
        const ok = await enablePush();
        if (!ok) setMsg('Mitteilungen sind für Best Badges in den iPhone-Einstellungen ausgeschaltet.');
      } else await disablePush();
      setPush(await pushState());
      await qc.invalidateQueries({ queryKey: ['notification-settings'] });
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(null); }
  };

  const toggleHints = async (on: boolean) => {
    setBusy('hints'); setMsg(null);
    try {
      if (on && !(await enableHints())) setMsg('Für Hinweise an Orten braucht Best Badges den Standort „Immer“ und Mitteilungen. Beides lässt sich in den iPhone-Einstellungen erlauben.');
      if (!on) await disableHints();
      setHints(await hintState());
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(null); }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Benachrichtigungen' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        <View style={st.card}>
          <View style={st.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={st.title}>Push auf diesem iPhone</Text>
              <Text style={T.muted}>
                {push === 'unsupported' ? 'Auf diesem Gerät nicht verfügbar.'
                  : push === 'denied' ? 'In den iPhone-Einstellungen ausgeschaltet.'
                  : s && !s.pushAvailable ? 'Push ist auf dem Server noch nicht eingerichtet; alles landet im Postfach.'
                  : 'Mitteilungen auch, wenn die App geschlossen ist. Ohne Push findest du alles im Postfach.'}
              </Text>
            </View>
            <Switch value={push === 'on'} disabled={busy !== null || push === 'unsupported' || push === 'denied'} onValueChange={(v) => void togglePush(v)}
              trackColor={{ true: colors.gold }} accessibilityLabel="Push auf diesem iPhone" />
          </View>
          {push === 'denied' && <Button title="iPhone-Einstellungen öffnen" kind="secondary" icon="external-link" onPress={() => void Linking.openSettings()} />}
        </View>

        <View style={st.card}>
          <View style={st.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={st.title}>Hinweise an Orten</Text>
              <Text style={T.muted}>
                {hints === 'unsupported' ? 'Auf diesem Gerät nicht verfügbar.'
                  : hints === 'denied' ? 'Standort „Immer“ ist in den iPhone-Einstellungen nicht erlaubt.'
                  : 'Die App meldet sich, wenn du in die Nähe eines Ortes kommst – auch geschlossen. Das erkennt das iPhone selbst, dein Standort wird dafür nicht übertragen.'}
              </Text>
            </View>
            <Switch value={hints === 'on'} disabled={busy !== null || hints === 'unsupported'} onValueChange={(v) => void toggleHints(v)}
              trackColor={{ true: colors.gold }} accessibilityLabel="Hinweise an Orten" />
          </View>
          {hints === 'denied' && <Button title="iPhone-Einstellungen öffnen" kind="secondary" icon="external-link" onPress={() => void Linking.openSettings()} />}
        </View>

        <Text style={T.label}>Worüber du informiert wirst</Text>
        {ROWS.map((r) => (
          <View key={r.key} style={st.card}>
            <View style={st.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={st.title}>{r.title}</Text>
                <Text style={T.muted}>{r.text}</Text>
              </View>
              <Switch value={s?.prefs[r.key] ?? false} disabled={!s || busy !== null} onValueChange={(v) => void toggle(r.key, v)}
                trackColor={{ true: colors.gold }} accessibilityLabel={r.title} />
            </View>
          </View>
        ))}
        <Text style={[T.muted, { fontSize: 12.5 }]}>
          Neuigkeiten, Sonderaktionen und Erinnerungen bekommst du nur, wenn du sie hier einschaltest. Du kannst das jederzeit wieder
          ausschalten.{s?.consentAt ? ` Zuletzt geändert am ${new Date(s.consentAt).toLocaleDateString('de-DE')}.` : ''}
          {' '}Mitteilungen enthalten nur Abzeichen- und Ortsnamen, keine persönlichen Daten.
        </Text>
        {msg && <Text style={{ color: colors.danger, fontFamily: font.semibold }}>{msg}</Text>}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 16 },
});
