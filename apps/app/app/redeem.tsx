import { look } from '../src/badges.ts';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../src/components/Badge';
import { LoginPrompt } from '../src/components/LoginPrompt.tsx';
import { Button, Screen, T } from '../src/components/ui.tsx';
import { api, ApiFailure, unwrap } from '../src/api.ts';
import { useAuth } from '../src/auth.ts';
import { redeem, setLastResult } from '../src/data.ts';
import { colors } from '../src/theme.ts';

const KIND: Record<string, string> = {
  station: 'Station', event: 'Veranstaltung', checkout: 'Einkauf', voucher: 'Gutschein',
};

export default function Redeem() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const auth = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ['preview', code, auth.status],
    enabled: !!code && auth.status !== 'loading',
    queryFn: () => unwrap(api.GET('/api/v1/redemptions/preview', { params: { query: { code } } })),
  });

  if (auth.status === 'signedOut') return <Screen><LoginPrompt text="Melde dich an, um dieses Abzeichen einzusammeln." /></Screen>;
  const p = preview.data;

  async function collect() {
    setBusy(true); setError(null);
    try {
      const result = await redeem(code);
      setLastResult(result);
      void qc.invalidateQueries({ queryKey: ['awards'] });
      router.replace('/success');
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Das hat nicht geklappt. Bitte noch einmal versuchen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      {preview.isPending && <Text style={T.muted}>Code wird geprüft …</Text>}
      {p && !p.achievement && <Text style={[T.h2, { textAlign: 'center' }]}>{p.message ?? 'Dieser Code ist ungültig.'}</Text>}
      {p?.achievement && (
        <>
          <Badge spec={look(p.achievement).spec} size={220} title={look(p.achievement).name} tier={look(p.achievement).kind === 'tiered' ? Math.max(1, p.award?.tier ?? 1) : undefined} locked={!p.award || p.award.tier === 0} />
          <Text style={[T.h1, { textAlign: 'center' }]}>{look(p.achievement).name}</Text>
          {p.achievement.secret && <Text style={[T.body, { textAlign: 'center', color: colors.gold }]}>{p.achievement.hint ? `Hinweis: ${p.achievement.hint}` : 'Was dahintersteckt, erfährst du beim Einsammeln.'}</Text>}
          <Text style={T.muted}>{p.template ? KIND[p.template] : ''}{p.value && p.value > 1 ? ` · zählt ${p.value}×` : ''}{p.award ? ` · dein Stand: ${p.award.progress}` : ''}</Text>
          {p.status !== 'ok' && <Text style={{ color: colors.danger, textAlign: 'center' }}>{p.message}</Text>}
          {error && <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text>}
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>
            <Button title="Einsammeln" icon="award" busy={busy} disabled={p.status !== 'ok'} onPress={() => void collect()} />
            <Button title="Abbrechen" kind="secondary" onPress={() => router.back()} />
          </View>
        </>
      )}
    </Screen>
  );
}
