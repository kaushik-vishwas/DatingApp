import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { chatApi, getErrorMessage, profileApi } from '../../services/api';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';

type NotificationKind = 'message' | 'call' | 'withdrawal' | 'earning';
type NotificationRow = {
  id: string;
  title: string;
  subtitle: string;
  at: string;
  type: NotificationKind;
};

export default function ReceiverNotificationsScreen(): React.JSX.Element {
  const navigation = useNavigation<NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverNotifications'>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | NotificationKind>('all');
  const [rows, setRows] = useState<NotificationRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: conversations }, { data: calls }, { data: withdrawals }] = await Promise.all([
        chatApi.conversations(),
        profileApi.receiverCallInsights('all'),
        profileApi.receiverWithdrawalOverview(),
      ]);

      const messageRows: NotificationRow[] = conversations.conversations.map((c) => ({
        id: `msg-${c.peerId}`,
        title: `Message from ${c.peerName}`,
        subtitle: c.lastText || 'You received a new message',
        at: c.lastAt,
        type: 'message',
      }));
      const callRows: NotificationRow[] = calls.recentCalls.map((c) => ({
        id: `call-${c.id}`,
        title: c.durationSec > 0 ? 'Call Completed' : 'Missed Call',
        subtitle: `Duration ${Math.max(1, Math.round(c.durationSec / 60))} min`,
        at: c.startedAt,
        type: 'call',
      }));
      const earningRows: NotificationRow[] = calls.recentCalls.map((c) => ({
        id: `earn-${c.id}`,
        title: 'Daily Earnings Summary',
        subtitle: `You earned ₹${Math.round(c.earningInr)} from a call`,
        at: c.startedAt,
        type: 'earning',
      }));
      const withdrawalRows: NotificationRow[] = withdrawals.recent.map((w) => ({
        id: `wd-${w.id}`,
        title: 'Withdrawal update',
        subtitle: `₹${w.amount} is ${w.status}`,
        at: w.createdAt,
        type: 'withdrawal',
      }));

      const merged = [...messageRows, ...callRows, ...withdrawalRows, ...earningRows].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
      );
      setRows(merged);
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

  const filtered = useMemo(
    () => (tab === 'all' ? rows : rows.filter((x) => x.type === tab)),
    [rows, tab]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity>
          <Text style={styles.markAll}>Mark all</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {(['all', 'call', 'earning', 'withdrawal'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'all' ? 'All' : t === 'call' ? 'Calls' : t === 'earning' ? 'Earnings' : 'Withdrawals'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'earning' ? (
        <View style={styles.earningActions}>
          <TouchableOpacity style={styles.earningBtn} onPress={() => navigation.navigate('ReceiverEarningsBreakdown')}>
            <Text style={styles.earningBtnText}>Open Earnings Breakdown</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.earningBtnOutline} onPress={() => navigation.navigate('ReceiverEarningsAnalytics')}>
            <Text style={styles.earningBtnOutlineText}>Open Analytics</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color="#7b2cff" style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>No notifications.</Text>
      ) : (
        filtered.map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.rowTitle}>{row.title}</Text>
            <Text style={styles.rowSub}>{row.subtitle}</Text>
            <Text style={styles.rowAt}>{new Date(row.at).toLocaleString()}</Text>
          </View>
        ))
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#111', fontWeight: '700' },
  headerTitle: { fontSize: 16, color: '#111', fontWeight: '900' },
  markAll: { fontSize: 12, color: '#7b2cff', fontWeight: '800' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#ddd', borderRadius: 16, backgroundColor: '#fff' },
  tabActive: { backgroundColor: '#7b2cff', borderColor: '#7b2cff' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#444' },
  tabTextActive: { color: '#fff' },
  error: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  empty: { color: '#666', fontSize: 12, marginTop: 8 },
  row: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ececec', padding: 10, marginBottom: 8 },
  rowTitle: { color: '#111', fontSize: 13, fontWeight: '800' },
  rowSub: { color: '#555', fontSize: 12, marginTop: 3, fontWeight: '600' },
  rowAt: { color: '#888', fontSize: 10, marginTop: 5, fontWeight: '600' },
  earningActions: { marginBottom: 10, gap: 8 },
  earningBtn: {
    backgroundColor: '#7b2cff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  earningBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  earningBtnOutline: {
    borderWidth: 1,
    borderColor: '#d7c6ff',
    backgroundColor: '#f9f5ff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  earningBtnOutlineText: { color: '#7b2cff', fontSize: 12, fontWeight: '800' },
});
