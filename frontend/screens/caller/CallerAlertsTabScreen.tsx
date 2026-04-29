import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CallerBottomTabs from '../../components/caller/CallerBottomTabs';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import type { CallerNotificationRow, CallerNotificationType } from '../../types/api';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerAlerts'>;

export default function CallerAlertsTabScreen({ navigation }: Props): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | CallerNotificationType>('all');
  const [rows, setRows] = useState<CallerNotificationRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await profileApi.callerNotifications();
      setRows(data.notifications);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filtered = useMemo(() => (tab === 'all' ? rows : rows.filter((r) => r.type === tab)), [rows, tab]);

  const parseChatNotification = (row: CallerNotificationRow): { receiverId: string; receiverName: string } | null => {
    if (row.type !== 'chat') return null;
    if (!row.id.startsWith('chat-')) return null;
    const receiverId = row.id.slice(5).trim();
    if (!receiverId) return null;
    const prefix = 'Message from ';
    const receiverName = row.title.startsWith(prefix) ? row.title.slice(prefix.length).trim() : 'Receiver';
    return { receiverId, receiverName: receiverName || 'Receiver' };
  };

  const onOpenNotification = (row: CallerNotificationRow) => {
    if (row.type === 'call') {
      navigation.navigate('CallerCalls');
      return;
    }
    if (row.type === 'chat') {
      const chatTarget = parseChatNotification(row);
      if (chatTarget) {
        navigation.navigate('CallerChat', {
          receiverId: chatTarget.receiverId,
          receiverName: chatTarget.receiverName,
        });
        return;
      }
      navigation.navigate('CallerChats');
      return;
    }
    navigation.navigate('Wallet');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Notifications</Text>
      <View style={styles.filters}>
        {(['all', 'transaction', 'chat', 'call'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.filterBtn, tab === t && styles.filterBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.filterText, tab === t && styles.filterTextActive]}>
              {t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.listWrap}>
        {loading ? (
          <ActivityIndicator size="large" color="#7b2cff" />
        ) : error ? (
          <Text style={styles.sub}>{error}</Text>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>🔔</Text>
            <Text style={styles.head}>You are all caught up</Text>
            <Text style={styles.sub}>Transaction, chat and call alerts will appear here.</Text>
          </View>
        ) : (
          filtered.map((row) => (
            <TouchableOpacity
              key={row.id}
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => onOpenNotification(row)}
            >
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowChevron}>›</Text>
              </View>
              <Text style={styles.rowSub}>{row.subtitle}</Text>
              <Text style={styles.rowAt}>{new Date(row.at).toLocaleString()}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
      <CallerBottomTabs active="alerts" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
    paddingVertical: 16,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  filterBtn: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6 },
  filterBtnActive: { borderColor: '#7b2cff', backgroundColor: '#f5ecff' },
  filterText: { fontSize: 11, color: '#666', fontWeight: '700' },
  filterTextActive: { color: '#7b2cff' },
  listWrap: { flex: 1, paddingHorizontal: 14, paddingBottom: 88 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  head: { fontSize: 18, fontWeight: '900', color: '#111', marginBottom: 8 },
  sub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 11,
    marginBottom: 8,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowTitle: { fontSize: 13, color: '#111', fontWeight: '800' },
  rowChevron: { fontSize: 20, color: '#bbb', fontWeight: '300' },
  rowSub: { marginTop: 3, fontSize: 12, color: '#666', fontWeight: '600' },
  rowAt: { marginTop: 4, fontSize: 10, color: '#999', fontWeight: '600' },
});
