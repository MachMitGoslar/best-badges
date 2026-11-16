import { useState } from 'react';
import { Text, View } from 'react-native';
import { signIn } from '../auth.ts';
import { colors } from '../theme.ts';
import { AnimatedBadge } from './AnimatedBadge';
import { BrandMark } from './BrandMark';
import { Button, T } from './ui.tsx';

export function LoginPrompt({ text = 'Sammle Abzeichen bei Vereinen, Museen und Veranstaltungen in Goslar.' }: { text?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }}>
      <AnimatedBadge spec={{ version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'rays', motif: { type: 'icon', ref: 'trophy' }, palette: 'mango' } }} size={230} tier={5} tierCount={5} title="Beispiel-Abzeichen" />
      <Text style={[T.h1, { textAlign: 'center' }]}>Best Badges</Text>
      <Text style={[T.muted, { textAlign: 'center', fontSize: 16 }]}>{text}</Text>
      {error && <Text style={[T.body, { color: colors.danger }]}>{error}</Text>}
      <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
        <Button title="Mit Goslar ID anmelden" icon="log-in" busy={busy} onPress={async () => {
          setBusy(true); setError(null);
          try { await signIn(); } catch { setError('Anmeldung fehlgeschlagen. Bitte noch einmal versuchen.'); } finally { setBusy(false); }
        }} />
      </View>
      <View style={{ alignItems: 'center', gap: 6, marginTop: 12, opacity: 0.9 }}>
        <Text style={T.label}>Ein Angebot des</Text>
        <BrandMark height={30} />
      </View>
    </View>
  );
}
