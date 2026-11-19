import { useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '../src/components/Icon.tsx';
import { LoginPrompt } from '../src/components/LoginPrompt.tsx';
import { Screen, T } from '../src/components/ui.tsx';
import { useAuth } from '../src/auth.ts';
import { markNotificationsRead, useNotifications, type NotificationItem } from '../src/data.ts';
import { setAppBadge } from '../src/push';
import { colors, font, radius } from '../src/theme.ts';

const ICON: Record<NotificationItem['category'], IconName> = {
  awards: 'award', requests: 'git-pull-request', news: 'star', campaigns: 'gift', reminders: 'bell',
};

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString('de-DE', { weekday: 'long' });
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
};

/** Postfach: alle Benachrichtigungen, auch die ohne Push */
export default function NotificationsScreen() {
  const auth = useAuth();
  const q = useNotifications();
  const qc = useQueryClient();
  const unread = q.data?.unread ?? 0;
  useEffect(() => { void setAppBadge(unread); }, [unread]);

  if (auth.status !== 'signedIn') return <Screen><LoginPrompt /></Screen>;

  const read = async (ids?: string[]) => {
    await markNotificationsRead(ids ? { ids } : { all: true });
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const open = (n: NotificationItem) => {
    if (!n.read) void read([n.id]);
    if (n.link) router.push(n.link as never);
  };

  return (
    <Screen>
      <Stack.Screen options={{
        title: 'Mitteilungen',
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            {unread > 0 && <Pressable onPress={() => void read()} accessibilityRole="button"><Text style={s.action}>Alle gelesen</Text></Pressable>}
            <Pressable onPress={() => router.push('/settings/notifications')} accessibilityRole="button" accessibilityLabel="Einstellungen für Benachrichtigungen">
              <Icon name="settings" size={20} color={colors.text} />
            </Pressable>
          </View>
        ),
      }} />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.gold} />}
        ListEmptyComponent={<Text style={[T.muted, { textAlign: 'center', marginTop: 40 }]}>{q.isLoading ? 'Lade …' : 'Noch keine Mitteilungen.'}</Text>}
        renderItem={({ item: n }) => (
          <Pressable onPress={() => open(n)} style={[s.row, !n.read && s.unread]} accessibilityRole={n.link ? 'link' : 'text'}
            accessibilityLabel={`${n.read ? '' : 'Ungelesen. '}${n.title}. ${n.body}`}>
            <View style={s.icon}><Icon name={ICON[n.category]} size={18} color={n.read ? colors.muted : colors.gold} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[s.title, n.read && { color: colors.muted }]} numberOfLines={1}>{n.title}</Text>
                <Text style={s.time}>{when(n.createdAt)}</Text>
              </View>
              <Text style={T.muted} numberOfLines={3}>{n.body}</Text>
            </View>
            {!n.read && <View style={s.dot} />}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: radius.m, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  unread: { borderColor: colors.gold },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.night[0] },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 15, flexShrink: 1 },
  time: { color: colors.muted, fontFamily: font.regular, fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, marginTop: 6 },
  action: { color: colors.gold, fontFamily: font.semibold, fontSize: 14 },
});
