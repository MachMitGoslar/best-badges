import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { LoginPrompt } from '../../src/components/LoginPrompt.tsx';
import { ShowcaseGrid } from '../../src/components/ShowcaseGrid.tsx';
import { Icon } from '../../src/components/Icon.tsx';
import { Button, Screen, T } from '../../src/components/ui.tsx';
import { signOut, useAuth } from '../../src/auth.ts';
import { saveProfile, useAwards, useMyProfile } from '../../src/data.ts';
import { colors, font, radius } from '../../src/theme.ts';

const MAX = 6;

export default function Profile() {
  const auth = useAuth();
  const awards = useAwards();
  const profile = useMyProfile();
  const qc = useQueryClient();

  const [isPublic, setPublic] = useState(false);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showcase, setShowcase] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setPublic(p.public); setHandle(p.handle ?? ''); setDisplayName(p.displayName ?? ''); setShowcase(p.showcase);
  }, [profile.data]);

  const earned = useMemo(() => (awards.data ?? []).flatMap((a) => (a.tier > 0 && !a.achievement.secret ? [{
    id: a.achievement.id, name: a.achievement.name, spec: a.achievement.spec, kind: a.achievement.kind,
    tier: a.tier, tierCount: a.tierCount, progress: a.progress, requiredCount: a.requiredCount,
  }] : [])), [awards.data]);

  if (auth.status !== 'signedIn') return <Screen><LoginPrompt /></Screen>;

  const toggle = (id: string) => setShowcase((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX ? s : [...s, id]));

  async function onSave() {
    setBusy(true); setMsg(null);
    try {
      const saved = await saveProfile({ public: isPublic, handle: handle.trim() || null, displayName: displayName.trim() || null, showcase });
      qc.setQueryData(['my-profile'], saved);
      setMsg({ ok: true, text: saved.public ? 'Gespeichert – dein Profil ist öffentlich.' : 'Gespeichert – dein Profil ist privat.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={T.h2}>{displayName.trim() || 'Dein Profil'}</Text>
          <Text style={T.muted}>{earned.length} Abzeichen gesammelt</Text>
        </View>

        <View style={{ gap: 10 }}>
          <View style={s.row}>
            <Text style={T.h2}>Showcase</Text>
            <Text style={T.muted}>{showcase.length} / {MAX}</Text>
          </View>
          <Text style={T.muted}>Wähle bis zu sechs Abzeichen, die in deinem Profil ganz vorn stehen.</Text>
          {earned.length === 0
            ? <Text style={T.muted}>Sammle dein erstes Abzeichen, dann kannst du es hier zeigen.</Text>
            : <ShowcaseGrid items={earned} selected={showcase} onPress={toggle} />}
        </View>

        <View style={[s.card, { gap: 14 }]}>
          <View style={s.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[T.body, { fontFamily: font.bold }]}>Öffentliches Profil</Text>
              <Text style={T.muted}>{isPublic ? 'Alle mit dem Link sehen Anzeigename, Showcase und Anzahl.' : 'Nur du siehst dein Profil.'}</Text>
            </View>
            <Switch value={isPublic} onValueChange={setPublic} trackColor={{ true: colors.gold, false: colors.panel2 }} thumbColor={colors.text} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={T.label}>Kürzel (für den Link)</Text>
            <TextInput style={s.input} value={handle} onChangeText={(v) => setHandle(v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30))}
              placeholder="z. B. waldlaeuferin" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={T.label}>Anzeigename</Text>
            <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} maxLength={40}
              placeholder="Wie andere dich sehen" placeholderTextColor={colors.muted} />
          </View>
          <Text style={T.muted}>Wir übernehmen nichts aus deiner Goslar ID. Name und Kürzel bestimmst du selbst.</Text>
        </View>

        {msg && <Text style={[T.body, { color: msg.ok ? colors.ok : colors.danger }]}>{msg.text}</Text>}
        <Button title="Speichern" icon="check" busy={busy} disabled={isPublic && handle.trim().length < 3} onPress={() => void onSave()} />
        {profile.data?.public && profile.data.handle && (
          <View style={[s.card, { gap: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="globe" size={16} color={colors.gold} />
              <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>{profile.data.url}</Text>
            </View>
            <Button title="Öffentliches Profil ansehen" kind="secondary" icon="eye" onPress={() => router.push(`/u/${profile.data!.handle}`)} />
          </View>
        )}
        <Button title="Abmelden" icon="log-out" kind="secondary" onPress={() => void signOut()} />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderRadius: radius.m, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  input: { color: colors.text, backgroundColor: colors.bg2, borderRadius: radius.s, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, fontFamily: font.regular },
});
